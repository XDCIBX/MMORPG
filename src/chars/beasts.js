// Четвероногие звери с анатомией: волк, медведь, кабан и ездовая лошадь.
import * as THREE from 'three';
import { Creature } from './creature_base.js';
import { limbGeo, ellipsoid } from './humanoid.js';
import { basicMat, gemMat, boneMat, metalMat, leatherMat, clothMat } from './materials.js';
import { furTex } from '../core/textures.js';
import { hairMat } from './face.js';
import { clamp, lerp } from '../core/util.js';

const mats = new Map();
function furMat(color, rough = 0.9) {
  const k = color + rough;
  if (!mats.has(k)) {
    const f = furTex();
    mats.set(k, new THREE.MeshStandardMaterial({ color, map: f.map, normalMap: f.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: rough }));
  }
  return mats.get(k);
}
const eyeMat = (c) => { const k = 'eye' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, clearcoat: 1 })); return mats.get(k); };
const hoofMat = () => basicMat('#1a1410', 0.45, 0.1);
const noseMat = () => basicMat('#141010', 0.35, 0);

// Параметры видов (размеры в метрах)
const SPECIES = {
  wolf: {
    leg: [0.3, 0.3, 0.16], legR: 0.05, rearLeg: [0.3, 0.3, 0.2], spread: 0.13, len: 0.5,
    chest: [0.2, 0.25, 0.28], barrel: [0.17, 0.2, 0.32], rump: [0.17, 0.19, 0.2], hump: null,
    neck: { n: 2, len: 0.17, r: 0.12, pitch: -0.55 }, skull: [0.12, 0.12, 0.14], muzzle: [0.06, 0.06, 0.15], ear: [0.04, 0.11, 'point'],
    tail: { n: 5, len: 0.12, r: 0.065, droop: 0.45, bushy: true }, ruff: true, paw: 'paw',
  },
  bear: {
    leg: [0.36, 0.34, 0.1], legR: 0.12, rearLeg: [0.4, 0.34, 0.12], spread: 0.27, len: 0.72,
    chest: [0.4, 0.46, 0.46], barrel: [0.42, 0.44, 0.55], rump: [0.38, 0.4, 0.38], hump: [0.3, 0.22, 0.3],
    neck: { n: 2, len: 0.18, r: 0.25, pitch: -0.15 }, skull: [0.22, 0.2, 0.22], muzzle: [0.11, 0.1, 0.15], ear: [0.06, 0.06, 'round'],
    tail: { n: 1, len: 0.08, r: 0.07, droop: 0.3 }, ruff: false, paw: 'claw',
  },
  boar: {
    leg: [0.22, 0.2, 0.08], legR: 0.055, rearLeg: [0.24, 0.2, 0.1], spread: 0.15, len: 0.5,
    chest: [0.26, 0.32, 0.33], barrel: [0.25, 0.28, 0.36], rump: [0.21, 0.24, 0.22], hump: null,
    neck: { n: 1, len: 0.12, r: 0.22, pitch: 0.15 }, skull: [0.17, 0.17, 0.2], muzzle: [0.09, 0.08, 0.2], ear: [0.05, 0.08, 'point'],
    tail: { n: 3, len: 0.07, r: 0.02, droop: 1.0 }, ruff: false, paw: 'hoof', bristle: true, tusks: true,
  },
  horse: {
    leg: [0.42, 0.4, 0.26], legR: 0.07, rearLeg: [0.46, 0.42, 0.3], spread: 0.17, len: 0.75,
    chest: [0.3, 0.38, 0.36], barrel: [0.32, 0.36, 0.5], rump: [0.31, 0.35, 0.33], hump: null,
    neck: { n: 3, len: 0.25, r: 0.17, pitch: -0.75 }, skull: [0.11, 0.14, 0.16], muzzle: [0.085, 0.1, 0.24], ear: [0.04, 0.12, 'point'],
    tail: { n: 5, len: 0.14, r: 0.05, droop: 1.1, hair: true }, ruff: false, paw: 'hoof', mane: true,
  },
};

