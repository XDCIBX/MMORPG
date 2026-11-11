// Монстры, боссы и призванные союзники: ИИ, способности, добыча, появление.
import * as THREE from 'three';
import { Entity } from './entity.js';
import { buildCreature } from '../chars/creatures.js';
import { MOB_TYPES, SPAWNS, BOSSES, mobHp, mobDmg, mobArmor } from '../data/mobs.js';
import { CITIES } from '../data/world.js';
import { mobXp } from '../data/classes.js';
import { randomGear, rollRarity, bossItem, makePotion, makeJunk } from '../data/items.js';
import { FX } from '../fx/particles.js';
import { hitFx } from './skills.js';
import { clamp, rand, angleLerp, pick } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Mob extends Entity {
  constructor(game, typeKey, level, spawn, opts = {}) {
    super(game);
    this.typeKey = typeKey;
    this.def = Object.assign({}, MOB_TYPES[typeKey], opts.defOverride || {});
    this.bossDef = opts.boss || null;
    this.isBoss = !!opts.boss;
    this.elite = !!opts.elite;
    this.level = level;
    this.spawn = spawn;
    this.home = V(opts.x, 0, opts.z);
    this.pos.set(opts.x, game.world.standY(opts.x, opts.z), opts.z);
    this.yaw = Math.random() * Math.PI * 2;
    const hpMul = this.def.hp * (this.elite ? 2.6 : 1) * (this.isBoss ? this.bossDef.hp : 1) * (opts.addMul || 1);
    this.maxHp = this.hp = Math.round(mobHp(level) * hpMul);
    this.ap = mobDmg(level) * this.def.dmg * (this.elite ? 1.4 : 1) * (this.isBoss ? this.bossDef.dmg : 1) * (opts.addMul || 1);
    if (level < 15 && !this.isBoss) this.ap *= 0.55 + 0.45 * level / 15; // мягкое начало
    this.armor = mobArmor(level) * (['golem', 'fallen', 'frostgiant', 'skeleton'].includes(typeKey) ? 1.4 : 1);
    this.critChance = 0.05; this.critDmg = 1.5;
    this.scale = (this.def.size || 1) * (this.isBoss ? this.bossDef.scale : 1) * (this.elite ? 1.25 : 1) * rand(0.92, 1.08) * (opts.scaleMul || 1);
    this.radius = 0.5 * this.scale * (['bear', 'golem', 'dragon', 'spider'].includes(this.def.model) ? 1.6 : 1);
    this.state = 'idle';
    this.wanderT = rand(1, 6);
    this.atkT = rand(0.5, 1.5);
    this.atkInterval = this.isBoss ? 2.0 : rand(1.7, 2.1);
    this.target = null;
    this.deathT = 0;
    this.respawnT = 0;
    this.ranged = !!this.def.ranged;
    this.abilityT = 5;
    this.isAdd = !!opts.isAdd;
    this.displayName = this.isBoss ? this.bossDef.name : (this.elite ? 'Матёрый ' + this.def.name.toLowerCase().replace(/^серый /, '') : this.def.name);
    if (this.elite && typeKey === 'wolf') this.displayName = 'Матёрый волк Теневой стаи';
  }
  get name() { return this.displayName; }

  ensureModel() {
    if (this.model) return;
    const def = this.isBoss ? Object.assign({}, this.def, { model: this.bossDef.model, fur: this.bossDef.fur, fur2: this.bossDef.fur2, eye: this.bossDef.eye }) : this.def;
    if (this.elite && this.def.model === 'wolf') { def.fur = '#3a3a44'; def.fur2 = '#22222a'; def.belly = '#2a2a32'; def.eye = '#80a0ff'; }
    if (this.isBoss) def.belly = this.bossDef.fur;
    this.model = buildCreature(def);
    this.model.root.scale.setScalar(this.scale * (this.model.spec ? this.model.spec.scale || 1 : 1));
    this.game.scene.add(this.model.root);
    this.syncModel();
  }
  disposeModel() {
    if (!this.model) return;
    this.model.root.removeFromParent();
    this.model = null;
  }
  syncModel() {
    if (!this.model) return;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
  centerY() { return this.pos.y + (this.model ? this.model.headTop() * 0.55 : 1); }
  headY() { return this.pos.y + (this.model ? this.model.headTop() : 2); }

  // ближайший призванный союзник игрока (мобы в первую очередь бьют питомцев)
  nearestAlly(maxD = 30) {
    let best = null, bd = maxD;
    for (const a of this.game.allies.list) { if (!a.alive) continue; const d = this.distTo(a); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  aggro(src, force = false) {
    if (!this.alive || !src || !src.alive) return;
    if (this.state === 'return' && !force) return;
    if (!force && src === this.game.player) { const al = this.nearestAlly(); if (al) src = al; }
    if (!this.target || force || !this.target.alive || (this.target === this.game.player && src !== this.target)) this.target = src;
    if (force) this.tauntT = 6;
    if (this.state !== 'chase') {
      this.state = 'chase';
      this.atkT = Math.min(this.atkT, 0.8);
      // социальная агрессия
      for (const m of this.game.mobs.active) {
        if (m !== this && m.alive && m.state !== 'chase' && m.typeKey === this.typeKey && !m.isBoss && m.distTo(this) < 6.5) m.aggro(src);
      }
      if (this.isBoss) this.game.ui.bossEngage(this);
    }
  }
  onDamaged(src) { if (src) this.aggro(src); }
  onDeath(src) {
    this.state = 'dead';
    this.deathT = 0;
    if (this.model) this.model.die();
    this.game.mobs.onMobDeath(this, src);
  }

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.deathT += dt;
      if (this.model) {
        this.model.update(dt, { speed: 0 });
        if (this.deathT > 2.5) this.model.root.position.y = this.pos.y - (this.deathT - 2.5) * 0.6;
        if (this.deathT > 5) this.disposeModel();
      }
      return;
    }
    this.updateBuffs(dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    let speed = 0;
    const baseSpeed = this.def.speed * (this.slowT > 0 ? 0.55 : 1) * (this.enraged ? 1.2 : 1);
    if (this.stunT > 0) {
      if (Math.random() < dt * 4) FX.emit({ x: this.pos.x + (Math.random() - 0.5) * 0.4, y: this.headY() + 0.3, z: this.pos.z + (Math.random() - 0.5) * 0.4, vy: 0.2, life: 0.6, size: 0.25, color: '#ffe060' });
    } else if (this.state === 'idle') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rand(4, 10);
        if (!this.isBoss && this.spawn) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * this.spawn.r;
          this.wanderTo = V(this.spawn.x + Math.cos(a) * r, 0, this.spawn.z + Math.sin(a) * r);
        }
      }
      if (this.wanderTo) {
        const d = Math.hypot(this.wanderTo.x - this.pos.x, this.wanderTo.z - this.pos.z);
        if (d < 1) this.wanderTo = null;
        else { speed = baseSpeed * 0.35; this.moveToward(this.wanderTo, speed, dt); }
      }
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.05 * dt);
    } else if (this.state === 'return') {
      const d = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
      if (d < 2) { this.state = 'idle'; this.hp = this.maxHp; this.buffs = []; }
      else { speed = baseSpeed * 1.3; this.moveToward(this.home, speed, dt, false); }
    } else if (this.state === 'chase') {
      let t = this.target;
      const leash = this.isBoss ? 75 : 95;
      const homeD = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
      let inCity = false;
      if (t) for (const c of CITIES) if (Math.hypot(t.pos.x - c.x, t.pos.z - c.z) < c.r + 4) inCity = true;
      if (!t || !t.alive || homeD > leash || inCity) {
        // ищем другую цель среди союзников игрока
        const alt = !inCity && homeD < leash ? g.friendlies().find(f => f.alive && f.distTo(this) < 15) : null;
        if (alt) this.target = alt;
        else { this.state = 'return'; this.target = null; if (this.isBoss) g.ui.bossDisengage(this); }
      } else {
        if (this.tauntT > 0) this.tauntT -= dt;
        else if (t === g.player) { this.retargetT = (this.retargetT || 0) - dt; if (this.retargetT <= 0) { this.retargetT = 0.8; const al = this.nearestAlly(25); if (al) this.target = al; } }
        t = this.target;
        const d = this.distTo(t);
        const reach = this.ranged ? 15 : this.radius + t.radius + 1.3;
        if (this.casting) {
          // способность босса в процессе
        } else if (d > reach) {
          if (this.canMove) { speed = baseSpeed; this.moveToward(t.pos, speed, dt); }
        } else {
          this.faceTo(t.pos, Math.min(1, dt * 8));
          if (this.ranged && d < 6 && this.canMove && !this.isBoss) { speed = -baseSpeed * 0.6; this.moveToward(t.pos, speed, dt); }
        }
        this.atkT -= dt;
        if (this.atkT <= 0 && d <= reach + 0.5 && !this.casting) { this.atkT = this.atkInterval; this.attack(t); }
        if (this.isBoss) this.bossUpdate(dt, t);
      }
    }
    // разделение мобов
    if (this.state === 'chase') {
      for (const m of g.mobs.active) {
        if (m === this || !m.alive) continue;
        const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z;
        const dd = Math.hypot(dx, dz), min = this.radius + m.radius;
        if (dd < min && dd > 0.001) { this.pos.x += dx / dd * (min - dd) * 0.5; this.pos.z += dz / dd * (min - dd) * 0.5; }
      }
    }
    this.pos.y = this.def.model === 'wraith' || this.def.model === 'elemental' ? Math.max(0.2, g.world.standY(this.pos.x, this.pos.z)) : Math.max(g.world.standY(this.pos.x, this.pos.z), -1.4);
    if (this.model) {
      this.model.update(dt, { speed: Math.abs(speed) > 0.01 ? speed / this.scale : 0, runSpeed: 6, howl: this.howling > 0, breathing: this.breathing > 0 });
      if (this.howling > 0) this.howling -= dt;
      if (this.breathing > 0) this.breathing -= dt;
      this.syncModel();
    }
  }

  moveToward(p, speed, dt, collide = true) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const dir = Math.sign(speed);
    this.pos.x += dx / d * Math.abs(speed) * dt * dir;
    this.pos.z += dz / d * Math.abs(speed) * dt * dir;
    if (collide) this.game.world.collision.resolve(this.pos, this.radius * 0.8);
    this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
  }

  attack(t) {
    const g = this.game;
    if (!this.model) return;
    const m = this.def.model;
    const anim = this.ranged ? 'cast' : (m === 'humanoid' || m === 'lich') ? (['greatsword', 'hammer'].includes(this.def.weapon && this.def.weapon.wtype) ? 'slam' : this.def.weapon && this.def.weapon.wtype === 'scythe' ? 'sweep' : 'slash') : 'bite';
    this.model.playAction(anim);
    if (this.ranged) {
      g.schedule(0.35, () => {
        if (!this.alive || !t.alive) return;
        const from = this.center().add(V(Math.sin(this.yaw) * 0.6, 0.3, Math.cos(this.yaw) * 0.6));
        const kind = this.def.ranged === 'spear' ? 'spear' : this.def.ranged === 'fire' ? 'fire' : this.isBoss ? 'frost' : 'shadow';
        g.effects.projectile(kind, from, () => (t.alive ? t.center() : null), 24, (p) => {
          g.combat.dealDamage(this, t, this.ap);
          hitFx(g, kind === 'fire' ? 'explosion' : 'default', p, { color: kind === 'shadow' ? '#8060ff' : '#80d0ff', size: 0.5 });
        });
      });
    } else {
      g.schedule(0.3, () => {
        if (!this.alive || !t.alive || this.stunT > 0) return;
        if (this.distTo(t) > this.radius + t.radius + 2.2) return;
        g.combat.dealDamage(this, t, this.ap);
        const c = t.center();
        FX.burst(c.x, c.y, c.z, 8, { color: ['#ff4030', '#ffffff'], speed: 4, life: 0.3, size: 0.25 });
        g.ui.sound('hurt');
      });
    }
  }

  // ---------------- Способности боссов ----------------
  bossUpdate(dt, t) {
    const g = this.game;
    const hpk = this.hp / this.maxHp;
    if (hpk < 0.3 && !this.enraged) {
      this.enraged = true;
      this.addBuff({ id: 'enrage', dur: 9999, mods: { dmgMul: 1.3 } });
      g.ui.notify(`${this.name} впадает в ярость!`, '#ff4030', true);
      g.effects.attachAura(this.model.root, '#ff3010', 9999, 2.5 * this.scale / 2);
    }
    this.abilityT -= dt * (hpk < 0.5 ? 1.4 : 1);
    if (this.abilityT > 0 || this.casting || this.stunT > 0) return;
    this.abilityT = rand(6, 9);
    const ab = pick(this.bossDef.abilities);
    this.doAbility(ab, t);
  }

  friendliesIn(x, z, r) { return this.game.combat.enemiesInRadius('enemy', x, z, r); }

  doAbility(ab, t) {
    const g = this.game, E = g.effects;
    const me = this;
    const ap = this.ap;
    const sc = this.scale / 3;
    this.casting = true;
    const done = (delay) => g.schedule(delay, () => { me.casting = false; });
    const groundAt = (p) => p.clone().setY(g.world.standY(p.x, p.z));
    switch (ab) {
      case 'slam': case 'stomp': {
        const r = (ab === 'stomp' ? 11 : 8) * Math.max(1, sc);
        E.telegraph(groundAt(this.pos), r, 1.6);
        g.ui.bossCast(this, ab === 'stomp' ? 'Сотрясение' : 'Сокрушительный удар');
        g.schedule(1.1, () => this.model && this.model.playAction('slam'));
        g.schedule(1.6, () => {
          if (!this.alive) return;
          E.ringWave(this.pos, '#ffb060', r, 0.6);
          FX.ring(this.pos.x, this.pos.y + 0.3, this.pos.z, r * 0.5, 50, { color: '#8a7050', speed: 8, vy: 3, life: 0.8, size: 1, additive: false, alpha: 0.7, gravity: 8 });
          g.shake(0.8);
          for (const f of this.friendliesIn(this.pos.x, this.pos.z, r)) {
            g.combat.dealDamage(this, f, ap * 2.2);
            if (ab === 'stomp') f.slowT = 3;
          }
        });
        done(1.9);
        break;
      }
      case 'leap': {
        const dest = t.pos.clone();
        E.telegraph(groundAt(dest), 5, 1.2);
        g.ui.bossCast(this, 'Прыжок');
        const start = this.pos.clone();
        g.schedule(0.6, () => {
          E.add(null, 0.6, (dt, k) => {
            if (!this.alive) return true;
            this.pos.x = start.x + (dest.x - start.x) * k; this.pos.z = start.z + (dest.z - start.z) * k;
            if (this.model) this.model.root.position.y = this.pos.y + Math.sin(k * Math.PI) * 6;
          }, () => {
            if (!this.alive) return;
            g.shake(0.7);
            E.ringWave(dest, '#a0a0ff', 6, 0.5);
            for (const f of this.friendliesIn(dest.x, dest.z, 5)) g.combat.dealDamage(this, f, ap * 2.0);
          });
        });
        done(1.3);
        break;
      }
      case 'howl': case 'summon': {
        g.ui.bossCast(this, ab === 'howl' ? 'Зов стаи' : 'Призыв');
        this.howling = 1.4;
        E.ringWave(this.pos, '#80a0ff', 14, 1.0, 1);
        g.schedule(1.0, () => {
          if (!this.alive) return;
          const type = this.typeKey === 'cultist' ? 'skeleton' : this.typeKey === 'drake' ? 'fireelem' : this.typeKey === 'golem' ? 'golem' : this.typeKey;
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const add = g.mobs.spawnAdd(type, Math.max(1, this.level - 3), this.pos.x + Math.cos(a) * 5, this.pos.z + Math.sin(a) * 5);
            add.aggro(t, true);
            FX.burst(add.pos.x, add.pos.y + 1, add.pos.z, 25, { color: ['#80ff90', '#ffffff'], speed: 4, life: 0.6, size: 0.4 });
          }
        });
        done(1.4);
        break;
      }
      case 'poisonpool': {
        const p = groundAt(t.pos);
        E.telegraph(p, 5.5, 1.4, '#60ff20');
        g.ui.bossCast(this, 'Ядовитая лужа');
        g.schedule(1.4, () => {
          if (!this.alive) return;
          E.ringWave(p, '#70ff30', 5.5, 0.5);
          const m = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), new THREE.MeshBasicMaterial({ color: '#4a9a10', transparent: true, opacity: 0.45, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; m.position.copy(p).setY(p.y + 0.12);
          let tick = 0;
          E.add(m, 7, (dt) => {
            tick += dt;
            if (Math.random() < dt * 30) { const a = Math.random() * 6.28, r = Math.random() * 5; FX.emit({ x: p.x + Math.cos(a) * r, y: p.y + 0.2, z: p.z + Math.sin(a) * r, vy: 1, life: 1, size: 0.5, color: '#80ff30' }); }
            if (tick >= 1) { tick = 0; for (const f of this.friendliesIn(p.x, p.z, 5.5)) g.combat.dealDamage(this, f, ap * 0.7, { color: '#80ff30' }); }
          });
        });
        done(1.6);
        break;
      }
      case 'rockfall': case 'blizzard': case 'meteor': {
        const n = ab === 'meteor' ? 3 : 5;
        const name = ab === 'rockfall' ? 'Камнепад' : ab === 'blizzard' ? 'Ледяная буря' : 'Огненный дождь';
        g.ui.bossCast(this, name);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 3 + Math.random() * 6;
          const p = groundAt(t.pos.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)));
          const rad = ab === 'meteor' ? 5.5 : 3.5;
          const delay = i * 0.25;
          g.schedule(delay, () => E.telegraph(p, rad, 1.6, ab === 'blizzard' ? '#60c0ff' : '#ff3010'));
          g.schedule(delay + 1.6, () => {
            if (ab === 'meteor') { E.meteor(p, '#ff5020', null); }
            else {
              const geo = ab === 'blizzard' ? new THREE.OctahedronGeometry(0.9) : new THREE.DodecahedronGeometry(1.1, 0);
              const mat = ab === 'blizzard' ? new THREE.MeshStandardMaterial({ color: '#a0e0ff', emissive: '#4080c0', emissiveIntensity: 0.8, roughness: 0.2 }) : new THREE.MeshStandardMaterial({ color: '#6a6058', roughness: 0.9, flatShading: true });
              const mesh = new THREE.Mesh(geo, mat);
              if (ab === 'blizzard') mesh.scale.set(0.6, 2, 0.6);
              E.dropFromSky(p, mesh, 0.01, null, 0);
              E.add(mesh, 0.6, (dt, k) => { mesh.position.copy(p).setY(p.y + (1 - k) * 0.5); });
              FX.burst(p.x, p.y + 0.5, p.z, 22, { color: ab === 'blizzard' ? ['#a0e8ff', '#ffffff'] : '#7a6a50', speed: 6, life: 0.7, size: 0.6, additive: ab === 'blizzard', alpha: 0.9, gravity: 8, up: 3 });
            }
          });
          g.schedule(delay + (ab === 'meteor' ? 2.4 : 1.65), () => {
            if (!this.alive) return;
            g.shake(0.35);
            for (const f of this.friendliesIn(p.x, p.z, rad)) { g.combat.dealDamage(this, f, ap * (ab === 'meteor' ? 2.3 : 1.7)); if (ab === 'blizzard') f.slowT = 2.5; }
          });
        }
        done(1.0);
        break;
      }
      case 'frostnova': {
        const r = 10;
        E.telegraph(groundAt(this.pos), r, 1.8, '#60c0ff');
        g.ui.bossCast(this, 'Ледяная нова');
        g.schedule(1.2, () => this.model && this.model.playAction('cast2'));
        g.schedule(1.8, () => {
          if (!this.alive) return;
          hitFx(g, 'frost', this.center());
          E.ringWave(this.pos, '#a0e8ff', r, 0.7);
          FX.ring(this.pos.x, this.pos.y + 0.6, this.pos.z, 0.5, 70, { color: ['#a0e8ff', '#ffffff'], speed: r * 2.2, life: 0.6, size: 0.7, drag: 0.92 });
          for (const f of this.friendliesIn(this.pos.x, this.pos.z, r)) { g.combat.dealDamage(this, f, ap * 1.8); f.rootT = 2.5; }
        });
        done(2.0);
        break;
      }
      case 'firebreath': {
        const dir = V(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
        const len = 20, ang = 0.45;
        for (let i = 1; i <= 5; i++) {
          const c = groundAt(this.pos.clone().addScaledVector(dir, i * len / 5.5));
          E.telegraph(c, 1.2 + i * 1.3, 1.6);
        }
        g.ui.bossCast(this, 'Пламя Изначальное');
        this.faceTo(t.pos);
        g.schedule(1.4, () => { this.breathing = 1.6; this.model && this.model.playAction('cast2'); });
        let tick = 0;
        g.schedule(1.6, () => {
          E.add(null, 1.4, (dt) => {
            if (!this.alive) return true;
            const head = this.center().add(V(0, this.scale * 0.6, 0)).addScaledVector(dir, this.scale * 1.6);
            for (let i = 0; i < 14; i++) {
              const a = (Math.random() - 0.5) * ang * 2;
              const dx = dir.x * Math.cos(a) - dir.z * Math.sin(a), dz = dir.x * Math.sin(a) + dir.z * Math.cos(a);
              const sp = 16 + Math.random() * 8;
              FX.emit({ x: head.x, y: head.y, z: head.z, vx: dx * sp, vy: -2 + Math.random() * 2, vz: dz * sp, life: 1.0, size: 1.4 + Math.random(), color: Math.random() < 0.5 ? '#ff6010' : '#ffc040', grow: 1.5, drag: 0.97 });
            }
            tick += dt;
            if (tick >= 0.4) {
              tick = 0;
              for (const f of g.friendlies()) {
                if (!f.alive) continue;
                const fx = f.pos.x - this.pos.x, fz = f.pos.z - this.pos.z, d = Math.hypot(fx, fz);
                if (d > len) continue;
                const da = Math.acos(clamp((fx * dir.x + fz * dir.z) / Math.max(0.01, d), -1, 1));
                if (da < ang) g.combat.dealDamage(this, f, ap * 0.9, { color: '#ff8020' });
              }
            }
          });
          E.flash(this.center(), '#ff6020', 60, 1.4, 30);
        });
        done(3.0);
        break;
      }
      default: this.casting = false;
    }
  }
}

