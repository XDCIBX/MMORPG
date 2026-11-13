// Детальные модели героев: загрузка запечённых данных, сборка скинированной
// модели на суставах Humanoid (анимации остаются прежними), смена брони.
import * as THREE from 'three';
import { Humanoid } from '../humanoid.js';
import { HERO_BONES, BIND_POSE } from './rig.js';
import { heroMat, eyeMaterial } from './materials.js';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

// ---------- Загрузка ----------
const loading = new Map();
const decoded = new Map();
export function heroKey(cls, female) { return cls + '_' + (female ? 'f' : 'm'); }
export function heroReady(key) { return decoded.has(key); }
export function getHero(key) { return decoded.get(key); }
export function loadHero(key) {
  if (key !== 'weapons') return Promise.all([loadData(key), loadData('weapons').catch(() => null)]).then(([d]) => d);
  return loadData(key);
}
export function weaponsReady() { return decoded.has('weapons'); }
function loadData(key) {
  if (decoded.has(key)) return Promise.resolve(decoded.get(key));
  if (loading.has(key)) return loading.get(key);
  const p = new Promise((resolve, reject) => {
    const done = () => {
      const raw = window.__HERO_DATA && window.__HERO_DATA[key];
      if (!raw) { reject(new Error('нет данных модели ' + key)); return; }
      MeshoptDecoder.ready.then(() => { decoded.set(key, decode(raw)); delete window.__HERO_DATA[key]; resolve(decoded.get(key)); }).catch(reject);
    };
    if (window.__HERO_DATA && window.__HERO_DATA[key]) { done(); return; }
    const s = document.createElement('script');
    s.src = (window.__HERO_BASE || '') + 'models/hero_' + key + '.js';
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error('не удалось загрузить ' + s.src));
    document.head.appendChild(s);
  });
  loading.set(key, p);
  p.catch(() => loading.delete(key));
  return p;
}

function decode(raw) {
  const bin = atob(raw.b);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const H = raw.h;
  const pieces = H.pieces.map(pc => {
    const g = new THREE.BufferGeometry();
    const nv = pc.nv;
    const dec = (ref, size) => { const out = new Uint8Array(nv * size); MeshoptDecoder.decodeVertexBuffer(out, nv, size, buf.subarray(ref[0], ref[0] + ref[1])); return out; };
    const q = new Uint16Array(dec(pc.pos, 8).buffer);
    const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) pos[i * 3 + a] = pc.bb[a] + q[i * 4 + a] / 65535 * (pc.bb[a + 3] - pc.bb[a]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const na = new Int8Array(dec(pc.nrm, 4).buffer);
    const nrm = new Int8Array(nv * 3), ao = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) { nrm[i * 3] = na[i * 4]; nrm[i * 3 + 1] = na[i * 4 + 1]; nrm[i * 3 + 2] = na[i * 4 + 2]; ao[i] = Math.max(0, na[i * 4 + 3]) * 2; }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    if (pc.si) {
      g.setAttribute('skinIndex', new THREE.BufferAttribute(dec(pc.si, 4), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(dec(pc.sw, 4), 4, true));
    }
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1, true));
    const ix = new Uint32Array(pc.ni);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(ix.buffer), pc.ni, 4, buf.subarray(pc.idx[0], pc.idx[0] + pc.idx[1]));
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? ix : Uint16Array.from(ix), 1));
    for (const [start, count, mi] of pc.groups) g.addGroup(start, count, mi);
    g.computeBoundingSphere();
    return { meta: pc, geo: g };
  });
  return { H, pieces };
}

// ---------- Модель ----------
export class HeroModel extends Humanoid {
  constructor(spec, data) {
    super(Object.assign({}, spec, { __hero: data }));
    this.isHero = true;
  }

