// Процедурная гуманоидная модель со скелетом из суставов и процедурной анимацией.
import * as THREE from 'three';
import { skinMat, clothMat, leatherMat, gemMat, boneMat, basicMat, muscleSkinMat } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { sculptedHead, faceTexture, buildHair, hairMat, hairCapMat } from './face.js';

// ---------- Геометрические помощники ----------
const geoCache = new Map();
function cached(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }

// Конечность вдоль -Y от 0 до -len (скруглённые концы, «мышечный» профиль)
export function limbGeo(len, r0, r1, bulge = 0.12, bulgeAt = 0.3, seg = 12) {
  const k = ['limb', len, r0, r1, bulge, bulgeAt, seg].map(v => typeof v === 'number' ? v.toFixed(4) : v).join();
  return cached(k, () => {
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * Math.PI / 2;
      pts.push(new THREE.Vector2(Math.max(0.0001, r1 * Math.cos(a)), -len + r1 * Math.sin(a) * 0.7));
    }
    for (let i = 0; i <= 8; i++) {
      const t = 1 - i / 8;
      const r = lerp(r0, r1, t) * (1 + bulge * Math.exp(-Math.pow((t - bulgeAt) / 0.22, 2)));
      pts.push(new THREE.Vector2(r, -t * len));
    }
    for (let i = 1; i <= 4; i++) {
      const a = (i / 4) * Math.PI / 2;
      pts.push(new THREE.Vector2(Math.max(0.0001, r0 * Math.cos(a)), r0 * Math.sin(a) * 0.7));
    }
    return new THREE.LatheGeometry(pts, seg);
  });
}

// Lathe по профилю [[r,y],...] (y по возрастанию)
export function latheGeo(profile, seg = 16, key = null) {
  const build = () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
  return key ? cached(key, build) : build();
}

export function ellipsoid(rx, ry, rz, ws = 16, hs = 12) {
  return cached(['ell', rx, ry, rz, ws, hs].join(), () => {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    return g;
  });
}

function headGeo(type) {
  return cached('head_' + type, () => {
    const g = new THREE.SphereGeometry(1, 30, 22);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      x *= 0.86; y *= 1.1; z *= 0.98;
      if (y < -0.1) {
        const t = (-y - 0.1) / 1.0;
        x *= 1 - t * (type === 'orc' || type === 'bull' ? 0.12 : 0.36);
        if (z > 0) z += t * 0.1;
      }
      if (z < 0 && y > -0.3) z *= 1.1;
      if (z > 0.62) z = 0.62 + (z - 0.62) * 0.55;
      if (type === 'lizard' || type === 'bull') { if (z > 0.2 && y < 0.2) z += (z - 0.2) * 0.9 * (1 - Math.max(0, y)); }
      if (type === 'goblin') { if (y > 0) { x *= 1.08; z *= 1.05; } }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

const SKULL_SOCKET = new THREE.MeshBasicMaterial({ color: 0x050505 });
const eyeMats = new Map();
function eyeWhiteMat(dark) {
  const k = 'w' + dark;
  if (!eyeMats.has(k)) eyeMats.set(k, new THREE.MeshPhysicalMaterial({ color: dark ? '#202020' : '#efeae4', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }));
  return eyeMats.get(k);
}
function irisMatFor(color) {
  if (!eyeMats.has(color)) eyeMats.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }));
  return eyeMats.get(color);
}

