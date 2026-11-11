// Модели существ: четвероногие, пауки, големы, призраки, элементали, драконы и гуманоидные монстры.
import * as THREE from 'three';
import { Humanoid, limbGeo, ellipsoid } from './humanoid.js';
import { equipVisual, animateGear } from './gear.js';
import { basicMat, gemMat, glowMat, boneMat, clothMat, metalMat } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { FX } from '../fx/particles.js';

function furMat(color, rough = 0.92) {
  return basicMat(color, rough, 0);
}

class Creature {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.meshes = [];
    this.time = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.action = null; this.actionT = 0; this.actionDur = 0.5;
    this.deadT = -1;
    this.height = 1;
  }
  m(geo, mat, parent, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
  pivot(parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
  playAction(name, speed = 1) { this.action = name; this.actionT = 0; this.actionDur = (name === 'slam' || name === 'cast2' ? 0.8 : 0.5) / speed; }
  actionP() {
    if (!this.action) return -1;
    return this.actionT;
  }
  die() { this.deadT = 0; }
  revive() { this.deadT = -1; this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); }
  headTop() { return this.height * this.root.scale.y; }
  baseUpdate(dt) {
    this.time += dt;
    if (this.action) {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) this.action = null;
    }
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = smoothstep(0, 0.7, this.deadT);
      this.body.rotation.z = k * Math.PI / 2 * 0.95;
      this.body.position.y = -k * 0.1;
    }
  }
  // кривая атаки: 0..1..0 с пиком в середине
  strike() {
    if (!this.action) return 0;
    const p = this.actionT;
    return p < 0.4 ? -smoothstep(0, 0.4, p) * 0.4 : p < 0.6 ? lerp(-0.4, 1, smoothstep(0.4, 0.6, p)) : 1 - smoothstep(0.6, 1, p);
  }
}

