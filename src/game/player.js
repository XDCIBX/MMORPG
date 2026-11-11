// Игрок: характеристики, снаряжение, инвентарь, передвижение, автоатака, умения, опыт.
import * as THREE from 'three';
import { Entity } from './entity.js';
import { Humanoid } from '../chars/humanoid.js';
import { equipVisual, animateGear, WEAPON_ANIM } from '../chars/gear.js';
import { CLASSES, BRANCH_LEVEL, xpNeeded } from '../data/classes.js';
import { SLOTS, starterKit, makePotion } from '../data/items.js';
import { castSkill, levelUpFx, hitFx } from './skills.js';
import { FX } from '../fx/particles.js';
import { buildMount } from '../chars/beasts.js';
import { WeaponTrail } from '../fx/trails.js';
import { clamp, angleLerp } from '../core/util.js';

const BAG_SIZE = 40;

export function buildPlayerModel(cls, female, equipment, branch = null) {
  const C = CLASSES[cls];
  const look = JSON.parse(JSON.stringify(female ? C.look.female : C.look.male));
  look.base = { shirt: '#6a5a48', pants: '#4a3a2a', boots: '#3a2a1a' };
  const h = new Humanoid(look);
  for (const s of ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'weapon', 'offhand']) {
    const it = equipment[s];
    equipVisual(h, s, it ? displayItem(it, cls, branch) : null);
  }
  return h;
}

// Подмена цветов мантии для веток мага (свет/тьма)
function displayItem(it, cls, branch) {
  if (!branch || !it.vis) return it;
  const B = CLASSES[cls].branches[branch];
  if (B && B.robe && it.vis.kind === 'cloth') return Object.assign({}, it, { vis: Object.assign({}, it.vis, B.robe) });
  if (B && B.robe && it.slot === 'weapon') return Object.assign({}, it, { vis: Object.assign({}, it.vis, { gem: B.robe.gem }) });
  return it;
}

export class Player extends Entity {
  constructor(game, data) {
    super(game);
    this.team = 'player';
    this.cls = data.cls;
    this.C = CLASSES[data.cls];
    this.playerName = data.name || 'Герой';
    this.female = !!data.female;
    this.level = data.level || 1;
    this.xp = data.xp || 0;
    this.gold = data.gold == null ? 25 : data.gold;
    this.branch = data.branch || null;
    this.equipment = {};
    for (const s of SLOTS) this.equipment[s] = null;
    this.bag = new Array(BAG_SIZE).fill(null);
    if (data.equipment) Object.assign(this.equipment, data.equipment);
    else Object.assign(this.equipment, starterKit(this.cls));
    if (data.bag) data.bag.forEach((it, i) => { if (i < BAG_SIZE) this.bag[i] = it; });
    else { this.addItem(makePotion('hp1', 5)); if (this.C.resource === 'Мана') this.addItem(makePotion('mp1', 3)); }
    this.cooldowns = {};
    this.gcd = 0;
    this.atkTimer = 0;
    this.engaged = false;
    this.casting = null;
    this.vy = 0;
    this.onGround = true;
    this.jumpOffset = 0;
    this.dashing = 0;
    this.radius = 0.45;
    this.moveSpeed = 0;
    this.buildModel();
    this.trail = new WeaponTrail(game.scene, this.trailColor());
    this.recalc();
    this.hp = data.hp ? Math.min(data.hp, this.maxHp) : this.maxHp;
    this.res = data.res != null ? Math.min(data.res, this.maxRes) : this.maxRes;
    if (this.C.resource === 'Ярость' && data.res == null) this.res = 30;
  }
  get name() { return this.playerName; }

  buildModel() {
    const old = this.model;
    this.model = buildPlayerModel(this.cls, this.female, this.equipment, this.branch);
    this.model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    if (old) {
      this.model.root.position.copy(old.root.position);
      this.model.root.rotation.copy(old.root.rotation);
      old.root.removeFromParent();
    }
    this.game.scene.add(this.model.root);
  }