// ---------- Позы для анимаций (ключевые кадры) ----------
const R = (x = 0, y = 0, z = 0) => [x, y, z];
export const ACTIONS = {
  // рубящий удар справа налево: замах с разворотом корпуса, выпад, проводка
  slash: { dur: 0.62, lunge: 0.35, keys: [
    [0.24, { shoulderR: R(-2.3, 0.4, -1.1), elbowR: R(-1.6), wristR: R(0.4), spine: R(0.05, 0.75, 0.05), chest: R(0, 0.2), shoulderL: R(-0.6, 0, 0.6), elbowL: R(-1.0), hipL: R(-0.35), kneeL: R(0.35), hipR: R(0.2), kneeR: R(0.15) }],
    [0.42, { shoulderR: R(-0.9, -0.3, 0.55), elbowR: R(-0.15), wristR: R(-0.5), spine: R(0.25, -0.65, -0.05), chest: R(0, -0.2), shoulderL: R(-0.3, 0, 0.9), elbowL: R(-0.5), hipL: R(-0.6), kneeL: R(0.55), hipR: R(0.35), kneeR: R(0.2) }],
    [0.64, { shoulderR: R(-0.4, -0.2, 0.65), elbowR: R(-0.3), wristR: R(-0.3), spine: R(0.2, -0.8), chest: R(0, -0.15), shoulderL: R(-0.2, 0, 0.7), hipL: R(-0.5), kneeL: R(0.45), hipR: R(0.3), kneeR: R(0.15) }],
  ] },
  // обратный удар снизу вверх слева направо
  slash2: { dur: 0.58, lunge: 0.25, keys: [
    [0.25, { shoulderR: R(-1.2, -0.4, 1.05), elbowR: R(-1.9), wristR: R(0.2), spine: R(0.1, -0.7), chest: R(0, -0.2), shoulderL: R(-0.4, 0, 0.4), hipR: R(-0.35), kneeR: R(0.35) }],
    [0.45, { shoulderR: R(-1.9, 0.3, -1.25), elbowR: R(-0.2), wristR: R(0.5), spine: R(0.05, 0.75), chest: R(0, 0.2), shoulderL: R(-0.3, 0, 1.0), hipR: R(-0.55), kneeR: R(0.5), hipL: R(0.3) }],
    [0.66, { shoulderR: R(-2.1, 0.2, -1.1), elbowR: R(-0.4), spine: R(0, 0.8), shoulderL: R(-0.2, 0, 0.8) }],
  ] },
  // мощный удар сверху с прыжком-выпадом
  slam: { dur: 0.8, lunge: 0.55, hop: 0.25, keys: [
    [0.34, { shoulderR: R(-3.05, 0, -0.2), shoulderL: R(-3.05, 0, 0.2), elbowR: R(-1.3), elbowL: R(-1.3), wristR: R(0.5), spine: R(-0.35), neck: R(-0.2), hipL: R(-0.25), kneeL: R(0.6), hipR: R(0.1), kneeR: R(0.5) }],
    [0.52, { shoulderR: R(-0.75, 0, -0.05), shoulderL: R(-0.8, 0, 0.05), elbowR: R(-0.1), elbowL: R(-0.1), wristR: R(-0.3), spine: R(0.65), neck: R(0.2), hipL: R(-0.8), kneeL: R(1.0), hipR: R(0.45), kneeR: R(0.55) }],
    [0.72, { shoulderR: R(-0.7), shoulderL: R(-0.75), elbowR: R(-0.2), elbowL: R(-0.2), spine: R(0.55), hipL: R(-0.7), kneeL: R(0.9), hipR: R(0.4), kneeR: R(0.5) }],
  ] },
  sweep: { dur: 0.7, spin: 1, keys: [
    [0.2, { spine: R(0.1, 0.9), shoulderR: R(-1.2, 0, -1.2), shoulderL: R(-1.3, 0.4, 0.6), elbowR: R(-0.6), elbowL: R(-0.7), hipL: R(-0.3), kneeL: R(0.5), hipR: R(-0.3), kneeR: R(0.5) }],
    [0.5, { spine: R(0.15, -0.2), shoulderR: R(-1.5, 0, -1.4), shoulderL: R(-1.4, 0, 1.1), elbowR: R(-0.1), elbowL: R(-0.3), hipL: R(-0.45), kneeL: R(0.7), hipR: R(-0.45), kneeR: R(0.7) }],
    [0.78, { spine: R(0.1, -0.8), shoulderR: R(-1.2, 0, 0.3), shoulderL: R(-1.2, 0, 0.9), elbowR: R(-0.3), elbowL: R(-0.3) }],
  ] },
  thrust: { dur: 0.5, lunge: 0.6, keys: [
    [0.3, { shoulderR: R(-0.6, 0.3, -0.4), elbowR: R(-2.0), spine: R(0, 0.45), chest: R(0, 0.15), hipR: R(0.2) }],
    [0.52, { shoulderR: R(-1.6), elbowR: R(-0.02), spine: R(0.25, -0.35), chest: R(0, -0.1), hipL: R(-0.7), kneeL: R(0.7), hipR: R(0.4), kneeR: R(0.2) }],
  ] },
  bash: { dur: 0.55, lunge: 0.45, keys: [
    [0.3, { shoulderL: R(-0.5, 0, 0.4), elbowL: R(-1.9), spine: R(0, -0.45), hipR: R(-0.3), kneeR: R(0.4) }],
    [0.52, { shoulderL: R(-1.55, 0, 0.1), elbowL: R(-0.6), spine: R(0.3, 0.45), hipL: R(-0.65), kneeL: R(0.6), hipR: R(0.35) }],
  ] },
  bow: { dur: 0.7, keys: [
    [0.2, { shoulderL: R(-1.55, 0, 0.05), elbowL: R(-0.05), shoulderR: R(-1.5, 0, -0.1), elbowR: R(-1.4), spine: R(0, 0.25), neck: R(0, -0.2) }],
    [0.62, { shoulderL: R(-1.58, 0, 0.05), elbowL: R(0), shoulderR: R(-1.45, 0.25, -0.2), elbowR: R(-2.5), spine: R(0, 0.3), neck: R(0, -0.25) }],
    [0.72, { shoulderL: R(-1.55, 0, 0.05), elbowL: R(0), shoulderR: R(-1.2, 0.4, -0.5), elbowR: R(-1.8), spine: R(0, 0.3) }],
  ] },
  cast: { dur: 0.6, keys: [
    [0.3, { shoulderR: R(-1.7, 0, -0.1), elbowR: R(-0.25), shoulderL: R(-0.7, 0, 0.5), elbowL: R(-0.6), spine: R(0.05, -0.2) }],
    [0.6, { shoulderR: R(-1.5, 0, -0.1), elbowR: R(-0.1), shoulderL: R(-0.6, 0, 0.5), spine: R(0.1, -0.15) }],
  ] },
  cast2: { dur: 0.85, keys: [
    [0.4, { shoulderR: R(-2.9, 0, -0.35), shoulderL: R(-2.9, 0, 0.35), elbowR: R(-0.2), elbowL: R(-0.2), spine: R(-0.22), neck: R(-0.3) }],
    [0.65, { shoulderR: R(-1.0, 0, -0.6), shoulderL: R(-1.0, 0, 0.6), elbowR: R(-0.3), elbowL: R(-0.3), spine: R(0.3) }],
  ] },
  buff: { dur: 0.8, keys: [
    [0.35, { shoulderR: R(-0.6, 0, -1.3), shoulderL: R(-0.6, 0, 1.3), elbowR: R(-0.9), elbowL: R(-0.9), spine: R(-0.3), neck: R(-0.35) }],
    [0.7, { shoulderR: R(-0.6, 0, -1.2), shoulderL: R(-0.6, 0, 1.2), elbowR: R(-0.9), elbowL: R(-0.9), spine: R(-0.25), neck: R(-0.3) }],
  ] },
  hit: { dur: 0.35, keys: [
    [0.3, { spine: R(-0.28, 0.1), neck: R(-0.25) }],
  ] },
  talk: { dur: 2.0, keys: [
    [0.25, { shoulderR: R(-0.9, 0, -0.3), elbowR: R(-1.2), neck: R(0.05, 0.1) }],
    [0.6, { shoulderR: R(-0.7, 0, -0.5), elbowR: R(-1.0), neck: R(-0.05, -0.1) }],
  ] },
  bite: { dur: 0.5, keys: [
    [0.3, { spine: R(-0.2), neck: R(-0.3) }],
    [0.5, { spine: R(0.4), neck: R(0.3) }],
  ] },
};