// ---------- Четвероногие (волк, кабан, медведь) ----------
class Quadruped extends Creature {
  constructor(def, kind) {
    super();
    this.kind = kind;
    const fur = furMat(def.fur), fur2 = furMat(def.fur2);
    const P = kind === 'wolf' ? { len: 0.55, w: 0.2, h: 0.24, leg: 0.36, legT: 0.055, headL: 0.28, neck: 0.25 }
      : kind === 'boar' ? { len: 0.5, w: 0.27, h: 0.3, leg: 0.24, legT: 0.065, headL: 0.3, neck: 0.12 }
        : { len: 0.7, w: 0.42, h: 0.45, leg: 0.42, legT: 0.12, headL: 0.3, neck: 0.25 };
    this.P = P;
    const legH = P.leg * 2 + 0.04;
    this.legH = legH;
    this.height = legH + P.h * 2 + 0.25;
    const torso = this.pivot(this.body, 0, legH + P.h * 0.4, 0);
    this.torso = torso;
    this.m(ellipsoid(P.w, P.h, P.len, 20, 14), fur, torso, 0, 0, 0);
    // грудь/загривок
    this.m(ellipsoid(P.w * 1.1, P.h * 1.15, P.len * 0.5, 16, 12), kind === 'boar' ? fur2 : fur, torso, 0, P.h * 0.15, P.len * 0.45);
    if (kind === 'boar') {
      for (let i = 0; i < 7; i++) {
        const c = this.m(new THREE.ConeGeometry(0.035, 0.16, 4), fur2, torso, 0, P.h * 0.95, P.len * (0.5 - i * 0.16));
        c.rotation.x = -0.4;
      }
    }
    if (kind === 'wolf') this.m(ellipsoid(P.w * 0.9, P.h * 0.75, P.len * 0.35, 14, 10), fur2, torso, 0, -P.h * 0.35, P.len * 0.4);
    // шея и голова
    const neck = this.pivot(torso, 0, P.h * 0.35, P.len * 0.8);
    this.neck = neck;
    this.m(ellipsoid(P.w * 0.7, P.h * 0.7, P.neck, 12, 10), fur, neck, 0, 0.02, P.neck * 0.4);
    const head = this.pivot(neck, 0, 0.05, P.neck * 0.9);
    this.head = head;
    const hs = kind === 'bear' ? 1.25 : 1;
    this.m(ellipsoid(0.13 * hs, 0.12 * hs, 0.14 * hs, 16, 12), fur, head, 0, 0, 0.05);
    const snout = this.m(ellipsoid(0.07 * hs, 0.065 * hs, P.headL * 0.6 * hs, 12, 10), kind === 'wolf' ? fur2 : fur, head, 0, -0.03, P.headL * 0.65 * hs);
    void snout;
    this.m(ellipsoid(0.03 * hs, 0.025 * hs, 0.025 * hs), basicMat('#111', 0.3), head, 0, -0.01, P.headL * 1.15 * hs);
    const jaw = this.pivot(head, 0, -0.07 * hs, 0.05);
    this.jaw = jaw;
    this.m(ellipsoid(0.055 * hs, 0.025 * hs, P.headL * 0.5 * hs, 10, 8), fur2, jaw, 0, 0, P.headL * 0.5 * hs);
    if (kind === 'wolf') for (let i = -1; i <= 1; i += 2) this.m(new THREE.ConeGeometry(0.008, 0.04, 4), boneMat('#fff'), jaw, i * 0.03, 0.025, P.headL * 0.85).rotation.x = Math.PI;
    const eyeC = def.eye || (kind === 'wolf' ? '#ffcc30' : '#301010');
    for (const sx of [-1, 1]) {
      this.m(ellipsoid(0.022, 0.018, 0.015), def.eye ? gemMat(eyeC, 3) : basicMat(eyeC, 0.2), head, sx * 0.07 * hs, 0.04 * hs, 0.14 * hs);
      // уши
      const ear = this.m(new THREE.ConeGeometry(kind === 'bear' ? 0.045 : 0.04, kind === 'wolf' ? 0.12 : 0.07, 6), fur, head, sx * 0.07 * hs, 0.12 * hs, -0.01);
      ear.rotation.z = sx * -0.25;
      if (kind === 'bear') ear.scale.y = 0.6;
      if (kind === 'boar') {
        const tusk = this.m(new THREE.ConeGeometry(0.018, 0.12, 6), boneMat('#f0e8d0'), head, sx * 0.06, -0.04, P.headL * 1.0);
        tusk.rotation.x = -0.9; tusk.rotation.z = sx * 0.3;
      }
    }
    // хвост
    const tail = this.pivot(torso, 0, P.h * 0.4, -P.len * 0.95);
    this.tail = tail;
    if (kind === 'wolf') {
      const tg = ellipsoid(0.07, 0.07, 0.3, 10, 8);
      this.m(tg, fur, tail, 0, -0.08, -0.25).rotation.x = 0.5;
      this.m(ellipsoid(0.05, 0.05, 0.12), fur2, tail, 0, -0.2, -0.48).rotation.x = 0.5;
    } else {
      this.m(ellipsoid(0.04, 0.04, 0.1), fur, tail, 0, 0, -0.05);
    }
    // ноги
    this.legs = [];
    const lx = P.w * 0.62, lz = P.len * 0.7;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const hip = this.pivot(this.body, sx * lx, legH, sz * lz);
      this.m(limbGeo(P.leg + 0.05, P.legT * (sz < 0 ? 1.6 : 1.35), P.legT, 0.15, 0.3, 10), fur, hip, 0, 0.05, 0);
      const knee = this.pivot(hip, 0, -P.leg, 0);
      this.m(limbGeo(P.leg, P.legT * 0.9, P.legT * 0.75, 0.05, 0.3, 8), kind === 'wolf' ? fur2 : fur, knee, 0, 0, 0);
      this.m(ellipsoid(P.legT * 1.1, P.legT * 0.6, P.legT * 1.5), kind === 'boar' ? basicMat('#1a1410', 0.5) : fur2, knee, 0, -P.leg, P.legT * 0.5);
      this.legs.push({ hip, knee, sz, sx });
    }
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 6, 0, 1.3);
    this.phase += dt * speed * 1.9;
    const ph = this.phase;
    for (const L of this.legs) {
      const off = (L.sz > 0 ? 0 : Math.PI) + (L.sx > 0 ? 0 : Math.PI * (blend > 0.9 ? 0.15 : 1));
      const s = Math.sin(ph + off);
      L.hip.rotation.x = s * 0.55 * blend;
      L.knee.rotation.x = (L.sz > 0 ? -1 : 1) * Math.max(0, Math.cos(ph + off)) * 0.7 * blend;
    }
    this.torso.position.y = this.legH + this.P.h * 0.4 + Math.abs(Math.sin(ph)) * 0.04 * blend + Math.sin(this.time * 2) * 0.008;
    this.torso.rotation.x = Math.sin(ph * 2) * 0.03 * blend;
    this.tail.rotation.x = 0.3 + Math.sin(this.time * 3) * 0.1;
    this.tail.rotation.y = Math.sin(this.time * 2.2 + ph) * 0.3;
    let headX = Math.sin(this.time * 0.8) * 0.06;
    let jawX = 0;
    if (this.action) {
      const s = this.strike();
      headX += s * 0.5;
      jawX = Math.max(0, Math.sin(this.actionT * Math.PI)) * 0.6;
      this.torso.position.z = s * 0.15;
    } else this.torso.position.z = 0;
    if (st.howl) { headX = -0.9; jawX = 0.5; }
    this.neck.rotation.x = headX;
    this.jaw.rotation.x = jawX;
  }
}

