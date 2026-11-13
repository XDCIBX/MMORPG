// Паук: вылепленные головогрудь и брюшко (SDF), хелицеры с клыками, восемь глаз,
// суставчатые ноги (бедро, колено, голень, плюсна, лапка) с кольцами окраски,
// волоски-оболочки (на ногах длиннее), блестящий хитин и узор на брюшке.
import * as THREE from 'three';
import { Creature } from './creature_base.js';
import { Sculpt } from './sdf.js';
import { IS_PHONE, IS_TOUCH } from '../core/device.js';
import { clamp } from '../core/util.js';
import { furLOD } from './beasts.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- Тело ----------
function sculptBody() {
  const S = new Sculpt();
  // головогрудь: выпуклая «головная» часть спереди, ямка посередине
  S.ell([0, 0.0, 0.12], [0.16, 0.085, 0.19], { k: 0.05, tag: 'pro' });
  S.ell([0, 0.035, 0.22], [0.1, 0.06, 0.1], { k: 0.06, tag: 'pro' });
  S.ell([0, 0.085, 0.08], [0.018, 0.02, 0.03], { k: 0.02, sub: true });   // ямка
  // хелицеры
  for (const sx of [1, -1]) S.ell([sx * 0.04, -0.05, 0.3], [0.042, 0.065, 0.045], { k: 0.03, tag: 'chel' });
  // стебелёк и брюшко
  S.cone([0, 0.0, -0.05], [0, 0.03, -0.14], 0.035, 0.04, { k: 0.03, tag: 'ped' });
  S.ell([0, 0.07, -0.42], [0.25, 0.21, 0.33], { k: 0.06, tag: 'abd', rot: [-0.18, 0, 0] });
  for (const sx of [1, -1]) S.ell([sx * 0.016, -0.03, -0.73], [0.016, 0.014, 0.03], { k: 0.015, tag: 'spin' });
  // глазные бугорки
  S.ell([0, 0.075, 0.27], [0.06, 0.035, 0.04], { k: 0.03, tag: 'pro' });
  const M = S.mesh(0.0085, [-0.28, -0.16, -0.78, 0.28, 0.32, 0.38]);
  const pos = Float32Array.from(M.position), nrm = Float32Array.from(M.normal), idx = Uint32Array.from(M.index);
  const nv = pos.length / 3, tags = [], ao = new Float32Array(nv);
  const p = V(0, 0, 0), n = V(0, 0, 0);
  for (let i = 0; i < nv; i++) {
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); n.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
    let best = 1e9, tag = null;
    for (const pr of S.prims) { if (pr.sub) continue; const d = Sculpt.dist(pr, p.x, p.y, p.z); if (d < best) { best = d; tag = pr.tag; } }
    tags.push(tag);
    ao[i] = S.ao(p, n);
  }
  return { pos, nrm, idx, nv, tags, ao };
}

// Сегмент ноги вдоль +Z: веретено с утолщением и кольцом у сустава
function segmentGeo(L, r0, r1, bulge = 0.15) {
  const g = new THREE.CylinderGeometry(1, 1, L, 9, 8, false);
  g.rotateX(Math.PI / 2); g.translate(0, 0, L / 2);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const z = pa.getZ(i), t = z / L;
    const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t)) * (t > 0.92 ? 1.12 : 1);
    pa.setX(i, pa.getX(i) * r); pa.setY(i, pa.getY(i) * r * 0.92);
  }
  g.computeVertexNormals();
  return g;
}