const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'tail'];

/**
 * spec: {
 *   female, scale, legLen, armLen, torsoW, torsoD, limb, head (scale), neckLen,
 *   skin, hair:{style,color}, beard, eyes:{color, glow}, headType, ears:'pointy'|'big',
 *   base:{shirt, pants, boots, sleeves}, tusks, horns:{color,size}, tail, bones
 * }
 */
export class Humanoid {
  constructor(spec = {}) {
    this.spec = spec = Object.assign({
      female: false, scale: 1, legLen: 1, armLen: 1, torsoW: 1, torsoD: 1, limb: 1, head: 1, neckLen: 1,
      skin: '#d9a77f', hair: { style: 'short', color: '#3b2a1e' }, beard: null, eyes: { color: '#3a5a7a', glow: false },
      headType: 'human', ears: null, base: { shirt: '#8a7a60', pants: '#4a3a2a', boots: '#3a2a1a', sleeves: true },
    }, spec);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.j = {};
    this.meshes = [];
    this.attachments = {};
    this.time = Math.random() * 10;
    this.phase = 0;
    this.action = null;
    this.actionT = 0;
    this.deadT = -1;
    this.hold = 'none'; // none, 1h, 2h, staff, bow, shield
    this.offhand = 'none';
    this.build();
    this.root.scale.setScalar(spec.scale);
    this.cur = {};
    for (const n of JOINTS) if (this.j[n]) this.cur[n] = [0, 0, 0];
  }