// ---------- Паук ----------
class Spider extends Creature {
  constructor(def) {
    super();
    const c1 = furMat(def.fur, 0.6), c2 = furMat(def.fur2, 0.6);
    this.height = 0.9;
    const bodyP = this.pivot(this.body, 0, 0.5, 0);
    this.torso = bodyP;
    this.m(ellipsoid(0.25, 0.17, 0.28), c1, bodyP, 0, 0, 0.1);
    const ab = this.m(ellipsoid(0.38, 0.32, 0.45), c1, bodyP, 0, 0.12, -0.5);
    this.abdomen = ab;
    for (let i = 0; i < 4; i++) {
      const st = this.m(ellipsoid(0.12 - i * 0.02, 0.04, 0.06), c2, bodyP, 0, 0.42 - i * 0.04, -0.3 - i * 0.16);
      st.rotation.x = -0.2 - i * 0.2;
    }
    const eye = gemMat(def.eye || '#ff2020', 3);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) this.m(ellipsoid(0.025, 0.025, 0.02), eye, bodyP, sx * (0.04 + i * 0.03), 0.06 + (i % 2) * 0.03, 0.36 - i * 0.02);
    for (const sx of [-1, 1]) {
      const f = this.m(new THREE.ConeGeometry(0.03, 0.14, 6), basicMat('#1a1010', 0.4), bodyP, sx * 0.06, -0.08, 0.38);
      f.rotation.x = Math.PI * 0.85;
    }
    this.legs = [];
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      const a = (i - 1.5) * 0.45;
      const hip = this.pivot(bodyP, sx * 0.2, 0, 0.15 - i * 0.12);
      hip.rotation.y = sx > 0 ? -Math.PI / 2 + a : Math.PI / 2 - a;
      const up = this.pivot(hip);
      up.rotation.x = -0.9;
      this.m(limbGeo(0.45, 0.04, 0.03, 0.2, 0.3, 6), c1, up).rotation.x = Math.PI;
      const kn = this.pivot(up, 0, 0, 0);
      kn.position.set(0, 0.45, 0);
      kn.rotation.x = -1.8;
      this.m(limbGeo(0.85, 0.03, 0.012, 0.1, 0.3, 6), c1, kn).rotation.x = Math.PI;
      this.legs.push({ hip, up, kn, i, sx });
    }
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 6, 0, 1.3);
    this.phase += dt * speed * 2.6;
    for (const L of this.legs) {
      const off = L.i * Math.PI / 2 + (L.sx > 0 ? 0 : Math.PI);
      L.up.rotation.x = -0.9 + Math.max(0, Math.sin(this.phase + off)) * 0.4 * blend;
      L.hip.rotation.z = Math.cos(this.phase + off) * 0.25 * blend * L.sx;
    }
    this.torso.position.y = 0.5 + Math.sin(this.time * 3) * 0.01;
    this.abdomen.scale.setScalar(1 + Math.sin(this.time * 2) * 0.02);
    if (this.action) {
      const s = this.strike();
      this.torso.rotation.x = s * 0.35;
      this.torso.position.z = s * 0.2;
    } else { this.torso.rotation.x = 0; this.torso.position.z = 0; }
  }
}