  build() {
    const data = this.spec.__hero;
    const H = data.H;
    this.heroData = data;
    this.parts = {};
    const d = H.dim;
    this.dim = { thigh: d.thigh, shin: d.shin, hipY: d.hipY, uarm: d.uarm, farm: d.farm, W: d.W, D: d.D, T: d.T, F: d.F };
    this.hipY = d.hipY;
    this.topY = d.topY;
    this.headR = d.hr;
    // суставы
    for (const n of HERO_BONES) {
      const [parent, x, y, z] = H.J[n];
      this.joint(n, parent ? this.j[parent] : this.body, x, y, z);
    }
    this.headC = new THREE.Group();
    this.headC.position.set(...H.headC);
    this.j.head.add(this.headC);
    for (const sd of ['L', 'R']) {
      const grip = new THREE.Object3D();
      grip.position.set(...H.grip[sd]);
      this.j['wrist' + sd].add(grip);
      this.j['grip' + sd] = grip;
      this.parts['hand' + sd] = this.j['wrist' + sd];
    }
    // поза запекания → привязка скелета
    for (const n in BIND_POSE) this.j[n].rotation.set(...BIND_POSE[n]);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(HERO_BONES.map(n => this.j[n]));
    this.pieceMeshes = new Map();
    const s = this.spec;
    // тело: материалы по областям (кожа или одежда, если слот пуст)
    const body = data.pieces.find(p => p.meta.slot === 'body');
    this.regionNames = body.meta.mats;
    const hairStyle = s.hair && s.hair.style && s.hair.style !== 'none' ? (s.hair.style === 'short' ? 2 : 1) : 0;
    this.skinMaterial = heroMat('skin', s.skin || '#d9a77f', { face: {
      center: H.hairCenter, hk: H.dim.hr / 0.104, lip: s.lips || (s.female ? '#9a4a4a' : '#9a5e55'), hair: s.hair && s.hair.color || '#3a2a1a',
      female: !!s.female, beard: !!s.beard, stubble: !s.female && !s.beard, style: hairStyle,
    } });
    this.hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
    this.baseMats = {
      shirt: s.base && s.base.shirt ? heroMat('cloth', s.base.shirt) : this.skinMaterial,
      pants: s.base && s.base.pants ? heroMat('cloth', s.base.pants) : this.skinMaterial,
      boots: s.base && s.base.boots ? heroMat('leather', s.base.boots) : this.skinMaterial,
    };
    this.bodyMesh = this.addPiece(body, this.regionNames.map(() => this.skinMaterial));
    // волосы и борода
    this.hairMeshes = [];
    // в моделях NPC запечено несколько причёсок и бород («hair:long», «beard:short») — берём нужные
    const avail = { hair: [], beard: [] };
    for (const p of data.pieces) if (p.meta.slot === 'hair' && p.meta.name.includes(':')) { const [k, st] = p.meta.name.split(':'); avail[k].push(st); }
    const choose = (k, want) => (!want || want === 'none') ? null : (avail[k].includes(want) ? want : avail[k][0] || null);
    const wantHair = choose('hair', s.hair && s.hair.style), wantBeard = choose('beard', s.beard);
    for (const p of data.pieces) {
      if (p.meta.slot !== 'hair') continue;
      const [kind, st] = p.meta.name.split(':');
      if (st && st !== (kind === 'beard' ? wantBeard : wantHair)) continue;
      const hm = heroMat('hair', s.hair && s.hair.color || '#3a2a1a', { center: H.hairCenter });
      const m = this.addPiece(p, p.meta.mats.map(mn => mn === 'T' ? heroMat('metal', '#d4a83a', { rough: 0.25 }) : hm));
      this.hairMeshes.push(m);
      m.userData.isBeard = kind === 'beard';
    }
    // глаза (двигаются) и веки для моргания
    this.eyeMeshes = []; this.blinkLids = [];
    const lidMat = heroMat('skin', s.skin || '#d9a77f');
    for (const e of H.eyes) {
      const em = new THREE.Mesh(new THREE.SphereGeometry(e.r, 24, 16), eyeMaterial(s.eyes && s.eyes.color || '#3a5a7a', s.eyes && s.eyes.glow));
      em.position.set(...e.c);
      this.j.head.add(em);
      this.eyeMeshes.push(em);
      // верхнее веко: сферический сегмент перед глазом; в покое спрятано в запечённом веке
      const lg = new THREE.SphereGeometry(e.r * 1.16, 24, 10, Math.PI / 2 - 1.05, 2.1, 0, 1.12);
      lg.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(lg.attributes.position.count).fill(205), 1, true));
      const lid = new THREE.Mesh(lg, lidMat);
      lid.position.set(...e.c);
      this.j.head.add(lid);
      this.blinkLids.push(lid);
    }
    this.eyeT = 0; this.eyeGoal = [0, 0]; this.eyeCur = [0, 0]; this.blinkT = 2 + Math.random() * 3; this.blinkK = 0;
    this.updateExtra = (dt) => this.animateFace(dt);
    for (const n in BIND_POSE) this.j[n].rotation.set(0, 0, 0);
    this.equipped = {};
    for (const sl of ['chest', 'legs', 'feet']) this.equipArmor(sl, null);
    this.updateBodyRegions();
  }

  addPiece(p, mats) {
    const m = new THREE.SkinnedMesh(p.geo, mats);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    this.body.add(m);
    // привязка в позе запекания: все суставы в покое (+ A-поза), корень без смещений
    const saved = {};
    for (const n of HERO_BONES) { const j = this.j[n]; saved[n] = [j.rotation.toArray(), j.position.toArray()]; j.rotation.set(...(BIND_POSE[n] || [0, 0, 0])); }
    this.j.hips.position.y = this.hipY;
    const sc = this.root.scale.clone(), rp = this.root.position.clone(), rq = this.root.quaternion.clone(), bp = this.body.position.clone(), br = this.body.rotation.clone();
    this.root.scale.set(1, 1, 1); this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    m.bind(this.skeleton);
    this.root.scale.copy(sc); this.root.position.copy(rp); this.root.quaternion.copy(rq); this.body.position.copy(bp); this.body.rotation.copy(br);
    for (const n of HERO_BONES) { const j = this.j[n]; j.rotation.fromArray(saved[n][0]); j.position.fromArray(saved[n][1]); }
    this.root.updateMatrixWorld(true);
    this.meshes.push(m);
    return m;
  }

  // Плащ эпических доспехов: ткань за спиной, качается при ходьбе
  updateCape(v) {
    if (this.capeObj) { this.capeObj.removeFromParent(); this.capeObj = null; this.cape = null; }
    if (!v || !((v.tier >= 4 && v.kind !== 'cloth') || v.cape)) return;
    const d = this.dim;
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.275, -0.135 * d.D);
    this.j.chest.add(pivot);
    const w = 0.46 * d.W, len = this.hipY * 0.98;
    const g = new THREE.PlaneGeometry(w, len, 10, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const t = 0.5 - y / len; // 0 сверху, 1 внизу
      const xx = x * (1 + t * 0.55);
      p.setXYZ(i, xx, y, -0.02 - Math.abs(xx) * 0.35 * (1 - t * 0.6) - Math.cos(xx * 40) * 0.008 * t - t * 0.05);
    }
    g.translate(0, -len / 2, 0);
    g.computeVertexNormals();
    g.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(p.count).fill(230), 1, true));
    const m = new THREE.Mesh(g, heroMat('cloth', v.capeColor || v.c2 || '#7a1c1c'));
    m.castShadow = true;
    pivot.add(m);
    // застёжки
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), heroMat('metal', v.trim || '#c9a640', { rough: 0.25 }));
      c.geometry.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(c.geometry.attributes.position.count).fill(255), 1, true));
      c.position.set(sx * w * 0.42, 0.0, 0.0);
      pivot.add(c);
    }
    this.capeObj = pivot;
    this.cape = pivot;
  }

  // Живое лицо: взгляд перескакивает с точки на точку, периодическое моргание
  animateFace(dt) {
    if (this.noFace) return;
    this.eyeT -= dt;
    if (this.eyeT < 0) {
      this.eyeT = 0.5 + Math.random() * 2.2;
      this.eyeGoal = Math.random() < 0.45 ? [0, 0] : [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.22];
    }
    const k = 1 - Math.exp(-dt * 25);
    this.eyeCur[0] += (this.eyeGoal[0] - this.eyeCur[0]) * k;
    this.eyeCur[1] += (this.eyeGoal[1] - this.eyeCur[1]) * k;
    for (const em of this.eyeMeshes) em.rotation.set(this.eyeCur[1], this.eyeCur[0], 0);
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkT = 2.2 + Math.random() * 4; this.blinkK = 1; if (Math.random() < 0.15) this.blinkT = 0.25; }
    this.blinkK = Math.max(0, this.blinkK - dt / 0.16);
    const closed = this.deadT >= 0 ? 1 : Math.sin(this.blinkK * Math.PI);
    for (const l of this.blinkLids) { l.rotation.x = -0.28 + closed * 1.05 + this.eyeCur[1] * 0.3; l.visible = closed > 0.02; }
  }

  // Видимость областей тела: под бронёй — скрыть, без брони — базовая одежда
  updateBodyRegions() {
    const covered = new Set();
    for (const slot in this.equipped) for (const r of this.equipped[slot].covers || []) covered.add(r);
    for (const r of this.hideRegions || []) covered.add(r);
    this.bodyMesh.material = this.regionNames.map(r => covered.has(r) ? this.hiddenMat : this.skinMaterial);
  }

  // Надеть деталь брони из запечённых (kind/style), окрасить по предмету
  equipArmor(slot, item) {
    const prev = this.equipped[slot];
    if (prev && prev.mesh) prev.mesh.visible = false;
    delete this.equipped[slot];
    const v = item && item.vis;
    let p = null;
    if (v) {
      const cands = this.heroData.pieces.filter(c => c.meta.slot === slot && c.meta.kind === v.kind);
      p = cands.find(c => c.meta.style === (v.style || 0)) || cands.find(c => c.meta.style === 0) || cands[0];
    }
    if (!p) p = this.heroData.pieces.find(c => c.meta.slot === slot && c.meta.kind === 'base');
    if (p) {
      let mesh = this.pieceMeshes.get(p);
      if (!mesh) { mesh = this.addPiece(p, p.meta.mats.map(() => this.hiddenMat)); this.pieceMeshes.set(p, mesh); }
      const B = this.baseMats;
      mesh.material = p.meta.mats.map(mn => mn === 'SH' ? B.shirt : mn === 'PA' ? B.pants : mn === 'BO' ? B.boots : armorMat(mn, v || {}));
      mesh.visible = true;
      this.equipped[slot] = { mesh, covers: p.meta.covers, hideHair: p.meta.hideHair };
    }
    if (slot === 'chest') this.updateCape(v);
    if (slot === 'head') {
      const hide = this.equipped.head && this.equipped.head.hideHair;
      for (const m of this.hairMeshes) m.visible = !hide || (hide === 'hair' && m.userData.isBeard);
    }
    this.updateBodyRegions();
  }
}