const cache = {};
const mats = new Map();
function chitinMat(gloss) {
  const k = 'chitin' + gloss;
  if (!mats.has(k)) mats.set(k, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: gloss ? 0.32 : 0.6, metalness: 0, clearcoat: gloss ? 0.6 : 0.15, clearcoatRoughness: 0.35 }));
  return mats.get(k);
}
// волоски: та же оболочечная техника, что у зверей, ворсинки тоньше и реже
function hairMat(k) {
  const key = 'hair' + k.toFixed(3);
  if (mats.has(key)) return mats.get(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uK = { value: k };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uK; attribute float aFur; varying vec3 vBase; varying float vFurL;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBase = position; vFurL = aFur;
        transformed += normal * aFur * uK;
        transformed.y -= uK * uK * aFur * 0.35;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uK; varying vec3 vBase; varying float vFurL;
        float hsh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFurL < 0.002) discard;
        vec3 q = vBase * 330.0;
        vec3 cell = floor(q);
        float h = hsh(cell);
        vec3 f = fract(q) - 0.5;
        float r = (1.0 - uK) * 0.32 + 0.06;
        if (dot(f, f) > r * r || h < 0.35 + uK * 0.4) discard;
        diffuseColor.rgb *= mix(0.7, 1.35, uK) * mix(0.8, 1.15, h);`);
  };
  m.customProgramCacheKey = () => 'spiderhair';
  mats.set(key, m);
  return m;
}
const eyeM = (c) => { const k = 'eye' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshPhysicalMaterial({ color: '#050505', roughness: 0.05, clearcoat: 1, emissive: c, emissiveIntensity: 0.9 })); return mats.get(k); };
const fangM = () => { if (!mats.has('fang')) mats.set('fang', new THREE.MeshPhysicalMaterial({ color: '#1a0e08', roughness: 0.25, clearcoat: 1 })); return mats.get('fang'); };

function withFur(geo, len) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aFur', new THREE.BufferAttribute(new Float32Array(n).fill(len), 1));
  return geo;
}
function paintSeg(geo, base, ring, L) {
  const pa = geo.attributes.position, n = pa.count;
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = pa.getZ(i) / L;
    c.copy(base).lerp(ring, sst(0.72, 0.9, t) * (1 - sst(0.95, 1.0, t)) * 0.5);
    c.multiplyScalar(0.8 + 0.25 * (pa.getY(i) > 0 ? 1 : 0.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class Spider extends Creature {
  constructor(def) {
    super();
    this.kind = 'spider';
    const base = new THREE.Color(def.fur || '#2a2a22'), accent = new THREE.Color(def.fur2 || '#6a5a20');
    const B = cache.body || (cache.body = sculptBody());
    // окраска тела: тёмный блестящий хитин, на брюшке — «листовидный» узор
    const col = new Float32Array(B.nv * 3), c = new THREE.Color();
    const fur = new Float32Array(B.nv);
    for (let i = 0; i < B.nv; i++) {
      const x = B.pos[i * 3], y = B.pos[i * 3 + 1], z = B.pos[i * 3 + 2], ny = B.nrm[i * 3 + 1];
      const tag = B.tags[i];
      c.copy(base);
      if (tag === 'abd') {
        // фолиум: зубчатая полоса по спине и шевроны
        const zz = (z + 0.42) / 0.33;
        const w = 0.07 + 0.05 * Math.cos(zz * 7.0) * (1 - Math.abs(zz) * 0.6);
        const band = sst(w + 0.02, w - 0.01, Math.abs(x)) * sst(0.0, 0.5, ny);
        const chev = sst(0.06, 0.0, Math.abs(((zz * 3 + Math.abs(x) * 9) % 1) - 0.5) - 0.38) * sst(0.2, 0.7, ny) * sst(0.12, 0.05, Math.abs(x) - 0.08);
        c.lerp(accent.clone().multiplyScalar(0.8), Math.min(1, band * 0.55 + chev * 0.4));
        c.multiplyScalar(0.7 + 0.3 * sst(-0.5, 0.6, ny));
        fur[i] = 0.016;
      } else if (tag === 'pro') {
        // радиальные бороздки от ямки
        const a = Math.atan2(x, z - 0.08);
        c.multiplyScalar(1.05 + 0.18 * Math.sin(a * 8) * sst(0.0, 0.5, ny));
        c.lerp(accent, sst(0.13, 0.16, Math.abs(x)) * 0.5);
        fur[i] = 0.007;
      } else if (tag === 'chel') { c.multiplyScalar(0.8); fur[i] = 0.012; }
      else if (tag === 'spin') { c.lerp(accent, 0.5); fur[i] = 0.002; }
      else fur[i] = 0.004;
      const a = 0.45 + 0.55 * B.ao[i];
      col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(B.nrm, 3));
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    bg.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
    bg.setIndex(new THREE.BufferAttribute(B.idx, 1));
    bg.computeBoundingSphere();
    this.height = 0.95;
    const torso = this.pivot(this.body, 0, 0.42, 0);
    this.torso = torso;
    const bodyMesh = this.m(bg, chitinMat(true), torso);
    this.shells = [];
    const NS = IS_PHONE ? 3 : IS_TOUCH ? 5 : 8;
    const addShells = (geo, parent) => {
      for (let s = 1; s <= NS; s++) {
        const sm = new THREE.Mesh(geo, hairMat(s / NS));
        sm.castShadow = false; sm.userData.shell = true;
        parent.add(sm); this.shells.push(sm);
      }
    };
    addShells(bg, torso);
    void bodyMesh;
    // глаза: два крупных передних, остальные помельче
    const ec = def.eye || '#ff2020';
    const eyes = [[0.022, 0.1, 0.305, 0.022], [0.052, 0.098, 0.29, 0.014], [0.03, 0.118, 0.27, 0.013], [0.062, 0.11, 0.255, 0.012]];
    for (const [ex, ey, ez, er] of eyes) for (const sx of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(er, 12, 10), eyeM(ec));
      e.position.set(sx * ex, ey - 0.02, ez); torso.add(e);
    }
    // клыки
    for (const sx of [1, -1]) {
      const curve = new THREE.QuadraticBezierCurve3(V(0, 0, 0), V(sx * -0.01, -0.04, 0.02), V(sx * -0.025, -0.07, -0.005));
      const f = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.009, 6), fangM());
      const g = f.geometry.attributes.position;
      for (let i = 0; i < g.count; i++) { /* к кончику тоньше */ }
      f.position.set(sx * 0.04, -0.1, 0.33); torso.add(f);
    }
    // ноги
    const segs = [['femur', 0.36, 0.034, 0.026], ['patella', 0.08, 0.026, 0.024], ['tibia', 0.3, 0.024, 0.018], ['meta', 0.3, 0.017, 0.011], ['tarsus', 0.13, 0.011, 0.006]];
    const legGeo = cache.legs || (cache.legs = segs.map(([n, L, r0, r1]) => segmentGeo(L, r0, r1, n === 'femur' ? 0.18 : 0.1)));
    const legCols = new Map();
    this.legs = [];
    for (let i = 0; i < 4; i++) for (const sx of [1, -1]) {
      const a = (i - 1.6) * 0.42;
      const hip = this.pivot(torso, sx * 0.13 * (1 - Math.abs(i - 1.5) * 0.12), -0.01, 0.2 - i * 0.075);
      hip.rotation.y = sx > 0 ? Math.PI / 2 + a : -Math.PI / 2 - a;
      // тазик ноги
      this.m(new THREE.SphereGeometry(0.038, 10, 8), chitinMat(true), hip).material = chitinMat(true);
      const chain = [];
      let parent = hip;
      const angles = [-0.95, 1.55 - 0.85, 0.35, 0.42, 0.35];
      const lenMul = i === 0 || i === 3 ? 1.05 : 0.93;
      segs.forEach(([n, L], k) => {
        const piv = this.pivot(parent, 0, 0, k === 0 ? 0.02 : segs[k - 1][1] * lenMul);
        piv.rotation.x = angles[k];
        const key = k + '|' + i;
        let g = legCols.get(key);
        if (!g) { g = legGeo[k].clone(); g.scale(1, 1, lenMul); paintSeg(g, base, accent, L * lenMul); withFur(g, k === 4 ? 0.012 : k === 0 ? 0.022 : 0.03); legCols.set(key, g); }
        const mesh = this.m(g, chitinMat(false), piv);
        void mesh;
        addShells(g, piv);
        chain.push(piv);
        parent = piv;
      });
      this.legs.push({ hip, chain, i, sx, base: chain.map(p => p.rotation.x) });
    }
    // педипальпы
    this.palps = [];
    for (const sx of [1, -1]) {
      const hip = this.pivot(torso, sx * 0.06, -0.04, 0.3);
      hip.rotation.set(-0.5, sx * 0.25, 0);
      let parent = hip;
      [[0.09, 0.016, 0.014, -0.5], [0.07, 0.014, 0.012, 1.1], [0.06, 0.012, 0.016, 0.5]].forEach(([L, r0, r1, ang]) => {
        const piv = this.pivot(parent, 0, 0, parent === hip ? 0 : 0.08);
        piv.rotation.x = ang;
        const g = withFur(paintSeg(segmentGeo(L, r0, r1, 0.1), base, accent, L), 0.02);
        this.m(g, chitinMat(false), piv);
        addShells(g, piv);
        parent = piv;
      });
      this.palps.push(hip);
    }
    this.furOn = true;
    this.root.traverse(o => { if (o.isMesh && !o.userData.shell) o.castShadow = true; });
    // посадка: лапки на земле
    this.root.updateMatrixWorld(true);
    let minY = 1e9;
    const tip = V(0, 0, 0);
    for (const L of this.legs) { const t = L.chain[4]; tip.set(0, 0, 0.13).applyMatrix4(t.matrixWorld); minY = Math.min(minY, tip.y); }
    this.restY = 0.42 - minY + 0.005;
    torso.position.y = this.restY;
  }

  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 5, 0, 1.3);
    this.phase += dt * speed * 3.0;
    // чередующиеся четвёрки ног (L1 R2 L3 R4 / R1 L2 R3 L4)
    for (const L of this.legs) {
      const grp = (L.i + (L.sx > 0 ? 0 : 1)) % 2;
      const ph = this.phase + grp * Math.PI + L.i * 0.25;
      const lift = Math.max(0, Math.sin(ph)) * blend;
      const swing = Math.cos(ph) * blend;
      L.chain[0].rotation.x = L.base[0] - lift * 0.35 + Math.sin(this.time * 1.3 + L.i) * 0.015;
      L.chain[2].rotation.x = L.base[2] + lift * 0.25;
      L.hip.rotation.z = 0;
      L.chain[0].rotation.y = swing * 0.28 * (L.sx);
    }
    for (const p of this.palps) p.rotation.x = -0.5 + Math.sin(this.time * 2.2) * 0.12;
    this.torso.position.y = this.restY + Math.sin(this.time * 3) * 0.006 + Math.abs(Math.sin(this.phase)) * 0.015 * blend;
    if (this.action) {
      const s = this.strike();
      this.torso.rotation.x = -s * 0.32;
      this.torso.position.z = s * 0.22;
      for (const L of this.legs) if (L.i === 0) L.chain[0].rotation.x = L.base[0] - Math.max(0, s) * 0.9;
    } else { this.torso.rotation.x = 0; this.torso.position.z = 0; }
    const on = this.root.position.distanceTo(furLOD.cam) < furLOD.dist * 0.6 && this.deadT < 2;
    if (on !== this.furOn) { this.furOn = on; for (const sm of this.shells) sm.visible = on; }
  }
}