// ---------- Голем ----------
class Golem extends Creature {
  constructor(def) {
    super();
    const rock = new THREE.MeshStandardMaterial({ color: def.fur, roughness: 0.95, flatShading: true });
    const glow = gemMat(def.fur2 || '#ffaa40', 3);
    this.height = 2.6;
    const torso = this.pivot(this.body, 0, 1.45, 0);
    this.torso = torso;
    const rk = (r, parent, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const g = new THREE.DodecahedronGeometry(r, 0);
      const mm = this.m(g, rock, parent, x, y, z);
      mm.scale.set(sx, sy, sz);
      mm.rotation.set(Math.random(), Math.random(), Math.random());
      return mm;
    };
    rk(0.55, torso, 0, 0.25, 0, 1.2, 1, 0.9);
    rk(0.4, torso, 0, -0.25, 0, 1.0, 0.8, 0.8);
    this.m(new THREE.OctahedronGeometry(0.16), glow, torso, 0, 0.25, 0.42);
    this.m(new THREE.SphereGeometry(0.3, 12, 10), glowMat(def.fur2 || '#ffaa40', 0.3), torso, 0, 0.25, 0.4);
    const head = this.pivot(torso, 0, 0.8, 0.1);
    this.head = head;
    rk(0.26, head, 0, 0, 0, 1, 0.8, 0.9);
    for (const sx of [-1, 1]) this.m(ellipsoid(0.05, 0.03, 0.03), glow, head, sx * 0.1, 0.02, 0.2);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = this.pivot(torso, sx * 0.72, 0.45, 0);
      rk(0.3, sh, 0, 0, 0);
      rk(0.24, sh, 0, -0.4, 0, 0.9, 1.3, 0.9);
      const el = this.pivot(sh, 0, -0.7, 0);
      rk(0.26, el, 0, -0.2, 0.05, 1, 1.3, 1);
      rk(0.32, el, 0, -0.65, 0.05);
      this.arms.push({ sh, el, sx });
    }
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = this.pivot(this.body, sx * 0.35, 1.0, 0);
      rk(0.3, hp, 0, -0.25, 0, 1, 1.3, 1);
      const kn = this.pivot(hp, 0, -0.55, 0);
      rk(0.3, kn, 0, -0.2, 0, 1, 1.2, 1);
      rk(0.25, kn, 0, -0.42, 0.08, 1.2, 0.6, 1.4);
      this.legs.push({ hp, kn, sx });
    }
    // руны
    for (let i = 0; i < 5; i++) this.m(new THREE.BoxGeometry(0.04, 0.14, 0.02), glow, torso, (i - 2) * 0.18, -0.05 + Math.abs(i - 2) * 0.06, 0.48);
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 5, 0, 1.2);
    this.phase += dt * speed * 1.2;
    const s = Math.sin(this.phase);
    this.legs[0].hp.rotation.x = s * 0.4 * blend; this.legs[1].hp.rotation.x = -s * 0.4 * blend;
    this.legs[0].kn.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.6 * blend;
    this.legs[1].kn.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.6 * blend;
    let a0 = -s * 0.3 * blend, a1 = s * 0.3 * blend;
    this.torso.rotation.y = s * 0.08 * blend;
    this.torso.position.y = 1.45 + Math.abs(Math.cos(this.phase)) * 0.05 * blend;
    if (this.action) {
      const k = this.strike();
      a0 = a1 = -k * 2.4 + (k < 0 ? 0 : 0);
      if (k < 0) { a0 = a1 = k * 5; }
      this.torso.rotation.x = Math.max(0, k) * 0.3;
    } else this.torso.rotation.x = 0;
    this.arms[0].sh.rotation.x = a0; this.arms[1].sh.rotation.x = a1;
    this.arms[0].el.rotation.x = -0.3; this.arms[1].el.rotation.x = -0.3;
    this.arms[0].sh.rotation.z = 0.15; this.arms[1].sh.rotation.z = -0.15;
  }
}

