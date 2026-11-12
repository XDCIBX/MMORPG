// Игровой процесс: связывает мир, игрока, монстров, NPC, задания и интерфейс.
import * as THREE from 'three';
import { Player } from './player.js';
import { MobManager, AllyManager } from './mobs.js';
import { createNPCs } from './npcs.js';
import { Physics } from './physics.js';
import { QuestLog } from './quests.js';
import { Combat } from './combat.js';
import { Effects } from '../fx/effects.js';
import { furLOD } from '../chars/beasts.js';
import { FX } from '../fx/particles.js';
import { UI } from '../ui/ui.js';
import { CITIES, SECRET_SHOPS } from '../data/world.js';
import { CLASSES } from '../data/classes.js';
import { makePotion, makeWeapon, makeArmor, makeOffhand, makeJewel, POTIONS } from '../data/items.js';
import { clamp, lerp, pick, rand } from '../core/util.js';

export class Game {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;
    this.camera = app.camera;
    this.world = app.world;
    this.input = app.input;
    this.quality = app.quality;
    this.time = 0;
    this.saveKey = 'three_crowns_save_v1';
    this.timers = [];
    this.target = null;
    this.shakeAmt = 0;
    this.cam = { yaw: Math.PI, pitch: 0.32, dist: 7.5, tdist: 7.5, pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.stocks = {};
    this.lastZone = '';
  }

  start(data, saved = null) {
    this.effects = new Effects(this.scene);
    this.effects.camera = this.camera;
    this.combat = new Combat(this);
    this.discovered = saved ? saved.discovered : { cities: ['c1'], shops: [] };
    this.player = new Player(this, data);
    const c1 = CITIES[0];
    if (saved && saved.player.pos) {
      this.player.pos.set(...saved.player.pos);
      this.player.yaw = saved.player.yaw || 0;
    } else {
      // старт у ворот Светлолесья, лицом к площади
      this.player.pos.set(c1.x + 10, 0, c1.z + 16);
      this.player.yaw = Math.PI;
    }
    this.player.pos.y = this.world.standY(this.player.pos.x, this.player.pos.z);
    this.cam.yaw = this.player.yaw;
    if (saved && saved.dayTime != null) this.world.dayTime = saved.dayTime;
    this.ui = new UI(this);
    this.quests = new QuestLog(this, saved ? saved.quests : {});
    this.mobs = new MobManager(this);
    this.allies = new AllyManager(this);
    this.npcs = createNPCs(this);
    // предметы с физикой: бочки, ящики, тыквы в городах и лагерях
    this.physics = new Physics(this);
    for (const c of this.world.cities) for (const p of c.props || []) this.physics.add(p.kind, p.x, p.z);
    for (const [px, pz] of [[-580, 540], [300, -60]]) for (let i = 0; i < 5; i++) {
      const a = i * 1.3, r = 7 + (i % 3) * 3;
      this.physics.add(i % 2 ? 'crate' : 'barrel', px + Math.cos(a) * r, pz + Math.sin(a) * r);
    }
    this.ui.init();
    this.world.veg.prebuildGrass(this.player.pos);
    this.respawnCity = saved ? saved.respawnCity || 'c1' : 'c1';
    this.started = true;
    this.autosaveT = 30;
    if (!saved) {
      this.ui.notify(`Добро пожаловать в Светлолесье, ${this.player.playerName}!`, '#ffe08a', true);
      setTimeout(() => this.ui.notify('Поговорите со старостой Брониславом (знак «!») на площади', '#ffd23a'), 3500);
      this.ui.log('Подсказка: Esc — меню и управление, M — карта мира.', '#9ad0ff');
    } else this.ui.notify(`С возвращением, ${this.player.playerName}!`, '#ffe08a', true);
    this.save();
  }

  schedule(delay, fn) { this.timers.push({ t: this.time + delay, fn }); }
  friendlies() { return [this.player, ...this.allies.list.filter(a => a.alive)]; }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  setTarget(e) { this.target = e; this.ui.updateTarget(); this.ui.dirtyMarkers(); }

  setQuality(q) {
    this.quality = q;
    this.app.setQuality(q);
  }

  // ---------- Сохранение ----------
  save() {
    if (!this.player) return;
    try {
      const data = { v: 1, t: Date.now(), player: this.player.serialize(), quests: this.quests.serialize(), discovered: this.discovered, respawnCity: this.respawnCity, dayTime: this.world.dayTime };
      localStorage.setItem(this.saveKey, JSON.stringify(data));
    } catch (e) { console.warn('save failed', e); }
  }