  refreshVisual(slot) {
    const it = this.equipment[slot];
    equipVisual(this.model, slot, it ? displayItem(it, this.cls, this.branch) : null);
    this.model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  recalc() {
    const C = this.C, L = this.level;
    const st = { str: C.base.str, agi: C.base.agi, int: C.base.int, sta: C.base.sta };
    const main = C.mainStat;
    for (const k of ['str', 'agi', 'int']) st[k] += (L - 1) * (k === main ? 2.0 : 0.6);
    st.sta += (L - 1) * 1.6;
    let armor = 0, critG = 0, wdmg = 0, wspeed = 1;
    for (const s of SLOTS) {
      const it = this.equipment[s];
      if (!it) continue;
      for (const [k, v] of Object.entries(it.stats || {})) {
        if (k in st) st[k] += v;
        else if (k === 'armor') armor += v;
        else if (k === 'crit') critG += v;
        else if (k === 'dmg') wdmg += v;
      }
      if (s === 'weapon') wspeed = it.speed || 1;
    }
    const bp = this.branch ? C.branches[this.branch].passive : {};
    this.stats = st;
    const hpMul = bp.hpMul || 1;
    this.maxHp = Math.round((C.base.hp + C.base.hpLvl * (L - 1) + st.sta * 8) * hpMul);
    const mana = C.resource === 'Мана';
    this.maxRes = mana ? Math.round(C.base.res + C.base.resLvl * (L - 1) + st.int * 4) : 100;
    this.ap = Math.round((wdmg || 3 + L * 2) + st[main] * 1.0);
    this.armor = Math.round((armor + st.sta * 0.3) * (bp.armorMul || 1));
    this.critChance = clamp(C.base.crit + critG / 100 + st.agi * 0.0003 + (bp.crit || 0), 0, 0.75);
    this.critDmg = 1.6 + (bp.critDmg || 0);
    this.hasteMul = (bp.hasteMul || 1) * this.mod('hasteMul');
    this.atkInterval = C.atkSpeed / wspeed / this.hasteMul;
    this.rangeAdd = bp.rangeAdd || 0;
    this.healMul = bp.healMul || 1;
    this.lifestealBase = bp.lifesteal || 0;
    this.maxMinions = bp.maxMinions || 3;
    this.minionMul = bp.minionMul || 1;
    this.branchDmgMul = bp.dmgMul || 1;
    this.speed = C.base.speed;
    this.hp = Math.min(this.hp, this.maxHp);
    this.res = Math.min(this.res == null ? this.maxRes : this.res, this.maxRes);
  }
  // модификатор урона включает пассивку ветки
  mod(key, def = 1) {
    let v = super.mod(key, def);
    if (key === 'dmgMul' && this.branchDmgMul) v *= this.branchDmgMul;
    return v;
  }

  get resourceName() { return this.C.resource; }

  // ---------- Инвентарь ----------
  addItem(item) {
    if (item.stack) {
      const ex = this.bag.find(b => b && b.stack && b.type === item.type && (b.key || b.name) === (item.key || item.name));
      if (ex) { ex.count += item.count || 1; return true; }
    }
    const i = this.bag.findIndex(b => !b);
    if (i < 0) return false;
    this.bag[i] = item;
    return true;
  }
  countItem(name) { return this.bag.reduce((s, b) => s + (b && b.name === name ? (b.count || 1) : 0), 0); }
  removeItemByName(name, count) {
    for (let i = 0; i < this.bag.length && count > 0; i++) {
      const b = this.bag[i];
      if (b && b.name === name) {
        const take = Math.min(count, b.count || 1);
        b.count = (b.count || 1) - take; count -= take;
        if (b.count <= 0) this.bag[i] = null;
      }
    }
  }
  canEquip(it) {
    if (!it || it.type !== 'gear') return 'Это нельзя надеть';
    if (it.cls && it.cls !== this.cls) return `Только для класса «${CLASSES[it.cls].name}»`;
    if (it.req > this.level) return `Требуется уровень ${it.req}`;
    return null;
  }
  slotFor(it) {
    if (it.slot === 'ring') return !this.equipment.ring1 ? 'ring1' : !this.equipment.ring2 ? 'ring2' : 'ring1';
    return it.slot;
  }
  equipFromBag(i) {
    const it = this.bag[i];
    const err = this.canEquip(it);
    if (err) { this.game.ui.error(err); return false; }
    const slot = this.slotFor(it);
    const old = this.equipment[slot];
    this.equipment[slot] = it;
    this.bag[i] = old || null;
    this.refreshVisual(slot);
    this.recalc();
    this.game.ui.sound('equip');
    return true;
  }
  unequip(slot) {
    const it = this.equipment[slot];
    if (!it) return;
    const i = this.bag.findIndex(b => !b);
    if (i < 0) { this.game.ui.error('Сумка переполнена'); return; }
    this.bag[i] = it;
    this.equipment[slot] = null;
    this.refreshVisual(slot);
    this.recalc();
  }
  usePotion(kind) {
    const idx = this.bag.map((b, i) => [b, i]).filter(([b]) => b && b.type === 'potion' && b.kind === kind && b.req <= this.level).sort((a, b) => b[0].amount - a[0].amount)[0];
    if (!idx) { this.game.ui.error(kind === 'hp' ? 'Нет зелий здоровья' : 'Нет зелий маны'); return; }
    this.useBagItem(idx[1]);
  }
  useBagItem(i) {
    const it = this.bag[i];
    if (!it) return;
    if (it.type === 'gear') return this.equipFromBag(i);
    if (it.type === 'potion') {
      if (it.req > this.level) { this.game.ui.error(`Требуется уровень ${it.req}`); return; }
      if ((this.cooldowns.potion || 0) > 0) { this.game.ui.error('Зелья ещё не готовы'); return; }
      if (it.kind === 'hp') { this.game.combat.heal(this, it.amount, null); FX.burst(this.pos.x, this.pos.y + 1, this.pos.z, 20, { color: ['#ff6060', '#ffffff'], speed: 2, up: 2, life: 0.8, size: 0.3 }); }
      else { this.res = Math.min(this.maxRes, this.res + it.amount); FX.burst(this.pos.x, this.pos.y + 1, this.pos.z, 20, { color: ['#6080ff', '#ffffff'], speed: 2, up: 2, life: 0.8, size: 0.3 }); }
      this.cooldowns.potion = 8;
      it.count--;
      if (it.count <= 0) this.bag[i] = null;
      this.game.ui.sound('potion');
    }
  }

  // ---------- Умения ----------
  skillBar() {
    const base = this.C.skills.filter(s => !s.branch);
    const br = this.branch ? this.C.skills.filter(s => s.branch === this.branch) : [];
    return base.concat(br);
  }
  skillCost(s) {
    return this.C.resource === 'Мана' ? Math.round(s.cost * (1 + this.level * 0.045)) : s.cost;
  }
  trySkill(index) {
    const s = this.skillBar()[index];
    const g = this.game;
    if (!s || !this.alive) return;
    if (s.lvl > this.level) { g.ui.error(`Умение откроется на ${s.lvl} уровне`); return; }
    if (this.stunT > 0) { g.ui.error('Вы оглушены'); return; }
    if (this.casting) return;
    if ((this.cooldowns[s.id] || 0) > 0) { g.ui.error('Умение ещё не готово'); return; }
    if (this.gcd > 0) return;
    const cost = this.skillCost(s);
    if (this.res < cost) { g.ui.error(`Недостаточно: ${this.C.resource.toLowerCase()}`); return; }
    const needsTarget = ['melee', 'proj', 'charge', 'chain'].includes(s.type);
    let target = g.target && g.target.alive && g.target.team === 'enemy' ? g.target : null;
    if (!target && needsTarget) {
      target = g.mobs.nearestEnemy(this.pos, 25);
      if (target) g.setTarget(target);
    }
    if (needsTarget && !target) { g.ui.error('Нет цели'); return; }
    const range = (s.range || this.C.range) + (this.rangeAdd || 0) + (s.type === 'melee' ? 1.2 : 0);
    if (target && (needsTarget || s.type === 'aoeTarget' || s.type === 'rain' || s.type === 'pull') && !s.self) {
      const d = this.distTo(target) - target.radius;
      if (d > range) { g.ui.error('Цель слишком далеко'); return; }
    }
    if (target) this.faceTo(target.pos);
    this.engaged = true;
    if (s.cast) {
      this.casting = { skill: s, t: 0, dur: s.cast / this.hasteMul, target };
      this.model.playAction('cast', 0.6);
      return;
    }
    this.finishSkill(s, target);
  }
  finishSkill(s, target) {
    this.dismount();
    this.res -= this.skillCost(s);
    this.cooldowns[s.id] = s.cd;
    this.gcd = 0.5;
    this.atkTimer = Math.max(this.atkTimer, 0.6);
    castSkill(this.game, this, s, target);
    this.game.ui.sound('skill');
  }

  // ---------- Опыт ----------
  gainXp(n) {
    if (this.level >= 100) return;
    this.xp += Math.round(n);
    this.game.ui.floatText(this.center().setY(this.pos.y + 2.6), `+${Math.round(n)} опыта`, '#c890ff', false, false, true);
    while (this.level < 100 && this.xp >= xpNeeded(this.level)) {
      this.xp -= xpNeeded(this.level);
      this.level++;
      this.recalc();
      this.hp = this.maxHp; this.res = this.maxRes;
      levelUpFx(this.game, this);
      this.game.ui.levelUp(this.level);
      const newSkills = this.C.skills.filter(s => s.lvl === this.level && (!s.branch || s.branch === this.branch));
      for (const s of newSkills) this.game.ui.notify(`Новое умение: ${s.name}`, '#9ad0ff');
      if (this.level === BRANCH_LEVEL && !this.branch) this.game.schedule(1.5, () => this.game.ui.openBranch());
      this.game.quests.refreshMarkers();
    }
    if (this.level >= 100) this.xp = 0;
  }
  trailColor() {
    const B = this.branch && this.C.branches[this.branch];
    if (B) return B.color;
    return { dwarf: '#ffae50', warrior: '#bcd4ff', archer: '#e0ffd0', mage: '#a0b0ff', necro: '#60ffa0' }[this.cls];
  }
  setBranch(b) {
    this.branch = b;
    this.recalc();
    this.buildModel();
    this.hp = this.maxHp;
    const col = this.C.branches[b].color;
    this.game.effects.pillar(this.pos.clone(), col, 2, 22, 1.6);
    FX.burst(this.pos.x, this.pos.y + 1, this.pos.z, 100, { color: [col, '#ffffff'], speed: 8, life: 1.4, size: 0.5 });
    this.game.ui.notify(`Путь избран: ${this.C.branches[b].name}`, col, true);
    if (this.trail) this.trail.setColor(this.trailColor());
    this.game.save();
  }

  // ---------- Обновление ----------
  update(dt) {
    const g = this.game;
    this.updateBuffs(dt);
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    if (this.gcd > 0) this.gcd -= dt;
    if (this.atkTimer > 0) this.atkTimer -= dt;
    if (this.dashing > 0) this.dashing -= dt;
    const prevHaste = this.hasteMul;
    this.hasteMul = (this.branch ? this.C.branches[this.branch].passive.hasteMul || 1 : 1) * this.mod('hasteMul');
    if (prevHaste !== this.hasteMul) this.recalc();
    if (!this.alive) {
      this.model.update(dt, { speed: 0 });
      this.syncModel();
      return;
    }
    // ----- движение -----
    const inp = g.input;
    let mx = 0, mz = 0;
    if (inp.key('KeyW') || inp.key('ArrowUp') || inp.bothMouse) mz += 1;
    if (inp.key('KeyS') || inp.key('ArrowDown')) mz -= 1;
    if (inp.key('KeyA') || inp.key('ArrowLeft')) mx -= 1;
    if (inp.key('KeyD') || inp.key('ArrowRight')) mx += 1;
    if (inp.key('KeyQ')) mx -= 1;
    if (inp.key('KeyE')) mx += 1;
    // виртуальный джойстик (телефон): свободное направление, без шага назад
    const joy = inp.joy && inp.joy.active && Math.hypot(inp.joy.x, inp.joy.y) > 0.18;
    let joyMag = 1;
    if (joy) { mx += inp.joy.x; mz += inp.joy.y; joyMag = Math.min(1, Math.hypot(inp.joy.x, inp.joy.y) * 1.25); }
    const camYaw = g.cam.yaw;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    const len = Math.hypot(dx, dz);
    let speed = 0;
    const ground = g.world.standY(this.pos.x, this.pos.z);
    const swimming = ground < -1.0;
    const canMove = this.canMove && this.dashing <= 0;
    if (len > 0.01 && canMove) {
      dx /= len; dz /= len;
      if (this.casting) { this.casting = null; g.ui.error('Заклинание прервано'); }
      const back = !joy && mz < 0 && mx === 0;
      speed = this.speed * (this.mounted ? 1.95 : 1) * (this.slowT > 0 ? 0.6 : 1) * (swimming ? 0.65 : 1) * (back ? 0.6 : 1) * (joy ? (joyMag < 0.6 ? 0.45 : 1) : 1);
      const targetYaw = back ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      this.yaw = angleLerp(this.yaw, targetYaw, Math.min(1, dt * 12));
      const nx = this.pos.x + dx * speed * dt, nz = this.pos.z + dz * speed * dt;
      const p = { x: nx, z: nz };
      g.world.collision.resolve(p, this.radius);
      // не даём забираться на крутые скалы
      const ny = g.world.standY(p.x, p.z);
      if (ny - this.pos.y < 1.2 || !this.onGround) { this.pos.x = p.x; this.pos.z = p.z; }
      this.pos.x = clamp(this.pos.x, -770, 770); this.pos.z = clamp(this.pos.z, -770, 770);
      this.moveSpeed = back ? -speed : speed;
    } else this.moveSpeed = 0;
    // ездовое животное
    if (inp.pressed('KeyG')) this.toggleMount();
    if (this.mounted && swimming) this.dismount();
    // прыжок и гравитация
    if (inp.pressed('Space') && this.onGround && canMove && !swimming) { this.vy = 7.5; this.onGround = false; }
    const gy = g.world.standY(this.pos.x, this.pos.z);
    const floor = swimming ? -1.25 : gy;
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= floor) { this.pos.y = floor; this.onGround = true; this.vy = 0; }
    } else {
      this.pos.y = floor;
    }
    // круги и брызги на воде
    if (gy < 0.15 && this.pos.y < 0.4) {
      this.rippleT = (this.rippleT || 0) - dt;
      if (this.rippleT <= 0 && (speed > 0 || Math.random() < dt * 1.5)) {
        this.rippleT = speed > 0 ? 0.28 : 1.2;
        g.effects.ringWave(new THREE.Vector3(this.pos.x, 0.02, this.pos.z), '#d8ecff', speed > 0 ? 1.8 : 1.2, 1.1, 0.02);
        if (speed > 0) FX.burst(this.pos.x, 0.15, this.pos.z, 6, { color: '#e8f4ff', speed: 2.2, up: 1.6, life: 0.5, size: 0.18, gravity: 9, alpha: 0.8 });
      }
    }
    // лава
    if (g.world.terrain.isLava(this.pos.x, this.pos.z) && this.pos.y < 1) {
      this.lavaT = (this.lavaT || 0) + dt;
      if (this.lavaT > 0.5) { this.lavaT = 0; g.combat.dealDamage(null, this, this.maxHp * 0.08, { pure: true, color: '#ff8020' }); }
    }
    // ----- каст -----
    if (this.casting) {
      this.casting.t += dt;
      const t = this.casting.target;
      if (t) this.faceTo(t.pos, Math.min(1, dt * 10));
      if (Math.random() < dt * 30) { const hp = this.model.worldPos('gripR'); FX.emit({ x: hp.x + (Math.random() - 0.5) * 0.4, y: hp.y + (Math.random() - 0.5) * 0.4, z: hp.z + (Math.random() - 0.5) * 0.4, vy: 1, life: 0.5, size: 0.3, color: this.casting.skill.color }); }
      if (this.casting.t >= this.casting.dur) {
        const c = this.casting; this.casting = null;
        if (!t || t.alive) this.finishSkill(c.skill, t);
      }
    }
    // ----- автоатака -----
    const tgt = g.target;
    if (tgt && tgt.alive && tgt.team === 'enemy' && this.engaged && !this.casting && this.stunT <= 0) {
      const range = this.C.range + (this.rangeAdd || 0) + tgt.radius + (this.C.melee ? 0.6 : 0);
      const d = this.distTo(tgt);
      if (d <= range) {
        if (speed === 0) this.faceTo(tgt.pos, Math.min(1, dt * 10));
        if (this.atkTimer <= 0) {
          this.atkTimer = this.atkInterval;
          this.autoAttack(tgt);
        }
      }
    }
    if (tgt && !tgt.alive) this.engaged = false;
    // ----- регенерация -----
    const inCombat = g.time - this.lastHitT < 6 || g.mobs.engagedCount > 0;
    const mana = this.C.resource === 'Мана';
    if (!inCombat) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt);
      if (this.C.resource === 'Ярость') this.res = Math.max(0, this.res - 2 * dt);
    } else this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.002 * dt);
    this.res = Math.min(this.maxRes, this.res + (this.C.base.resRegen + (mana ? this.maxRes * (inCombat ? 0.012 : 0.04) : 0)) * dt * (this.C.resource === 'Ярость' && !inCombat ? 0 : 1));
    // ауры веток
    if (this.branch && Math.random() < dt * 6) {
      const col = this.C.branches[this.branch].color;
      const a = Math.random() * Math.PI * 2;
      FX.emit({ x: this.pos.x + Math.cos(a) * 0.5, y: this.pos.y + 0.2 + Math.random() * 1.5, z: this.pos.z + Math.sin(a) * 0.5, vy: 0.6, life: 1.2, size: 0.18, color: col, alpha: 0.8 });
    }
    // призыв скакуна
    if (this.mountCast) {
      this.mountCast -= dt;
      if (speed > 0 || this.engaged && g.target && g.target.alive) { this.mountCast = 0; g.ui.error('Призыв прерван'); }
      else if (this.mountCast <= 0) this.mountUp();
    }
    // модель
    this.model.update(dt, { speed: this.mounted ? 0 : this.moveSpeed, runSpeed: this.speed, airborne: !this.mounted && (!this.onGround || this.jumpOffset > 0.3), mounted: this.mounted, mountSpeed: Math.abs(this.moveSpeed) });
    if (this.mounted) this.mount.update(dt, { speed: this.moveSpeed });
    // светящийся след клинка во время удара
    const M = this.model;
    const swing = M.action && ['slash', 'slash2', 'slam', 'sweep', 'thrust', 'bash'].includes(M.actionName) && M.actionT > 0.18 && M.actionT < 0.78;
    this.trail.update(dt, M, swing);
    animateGear(this.model, g.time);
    this.syncModel();
  }

  syncModel() {
    const r = this.model.root;
    if (this.mounted) {
      const m = this.mount;
      m.root.position.set(this.pos.x, this.pos.y + this.jumpOffset, this.pos.z);
      m.root.rotation.y = this.yaw;
      const bob = (m.torso.position.y - m.bodyH) * m.root.scale.y;
      const fwd = 0.06;
      r.position.set(this.pos.x + Math.sin(this.yaw) * fwd, this.pos.y + this.jumpOffset + m.seatY + bob - this.model.hipY * r.scale.y + 0.06, this.pos.z + Math.cos(this.yaw) * fwd);
      r.rotation.y = this.yaw;
      return;
    }
    r.position.set(this.pos.x, this.pos.y + this.jumpOffset, this.pos.z);
    r.rotation.y = this.yaw;
  }

  // ---------- Ездовое животное ----------
  toggleMount() {
    const g = this.game;
    if (this.mounted) { this.dismount(); return; }
    if (this.mountCast > 0) return;
    if (g.mobs.engagedCount > 0) { g.ui.error('Нельзя призвать скакуна в бою'); return; }
    if (g.world.standY(this.pos.x, this.pos.z) < -1) { g.ui.error('Нельзя призвать скакуна в воде'); return; }
    this.mountCast = 1.2;
    this.casting = null;
    this.model.playAction('cast2', 1.2);
    g.effects.runeDecal(this.pos.clone(), '#ffd860', 2.4, 1.4, 2);
    g.ui.castInfo = { name: 'Призыв скакуна', t0: g.time, dur: 1.2 };
  }
  mountUp() {
    const g = this.game;
    this.mount = buildMount(this.cls);
    g.scene.add(this.mount.root);
    this.mounted = true;
    FX.burst(this.pos.x, this.pos.y + 0.8, this.pos.z, 40, { color: ['#ffe8a0', '#ffffff'], speed: 4, up: 2, life: 0.8, size: 0.4 });
    FX.burst(this.pos.x, this.pos.y + 0.3, this.pos.z, 16, { color: '#9a8a70', speed: 3, life: 1, size: 1, additive: false, alpha: 0.5, grow: 1 });
    g.ui.log(`Вы призвали скакуна: ${this.mount.mountName}`, '#ffe08a');
    g.ui.castInfo = null;
  }
  dismount() {
    if (!this.mounted) return;
    const g = this.game;
    this.mounted = false;
    FX.burst(this.pos.x, this.pos.y + 0.8, this.pos.z, 30, { color: ['#ffe8a0', '#ffffff'], speed: 3, up: 1.5, life: 0.6, size: 0.35 });
    this.mount.root.removeFromParent();
    this.mount = null;
    this.syncModel();
    void g;
  }

  autoAttack(tgt) {
    const g = this.game;
    this.dismount();
    const wt = this.model.weaponType || 'none';
    let anim = WEAPON_ANIM[wt] || 'thrust';
    let finisher = false;
    if (this.C.melee || wt === 'scythe') {
      // серия ударов: рубящий, обратный, завершающий
      const chains = { sword: ['slash', 'slash2', 'thrust'], greatsword: ['slash', 'slash2', 'slam'], axe: ['slash', 'slash2', 'slam'], hammer: ['slash', 'slash2', 'slam'], scythe: ['sweep', 'slash', 'slash2'] };
      const ch = chains[wt] || ['slash', 'slash2', 'thrust'];
      if (g.time - (this.comboT || 0) > 2.5) this.combo = 0;
      anim = ch[(this.combo || 0) % 3];
      finisher = (this.combo || 0) % 3 === 2;
      this.combo = (this.combo || 0) + 1;
      this.comboT = g.time;
    }
    this.model.playAction(anim, this.hasteMul * 1.1);
    const dmg = this.ap * (this.C.melee ? 1.0 : 0.85) * (finisher ? 1.3 : 1);
    if (this.C.melee) {
      g.schedule((anim === 'slam' ? 0.42 : 0.28) / (this.hasteMul * 1.1), () => {
        if (!tgt.alive) return;
        g.combat.dealDamage(this, tgt, dmg);
        hitFx(g, finisher && anim === 'slam' ? 'impact' : 'slash', tgt.center());
        if (finisher) { g.effects.crescent(this.pos.clone().setY(this.pos.y + 1.1).add(new THREE.Vector3(Math.sin(this.yaw) * 0.6, 0, Math.cos(this.yaw) * 0.6)), this.yaw, this.trailColor(), 2.2, { dur: 0.28, travel: 1.2, roll: 0.4 }); g.shake(0.25); }
        else g.shake(0.08);
        tgt.aggro && tgt.aggro(this);
        if (this.C.resource === 'Ярость') this.res = Math.min(this.maxRes, this.res + 8);
        g.ui.sound('hit');
      });
    } else {
      const kind = this.C.projectile === 'arrow' ? 'arrow' : this.C.projectile === 'bone' ? 'bone' : 'magic';
      const delay = kind === 'arrow' ? 0.42 / this.hasteMul : 0.25 / this.hasteMul;
      g.schedule(delay, () => {
        if (!tgt.alive) return;
        const from = new THREE.Vector3();
        if (this.model.hold === 'staff' && this.model.weaponObj) this.model.weaponObj.localToWorld(from.set(0, 1.15, 0));
        else this.model.worldPos(kind === 'arrow' ? 'gripL' : 'gripR', from);
        const col = this.branch === 'dark' ? '#a050ff' : this.branch === 'light' ? '#ffe080' : null;
        g.effects.projectile(kind, from, () => (tgt.alive ? tgt.center() : null), kind === 'arrow' ? 48 : 32, (p) => {
          g.combat.dealDamage(this, tgt, dmg);
          hitFx(g, kind === 'arrow' ? 'arrowhit' : kind === 'bone' ? 'bonehit' : 'default', p, { color: col || '#a0a0ff' });
          tgt.aggro && tgt.aggro(this);
          if (this.C.resource === 'Энергия') this.res = Math.min(this.maxRes, this.res + 4);
        }, { color: col });
      });
    }
  }

  onDamaged(src) {
    if (this.mounted && src) { this.dismount(); this.game.ui.log('Вас сбили со скакуна!', '#ff8a6a'); }
    if (this.C.resource === 'Ярость') this.res = Math.min(this.maxRes, this.res + 4);
    if (this.casting && Math.random() < 0.15) { this.casting.t -= 0.2; }
    if (src && src.alive && (!this.game.target || !this.game.target.alive) && src.team === 'enemy') { this.game.setTarget(src); }
    this.game.ui.flashDamage();
  }
  onDeath() {
    this.dismount();
    this.model.die();
    this.casting = null;
    this.engaged = false;
    this.game.onPlayerDeath();
  }
  revive(pos) {
    this.alive = true;
    this.hp = Math.round(this.maxHp * 0.6);
    this.res = this.C.resource === 'Мана' ? this.maxRes * 0.6 : 20;
    this.buffs = [];
    this.stunT = this.rootT = this.slowT = 0;
    this.pos.copy(pos);
    this.model.revive();
    levelUpFx(this.game, this);
  }

  serialize() {
    return {
      name: this.playerName, cls: this.cls, female: this.female, level: this.level, xp: this.xp, gold: this.gold,
      branch: this.branch, hp: this.hp, res: this.res, pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw,
      equipment: this.equipment, bag: this.bag,
    };
  }
}