// ---------- Призрак ----------
class Wraith extends Creature {
  constructor(def) {
    super();
    const robe = new THREE.MeshStandardMaterial({ color: def.fur, roughness: 0.9, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: def.fur2, emissiveIntensity: 0.08 });
    this.height = 2.1;
    const torso = this.pivot(this.body, 0, 0.9, 0);
    this.torso = torso;
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.45 * (1 - t) + 0.12 + Math.sin(t * 9) * 0.02, -0.9 + t * 1.75)); }
    const lg = new THREE.LatheGeometry(pts, 18);
    const p = lg.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.7) p.setY(i, p.getY(i) + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 6) * 0.08);
    lg.computeVertexNormals();
    this.robe = this.m(lg, robe, torso, 0, 0, 0);
    const hood = this.m(new THREE.SphereGeometry(0.24, 16, 12, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.75), robe, torso, 0, 0.95, 0);
    hood.scale.set(1, 1.2, 1.1);
    this.m(ellipsoid(0.17, 0.2, 0.08), basicMat('#000', 1), torso, 0, 0.9, 0.12);
    for (const sx of [-1, 1]) this.m(ellipsoid(0.03, 0.02, 0.02), gemMat(def.fur2, 4), torso, sx * 0.06, 0.93, 0.18);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = this.pivot(torso, sx * 0.25, 0.65, 0);
      this.m(limbGeo(0.55, 0.09, 0.13, -0.2, 0.5, 10), robe, sh);
      const hand = this.m(ellipsoid(0.04, 0.08, 0.03), boneMat('#c8c8d8'), sh, 0, -0.62, 0);
      void hand;
      this.arms.push(sh);
    }
    this.def = def;
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const t = this.time;
    this.torso.position.y = 0.9 + Math.sin(t * 2) * 0.12;
    this.robe.rotation.y = Math.sin(t) * 0.1;
    let a = -0.8 + Math.sin(t * 1.5) * 0.1;
    if (this.action) a = -0.8 - Math.max(0, this.strike()) * 0.9;
    this.arms[0].rotation.x = a; this.arms[1].rotation.x = a;
    this.arms[0].rotation.z = 0.3; this.arms[1].rotation.z = -0.3;
    this.torso.rotation.x = 0.15 + (st.speed || 0) * 0.03;
    if (Math.random() < dt * 8 && this.deadT < 0) {
      const wp = this.root.position;
      FX.emit({ x: wp.x + (Math.random() - 0.5) * 0.6, y: wp.y + 0.3 * this.root.scale.y, z: wp.z + (Math.random() - 0.5) * 0.6, vy: 0.4, life: 1.2, size: 0.5 * this.root.scale.x, color: this.def.fur2, alpha: 0.35 });
    }
  }
}

// ---------- Огненный элементаль ----------
class Elemental extends Creature {
  constructor(def) {
    super();
    this.def = def;
    this.height = 2.2;
    const core = this.pivot(this.body, 0, 1.3, 0);
    this.torso = core;
    this.m(new THREE.IcosahedronGeometry(0.42, 1), gemMat(def.fur, 2.2), core);
    this.m(new THREE.IcosahedronGeometry(0.62, 1), glowMat(def.fur2, 0.35), core);
    const rock = new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.9, flatShading: true, emissive: '#ff3000', emissiveIntensity: 0.25 });
    this.shards = [];
    for (let i = 0; i < 9; i++) {
      const s = this.m(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.12, 0), rock, core);
      s.userData.a = i / 9 * Math.PI * 2; s.userData.r = 0.75 + Math.random() * 0.25; s.userData.h = (Math.random() - 0.5) * 0.9;
      this.shards.push(s);
    }
    this.light = { intensity: 0 }; // без динамического света (иначе перекомпиляция шейдеров)
  }
  update(dt) {
    this.baseUpdate(dt);
    const t = this.time;
    this.torso.position.y = 1.3 + Math.sin(t * 2.5) * 0.12;
    this.torso.rotation.y = t * 0.6;
    for (const s of this.shards) {
      const a = s.userData.a + t * 1.2;
      s.position.set(Math.cos(a) * s.userData.r, s.userData.h + Math.sin(t * 2 + s.userData.a) * 0.1, Math.sin(a) * s.userData.r);
      s.rotation.x += dt; s.rotation.y += dt * 0.7;
    }
    if (this.deadT < 0 && Math.random() < dt * 30) {
      const wp = this.root.position, sc = this.root.scale.x;
      FX.emit({ x: wp.x + (Math.random() - 0.5) * 0.7 * sc, y: wp.y + (1.0 + Math.random() * 0.6) * sc, z: wp.z + (Math.random() - 0.5) * 0.7 * sc, vy: 1.5 + Math.random(), life: 0.7, size: 0.7 * sc, color: Math.random() < 0.5 ? this.def.fur : this.def.fur2, alpha: 0.9 });
    }
    this.light.intensity = this.deadT >= 0 ? 0 : 5 + Math.sin(t * 13) * 1.5;
  }
}