export class Beast extends Creature {
  constructor(def, kind, opts = {}) {
    super();
    this.kind = kind;
    const S = SPECIES[kind];
    this.S = S;
    const fur = furMat(def.fur), fur2 = furMat(def.fur2 || def.fur), belly = furMat(def.belly || def.fur2 || def.fur);
    // высота плеч/бёдер, чтобы лапы стояли на земле
    const frontH = S.leg[0] + S.leg[1] * 0.98 + S.leg[2] * 0.9 + 0.03;
    const rearH = S.rearLeg[0] * Math.cos(0.35) + S.rearLeg[1] * Math.cos(0.45) + S.rearLeg[2] * 0.95 + 0.03;
    const bodyH = Math.max(frontH, rearH);
    this.bodyH = bodyH;
    const torso = this.pivot(this.body, 0, bodyH, 0);
    this.torso = torso;
    const L = S.len;
    // туловище: грудь, бочка, круп (+ холка у медведя)
    this.m(ellipsoid(S.chest[0], S.chest[1], S.chest[2], 22, 16), fur, torso, 0, S.chest[1] * 0.05, L * 0.62);
    this.m(ellipsoid(S.barrel[0], S.barrel[1], S.barrel[2], 22, 16), fur, torso, 0, 0, 0);
    this.m(ellipsoid(S.barrel[0] * 0.85, S.barrel[1] * 0.55, S.barrel[2] * 0.85, 18, 12), belly, torso, 0, -S.barrel[1] * 0.45, L * 0.05);
    this.m(ellipsoid(S.rump[0], S.rump[1], S.rump[2], 22, 16), fur, torso, 0, S.rump[1] * 0.08, -L * 0.6);
    if (S.hump) this.m(ellipsoid(S.hump[0], S.hump[1], S.hump[2], 18, 12), fur, torso, 0, S.chest[1] * 0.8, L * 0.55);
    // лопатки и бёдра — мускулы
    for (const sx of [-1, 1]) {
      this.m(ellipsoid(S.chest[0] * 0.45, S.chest[1] * 0.7, S.chest[2] * 0.55), fur, torso, sx * S.chest[0] * 0.62, S.chest[1] * 0.05, L * 0.62);
      this.m(ellipsoid(S.rump[0] * 0.5, S.rump[1] * 0.8, S.rump[2] * 0.75), fur, torso, sx * S.rump[0] * 0.58, -S.rump[1] * 0.05, -L * 0.62);
    }
    if (S.bristle) for (let i = 0; i < 12; i++) {
      const c = this.m(new THREE.ConeGeometry(0.03, 0.14, 4), fur2, torso, (i % 2 - 0.5) * 0.03, S.chest[1] * 0.95 - i * 0.012, L * (0.75 - i * 0.12));
      c.rotation.x = -0.5;
    }
    // шея
    let parent = torso, pz = L * 0.62 + S.chest[2] * 0.55, py = S.chest[1] * 0.35;
    this.neckSeg = [];
    for (let i = 0; i < S.neck.n; i++) {
      const sgm = this.pivot(parent, 0, py, pz);
      sgm.rotation.x = i === 0 ? S.neck.pitch : 0;
      const r = S.neck.r * (1 - i * 0.12);
      this.m(ellipsoid(r * 0.85, r, S.neck.len * 0.75), i === 0 && S.ruff ? fur2 : fur, sgm, 0, 0, S.neck.len * 0.45);
      if (S.ruff && i === 0) this.m(ellipsoid(r * 1.25, r * 1.2, S.neck.len * 0.6), fur2, sgm, 0, -r * 0.1, S.neck.len * 0.15);
      this.neckSeg.push(sgm);
      parent = sgm; pz = S.neck.len; py = 0;
    }
    // голова
    const head = this.pivot(parent, 0, 0.02, S.neck.len * 0.85);
    head.rotation.x = -S.neck.pitch * 0.9 + (kind === 'horse' ? 0.35 : 0);
    this.head = head;
    const sk = S.skull, mz = S.muzzle;
    this.m(ellipsoid(sk[0], sk[1], sk[2], 20, 14), fur, head, 0, 0, sk[2] * 0.4);
    // морда — сужающийся цилиндр
    const muzzleG = new THREE.CylinderGeometry(mz[0] * 0.75, mz[0], mz[2] * 2, 14, 3);
    muzzleG.rotateX(Math.PI / 2); muzzleG.scale(1, mz[1] / mz[0], 1);
    this.m(muzzleG, kind === 'bear' || kind === 'wolf' ? fur2 : fur, head, 0, -sk[1] * 0.3, sk[2] * 0.6 + mz[2]);
    this.m(ellipsoid(mz[0] * 0.8, mz[1] * 0.75, mz[0] * 0.5), noseMat(), head, 0, -sk[1] * 0.22, sk[2] * 0.6 + mz[2] * 2 + (kind === 'boar' ? 0.01 : -0.01));
    // челюсть
    const jaw = this.pivot(head, 0, -sk[1] * 0.55, sk[2] * 0.3);
    this.jaw = jaw;
    this.m(ellipsoid(mz[0] * 0.7, mz[1] * 0.35, mz[2] * 0.95), fur2, jaw, 0, 0, mz[2] * 0.9);
    if (kind === 'wolf' || kind === 'bear') for (const sx of [-1, 1]) for (let t = 0; t < 2; t++) {
      const f = this.m(new THREE.ConeGeometry(0.009 * (kind === 'bear' ? 1.6 : 1), 0.045, 5), boneMat('#f4ecd8'), jaw, sx * mz[0] * 0.45, mz[1] * 0.25, mz[2] * (1.2 + t * 0.35));
      f.rotation.x = Math.PI;
    }
    if (S.tusks) for (const sx of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 0.05, 0.02, 0.04), new THREE.Vector3(sx * 0.06, 0.12, 0.02));
      this.m(new THREE.TubeGeometry(curve, 8, 0.016, 6), boneMat('#f2ead2'), head, sx * mz[0] * 0.6, -sk[1] * 0.45, sk[2] * 0.6 + mz[2] * 1.4);
    }
    // глаза
    const ec = def.eye || (kind === 'wolf' ? '#e8b020' : kind === 'horse' ? '#2a1a10' : '#1a0c08');
    for (const sx of [-1, 1]) {
      this.m(ellipsoid(sk[0] * 0.2, sk[0] * 0.18, sk[0] * 0.14), def.eye ? gemMat(ec, 3) : eyeMat(ec), head, sx * sk[0] * 0.62, sk[1] * 0.25, sk[2] * 0.78);
      // уши
      const ear = S.ear;
      let eg;
      if (ear[2] === 'round') { eg = new THREE.SphereGeometry(ear[0], 10, 8); eg.scale(1, 1, 0.45); }
      else { eg = new THREE.ConeGeometry(ear[0], ear[1], 8); eg.scale(1, 1, 0.45); }
      const e = this.m(eg, fur, head, sx * sk[0] * 0.55, sk[1] * 0.85, 0);
      e.rotation.z = sx * -0.3; e.rotation.x = -0.15;
    }
    // грива (лошадь) — пряди волос
    if (S.mane) {
      const hm = hairMat(def.mane || '#1a120c');
      for (let i = 0; i < this.neckSeg.length; i++) {
        for (let k = 0; k < 4; k++) {
          const g = new THREE.PlaneGeometry(0.18, 0.34);
          g.translate(0, -0.17, 0);
          const mesh = this.m(g, hm, this.neckSeg[i], (k % 2 - 0.5) * 0.04, S.neck.r * 0.9, S.neck.len * (0.1 + k * 0.22));
          mesh.rotation.set(0.2, (k % 2 - 0.5) * 0.6, (k % 2 ? 1 : -1) * 0.9);
        }
      }
      const fl = new THREE.PlaneGeometry(0.16, 0.22); fl.translate(0, -0.11, 0);
      this.m(fl, hm, head, 0, sk[1] * 0.9, sk[2] * 0.2).rotation.x = -0.6;
    }
    // хвост
    this.tailSeg = [];
    parent = torso; pz = -L * 0.6 - S.rump[2] * 0.85;
    let ty = S.rump[1] * 0.45;
    for (let i = 0; i < S.tail.n; i++) {
      const sgm = this.pivot(parent, 0, ty, pz);
      sgm.rotation.x = i === 0 ? S.tail.droop : 0.12;
      const r = S.tail.r * (S.tail.bushy ? (1 + Math.sin((i + 1) / S.tail.n * Math.PI) * 0.6) : 1 - i * 0.12);
      if (!S.tail.hair) this.m(ellipsoid(r, r, S.tail.len * 0.75), S.tail.bushy && i === S.tail.n - 1 ? fur2 : fur, sgm, 0, 0, -S.tail.len * 0.45);
      this.tailSeg.push(sgm);
      parent = sgm; pz = -S.tail.len; ty = 0;
    }
    if (S.tail.hair) {
      const hm = hairMat(def.mane || '#1a120c');
      for (let k = 0; k < 6; k++) {
        const g = new THREE.PlaneGeometry(0.16, 0.8); g.translate(0, -0.38, 0);
        const mesh = this.m(g, hm, this.tailSeg[0], 0, 0, -0.05);
        mesh.rotation.y = k / 6 * Math.PI; mesh.rotation.x = -0.25;
      }
    }
    // лапы: перед — плечо/предплечье/пясть, зад — бедро/голень/плюсна
    this.legs = [];
    const xs = S.spread;
    for (const [sx, front] of [[1, true], [-1, true], [1, false], [-1, false]]) {
      const seg = front ? S.leg : S.rearLeg;
      const z = front ? L * 0.62 : -L * 0.62;
      const top = this.pivot(this.body, sx * xs, front ? frontH : rearH, z);
      const R = S.legR;
      this.m(limbGeo(seg[0], R * (front ? 1.5 : 2.0), R * 1.05, 0.25, 0.3, 10), fur, top);
      const mid = this.pivot(top, 0, -seg[0], 0);
      this.m(limbGeo(seg[1], R * 1.0, R * 0.75, 0.15, 0.25, 9), kind === 'wolf' ? fur2 : fur, mid);
      const low = this.pivot(mid, 0, -seg[1], 0);
      this.m(limbGeo(seg[2], R * 0.75, R * 0.65, 0, 0.3, 8), kind === 'wolf' ? fur2 : fur, low);
      const foot = this.pivot(low, 0, -seg[2], 0);
      if (S.paw === 'hoof') {
        const hg = new THREE.CylinderGeometry(R * 0.85, R * 1.05, R * 1.1, 10);
        this.m(hg, hoofMat(), foot, 0, -R * 0.35, 0.005);
        if (kind === 'horse') this.m(ellipsoid(R * 1.2, R * 0.9, R * 1.2), furMat(def.sock || def.fur2 || def.fur), foot, 0, R * 0.4, 0);
      } else {
        this.m(ellipsoid(R * 1.3, R * 0.65, R * 1.7), fur2, foot, 0, -R * 0.2, R * 0.5);
        const cl = S.paw === 'claw' ? 0.06 : 0.025;
        for (let c = -1.5; c <= 1.5; c++) {
          const claw = this.m(new THREE.ConeGeometry(R * 0.16, cl, 5), boneMat(S.paw === 'claw' ? '#3a3430' : '#2a2420'), foot, c * R * 0.42, -R * 0.35, R * 1.95);
          claw.rotation.x = Math.PI / 2 + 0.6;
        }
      }
      this.legs.push({ top, mid, low, foot, sx, front });
    }
    this.height = bodyH + S.chest[1] + S.neck.len * S.neck.n * 0.6;
    // ездовая сбруя
    if (opts.saddle) this.addTack(opts.saddle, def);
  }

  addTack(style, def) {
    const S = this.S, t = this.torso;
    const leather = leatherMat(style.leather || '#4a2a16');
    const trim = metalMat(style.trim || '#c9a640', 0.3);
    const cloth = clothMat(style.cloth || '#7a1c1c', 2);
    // попона
    const pad = new THREE.CylinderGeometry(S.barrel[0] * 1.07, S.barrel[0] * 1.07, 0.7, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
    pad.rotateZ(Math.PI / 2); pad.rotateY(Math.PI / 2);
    const pm = this.m(pad, cloth, t, 0, S.barrel[1] * 0.12, 0.05);
    pm.scale.set(1, S.barrel[1] / S.barrel[0] * 1.02, 1);
    // седло
    const seat = new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    seat.scale(1, 0.35, 1.25);
    this.m(seat, leather, t, 0, S.barrel[1] * 0.98, 0.05);
    this.m(new THREE.TorusGeometry(0.12, 0.03, 8, 16, Math.PI), leather, t, 0, S.barrel[1] * 1.0, 0.27).rotation.y = Math.PI / 2;
    this.m(new THREE.TorusGeometry(0.15, 0.035, 8, 16, Math.PI), leather, t, 0, S.barrel[1] * 0.98, -0.2).rotation.y = Math.PI / 2;
    // стремена
    for (const sx of [-1, 1]) {
      this.m(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), leather, t, sx * S.barrel[0] * 1.05, S.barrel[1] * 0.45, 0.08);
      this.m(new THREE.TorusGeometry(0.05, 0.01, 6, 12), trim, t, sx * S.barrel[0] * 1.07, S.barrel[1] * 0.18, 0.08);
    }
    // уздечка
    const h = this.head, sk = S.skull, mz = S.muzzle;
    this.m(new THREE.TorusGeometry(mz[0] * 1.05, 0.012, 6, 16), leather, h, 0, -sk[1] * 0.3, sk[2] * 0.6 + mz[2] * 0.9);
    this.m(new THREE.TorusGeometry(sk[0] * 1.02, 0.012, 6, 16), leather, h, 0, 0, sk[2] * 0.35).rotation.y = Math.PI / 2;
    // латная броня для боевого коня
    if (style.armor) {
      const am = metalMat(style.armor, 0.3);
      const cp = new THREE.SphereGeometry(S.chest[0] * 1.12, 20, 12, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.55);
      const cm = this.m(cp, am, t, 0, S.chest[1] * 0.05, S.len * 0.62);
      cm.scale.set(1, S.chest[1] / S.chest[0], S.chest[2] / S.chest[0]);
      this.m(new THREE.BoxGeometry(0.05, sk[1] * 1.6, sk[2] * 1.6), am, h, 0, sk[1] * 0.4, sk[2] * 0.7).rotation.x = 0.4;
    }
    if (style.glow) for (let i = 0; i < 4; i++) this.m(new THREE.OctahedronGeometry(0.03), gemMat(style.glow, 3), t, (i % 2 - 0.5) * 0.5, S.barrel[1] * 0.3, -0.25 + Math.floor(i / 2) * 0.5);
  }

  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const runRef = this.kind === 'horse' ? 8 : 6;
    const blend = clamp(Math.abs(speed) / runRef, 0, 1.6);
    const gallop = blend > 1.05;
    this.phase += dt * Math.abs(speed) * (this.kind === 'horse' ? 1.15 : 1.9) * (gallop ? 0.75 : 1);
    const ph = this.phase;
    for (const Lg of this.legs) {
      // рысь — диагональные пары, галоп — передние/задние почти вместе
      const off = gallop ? (Lg.front ? 0 : Math.PI * 0.9) + (Lg.sx > 0 ? 0.35 : 0) : (Lg.front ? 0 : Math.PI) + (Lg.sx > 0 ? 0 : Math.PI);
      const s = Math.sin(ph + off), c = Math.cos(ph + off);
      const amp = Math.min(1, blend) * (gallop ? 0.75 : 0.5);
      const lift = Math.max(0, c);
      if (Lg.front) {
        Lg.top.rotation.x = -s * amp;
        Lg.mid.rotation.x = lift * amp * 1.3;
        Lg.low.rotation.x = lift * amp * 0.8;
      } else {
        Lg.top.rotation.x = -0.35 - s * amp;
        Lg.mid.rotation.x = 0.8 + lift * amp * 0.6;
        Lg.low.rotation.x = -0.45 - lift * amp * 0.9;
      }
      Lg.foot.rotation.x = -(Lg.top.rotation.x + Lg.mid.rotation.x + Lg.low.rotation.x) + (Lg.front ? 0 : 0);
    }
    const bob = gallop ? Math.sin(ph * 2) * 0.06 : Math.abs(Math.sin(ph)) * 0.03 * Math.min(1, blend);
    this.torso.position.y = this.bodyH + bob + Math.sin(this.time * 1.8) * 0.006;
    this.torso.rotation.x = gallop ? Math.sin(ph * 2 + 1) * 0.06 : 0;
    // хвост, голова, дыхание
    this.tailSeg.forEach((sgm, i) => { sgm.rotation.y = Math.sin(this.time * 2.2 + i * 0.6) * (0.12 + blend * 0.15); });
    let headX = Math.sin(this.time * 0.7) * 0.04 + (gallop ? Math.sin(ph * 2) * 0.12 : 0);
    let jawX = 0;
    if (this.action) {
      const s = this.strike();
      headX += s * 0.45;
      jawX = Math.max(0, Math.sin(this.actionT * Math.PI)) * 0.55;
      this.torso.position.z = s * 0.15;
    } else this.torso.position.z = 0;
    if (st.howl) { headX = -0.8; jawX = 0.45; }
    if (this.neckSeg[0]) this.neckSeg[0].rotation.x = this.S.neck.pitch + headX;
    this.jaw.rotation.x = jawX + (blend > 0.8 && this.kind === 'wolf' ? 0.15 : 0);
  }
}