  mesh(geo, mat, parent, x = 0, y = 0, z = 0, name = '') {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = false;
    if (name) m.name = name;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  joint(name, parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.name = name;
    parent.add(o);
    this.j[name] = o;
    return o;
  }

  build() {
    const s = this.spec;
    const F = s.female;
    const L = s.legLen * (F ? 1.0 : 1.0);
    const A = s.armLen;
    const W = s.torsoW * (F ? 0.88 : 1);
    const D = s.torsoD;
    const T = s.limb * (F ? 0.86 : 1);
    const isSkel = s.headType === 'skull';
    const skin = isSkel ? boneMat() : skinMat(s.skin);
    this.skinMat = skin;
    this.shirtMat = s.base.shirt ? clothMat(s.base.shirt) : skin;
    this.pantsMat = s.base.pants ? clothMat(s.base.pants) : skin;
    this.bootMat = s.base.boots ? leatherMat(s.base.boots) : skin;
    const thigh = 0.44 * L, shin = 0.42 * L;
    const hipY = thigh + shin + 0.06 + 0.06;
    this.dim = { thigh, shin, hipY, uarm: 0.29 * A, farm: 0.26 * A, W, D, T, F };

    const hips = this.joint('hips', this.body, 0, hipY, 0);
    this.hipY = hipY;
    // Таз
    this.parts = {};
    const pelvisW = F ? 0.165 : 0.15;
    this.parts.pelvis = this.mesh(ellipsoid(pelvisW * W * (F ? 1.12 : 1), 0.11, 0.115 * D), this.pantsMat, hips, 0, 0.0, 0);
    const spine = this.joint('spine', hips, 0, 0.07, 0);
    // Живот
    const ab = latheGeo([[0.0, -0.02], [0.125, 0.0], [0.13, 0.08], [0.128, 0.16], [0.135, 0.22]], 16, 'abdomen');
    const bare = this.shirtMat === skin && !isSkel;
    this.parts.abdomen = this.mesh(ab, bare ? muscleSkinMat(s.skin, 'abs') : this.shirtMat, spine, 0, 0, 0);
    this.parts.abdomen.scale.set(W * (F ? 0.95 : 1.02), 1, 0.74 * D);
    const chest = this.joint('chest', spine, 0, 0.18, 0);
    // Грудная клетка (V-образный силуэт у мужчин)
    const chestProf = F
      ? [[0.12, 0.0], [0.135, 0.06], [0.15, 0.14], [0.152, 0.2], [0.14, 0.25], [0.1, 0.29], [0.05, 0.31]]
      : [[0.13, 0.0], [0.15, 0.06], [0.17, 0.14], [0.18, 0.21], [0.172, 0.26], [0.12, 0.3], [0.05, 0.315]];
    this.parts.chest = this.mesh(latheGeo(chestProf, 24, 'chest' + F), bare ? muscleSkinMat(s.skin, 'chest') : this.shirtMat, chest, 0, 0, 0);
    this.parts.chest.scale.set(W, 1, 0.68 * D);
    if (F) {
      for (const sx of [-1, 1]) {
        const b = this.mesh(ellipsoid(0.062, 0.058, 0.05), this.shirtMat, chest, sx * 0.062 * W, 0.165, 0.075 * D);
        b.rotation.x = -0.25;
        this.parts['breast' + sx] = b;
      }
    }
    // Трапеции
    const trap = this.mesh(ellipsoid(0.15 * W, 0.05, 0.07 * D), this.shirtMat, chest, 0, 0.27, -0.01);
    this.parts.trap = trap;
    // Шея и голова
    const neckLen = 0.072 * s.neckLen;
    const neck = this.joint('neck', chest, 0, 0.3, 0.0);
    this.mesh(limbGeo(neckLen + 0.03, 0.056 * T * (F ? 0.88 : 1.08), 0.064 * T * (F ? 0.9 : 1.05), 0, 0.5, 12), skin, neck, 0, neckLen + 0.005, 0.0);
    const head = this.joint('head', neck, 0, neckLen, 0.01);
    this.buildHead(head);
    this.topY = hipY + 0.07 + 0.18 + 0.3 + neckLen + this.headR * 2.15;

    // Руки
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = this.joint('shoulder' + side, chest, sx * 0.19 * W, 0.245, -0.005);
      this.parts['delt' + side] = this.mesh(ellipsoid(0.074 * T, 0.076 * T, 0.072 * T), this.spec.base.sleeves === false ? skin : this.shirtMat, sh, sx * 0.012, -0.02, 0);
      this.parts['uarm' + side] = this.mesh(limbGeo(this.dim.uarm, 0.063 * T, 0.05 * T, 0.2, 0.4), this.spec.base.sleeves === false ? skin : this.shirtMat, sh, 0, -0.01, 0);
      const el = this.joint('elbow' + side, sh, 0, -this.dim.uarm, 0);
      this.parts['farm' + side] = this.mesh(limbGeo(this.dim.farm, 0.052 * T, 0.035 * T, 0.22, 0.25), skin, el, 0, 0, 0);
      const wr = this.joint('wrist' + side, el, 0, -this.dim.farm, 0);
      // кисть: ладонь + пальцы + большой палец
      const hand = new THREE.Group();
      wr.add(hand);
      this.parts['hand' + side] = hand;
      const hs = isSkel ? 0.8 : 1;
      this.mesh(ellipsoid(0.036 * hs, 0.046 * hs, 0.019 * hs), skin, hand, 0, -0.045, 0.004);
      // четыре согнутых пальца из двух фаланг и большой палец
      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.017 * hs;
        const fl = (f === 1 || f === 2 ? 0.03 : 0.026) * hs;
        const k1 = new THREE.Object3D(); k1.position.set(fx, -0.086 * hs, 0.004); k1.rotation.x = 0.9; hand.add(k1);
        this.mesh(limbGeo(fl, 0.0085 * hs, 0.0075 * hs, 0, 0.5, 6), skin, k1);
        const k2 = new THREE.Object3D(); k2.position.set(0, -fl, 0); k2.rotation.x = 1.1; k1.add(k2);
        this.mesh(limbGeo(fl * 0.85, 0.0075 * hs, 0.0062 * hs, 0, 0.5, 6), skin, k2);
      }
      const tb = new THREE.Object3D(); tb.position.set(-sx * 0.026, -0.03, 0.014); tb.rotation.set(0.5, 0, -sx * 0.7); hand.add(tb);
      this.mesh(limbGeo(0.042, 0.011, 0.008, 0.1, 0.4, 6), skin, tb);
      // точка хвата оружия
      const grip = new THREE.Object3D();
      grip.position.set(0, -0.075, 0.02);
      hand.add(grip);
      this.j['grip' + side] = grip;
    }
    // Ноги
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const hp = this.joint('hip' + side, hips, sx * (F ? 0.098 : 0.092) * W, -0.05, 0);
      this.parts['thigh' + side] = this.mesh(limbGeo(thigh, 0.094 * T * (F ? 1.08 : 1), 0.06 * T, 0.12, 0.25), this.pantsMat, hp, 0, 0, 0);
      const kn = this.joint('knee' + side, hp, 0, -thigh, 0);
      this.parts['shin' + side] = this.mesh(limbGeo(shin, 0.062 * T, 0.04 * T, 0.28, 0.25), this.pantsMat, kn, 0, 0, 0);
      const an = this.joint('ankle' + side, kn, 0, -shin, 0);
      const foot = new THREE.Group();
      an.add(foot);
      this.parts['foot' + side] = foot;
      this.mesh(ellipsoid(0.048, 0.04, 0.115), this.bootMat, foot, 0, -0.045, 0.045);
      this.mesh(ellipsoid(0.042, 0.05, 0.05), this.bootMat, foot, 0, -0.025, -0.02);
      // голенище базовых сапог
      if (this.spec.base.boots) this.parts['bootTop' + side] = this.mesh(limbGeo(0.16, 0.047 * T, 0.045 * T, 0, 0.5, 10), this.bootMat, an, 0, 0.15, 0);
    }
    if (s.tail) {
      const tail = this.joint('tail', hips, 0, 0.02, -0.1);
      const tg = new THREE.ConeGeometry(0.07, 0.9, 8);
      tg.rotateX(-Math.PI / 2 - 0.4); tg.translate(0, -0.18, -0.42);
      this.mesh(tg, skin, tail);
    }
  }

  buildHead(head) {
    const s = this.spec;
    const hr = 0.104 * s.head * (s.female ? 0.96 : 1);
    const hc = new THREE.Group();
    hc.position.set(0, hr * 1.02, 0.008);
    head.add(hc);
    this.headC = hc;
    this.headR = hr;
    const type = s.headType;
    const isSkel = type === 'skull';
    const skin = this.skinMat;
    const faceTypes = ['human', 'orc', 'goblin', 'demon', 'lizard', 'bull'];
    let faceMat = skin;
    if (faceTypes.includes(type)) {
      const necroLike = s.eyes && s.eyes.glow && /^#[0-9a-f]{6}$/i.test(s.skin) && new THREE.Color(s.skin).getHSL({}).s < 0.12;
      faceMat = new THREE.MeshPhysicalMaterial({
        map: faceTexture(s.skin, s.hair && s.hair.color, s.female, { stubble: !s.female && !s.beard && type === 'human', lips: s.lips, paint: necroLike ? '#2a2a3a' : null }),
        roughness: 0.55, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ff9a80'),
      });
    }
    this.faceMat = faceMat;
    const headMesh = this.mesh(faceTypes.includes(type) && type !== 'lizard' && type !== 'bull' ? sculptedHead(type, s.female) : headGeo(type), faceMat, hc);
    headMesh.scale.setScalar(hr);
    if (type === 'yeti') headMesh.scale.multiplyScalar(1.1);
    const eyeY = hr * 0.13, eyeX = hr * 0.29, eyeZ = hr * 0.73;
    if (isSkel) {
      for (const sx of [-1, 1]) {
        this.mesh(ellipsoid(hr * 0.17, hr * 0.17, hr * 0.12), SKULL_SOCKET, hc, sx * eyeX, eyeY, eyeZ + hr * 0.04);
        this.mesh(ellipsoid(hr * 0.07, hr * 0.07, hr * 0.05), gemMat(s.eyes.color || '#55ffdd', 4), hc, sx * eyeX, eyeY, eyeZ + hr * 0.1);
      }
      this.mesh(ellipsoid(hr * 0.06, hr * 0.08, hr * 0.05), SKULL_SOCKET, hc, 0, -hr * 0.2, hr * 0.84);
      // челюсть с зубами
      const jaw = this.mesh(ellipsoid(hr * 0.5, hr * 0.2, hr * 0.5), boneMat(), hc, 0, -hr * 0.75, hr * 0.25);
      jaw.name = 'jaw';
      for (let i = -2; i <= 2; i++) this.mesh(ellipsoid(hr * 0.05, hr * 0.09, hr * 0.04), boneMat('#eee6d0'), hc, i * hr * 0.11, -hr * 0.55, hr * 0.74);
      return;
    }
    // Глаза
    for (const sx of [-1, 1]) {
      this.mesh(ellipsoid(hr * 0.12, hr * 0.1, hr * 0.1), eyeWhiteMat(s.eyes.glow), hc, sx * eyeX, eyeY, eyeZ);
      const irisMat = s.eyes.glow ? gemMat(s.eyes.color, 3) : irisMatFor(s.eyes.color);
      this.mesh(ellipsoid(hr * 0.06, hr * 0.06, hr * 0.03), irisMat, hc, sx * eyeX, eyeY, eyeZ + hr * 0.08);
      if (!s.eyes.glow) this.mesh(ellipsoid(hr * 0.028, hr * 0.028, hr * 0.015), basicMat('#050505', 0.05), hc, sx * eyeX, eyeY, eyeZ + hr * 0.1);
      // веко (моргает)
      const lid = this.mesh(ellipsoid(hr * 0.135, hr * 0.07, hr * 0.112), faceTypes.includes(type) ? skinMat(s.skin) : skin, hc, sx * eyeX, eyeY + hr * 0.06, eyeZ - hr * 0.002);
      lid.rotation.x = -0.15;
      (this.lids || (this.lids = [])).push(lid);
      // уши
      const earMesh = this.mesh(ellipsoid(hr * 0.1, hr * 0.24, hr * 0.17), skin, hc, sx * hr * 0.85, -hr * 0.02, -hr * 0.05);
      if (s.ears === 'pointy' || type === 'goblin') {
        earMesh.scale.set(1, type === 'goblin' ? 1.4 : 1.1, 1);
        earMesh.rotation.z = sx * -1.1;
        earMesh.position.x = sx * hr * (type === 'goblin' ? 1.25 : 1.0);
        earMesh.position.y = hr * 0.1;
      }
    }
    // Нос у гоблина — длинный крючковатый
    if (type === 'goblin') {
      const nose = this.mesh(ellipsoid(hr * 0.1, hr * 0.2, hr * 0.3), skinMat(s.skin), hc, 0, -hr * 0.12, hr * 0.98);
      nose.rotation.x = -0.45;
    }
    if (type === 'orc' || s.tusks) {
      for (const sx of [-1, 1]) {
        const tusk = this.mesh(new THREE.ConeGeometry(hr * 0.06, hr * 0.32, 6), boneMat('#efe6c8'), hc, sx * hr * 0.24, -hr * 0.42, hr * 0.78);
        tusk.rotation.z = sx * -0.25;
      }
    }
    if (type === 'bull') {
      this.mesh(ellipsoid(hr * 0.4, hr * 0.3, hr * 0.32), basicMat('#3a2a22', 0.7), hc, 0, -hr * 0.45, hr * 1.25);
      const ring = this.mesh(new THREE.TorusGeometry(hr * 0.12, hr * 0.025, 6, 14), basicMat('#c9a040', 0.3, 1), hc, 0, -hr * 0.62, hr * 1.5);
      ring.rotation.x = 0.3;
    }
    if (type === 'lizard') {
      // гребень
      for (let i = 0; i < 5; i++) {
        const c = this.mesh(new THREE.ConeGeometry(hr * 0.08, hr * 0.35, 4), basicMat('#a04020', 0.6), hc, 0, hr * (0.9 - i * 0.12), -hr * (0.1 + i * 0.25));
        c.rotation.x = -0.6 - i * 0.2;
      }
    }
    if (s.horns || type === 'bull' || type === 'demon') {
      const hcol = (s.horns && s.horns.color) || (type === 'demon' ? '#1a1010' : '#e8dcc0');
      const size = (s.horns && s.horns.size) || 1;
      for (const sx of [-1, 1]) {
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(sx * hr * 0.9 * size, hr * 0.3 * size, -hr * 0.1),
          new THREE.Vector3(sx * hr * 1.0 * size, hr * 1.1 * size, hr * 0.2 * size),
        );
        const tg = new THREE.TubeGeometry(curve, 10, hr * 0.09 * size, 7);
        // сужение к кончику
        const p = tg.attributes.position;
        const tmp = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          const seg = Math.floor(i / 8) / 10;
          const c = curve.getPoint(Math.min(1, seg));
          tmp.set(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(1 - seg * 0.85).add(c);
          p.setXYZ(i, tmp.x, tmp.y, tmp.z);
        }
        tg.computeVertexNormals();
        this.mesh(tg, basicMat(hcol, 0.5), hc, sx * hr * 0.55, hr * 0.55, 0);
      }
    }
    // Волосы: кожа головы с текстурой прядей + пряди-ленты
    const hairCol = s.hair && s.hair.color;
    this.hairMeshes = [];
    if (s.hair && s.hair.style !== 'none' && hairCol) {
      const style = s.hair.style;
      const cap = new THREE.SphereGeometry(hr * 1.035, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const capM = this.mesh(cap, hairCapMat(hairCol), hc, 0, hr * 0.06, -hr * 0.05);
      capM.scale.set(0.88, 1.08, 1.04);
      capM.rotation.x = -0.45;
      this.hairMeshes.push(capM);
      const hg = buildHair(style, hr, s.female, Math.floor((new THREE.Color(hairCol).r * 97 + (s.female ? 3 : 1)) * 10));
      if (hg) { const hm = this.mesh(hg, hairMat(hairCol), hc); hm.castShadow = true; this.hairMeshes.push(hm); }
      if (style === 'braids') {
        const bm = hairCapMat(hairCol);
        for (const sx of [-1, 1]) {
          for (let k = 0; k < 6; k++) this.hairMeshes.push(this.mesh(ellipsoid(hr * 0.12, hr * 0.15, hr * 0.12), bm, hc, sx * hr * 0.72, -hr * (0.35 + k * 0.25), -hr * 0.32));
          this.mesh(new THREE.TorusGeometry(hr * 0.11, hr * 0.04, 6, 12), basicMat('#d4a83a', 0.3, 1), hc, sx * hr * 0.72, -hr * 1.85, -hr * 0.32).rotation.x = Math.PI / 2;
        }
      }
    }
    // Борода
    if (s.beard) {
      const bm = hairCapMat(s.hair.color || '#5a3a1a');
      const big = s.beard === 'dwarf';
      const bl = big ? hr * 3.0 : hr * 1.0;
      const bg = new THREE.ConeGeometry(hr * (big ? 0.85 : 0.6), bl, 14, 3);
      bg.rotateX(Math.PI);
      const b = this.mesh(bg, bm, hc, 0, -hr * 0.55 - bl * 0.42, hr * 0.42);
      b.scale.z = 0.6;
      b.rotation.x = -0.15;
      // усы
      for (const sx of [-1, 1]) {
        const mu = this.mesh(ellipsoid(hr * 0.28, hr * 0.08, hr * 0.1), bm, hc, sx * hr * 0.2, -hr * 0.33, hr * 0.85);
        mu.rotation.z = sx * -0.35;
      }
      // бакенбарды
      for (const sx of [-1, 1]) this.mesh(ellipsoid(hr * 0.2, hr * 0.45, hr * 0.3), bm, hc, sx * hr * 0.68, -hr * 0.4, hr * 0.15);
      if (big) {
        for (const sx of [-1, 1]) {
          for (let k = 0; k < 3; k++) this.mesh(ellipsoid(hr * 0.12, hr * 0.14, hr * 0.12), bm, hc, sx * hr * 0.3, -hr * (2.3 + k * 0.25), hr * 0.62);
          this.mesh(new THREE.TorusGeometry(hr * 0.1, hr * 0.04, 6, 10), basicMat('#d4a83a', 0.3, 1), hc, sx * hr * 0.3, -hr * 3.1, hr * 0.62).rotation.x = Math.PI / 2;
        }
      }
    }
    if (type === 'yeti') {
      const fur = basicMat(s.skin, 0.95);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        this.mesh(ellipsoid(hr * 0.35, hr * 0.5, hr * 0.35), fur, hc, Math.cos(a) * hr * 0.8, hr * 0.2, Math.sin(a) * hr * 0.6 - hr * 0.1);
      }
    }
  }

  // Видимость частей тела (броня их скрывает, чтобы не было «просвечивания»)
  setPartVisible(name, v) { if (this.parts[name]) this.parts[name].visible = v; }

  playAction(name, speed = 1) {
    const a = ACTIONS[name];
    if (!a) return;
    this.action = a; this.actionName = name;
    this.actionT = 0; this.actionSpeed = speed;
  }

  die() { this.deadT = 0; this.action = null; }
  revive() { this.deadT = -1; this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); }

  // state: { speed (м/с, со знаком), runSpeed, airborne }
  update(dt, state = {}) {
    this.time += dt;
    const speed = state.speed || 0;
    const runSpeed = state.runSpeed || 6;
    const blend = clamp(Math.abs(speed) / runSpeed, 0, 1.2);
    const T = {};
    for (const n in this.cur) T[n] = [0, 0, 0];
    const t = this.time;
    // Поза покоя
    T.shoulderL[2] = 0.13; T.shoulderR[2] = -0.13;
    T.elbowL[0] = -0.18; T.elbowR[0] = -0.18;
    T.chest[0] = Math.sin(t * 1.7) * 0.018;
    T.neck[0] = Math.sin(t * 0.7) * 0.03;
    T.neck[1] = Math.sin(t * 0.37) * 0.12 * (1 - blend);
    T.wristL[0] = 0.1; T.wristR[0] = 0.1;
    const hold = this.hold;
    if (hold === 'staff') { T.elbowR[0] = -1.25; T.shoulderR[0] = -0.1; T.shoulderR[2] = -0.2; T.wristR[0] = 0.0; }
    else if (hold === '1h') { T.elbowR[0] = -0.55; T.wristR[0] = 0.75; }
    else if (hold === '2h') { T.shoulderR[0] = -0.35; T.elbowR[0] = -1.0; T.shoulderL[0] = -0.55; T.elbowL[0] = -1.2; T.shoulderL[2] = 0.05; T.shoulderL[1] = -0.5; T.wristR[0] = 0.5; }
    else if (hold === 'bow') { T.elbowL[0] = -0.4; T.wristL[0] = 0.4; }
    if (this.offhand === 'shield') { T.elbowL[0] = -1.35; T.shoulderL[2] = 0.28; T.shoulderL[0] = -0.1; T.wristL[2] = 0.0; }
    else if (this.offhand === 'orb') { T.elbowL[0] = -1.1; T.shoulderL[2] = 0.3; T.wristL[0] = -0.4; }

    // Ходьба/бег
    const armsFree = hold === 'none' || hold === '1h' || hold === 'bow' || hold === 'staff';
    if (blend > 0.02) {
      this.phase += dt * speed * (1.55 - blend * 0.25) * 1.15;
      const ph = this.phase;
      const amp = 0.28 + 0.38 * Math.min(1, blend);
      const sn = Math.sin(ph), cs = Math.cos(ph);
      T.hipL[0] += sn * amp; T.hipR[0] += -sn * amp;
      T.kneeL[0] += Math.max(0, -cs) * amp * 1.9 + 0.08;
      T.kneeR[0] += Math.max(0, cs) * amp * 1.9 + 0.08;
      T.ankleL[0] += -sn * amp * 0.35 - 0.05;
      T.ankleR[0] += sn * amp * 0.35 - 0.05;
      const aa = amp * 0.9;
      if (this.offhand !== 'shield' && hold !== '2h' && this.offhand !== 'orb') { T.shoulderL[0] += -sn * aa; T.elbowL[0] -= blend * 0.7; }
      if (armsFree && hold !== 'staff') { T.shoulderR[0] += sn * aa; T.elbowR[0] -= blend * 0.7; }
      T.spine[0] += blend * 0.13;
      T.spine[1] += sn * 0.09 * blend;
      T.hips[1] -= sn * 0.07 * blend;
      this.j.hips.position.y = this.hipY + (Math.abs(cs) - 0.6) * 0.045 * blend;
    } else {
      this.j.hips.position.y = lerp(this.j.hips.position.y, this.hipY + Math.sin(t * 1.7) * 0.004, 0.2);
    }
    if (state.mounted) {
      // посадка в седле: ноги в стременах, руки держат поводья
      T.hipL = [-1.25, 0, 0.42]; T.hipR = [-1.25, 0, -0.42];
      T.kneeL = [1.45, 0, 0]; T.kneeR = [1.45, 0, 0];
      T.ankleL = [-0.15, 0, 0]; T.ankleR = [-0.15, 0, 0];
      T.spine[0] += 0.12 + (state.mountSpeed || 0) * 0.012;
      if (!this.action) { T.shoulderL = [-0.55, 0, 0.12]; T.shoulderR = [-0.55, 0, -0.12]; T.elbowL = [-1.0, 0, 0]; T.elbowR = [-1.0, 0, 0]; }
      this.j.hips.position.y = this.hipY;
    }
    if (state.airborne && !state.mounted) {
      T.hipL[0] = -0.6; T.kneeL[0] = 1.0; T.hipR[0] = 0.1; T.kneeR[0] = 0.5;
    }
    // Действие (атака/каст)
    if (this.action) {
      this.actionT += dt / (this.action.dur / (this.actionSpeed || 1));
      const p = this.actionT;
      if (p >= 1) this.action = null;
      else {
        const keys = this.action.keys;
        // найти соседние кадры: [0, rest] ... keys ... [1, rest]
        let prevT = 0, prevPose = null, nextT = 1, nextPose = null;
        for (let i = 0; i < keys.length; i++) {
          if (p < keys[i][0]) { nextT = keys[i][0]; nextPose = keys[i][1]; break; }
          prevT = keys[i][0]; prevPose = keys[i][1];
        }
        const k = smoothstep(0, 1, (p - prevT) / (nextT - prevT));
        const joints = new Set([...Object.keys(prevPose || {}), ...Object.keys(nextPose || {})]);
        for (const jn of joints) {
          if (!T[jn]) continue;
          const a = prevPose && prevPose[jn] ? prevPose[jn] : T[jn];
          const b = nextPose && nextPose[jn] ? nextPose[jn] : T[jn];
          T[jn] = [lerp(a[0] || 0, b[0] || 0, k), lerp(a[1] || 0, b[1] || 0, k), lerp(a[2] || 0, b[2] || 0, k)];
        }
      }
    }
    // выпад вперёд, прыжок и вращение всем телом во время удара
    if (this.action && this.deadT < 0) {
      const p = this.actionT, A = this.action;
      const w = Math.sin(clamp((p - 0.1) / 0.6, 0, 1) * Math.PI);
      this.body.position.z = (A.lunge || 0) * w;
      this.body.position.y = (A.hop || 0) * Math.sin(clamp((p - 0.15) / 0.38, 0, 1) * Math.PI);
      this.body.rotation.y = A.spin ? -smoothstep(0.12, 0.75, p) * Math.PI * 2 * A.spin : 0;
    } else if (this.deadT < 0) {
      this.body.position.z *= 0.8; this.body.position.y *= 0.8; this.body.rotation.y = 0;
    }
    // Смерть
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = smoothstep(0, 0.8, this.deadT);
      this.body.rotation.x = -k * Math.PI / 2 * 0.98;
      this.body.position.y = k * 0.12;
      this.body.position.z = -k * 0.2;
      T.kneeL[0] = 0.4 * k; T.kneeR[0] = 0.1 * k;
      T.shoulderL[2] = 0.8 * k; T.shoulderR[2] = -0.6 * k;
      T.neck[0] = -0.2 * k;
    }
    // Плавное приближение к целевой позе
    const kk = 1 - Math.exp(-dt * (this.action ? 22 : 14));
    for (const n in this.cur) {
      const c = this.cur[n], tg = T[n];
      c[0] += (tg[0] - c[0]) * kk; c[1] += (tg[1] - c[1]) * kk; c[2] += (tg[2] - c[2]) * kk;
      this.j[n].rotation.set(c[0], c[1], c[2]);
    }
    // моргание
    if (this.lids) {
      this.blinkT = (this.blinkT == null ? 2 + Math.random() * 3 : this.blinkT) - dt;
      const k = this.blinkT < 0.12 ? 2.1 : 1;
      if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3.5;
      for (const l of this.lids) l.scale.y = this.deadT >= 0 ? 2.1 : k;
    }
    // покачивание таза при ходьбе и перенос веса в покое
    if (blend > 0.02) this.j.hips.rotation.z = Math.sin(this.phase) * 0.06 * Math.min(1, blend);
    else { this.j.hips.rotation.z = Math.sin(t * 0.45) * 0.025; this.j.spine.rotation.z = -Math.sin(t * 0.45) * 0.02; }
    if (this.robe) this.deformRobe();
    // анимация тканей (плащ)
    if (this.cape) {
      const sw = Math.sin(t * 2.3) * 0.04 + blend * 0.35;
      this.cape.rotation.x = 0.1 + sw;
    }
    if (this.robe) {
      this.robe.rotation.x = -this.cur.spine[0] * 0.3 + Math.sin(this.phase) * 0.04 * blend;
    }
    if (this.updateExtra) this.updateExtra(dt, t, blend);
  }

  // Мантия раздвигается ногами (без просвечивания)
  deformRobe() {
    const d = this.dim, robe = this.robe;
    const hx = (d.F ? 0.098 : 0.092) * d.W;
    const legs = ['L', 'R'].map((sd) => {
      const t1 = this.cur['hip' + sd][0], t2 = this.cur['knee' + sd][0];
      const H = [sd === 'L' ? hx : -hx, -0.05, 0];
      const K = [H[0], H[1] - d.thigh * Math.cos(t1), -d.thigh * Math.sin(t1)];
      const A = [H[0], K[1] - d.shin * Math.cos(t1 + t2), K[2] - d.shin * Math.sin(t1 + t2)];
      return { H, K, A };
    });
    const legR = 0.1 * d.T;
    for (const m of robe.children) {
      const base = m.userData.base;
      if (!base) continue;
      const pos = m.geometry.attributes.position;
      const sz = m.scale.z || 1;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2] * sz;
        const r0 = Math.hypot(bx, bz);
        if (r0 < 1e-4) continue;
        const cx = bx / r0, cz = bz / r0;
        let need = r0;
        for (const L of legs) {
          let lx, lz;
          if (by >= L.K[1]) { const t = clamp((L.H[1] - by) / Math.max(1e-3, L.H[1] - L.K[1]), 0, 1); lx = L.H[0]; lz = L.H[2] + (L.K[2] - L.H[2]) * t; }
          else { const t = clamp((L.K[1] - by) / Math.max(1e-3, L.K[1] - L.A[1]), 0, 1.3); lx = L.K[0]; lz = L.K[2] + (L.A[2] - L.K[2]) * t; }
          const p = lx * cx + lz * cz, q = Math.abs(-lx * cz + lz * cx);
          if (q < legR) need = Math.max(need, p + Math.sqrt(legR * legR - q * q) + 0.02);
        }
        const k = need / r0;
        pos.setXYZ(i, bx * k, by, base[i * 3 + 2] * k);
      }
      pos.needsUpdate = true;
      m.geometry.computeVertexNormals();
    }
  }

  worldPos(jointName, out = new THREE.Vector3()) {
    const o = this.j[jointName];
    return o ? o.getWorldPosition(out) : this.root.getWorldPosition(out);
  }
  headTop() { return (this.topY || 1.85) * this.root.scale.y; }

  dispose() { this.root.removeFromParent(); }
}