// ---------------- Союзники (призванные) ----------------
const ALLY_DEFS = {
  skeleton: { name: 'Скелет-воин', type: 'skeleton', hp: 0.35, dmg: 0.32, speed: 7, scale: 1 },
  bonegolem: { name: 'Костяной голем', type: 'golem', hp: 1.0, dmg: 0.6, speed: 6.2, scale: 1.1, override: { fur: '#d8cfb4', fur2: '#60ff80' } },
  deathknight: { name: 'Рыцарь Смерти', type: 'fallen', hp: 0.9, dmg: 0.9, speed: 7, scale: 1.3, override: {} },
  spiritwolf: { name: 'Дух-волк', type: 'wolf', hp: 0.6, dmg: 0.5, speed: 8.5, scale: 1.25, override: { fur: '#6aa8d8', fur2: '#c0e8ff', eye: '#ffffff' } },
};

export class Ally extends Entity {
  constructor(game, kind, pos, dur) {
    super(game);
    const D = ALLY_DEFS[kind];
    const P = game.player;
    this.kind = kind;
    this.team = 'player';
    this.owner = P;
    this.allyName = D.name;
    this.level = P.level;
    const mul = P.minionMul || 1;
    this.maxHp = this.hp = Math.round(P.maxHp * D.hp * mul);
    this.ap = P.ap * D.dmg * mul;
    this.armor = P.armor * 0.8;
    this.speed = D.speed;
    this.dur = dur; this.t = 0;
    this.pos.copy(pos);
    this.pos.y = game.world.standY(pos.x, pos.z);
    const def = Object.assign({}, MOB_TYPES[D.type], D.override || {});
    if (kind === 'deathknight') def.armor = { kind: 'heavy', c1: '#1a1a20', c2: '#1a5a3a', trim: '#40ff90', tier: 7, style: 1, gem: '#40ff90' };
    if (kind === 'deathknight') def.spec = Object.assign({}, def.spec, { eyes: { color: '#40ff90' } });
    if (kind === 'skeleton') def.spec = Object.assign({}, def.spec, { eyes: { color: '#40ff90' } });
    this.model = buildCreature(def);
    this.model.root.scale.setScalar(D.scale);
    this.scale = D.scale;
    this.radius = 0.45 * D.scale;
    game.scene.add(this.model.root);
    this.atkT = 0.5;
    this.critChance = 0.05; this.critDmg = 1.5;
    this.offset = Math.random() * Math.PI * 2;
    if (kind === 'spiritwolf') this.model.root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.75; o.material.emissive = new THREE.Color('#4080c0'); o.material.emissiveIntensity = 0.5; } });
    FX.burst(this.pos.x, this.pos.y + 0.5, this.pos.z, 40, { color: kind === 'spiritwolf' ? ['#80d0ff', '#ffffff'] : ['#60ff80', '#20a040'], speed: 4, up: 3, life: 0.8, size: 0.5 });
    this.riseT = kind === 'spiritwolf' ? 0 : 1.1; // нежить встаёт из-под земли
  }
  get name() { return this.allyName; }
  onDamaged(src) { if (!this.target && src && src.alive) this.target = src; }
  onDeath() { this.model.die(); this.deathT = 0; }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.model ? this.model.headTop() * 0.55 : 1), this.pos.z); }
  update(dt) {
    const g = this.game, P = g.player;
    this.t += dt;
    if (!this.alive) { this.deathT += dt; this.model.update(dt, { speed: 0 }); return; }
    if (this.riseT > 0) {
      this.riseT -= dt;
      this.model.update(dt, { speed: 0 });
      this.model.root.position.set(this.pos.x, this.pos.y - Math.max(0, this.riseT) * 1.9 * this.scale, this.pos.z);
      if (Math.random() < 0.6) FX.emit({ x: this.pos.x + (Math.random() - 0.5) * 1.2, y: this.pos.y + 0.1, z: this.pos.z + (Math.random() - 0.5) * 1.2, vy: 2, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, gravity: 8, life: 0.8, size: 0.35, color: '#4a3a2a', additive: false, alpha: 0.85 });
      return;
    }
    if (this.t > this.dur || !P.alive) { this.hp = 0; this.alive = false; this.onDeath(); return; }
    this.updateBuffs(dt);
    let speed = 0;
    // выбор цели
    if (this.target && (!this.target.alive || this.target.distTo(P) > 35)) this.target = null;
    if (!this.target) {
      if (g.target && g.target.alive && g.target.team === 'enemy' && P.engaged && g.target.distTo(P) < 30) this.target = g.target;
      else {
        const threat = g.mobs.active.find(m => m.alive && m.target && (m.target === P || m.target === this) && m.distTo(P) < 25);
        if (threat) this.target = threat;
      }
    }
    const dP = this.distTo(P);
    if (dP > 45) { this.pos.copy(P.pos); FX.burst(this.pos.x, this.pos.y + 1, this.pos.z, 20, { color: '#60ff80', speed: 3, life: 0.5, size: 0.4 }); }
    if (this.target && this.canAct) {
      const t = this.target;
      const d = this.distTo(t), reach = this.radius + t.radius + 1.2;
      if (d > reach) { speed = this.speed; this.moveToward(t.pos, speed, dt); }
      else {
        this.faceTo(t.pos, Math.min(1, dt * 8));
        this.atkT -= dt;
        if (this.atkT <= 0) {
          this.atkT = 1.5;
          this.model.playAction(this.kind === 'spiritwolf' ? 'bite' : this.kind === 'bonegolem' ? 'slam' : 'slash');
          g.schedule(0.3, () => {
            if (!this.alive || !t.alive) return;
            g.combat.dealDamage(this, t, this.ap);
            t.aggro && t.aggro(this);
            const c = t.center();
            FX.burst(c.x, c.y, c.z, 8, { color: ['#60ff80', '#ffffff'], speed: 4, life: 0.3, size: 0.25 });
          });
        }
      }
    } else {
      const fp = P.pos.clone().add(V(Math.sin(P.yaw + Math.PI + this.offset * 0.4 - 0.6) * 3, 0, Math.cos(P.yaw + Math.PI + this.offset * 0.4 - 0.6) * 3));
      const d = Math.hypot(fp.x - this.pos.x, fp.z - this.pos.z);
      if (d > 1.5) { speed = Math.min(this.speed * 1.2, d * 2); this.moveToward(fp, speed, dt); }
    }
    this.pos.y = g.world.standY(this.pos.x, this.pos.z);
    this.model.update(dt, { speed: speed / this.scale, runSpeed: 6 });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
  moveToward(p, speed, dt) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    this.pos.x += dx / d * speed * dt; this.pos.z += dz / d * speed * dt;
    this.game.world.collision.resolve(this.pos, this.radius * 0.8);
    this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
  }
}

