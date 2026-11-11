// Базовая сущность (игрок, монстр, союзник): здоровье, эффекты, урон.
import * as THREE from 'three';

let nextId = 1;

export class Entity {
  constructor(game) {
    this.game = game;
    this.id = nextId++;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.level = 1;
    this.hp = 100; this.maxHp = 100;
    this.alive = true;
    this.radius = 0.5;
    this.team = 'enemy';
    this.model = null;
    this.buffs = []; // {id, name, icon, dur, t, mods:{...}, dot:{dps, color, src}}
    this.stunT = 0; this.rootT = 0; this.slowT = 0;
    this.armor = 0;
    this.hitFlash = 0;
    this.lastHitT = -99;
    this.shield = 0; this.shieldT = 0;
  }
  get name() { return '???'; }
  mod(key, def = 1) {
    let v = def;
    for (const b of this.buffs) if (b.mods && b.mods[key] != null) {
      if (key === 'lifesteal') v += b.mods[key]; else v *= b.mods[key];
    }
    return v;
  }
  addBuff(b) {
    const ex = this.buffs.find(x => x.id === b.id && (!b.src || x.src === b.src));
    if (ex) { ex.t = 0; ex.dur = b.dur; Object.assign(ex, b); ex.t = 0; return ex; }
    const nb = Object.assign({ t: 0, tick: 0 }, b);
    this.buffs.push(nb);
    return nb;
  }
  hasBuff(id) { return this.buffs.some(b => b.id === id); }
  updateBuffs(dt) {
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t += dt;
      if (b.dot && this.alive) {
        b.tick += dt;
        if (b.tick >= 1) {
          b.tick -= 1;
          this.game.combat.dealDamage(b.src, this, b.dot.dps, { dot: true, color: b.dot.color, noCrit: true });
        }
      }
      if (b.t >= b.dur) this.buffs.splice(i, 1);
    }
    if (this.stunT > 0) this.stunT -= dt;
    if (this.rootT > 0) this.rootT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
  }
  get canAct() { return this.alive && this.stunT <= 0; }
  get canMove() { return this.alive && this.stunT <= 0 && this.rootT <= 0; }
  distTo(e) { return Math.hypot(this.pos.x - e.pos.x, this.pos.z - e.pos.z); }
  faceTo(p, k = 1) {
    const target = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * k;
  }
  centerY() { return this.pos.y + (this.model ? this.model.headTop() * 0.55 : 1); }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.centerY(), this.pos.z); }
}