// ---------- Дракон ----------
class Dragon extends Creature {
  constructor(def) {
    super();
    this.def = def;
    const scale = new THREE.MeshStandardMaterial({ color: def.fur, roughness: 0.55, metalness: 0.15 });
    const belly = new THREE.MeshStandardMaterial({ color: def.fur2, roughness: 0.6, emissive: def.fur2, emissiveIntensity: 0.12 });
    const horn = boneMat('#2a2220');
    this.height = 2.2;
    const torso = this.pivot(this.body, 0, 1.0, 0);
    this.torso = torso;
    this.m(ellipsoid(0.55, 0.48, 1.0, 20, 14), scale, torso);
    this.m(ellipsoid(0.42, 0.35, 0.85, 16, 10), belly, torso, 0, -0.2, 0.05);
    for (let i = 0; i < 7; i++) this.m(new THREE.ConeGeometry(0.06, 0.25, 5), horn, torso, 0, 0.48 - Math.abs(i - 2) * 0.02, 0.6 - i * 0.22).rotation.x = -0.4;
    // шея
    this.neckSeg = [];
    let parent = torso, pz = 0.85, py = 0.2;
    for (let i = 0; i < 5; i++) {
      const s = this.pivot(parent, 0, py, pz);
      this.m(ellipsoid(0.24 - i * 0.02, 0.24 - i * 0.02, 0.26), scale, s, 0, 0, 0.12);
      this.m(new THREE.ConeGeometry(0.04, 0.16, 5), horn, s, 0, 0.22, 0.05).rotation.x = -0.4;
      this.neckSeg.push(s);
      parent = s; pz = 0.26; py = 0.1;
    }
    const head = this.pivot(parent, 0, 0.05, 0.3);
    this.head = head;
    this.m(ellipsoid(0.25, 0.2, 0.32), scale, head, 0, 0, 0.1);
    this.m(ellipsoid(0.17, 0.12, 0.3), scale, head, 0, -0.03, 0.42);
    const jaw = this.pivot(head, 0, -0.1, 0.1);
    this.jaw = jaw;
    this.m(ellipsoid(0.15, 0.06, 0.38), belly, jaw, 0, -0.03, 0.3);
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) this.m(new THREE.ConeGeometry(0.015, 0.06, 4), boneMat('#fff'), jaw, sx * 0.1, 0.03, 0.15 + i * 0.09);
    for (const sx of [-1, 1]) {
      this.m(ellipsoid(0.045, 0.03, 0.03), gemMat(def.eye || '#ffd040', 4), head, sx * 0.15, 0.08, 0.28);
      const hh = this.m(new THREE.ConeGeometry(0.06, 0.55, 6), horn, head, sx * 0.14, 0.18, -0.12);
      hh.rotation.x = -2.2; hh.rotation.z = sx * 0.3;
    }
    this.mouthLight = { intensity: 0 };
    // хвост
    this.tailSeg = [];
    parent = torso; pz = -0.9;
    for (let i = 0; i < 7; i++) {
      const s = this.pivot(parent, 0, 0, pz);
      this.m(ellipsoid(0.22 - i * 0.028, 0.2 - i * 0.025, 0.3), scale, s, 0, 0, -0.15);
      if (i < 6) this.m(new THREE.ConeGeometry(0.035, 0.14, 4), horn, s, 0, 0.17 - i * 0.02, -0.1).rotation.x = -0.6;
      this.tailSeg.push(s);
      parent = s; pz = -0.32;
    }
    this.m(new THREE.ConeGeometry(0.12, 0.3, 4), horn, parent, 0, 0, -0.35).rotation.x = -Math.PI / 2;
    // крылья
    this.wings = [];
    const memb = new THREE.MeshStandardMaterial({ color: def.fur, roughness: 0.7, side: THREE.DoubleSide, emissive: def.fur2, emissiveIntensity: 0.06 });
    for (const sx of [-1, 1]) {
      const w = this.pivot(torso, sx * 0.4, 0.35, 0.35);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(2.4, 0.5); shape.lineTo(2.2, -0.2); shape.lineTo(1.6, -0.6); shape.lineTo(1.4, -1.2); shape.lineTo(0.9, -0.9); shape.lineTo(0.6, -1.5); shape.lineTo(0.2, -1.0); shape.lineTo(0, -0.6); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(Math.PI / 2);
      if (sx < 0) g.scale(-1, 1, 1);
      this.m(g, memb, w);
      for (const [x, z] of [[2.4, 0.5], [1.4, -1.2], [0.6, -1.5]]) {
        const len = Math.hypot(x, z);
        const bone = this.m(new THREE.CylinderGeometry(0.025, 0.05, len, 5), scale, w, sx * x / 2, 0, z / 2);
        bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx * x, 0, z).normalize());
      }
      this.wings.push({ w, sx });
    }
    // лапы
    this.legs = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const hp = this.pivot(torso, sx * 0.46, -0.12, sz * 0.58);
      // мощное бедро/плечо
      this.m(ellipsoid(0.2, 0.3, 0.26), scale, hp, 0, -0.08, sz < 0 ? -0.04 : 0.02);
      this.m(limbGeo(0.5, 0.15, 0.1, 0.25, 0.3, 10), scale, hp);
      const kn = this.pivot(hp, 0, -0.5, 0);
      this.m(limbGeo(0.48, 0.095, 0.065, 0.1, 0.3, 8), scale, kn);
      const foot = this.pivot(kn, 0, -0.48, 0);
      this.m(ellipsoid(0.1, 0.05, 0.16), scale, foot, 0, -0.02, 0.06);
      for (let c = -1; c <= 1; c++) this.m(new THREE.ConeGeometry(0.025, 0.12, 4), horn, foot, c * 0.05, -0.03, 0.2).rotation.x = Math.PI / 2;
      this.legs.push({ hp, kn, foot, sx, sz, baseH: sz > 0 ? -0.35 : 0.45, baseK: sz > 0 ? 0.55 : -0.85 });
    }
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const t = this.time;
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 6, 0, 1.2);
    this.phase += dt * speed * 1.4;
    for (const L of this.legs) {
      const off = (L.sz > 0 ? 0 : Math.PI) + (L.sx > 0 ? 0 : Math.PI);
      L.hp.rotation.x = L.baseH + Math.sin(this.phase + off) * 0.4 * blend;
      L.kn.rotation.x = L.baseK + (L.sz > 0 ? 1 : -1) * Math.max(0, Math.cos(this.phase + off)) * 0.45 * blend;
      L.foot.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x);
    }
    this.torso.position.y = 1.0 + Math.sin(t * 1.5) * 0.03;
    this.neckSeg.forEach((s, i) => { s.rotation.x = (i === 0 ? -0.35 : -0.08) + Math.sin(t * 1.2 + i * 0.5) * 0.03; s.rotation.y = Math.sin(t * 0.7 + i * 0.3) * 0.06; });
    this.head.rotation.x = 0.55;
    this.tailSeg.forEach((s, i) => { s.rotation.y = Math.sin(t * 1.6 - i * 0.6) * 0.15; s.rotation.x = 0.06; });
    const flap = st.flying ? Math.sin(t * 6) * 0.8 : Math.sin(t * 1.2) * 0.12 + 0.3;
    for (const W of this.wings) { W.w.rotation.z = W.sx * flap; W.w.rotation.y = W.sx * -0.3; }
    let jaw = Math.max(0, Math.sin(t * 0.9)) * 0.1;
    let headX = 0;
    if (this.action) {
      const s = this.strike();
      headX = s * 0.5; jaw = Math.max(0, s) * 0.7;
      if (this.action === 'breath' || this.action === 'cast2') { headX = 0.35; jaw = 0.8; }
    }
    if (st.breathing) { headX = 0.35; jaw = 0.85; }
    this.neckSeg[4].rotation.x += headX;
    this.jaw.rotation.x = jaw;
    this.mouthLight.intensity = st.breathing ? 25 : 0;
  }
}