// Ездовые животные для героев
export const MOUNTS = {
  dwarf: { name: 'Боевой пони', def: { fur: '#5a3a24', fur2: '#3a2416', belly: '#7a5a3a', mane: '#e8e0d0', sock: '#e8e0d0' }, scale: 0.82, saddle: { cloth: '#2d4f8a', trim: '#c9a640', armor: '#8a95a5' } },
  warrior: { name: 'Боевой конь', def: { fur: '#1c1a1a', fur2: '#141212', belly: '#2a2626', mane: '#0c0a0a', sock: '#e8e4dc' }, scale: 1.0, saddle: { cloth: '#8a1c1c', trim: '#d4a640', armor: '#a8acb2' } },
  archer: { name: 'Лесной скакун', def: { fur: '#8a5a32', fur2: '#6a4224', belly: '#c8a070', mane: '#2a1a10', sock: '#3a2416' }, scale: 0.98, saddle: { cloth: '#3a5a2a', trim: '#b08a3a' } },
  mage: { name: 'Белый единорог', def: { fur: '#eae6e0', fur2: '#d8d2ca', belly: '#f4f0ea', mane: '#c8d8ff', sock: '#ffffff' }, scale: 1.0, saddle: { cloth: '#2a3a9a', trim: '#e0e8ff', glow: '#80c0ff' }, horn: '#e8e0ff' },
  necro: { name: 'Конь-призрак', def: { fur: '#2a2a30', fur2: '#18181c', belly: '#3a3a40', mane: '#40ff90', sock: '#1a1a1a', eye: '#40ff90' }, scale: 1.0, saddle: { cloth: '#1a2a1a', trim: '#6aa080', glow: '#40ff90' } },
};

export function buildMount(cls) {
  const M = MOUNTS[cls] || MOUNTS.warrior;
  const b = new Beast(M.def, 'horse', { saddle: M.saddle });
  if (M.horn) {
    const hg = new THREE.ConeGeometry(0.03, 0.4, 10);
    const horn = b.m(hg, gemMat(M.horn, 1.2), b.head, 0, b.S.skull[1] * 0.9, b.S.skull[2] * 0.7);
    horn.rotation.x = 0.7;
  }
  b.root.scale.setScalar(M.scale);
  b.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  b.mountName = M.name;
  b.seatY = (b.bodyH + b.S.barrel[1] * 1.0) * M.scale;
  return b;
}

void lerp;