// материал детали брони по коду и описанию предмета
function armorMat(code, v) {
  const tierRough = v.tier >= 5 ? 0.24 : 0.34;
  const glow = v.tier >= 6 ? v.gem : null;
  switch (code) {
    case 'P': return v.kind === 'heavy' ? heroMat('metal', v.c1, { rough: tierRough, glow, glowI: 0.12 }) : v.kind === 'leather' ? heroMat('leather', v.c1) : heroMat('cloth', v.c1);
    case 'S': return v.kind === 'heavy' ? heroMat('metal', '#' + new THREE.Color(v.c1 || '#a0a4aa').multiplyScalar(0.72).getHexString(), { rough: 0.36 }) : v.kind === 'leather' ? heroMat('leather', v.c2) : heroMat('cloth', v.c2);
    case 'T': return heroMat('metal', v.trim || '#c9a640', { rough: 0.25, glow: v.tier >= 6 ? v.trim : null, glowI: 0.3 });
    case 'C': return heroMat('cloth', v.c2 || '#7a1c1c');
    case 'C1': return heroMat('cloth', v.c1);
    case 'L': return heroMat('leather', '#3a2616');
    case 'M': return heroMat('chain', '#8a8a90');
    case 'F': return heroMat('fur', v.tier >= 5 ? '#ece6dc' : '#6a5440');
    case 'G': return heroMat('gem', v.gem || '#60a0ff');
    case 'D': return heroMat('dark', '#050308');
    case 'B': return heroMat('bone', '#d8cfb4');
    default: return heroMat('cloth', v.c1);
  }
}