export class AllyManager {
  constructor(game) { this.game = game; this.list = []; }
  summon(kind, pos, dur, max) {
    const same = this.list.filter(a => a.kind === kind && a.alive);
    while (same.length >= max) { const o = same.shift(); o.alive = false; o.hp = 0; o.onDeath(); }
    this.list.push(new Ally(this.game, kind, pos, dur));
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.update(dt);
      if (!a.alive && a.deathT > 2) { a.model.root.removeFromParent(); this.list.splice(i, 1); }
    }
  }
  clear() { for (const a of this.list) a.model.root.removeFromParent(); this.list = []; }
}

// ---------------- Менеджер монстров ----------------
export class MobManager {
  constructor(game) {
    this.game = game;
    this.all = [];
    this.active = [];
    this.adds = [];
    this.bosses = [];
    this.scanT = 0;
    this.engagedCount = 0;
    for (const sp of SPAWNS) {
      sp.mobs = [];
      for (let i = 0; i < sp.count; i++) {
        const m = this.makeMob(sp);
        sp.mobs.push(m);
        this.all.push(m);
      }
    }
    for (const b of BOSSES) {
      const m = new Mob(game, b.type, b.lvl, null, { boss: b, x: b.x, z: b.z });
      m.bossId = b.id;
      this.bosses.push(m);
      this.all.push(m);
    }
  }
  makeMob(sp) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp.r;
    let x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
    // избегаем воды
    for (let k = 0; k < 6 && this.game.world.groundY(x, z) < 0.3; k++) { const a2 = Math.random() * 6.28, r2 = Math.random() * sp.r; x = sp.x + Math.cos(a2) * r2; z = sp.z + Math.sin(a2) * r2; }
    const lvl = Math.floor(rand(sp.lvl[0], sp.lvl[1] + 0.999));
    return new Mob(this.game, sp.type, lvl, sp, { x, z, elite: sp.elite });
  }
  spawnAdd(type, lvl, x, z) {
    const m = new Mob(this.game, type, lvl, null, { x, z, isAdd: true, addMul: 0.6 });
    m.ensureModel();
    this.adds.push(m);
    this.all.push(m);
    this.active.push(m);
    return m;
  }
  nearestEnemy(pos, r) {
    let best = null, bd = r;
    for (const m of this.active) { if (!m.alive) continue; const d = Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  bossById(id) { return this.bosses.find(b => b.bossId === id); }

  onMobDeath(m, src) {
    const g = this.game, P = g.player;
    if (g.target === m) g.ui.updateTarget();
    if (m.isBoss) g.ui.bossDisengage(m, true);
    if (m.isAdd) return;
    const killedByPlayer = src === P || (src && src.owner === P) || m.lastHitT > 0;
    if (!killedByPlayer || !P.alive) return;
    // опыт
    const diff = m.level - P.level;
    let mul = diff >= 0 ? 1 + Math.min(diff, 5) * 0.1 : diff < -8 ? 0.05 : Math.max(0.1, 1 + diff * 0.1);
    let xp = mobXp(m.level) * mul * (m.elite ? 2.5 : 1) * (m.isBoss ? 18 : 1);
    P.gainXp(xp);
    // золото
    const gold = Math.round((m.level * 1.6 + rand(1, 6)) * (m.elite ? 3 : 1) * (m.isBoss ? 40 : 1));
    P.gold += gold;
    g.ui.loot(`+${gold} золота`, '#ffd700');
    // добыча
    const drops = [];
    if (m.isBoss) {
      drops.push(bossItem(m.bossId, P.cls, m.level + 2));
      drops.push(bossItem(m.bossId, P.cls, m.level + 2));
      drops.push(randomGear(P.cls, m.level, 2 + (Math.random() < 0.5 ? 1 : 0)));
      g.ui.notify(`${m.name} повержен!`, '#ffb030', true);
    } else {
      if (Math.random() < (m.elite ? 0.4 : 0.12)) drops.push(randomGear(P.cls, clamp(m.level + Math.floor(rand(-1, 2)), 1, 100), rollRarity(m.elite ? 0.5 : 0)));
      if (Math.random() < 0.08) drops.push(makePotion(P.level >= 75 ? (Math.random() < 0.5 ? 'hp4' : 'mp4') : P.level >= 50 ? (Math.random() < 0.5 ? 'hp3' : 'mp3') : P.level >= 25 ? (Math.random() < 0.5 ? 'hp2' : 'mp2') : (Math.random() < 0.6 ? 'hp1' : 'mp1')));
      if (Math.random() < 0.22) drops.push(makeJunk(m.level));
    }
    for (const it of drops) {
      if (P.addItem(it)) g.ui.lootItem(it);
      else g.ui.error('Сумка переполнена! Предмет потерян.');
    }
    g.quests.onKill(m);
    // таймер возрождения
    m.respawnT = m.isBoss ? m.bossDef.respawn : rand(35, 55);
  }

  update(dt) {
    const g = this.game, P = g.player;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      this.active = [];
      for (const m of this.all) {
        const d = Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z);
        if (d < 170 && (m.alive || m.model)) { this.active.push(m); m.ensureModel(); }
        else if (d > 220 && m.model && m.alive) m.disposeModel();
      }
    }
    let engaged = 0;
    for (const m of this.active) {
      m.update(dt);
      if (m.alive && m.state === 'chase' && m.target && (m.target === P || m.target.owner === P)) engaged++;
      // агрессия по близости
      if (m.alive && m.state === 'idle' && P.alive && m.level >= P.level - 8) {
        const d = m.distTo(P);
        const ag = m.def.aggro * (m.isBoss ? 1.2 : 1) * (m.level > P.level + 3 ? 1.3 : 1);
        if (d < ag) {
          let inCity = false;
          for (const c of CITIES) if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < c.r + 4) inCity = true;
          if (!inCity) m.aggro(P);
        }
      }
    }
    this.engagedCount = engaged;
    // возрождение
    for (const m of this.all) {
      if (m.alive || m.isAdd) continue;
      m.respawnT -= dt;
      if (m.respawnT <= 0 && !m.model) {
        const d = Math.hypot(m.home.x - P.pos.x, m.home.z - P.pos.z);
        if (d < 30) { m.respawnT = 5; continue; }
        if (m.isBoss) this.reviveMob(m, m.home.x, m.home.z);
        else {
          const sp = m.spawn;
          const fresh = this.makeMob(sp);
          const idx = this.all.indexOf(m);
          this.all[idx] = fresh;
          sp.mobs[sp.mobs.indexOf(m)] = fresh;
        }
      }
    }
    // убираем мёртвые добавки
    for (let i = this.adds.length - 1; i >= 0; i--) {
      const a = this.adds[i];
      if (!a.alive && !a.model) { this.adds.splice(i, 1); this.all.splice(this.all.indexOf(a), 1); }
    }
  }
  reviveMob(m, x, z) {
    m.alive = true; m.hp = m.maxHp; m.state = 'idle'; m.target = null; m.buffs = []; m.enraged = false; m.casting = false;
    m.pos.set(x, this.game.world.standY(x, z), z);
  }
  resetAggroOnPlayerDeath() {
    for (const m of this.all) if (m.alive && m.state === 'chase') { m.state = 'return'; m.target = null; }
    for (const a of this.adds) if (a.alive) { a.alive = false; a.hp = 0; a.onDeath(null); }
  }
}