// ---------- Гуманоидные монстры ----------
function humanoidMob(def, extra = {}) {
  const spec = Object.assign({}, def.spec || {});
  const h = new Humanoid(spec);
  if (def.armor) {
    const a = def.armor;
    const v = { kind: a.kind, c1: a.c1, c2: a.c2, trim: a.trim || '#8a7a5a', tier: a.tier || 1, style: a.style || 0, gem: a.gem || null };
    const slots = a.partial ? ['chest', 'shoulders'] : (a.robe ? ['chest', 'shoulders', 'head'] : ['chest', 'shoulders', 'legs', 'feet', 'head', 'hands']);
    for (const sl of slots) equipVisual(h, sl, { vis: v });
  }
  if (def.weapon) {
    const t = def.weapon.tier || 0;
    equipVisual(h, 'weapon', { wtype: def.weapon.wtype, vis: { tier: t, c1: ['#8a8a88', '#a0a4a8', '#9aa0a8', '#c0d0e0', '#808898', '#606878', '#5a1010', '#d0e0f0'][t], trim: '#6a5a3a', gem: def.weapon.gem || (t >= 4 ? (extra.gem || '#ff4020') : null) } });
  }
  if (def.offhand === 'shield') equipVisual(h, 'offhand', { otype: 'shield', vis: { kind: 'heavy', tier: 1, c1: '#5a5450', c2: '#3a2020', trim: '#6a5a3a', style: 0 } });
  if (def.wings) {
    const memb = new THREE.MeshStandardMaterial({ color: '#3a0a0a', roughness: 0.7, side: THREE.DoubleSide });
    h.wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * 0.1, 0.22, -0.12);
      h.j.chest.add(w);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.9, 0.5); shape.lineTo(0.85, -0.1); shape.lineTo(0.6, -0.3); shape.lineTo(0.45, -0.7); shape.lineTo(0.2, -0.4); shape.lineTo(0, -0.3); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      if (sx < 0) g.scale(-1, 1, 1);
      const m = new THREE.Mesh(g, memb); m.castShadow = true;
      m.rotation.y = sx * 0.5;
      w.add(m);
      h.wings.push({ w, sx });
    }
    h.updateExtra = (dt, t) => { for (const W of h.wings) W.w.rotation.y = W.sx * (0.4 + Math.sin(t * 2) * 0.25); };
  }
  if (spec.headType === 'yeti') {
    const fur = basicMat(spec.skin, 0.95);
    const tuft = (parent, x, y, z, r) => { const m = new THREE.Mesh(ellipsoid(r, r * 1.3, r), fur); m.position.set(x, y, z); m.castShadow = true; parent.add(m); };
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; tuft(h.j.chest, Math.cos(a) * 0.17, 0.08 + (i % 3) * 0.08, Math.sin(a) * 0.12, 0.08); }
    for (const sd of ['L', 'R']) { tuft(h.j['shoulder' + sd], 0, -0.05, 0, 0.1); tuft(h.j['elbow' + sd], 0, -0.05, 0, 0.075); tuft(h.j['hip' + sd], 0, -0.15, 0, 0.11); tuft(h.j['knee' + sd], 0, -0.1, 0, 0.08); }
  }
  if (extra.crown) {
    const crown = new THREE.Group();
    const gm = metalMat('#c8e8ff', 0.2);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14 + (i % 2) * 0.08, 5), gm);
      sp.position.set(Math.cos(a) * 0.09, 0.1, Math.sin(a) * 0.09);
      crown.add(sp);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 6, 20), gm);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
    crown.add(ring);
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), gemMat(extra.gem || '#60e0ff', 4));
    g.position.set(0, 0.08, 0.1);
    crown.add(g);
    h.headC.add(crown);
  }
  h.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const orig = h.update.bind(h);
  h.update = (dt, st) => { orig(dt, st); animateGear(h, h.time); };
  h.height = h.headTop() * (1 / Math.max(0.01, spec.scale || 1));
  return h;
}

export function buildCreature(def, opts = {}) {
  let c;
  switch (def.model) {
    case 'wolf': c = new Quadruped(def, 'wolf'); break;
    case 'boar': c = new Quadruped(def, 'boar'); break;
    case 'bear': c = new Quadruped(def, 'bear'); break;
    case 'spider': c = new Spider(def); break;
    case 'golem': c = new Golem(def); break;
    case 'wraith': c = new Wraith(def); break;
    case 'elemental': c = new Elemental(def); break;
    case 'dragon': c = new Dragon(def); break;
    case 'lich': {
      const lichDef = {
        spec: { headType: 'skull', limb: 0.65, eyes: { color: def.eye || '#60e0ff' }, hair: { style: 'none' }, base: { shirt: null, pants: null, boots: null } },
        armor: { kind: 'cloth', c1: '#1a2a3a', c2: '#80c8ff', tier: 7, style: 2, robe: true, gem: '#60e0ff' },
        weapon: { wtype: 'bonestaff', tier: 7, gem: '#60e0ff' },
      };
      c = humanoidMob(lichDef, { crown: true, gem: def.eye });
      break;
    }
    default: c = humanoidMob(def, opts);
  }
  return c;
}

export { humanoidMob };
void clothMat;