export function isHeroModel(h) { return !!(h && h.isHero); }

// ---------- Запечённое оружие ----------
const WOOD = { axe: '#5b3b22', hammer: '#4a3020', scythe: '#2a1e18', staff: '#5a3b22', wand: '#5a3b22' };
export function bakedWeapon(type, v) {
  const W = decoded.get('weapons');
  if (!W) return null;
  const name = type === 'shield' ? 'shield' + (v.style === 1 ? 1 : 0) : type;
  const p = W.pieces.find(pc => pc.meta.name === name);
  if (!p) return null;
  const tier = v.tier || 1;
  const mats = p.meta.mats.map(code => {
    switch (code) {
      case 'B': return heroMat('metal', v.c1 || '#c8ccd2', { rough: 0.2, glow: tier >= 5 ? v.gem : null, glowI: tier >= 5 ? 0.3 + (tier - 5) * 0.25 : 0 });
      case 'T': return heroMat('metal', v.trim || '#b08a3a', { rough: 0.28 });
      case 'L': return heroMat('leather', '#3a2416');
      case 'W': return (type === 'bow' || type === 'longbow') && tier >= 5 ? heroMat('metal', v.c1, { rough: 0.3 }) : heroMat('wood', (type === 'bow' || type === 'longbow' || type === 'staff' || type === 'wand') ? (v.c1 || WOOD[type] || '#6a4428') : (WOOD[type] || '#5b3b22'));
      case 'G': return v.gem ? heroMat('gem', v.gem) : heroMat('metal', v.trim || '#b08a3a', { rough: 0.28 });
      case 'O': return heroMat('bone', '#d8cfb4');
      case 'S': return heroMat('cloth', '#e8e0d0');
      case 'C': return heroMat('cloth', type === 'quiver' ? (v.gem || '#c03030') : (v.c2 || '#7a1c1c'));
      case 'F': return tier >= 2 || v.style === 1 ? heroMat('metal', v.c1 || '#8a8f98', { rough: 0.34 }) : heroMat('wood', '#6a4a2a');
      case 'D': return heroMat('metal', '#3a3c40', { rough: 0.45 });
      default: return heroMat('metal', '#888888');
    }
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(p.geo, mats);
  m.castShadow = true;
  g.add(m);
  g.userData.meshes = [m];
  return g;
}