  // ---------- Взаимодействие ----------
  nearestInteractive(maxD = 5) {
    let best = null, bd = maxD;
    for (const n of this.npcs) {
      if (!n.interactive) continue;
      const d = Math.hypot(n.pos.x - this.player.pos.x, n.pos.z - this.player.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  interact(npc) {
    if (!npc) return;
    const d = Math.hypot(npc.pos.x - this.player.pos.x, npc.pos.z - this.player.pos.z);
    if (d > 6) { this.ui.error('Подойдите ближе'); return; }
    if (npc.shopId && !this.discovered.shops.includes(npc.shopId)) this.discoverShop(npc.shopId);
    this.ui.openDialog(npc);
  }
  discoverShop(id) {
    if (this.discovered.shops.includes(id)) return;
    this.discovered.shops.push(id);
    const s = SECRET_SHOPS.find(s => s.id === id);
    this.ui.notify(`Найдена тайная лавка: ${s.name}`, '#d8a0ff', true);
    this.player.gainXp(40 + this.player.level * 15);
    this.save();
  }

  teleportTo(cityId) {
    const c = CITIES.find(c => c.id === cityId);
    const P = this.player;
    this.effects.pillar(P.pos.clone(), '#80e0ff', 1.5, 16, 0.8);
    const tp = this.npcs.find(n => n.isTeleport && n.cityId === cityId);
    const x = tp ? tp.pos.x + 3 : c.x + 8, z = tp ? tp.pos.z + 3 : c.z + 8;
    P.pos.set(x, this.world.standY(x, z), z);
    this.allies.list.forEach(a => a.pos.copy(P.pos));
    this.world.veg.prebuildGrass(P.pos);
    this.mobs.scanT = 0;
    this.effects.pillar(P.pos.clone(), '#80e0ff', 1.5, 16, 0.8);
    this.ui.notify(`Телепортация: ${c.name}`, '#80e0ff');
  }

  // ---------- Магазины ----------
  shopStock(npc) {
    const P = this.player;
    const key = npc.shopId || (npc.id + npc.cityId);
    const st = this.stocks[key];
    if (st && st.lvl === P.level && this.time - st.t < 600) return st.items;
    const items = [];
    const city = CITIES.find(c => c.id === npc.cityId);
    const cls = P.cls;
    const gearAt = (lvl, rar) => {
      const r = Math.random();
      if (r < 0.3) return makeWeapon(cls, lvl, rar);
      if (r < 0.38 && CLASSES[cls].offhand.length) return makeOffhand(cls, lvl, rar);
      if (r < 0.46) return makeJewel(Math.random() < 0.5 ? 'ring' : 'amulet', lvl, rar, cls);
      return makeArmor(cls, pick(['head', 'shoulders', 'chest', 'hands', 'legs', 'feet']), lvl, rar);
    };
    if (npc.role === 'merchant') {
      const tiers = city.id === 'c1' ? ['hp1', 'mp1', 'hp2', 'mp2'] : city.id === 'c2' ? ['hp1', 'mp1', 'hp2', 'mp2', 'hp3', 'mp3'] : ['hp2', 'mp2', 'hp3', 'mp3', 'hp4', 'mp4'];
      for (const k of tiers) items.push(makePotion(k, 1));
      for (let i = 0; i < 4; i++) items.push(gearAt(clamp(P.level + Math.floor(rand(-2, 2)), city.minLvl, city.maxLvl), Math.random() < 0.5 ? 0 : 1));
    } else if (npc.role === 'smith') {
      const lvl = clamp(P.level, city.minLvl, city.maxLvl);
      items.push(makeWeapon(cls, lvl, 1)); items.push(makeWeapon(cls, clamp(lvl + 2, 1, 100), 2));
      for (let i = 0; i < 7; i++) items.push(gearAt(clamp(lvl + Math.floor(rand(-1, 3)), 1, 100), Math.random() < 0.35 ? 2 : 1));
    } else if (npc.role === 'secret') {
      const s = SECRET_SHOPS.find(s => s.id === npc.shopId);
      const lvl = clamp(P.level + 2, s.lvl[0], s.lvl[1]);
      items.push(makeWeapon(cls, lvl, 3));
      for (let i = 0; i < 6; i++) items.push(gearAt(clamp(lvl + Math.floor(rand(-2, 3)), s.lvl[0], s.lvl[1]), Math.random() < 0.45 ? 3 : 2));
      const leg = gearAt(clamp(lvl + 2, 1, 100), 4);
      leg.price = Math.round(leg.price * 1.6);
      items.push(leg);
      for (const it of items) it.price = Math.round(it.price * 1.25);
    }
    items.forEach(it => { if (it.type === 'gear') it.price = Math.round(it.price * (it.rarity >= 3 ? 1.4 : 1)); });
    this.stocks[key] = { lvl: P.level, t: this.time, items };
    void POTIONS;
    return items;
  }

  // ---------- Смерть ----------
  onPlayerDeath() {
    this.ui.notify('Вы погибли…', '#ff4a3a', true);
    this.mobs.resetAggroOnPlayerDeath();
    this.allies.clear();
    setTimeout(() => document.getElementById('death').classList.remove('hidden'), 1500);
  }
  respawn() {
    document.getElementById('death').classList.add('hidden');
    // ближайший открытый город
    const P = this.player;
    let best = CITIES[0], bd = 1e9;
    for (const c of CITIES) {
      if (!this.discovered.cities.includes(c.id)) continue;
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    const tp = this.npcs.find(n => n.isTeleport && n.cityId === best.id);
    const x = tp ? tp.pos.x + 3 : best.x + 8, z = tp ? tp.pos.z + 3 : best.z + 8;
    P.revive(new THREE.Vector3(x, this.world.standY(x, z), z));
    this.world.veg.prebuildGrass(P.pos);
    this.mobs.scanT = 0;
    this.target = null;
  }

  // ---------- Выбор цели мышью ----------
  pick(mx, my, tol = 1) {
    const cam = this.camera, W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    let best = null, bestScore = 1e9;
    const consider = (e, headY) => {
      const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
      if (d > 90) return;
      v.set(e.pos.x, e.pos.y, e.pos.z).project(cam);
      if (v.z > 1) return;
      const fx = (v.x * 0.5 + 0.5) * W, fy = (-v.y * 0.5 + 0.5) * H;
      v.set(e.pos.x, headY, e.pos.z).project(cam);
      const hx = (v.x * 0.5 + 0.5) * W, hy = (-v.y * 0.5 + 0.5) * H;
      const h = Math.max(20, fy - hy);
      const w = Math.max(18 * tol, h * 0.35 * tol * (e.radius ? Math.max(1, e.radius * 1.5) : 1));
      const cx = (fx + hx) / 2;
      if (Math.abs(mx - cx) < w && my > hy - 10 * tol && my < fy + 6 * tol) {
        const score = Math.abs(mx - cx) / w + d * 0.01;
        if (score < bestScore) { bestScore = score; best = e; }
      }
    };
    for (const m of this.mobs.active) if (m.alive && m.model) consider(m, m.headY());
    for (const a of this.allies.list) if (a.alive) consider(a, a.pos.y + a.model.headTop());
    for (const n of this.npcs) if (n.role !== 'citizen' || true) consider(n, n.headY ? n.headY() : n.pos.y + 2);
    return best;
  }

  onClick(mx, my, button) {
    if (button === 'tap') {
      // касание: первое — выбор цели, повторное — атака; NPC — сразу разговор
      const e = this.pick(mx, my, 1.7);
      if (!e) return;
      if (e.isTeleport || e.role) { if (e.interactive) this.interact(e); else this.setTarget(e); return; }
      if (e === this.target && e.team === 'enemy') { this.player.engaged = true; return; }
      this.setTarget(e);
      return;
    }
    const e = this.pick(mx, my);
    if (!e) { if (button === 0) this.setTarget(null); return; }
    if (e.isTeleport || e.role) {
      this.setTarget(e.isTeleport ? null : e);
      if (button === 2 && e.interactive) this.interact(e);
      return;
    }
    this.setTarget(e);
    if (button === 2 && e.team === 'enemy') this.player.engaged = true;
  }

  // Кнопка атаки на телефоне
  touchAttack() {
    const P = this.player;
    let t = this.target && this.target.alive && this.target.team === 'enemy' ? this.target : null;
    if (!t) { t = this.mobs.nearestEnemy(P.pos, 30); if (t) this.setTarget(t); }
    if (!t) { this.ui.error('Рядом нет врагов'); return; }
    P.engaged = true;
    if (P.distTo(t) < 40) P.faceTo(t.pos);
  }

  tabTarget() {
    const P = this.player;
    const list = this.mobs.active.filter(m => m.alive && m.distTo(P) < 40).sort((a, b) => a.distTo(P) - b.distTo(P));
    if (!list.length) return;
    const i = list.indexOf(this.target);
    this.setTarget(list[(i + 1) % list.length]);
  }

  handleKeys() {
    const inp = this.input, ui = this.ui, P = this.player;
    if (inp.pressed('Escape')) { if (!ui.closeAll()) { if (this.target) this.setTarget(null); else ui.toggle('help'); } }
    if (inp.pressed('KeyC')) ui.toggle('char');
    if (inp.pressed('KeyB') || inp.pressed('KeyI')) ui.toggle('bag');
    if (inp.pressed('KeyL') || inp.pressed('KeyJ')) ui.toggle('quests');
    if (inp.pressed('KeyK') || inp.pressed('KeyP')) ui.toggle('skills');
    if (inp.pressed('KeyM')) ui.toggle('map');
    if (inp.pressed('Tab')) this.tabTarget();
    if (inp.pressed('KeyF')) {
      const n = this.nearestInteractive(5);
      if (n) this.interact(n); else ui.error('Рядом никого нет');
    }
    if (inp.pressed('KeyZ')) P.usePotion('hp');
    if (inp.pressed('KeyX')) P.usePotion('mp');
    for (let i = 0; i < 9; i++) if (inp.pressed('Digit' + (i + 1)) || inp.pressed('Numpad' + (i + 1))) { ui.pressSkill(i); P.trySkill(i); }
  }

  // ---------- Камера ----------
  updateCamera(dt) {
    const c = this.cam, inp = this.input, P = this.player;
    if (inp.dragging) {
      c.yaw -= inp.dx * 0.0055;
      c.pitch = clamp(c.pitch + inp.dy * 0.0045, -0.25, 1.35);
    }
    if (inp.wheel) c.tdist = clamp(c.tdist * (1 + inp.wheel * 0.0012), 2.5, 28);
    // на телефоне камера плавно разворачивается за бегущим героем
    if (inp.joy && inp.joy.active && !inp.dragging && P.moveSpeed > 0) {
      let d = P.yaw - c.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.9) c.yaw += d * Math.min(1, dt * 1.2);
    }
    c.dist = lerp(c.dist, c.tdist, Math.min(1, dt * 8));
    // при движении с зажатой ПКМ персонаж поворачивается за камерой (как в MMO)
    if (inp.mouse[2] && P.moveSpeed !== 0) P.yaw = c.yaw;
    const h = P.model.headTop ? P.model.headTop() : 1.8;
    const target = new THREE.Vector3(P.pos.x, P.pos.y + h * 0.92 + P.jumpOffset + (P.mounted ? P.mount.seatY * 0.75 : 0), P.pos.z);
    c.look.lerp(target, Math.min(1, dt * 14));
    if (c.look.lengthSq() === 0 || c.look.distanceTo(target) > 20) c.look.copy(target);
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    let dist = c.dist;
    const pos = new THREE.Vector3(c.look.x - Math.sin(c.yaw) * cp * dist, c.look.y + sp * dist, c.look.z - Math.cos(c.yaw) * cp * dist);
    // не опускаем камеру под землю
    const gy = this.world.groundY(pos.x, pos.z);
    const minY = Math.max(gy, 0) + 0.6;
    if (pos.y < minY) pos.y = minY;
    if (this.shakeAmt > 0) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt * 0.4;
      pos.y += (Math.random() - 0.5) * this.shakeAmt * 0.4;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(c.look);
  }

  // ---------- Главный цикл ----------
  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= this.time) { const f = this.timers[i].fn; this.timers.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
    }
    const P = this.player;
    if (this.started) this.handleKeys();
    P.update(dt);
    this.physics.update(dt);
    this.mobs.update(dt);
    this.allies.update(dt);
    for (const n of this.npcs) n.update(dt, P.pos);
    this.quests.update(dt);
    this.effects.update(dt);
    FX.update(dt);
    this.updateCamera(dt);
    furLOD.cam.copy(this.camera.position);
    furLOD.dist = this.quality >= 1 ? 45 : this.quality >= 0.6 ? 25 : 0;
    this.world.update(dt, P.pos, this.camera.position);
    if (this.target && this.target.alive === false && this.target.team === 'enemy' && (this.target.deathT || 0) > 3) this.setTarget(null);
    // открытие городов и лавок, смена локаций
    for (const c of CITIES) {
      if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < c.r) {
        if (!this.discovered.cities.includes(c.id)) {
          this.discovered.cities.push(c.id);
          this.ui.notify(`Открыт город: ${c.name}`, '#ffe08a', true);
          this.ui.log(c.desc, '#c8c0a8');
          this.save();
        }
        this.respawnCity = c.id;
      }
    }
    for (const s of SECRET_SHOPS) if (!this.discovered.shops.includes(s.id) && Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < 16) this.discoverShop(s.id);
    const zone = this.world.zoneName(P.pos.x, P.pos.z);
    if (zone !== this.lastZone) { if (this.lastZone) this.ui.log(`Локация: ${zone}`, '#9ad0ff'); this.lastZone = zone; }
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 30; this.save(); }
    this.ui.update(dt);
  }
}
