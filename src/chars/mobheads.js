// Головы гуманоидных монстров (SDF-лепка) для детальных тел: орк, гоблин, тролль,
// ящер, минотавр, демон, йети. Голова в «единицах человеческой головы» (череп ~0.1 м),
// центр — центр черепа, лицо смотрит в +Z.
import * as THREE from 'three';
import { Sculpt } from './sdf.js';
import { heroMat } from './hero/materials.js';
import { furShellSolid } from './quad.js';
import { IS_PHONE, IS_TOUCH } from '../core/device.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function sculpt(type) {
  const S = new Sculpt();
  const E = (c, r, o = {}) => S.ell(c, r, { k: 0.02, ...o });
  const C = (a, b, r1, r2, o = {}) => S.cone(a, b, r1, r2, { k: 0.02, ...o });
  const both = (fn) => { fn(1); fn(-1); };
  const extra = { tusks: [], horns: [], eyes: [], spikes: [] };
  // шея — прикрывает стык с телом
  C([0, -0.07, -0.025], [0, -0.2, -0.035], 0.06, 0.068, { k: 0.03, tag: 'neck' });
  if (type === 'orc' || type === 'troll') {
    const T = type === 'troll';
    E([0, 0.012, -0.012], [0.098, 0.1, 0.11], { k: 0.03 });
    C([-0.068, 0.038, 0.078], [0.068, 0.038, 0.078], 0.03, 0.03, { k: 0.03 });                  // массивные надбровья
    E([0, -0.03, 0.05], [0.086, 0.078, 0.072], { k: 0.035 });
    if (T) C([0, 0.01, 0.1], [0, -0.04, 0.175], 0.03, 0.02, { k: 0.02, tag: 'nose' });          // длинный нос тролля
    else E([0, -0.006, 0.112], [0.034, 0.023, 0.024], { k: 0.02, tag: 'nose' });                // приплюснутый нос
    E([0, -0.088, 0.065], [0.088, 0.048, 0.075], { k: 0.03, tag: 'jaw' });                      // выступающая челюсть
    both(sx => {
      E([sx * 0.066, -0.012, 0.062], [0.036, 0.03, 0.035], { k: 0.025 });                       // скулы
      C([sx * 0.092, 0.0, -0.012], [sx * (T ? 0.17 : 0.155), T ? -0.01 : 0.045, -0.075], 0.026, 0.004, { k: 0.012, sq: 0.35, q: [1, 0, 0], tag: 'ear' });
      E([sx * 0.035, 0.014, 0.085], [0.019, 0.012, 0.016], { sub: true, k: 0.01 });             // глазница
      E([sx * 0.016, -0.012, 0.13], [0.008, 0.007, 0.01], { sub: true, k: 0.005 });             // ноздри
      extra.eyes.push([sx * 0.035, 0.013, 0.08, 0.012]);
      extra.tusks.push([sx * 0.042, -0.075, 0.118, T ? 0.05 : 0.038]);
    });
    E([0, -0.062, 0.122], [0.048, 0.005, 0.02], { sub: true, k: 0.006 });                     // рот
  } else if (type === 'goblin') {
    E([0, 0.022, -0.022], [0.088, 0.086, 0.1], { k: 0.03 });
    E([0, -0.03, 0.04], [0.064, 0.06, 0.06], { k: 0.03 });
    C([0, 0.004, 0.09], [0, -0.035, 0.168], 0.022, 0.007, { k: 0.015, tag: 'nose' });         // длинный крючковатый нос
    C([0, -0.07, 0.05], [0, -0.103, 0.085], 0.03, 0.012, { k: 0.02, tag: 'jaw' });            // острый подбородок
    both(sx => {
      C([sx * 0.082, 0.012, -0.0], [sx * 0.215, 0.055, -0.05], 0.036, 0.003, { k: 0.012, sq: 0.3, q: [0, 0.3, 1], tag: 'ear' });
      C([sx * 0.1, 0.02, 0.002], [sx * 0.19, 0.05, -0.043], 0.02, 0.002, { k: 0.006, sq: 0.4, q: [0, 0.3, 1], sub: true });
      E([sx * 0.03, 0.032, 0.083], [0.03, 0.011, 0.02], { k: 0.015 });                          // брови
      E([sx * 0.032, 0.014, 0.078], [0.021, 0.015, 0.016], { sub: true, k: 0.01 });
      extra.eyes.push([sx * 0.032, 0.013, 0.073, 0.016]);
    });
    E([0, -0.056, 0.098], [0.05, 0.006, 0.02], { sub: true, k: 0.006 });
  } else if (type === 'lizard') {
    E([0, 0.022, -0.025], [0.078, 0.072, 0.1], { k: 0.03 });
    C([0, 0.004, 0.04], [0, -0.012, 0.21], 0.062, 0.03, { k: 0.03, sq: 0.8, tag: 'snout' });
    C([0, -0.045, 0.03], [0, -0.05, 0.19], 0.045, 0.024, { k: 0.02, tag: 'jaw' });
    E([0, -0.033, 0.12], [0.05, 0.004, 0.085], { sub: true, k: 0.006 });                     // щель пасти
    both(sx => {
      C([sx * 0.045, 0.045, 0.0], [sx * 0.04, 0.032, 0.09], 0.02, 0.012, { k: 0.015 });         // надглазья
      E([sx * 0.056, 0.03, 0.075], [0.018, 0.015, 0.018], { sub: true, k: 0.008 });
      E([sx * 0.012, 0.006, 0.205], [0.006, 0.005, 0.008], { sub: true, k: 0.004 });
      extra.eyes.push([sx * 0.056, 0.03, 0.072, 0.015]);
    });
    for (let i = 0; i < 6; i++) extra.spikes.push([0, 0.085 - i * 0.012, -0.0 - i * 0.04, 0.05 - i * 0.004]);  // гребень
  } else if (type === 'bull') {
    E([0, 0.035, -0.02], [0.1, 0.1, 0.1], { k: 0.035 });
    C([0, 0.025, 0.04], [0, -0.03, 0.18], 0.088, 0.07, { k: 0.04, sq: 0.9 });
    E([0, -0.043, 0.188], [0.062, 0.05, 0.036], { k: 0.02, tag: 'nose' });                    // мокрый нос
    E([0, -0.085, 0.1], [0.062, 0.032, 0.085], { k: 0.025, tag: 'jaw' });
    both(sx => {
      E([sx * 0.12, 0.04, -0.005], [0.055, 0.022, 0.032], { k: 0.012, rot: [0, 0, sx * 0.3], tag: 'ear' });
      E([sx * 0.07, 0.035, 0.07], [0.02, 0.016, 0.018], { sub: true, k: 0.01 });
      E([sx * 0.025, -0.03, 0.222], [0.01, 0.012, 0.012], { sub: true, k: 0.006 });
      extra.eyes.push([sx * 0.072, 0.034, 0.064, 0.016]);
      extra.horns.push({ sx, pts: [[sx * 0.075, 0.09, 0.0], [sx * 0.2, 0.11, 0.03], [sx * 0.29, 0.17, 0.1], [sx * 0.3, 0.27, 0.17]], r: 0.034 });
    });
  } else if (type === 'demon') {
    E([0, 0.018, -0.012], [0.094, 0.1, 0.105], { k: 0.03 });
    E([0, -0.035, 0.05], [0.074, 0.075, 0.064], { k: 0.03 });
    C([-0.06, 0.04, 0.08], [0.06, 0.04, 0.08], 0.022, 0.022, { k: 0.02 });
    E([0, -0.088, 0.058], [0.06, 0.032, 0.06], { k: 0.025, tag: 'jaw' });
    E([0, 0.0, 0.11], [0.022, 0.03, 0.022], { k: 0.015, tag: 'nose' });
    both(sx => {
      E([sx * 0.06, -0.02, 0.07], [0.03, 0.035, 0.03], { k: 0.02 });
      C([sx * 0.088, 0.01, -0.01], [sx * 0.14, 0.09, -0.06], 0.026, 0.003, { k: 0.01, sq: 0.35, q: [1, 0, 0], tag: 'ear' });
      E([sx * 0.034, 0.016, 0.086], [0.019, 0.012, 0.016], { sub: true, k: 0.01 });
      extra.eyes.push([sx * 0.034, 0.015, 0.081, 0.012]);
      extra.horns.push({ sx, pts: [[sx * 0.05, 0.085, 0.03], [sx * 0.08, 0.15, -0.02], [sx * 0.1, 0.18, -0.12], [sx * 0.09, 0.14, -0.22]], r: 0.026 });
      extra.tusks.push([sx * 0.025, -0.055, 0.105, -0.025]);
    });
    E([0, -0.062, 0.108], [0.044, 0.005, 0.02], { sub: true, k: 0.006 });
  } else if (type === 'skull') {
    // череп: свод, глазницы, носовая полость, скулы, верхняя челюсть с зубами, нижняя челюсть
    C([0, -0.07, -0.025], [0, -0.2, -0.035], 0.03, 0.035, { k: 0.01, tag: 'neck' });
    E([0, 0.03, -0.015], [0.088, 0.095, 0.105], { k: 0.02 });
    E([0, -0.03, 0.055], [0.066, 0.06, 0.055], { k: 0.025 });
    both(sx => {
      E([sx * 0.06, -0.022, 0.06], [0.026, 0.02, 0.03], { k: 0.015 });                         // скуловые кости
      E([sx * 0.032, 0.006, 0.088], [0.024, 0.021, 0.03], { sub: true, k: 0.008 });           // глазницы
      extra.eyes.push([sx * 0.032, 0.004, 0.078, 0.008]);
    });
    C([0, -0.012, 0.11], [0, -0.04, 0.11], 0.012, 0.016, { sub: true, k: 0.006 });             // носовая полость
    E([0, -0.07, 0.08], [0.045, 0.018, 0.035], { k: 0.012, tag: 'teeth' });                   // зубы
    E([0, -0.092, 0.062], [0.052, 0.018, 0.048], { k: 0.012, tag: 'jaw' });
    E([0, -0.065, 0.11], [0.04, 0.004, 0.012], { sub: true, k: 0.004 });
  } else if (type === 'yeti') {
    E([0, 0.04, -0.025], [0.102, 0.11, 0.108], { k: 0.035 });
    C([0, 0.14, -0.06], [0, 0.12, 0.03], 0.016, 0.012, { k: 0.03 });                          // сагиттальный гребень
    C([-0.075, 0.045, 0.075], [0.075, 0.045, 0.075], 0.032, 0.032, { k: 0.03 });              // надбровный валик
    E([0, -0.04, 0.075], [0.075, 0.065, 0.065], { k: 0.035, tag: 'face' });                   // выступающая морда
    E([0, -0.01, 0.12], [0.032, 0.022, 0.02], { k: 0.015, tag: 'face' });
    E([0, -0.095, 0.07], [0.07, 0.035, 0.06], { k: 0.025, tag: 'face' });
    both(sx => {
      E([sx * 0.104, 0.02, -0.01], [0.022, 0.03, 0.016], { k: 0.012 });
      E([sx * 0.035, 0.02, 0.09], [0.02, 0.012, 0.016], { sub: true, k: 0.01 });
      extra.eyes.push([sx * 0.035, 0.019, 0.084, 0.012]);
    });
    E([0, -0.065, 0.13], [0.045, 0.006, 0.02], { sub: true, k: 0.006 });
  }
  S.prims.sort((a, b) => (a.sub ? 1 : 0) - (b.sub ? 1 : 0));
  return { S, extra };
}

const cache = new Map();
function headGeo(type) {
  if (cache.has(type)) return cache.get(type);
  const { S, extra } = sculpt(type);
  const h = IS_PHONE ? 0.008 : IS_TOUCH ? 0.006 : 0.0045;
  const M = S.mesh(h, [-0.25, -0.24, -0.3, 0.25, 0.22, 0.27]);
  const pos = Float32Array.from(M.position), nrm = Float32Array.from(M.normal), idx = Uint32Array.from(M.index);
  const nv = pos.length / 3;
  const ao = new Uint8Array(nv), tags = [], fur = new Float32Array(nv), scl = new Float32Array(nv), belly = new Float32Array(nv);
  const p = V(0, 0, 0), n = V(0, 0, 0);
  for (let i = 0; i < nv; i++) {
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); n.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
    ao[i] = Math.round(255 * (0.35 + 0.65 * S.ao(p, n)));
    let best = 1e9, tag = null;
    for (const pr of S.prims) { if (pr.sub) continue; const d = Sculpt.dist(pr, p.x, p.y, p.z); if (d < best) { best = d; tag = pr.tag; } }
    tags.push(tag);
    fur[i] = tag === 'nose' || tag === 'face' ? 0.0 : type === 'yeti' ? 0.03 : 0.008;
    scl[i] = tag === 'snout' || tag === 'jaw' ? 0.011 : 0.015;
    belly[i] = Math.max(0, -n.y) * (tag === 'jaw' ? 1 : 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1, true));
  g.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
  g.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
  g.setAttribute('aBelly', new THREE.BufferAttribute(belly, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const out = { g, extra, tags };
  cache.set(type, out);
  return out;
}

export const MOB_HEADS = new Set(['orc', 'goblin', 'lizard', 'bull', 'demon', 'yeti', 'skull']);

// Посадить голову на детальное тело (HeroModel): человеческую голову, глаза и волосы скрыть
export function attachMobHead(h, spec, scaleMat) {
  const type = spec.headType === 'orc' && spec.tusks ? 'troll' : spec.headType;
  const { g, extra } = headGeo(type);
  const skin = spec.skin || '#7a8a5a';
  const k = (h.headR || 0.104) / 0.1 * 1.04;
  const group = new THREE.Group();
  group.position.copy(h.headC.position);
  group.scale.setScalar(k);
  h.j.head.add(group);
  const mat = type === 'lizard' && scaleMat ? scaleMat : type === 'skull' ? heroMat('bone', '#d6cdb2') : heroMat('skin', type === 'yeti' ? '#5c6068' : skin);
  const head = new THREE.Mesh(g, mat);
  head.castShadow = true;
  group.add(head);
  // мех (минотавр, йети)
  if (type === 'bull' || type === 'yeti') {
    const n = IS_PHONE ? 3 : 6;
    for (let s = 1; s <= n; s++) { const sm = new THREE.Mesh(g, furShellSolid(s / n, type === 'yeti' ? skin : new THREE.Color(skin).multiplyScalar(0.8).getStyle())); sm.userData.shell = true; group.add(sm); }
  }
  // глаза
  const eyeC = spec.eyes && spec.eyes.color || '#e0c040';
  const glow = !!(spec.eyes && spec.eyes.glow) || type === 'demon' || type === 'orc' || type === 'troll' || type === 'skull';
  const eyeM = new THREE.MeshPhysicalMaterial({ color: eyeC, roughness: 0.08, clearcoat: 1, emissive: eyeC, emissiveIntensity: glow ? 1.6 : 0.15 });
  for (const [x, y, z, r] of extra.eyes) { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), eyeM); e.position.set(x, y, z); group.add(e); }
  // клыки и рога
  const bone = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.45 });
  for (const [x, y, z, len] of extra.tusks) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.009 + Math.abs(len) * 0.12, Math.abs(len), 7), bone);
    t.position.set(x, y + len * 0.4, z); if (len < 0) t.rotation.x = Math.PI;
    t.rotation.z = -Math.sign(x) * 0.15; group.add(t);
  }
  const hornM = new THREE.MeshStandardMaterial({ color: type === 'demon' ? '#1a1414' : '#d8ccb0', roughness: 0.5 });
  for (const H of extra.horns) {
    const curve = new THREE.CatmullRomCurve3(H.pts.map(p => V(...p)));
    const tg = new THREE.TubeGeometry(curve, 16, H.r, 8);
    const pa = tg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const t = Math.floor(i / 9) / 16, c = curve.getPoint(Math.min(1, t)), kk = 1 - t * 0.88;
      pa.setXYZ(i, c.x + (pa.getX(i) - c.x) * kk, c.y + (pa.getY(i) - c.y) * kk, c.z + (pa.getZ(i) - c.z) * kk);
    }
    tg.computeVertexNormals();
    const hm = new THREE.Mesh(tg, hornM); hm.castShadow = true; group.add(hm);
  }
  for (const [x, y, z, len] of extra.spikes) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(len * 0.25, len, 5), hornM);
    sp.position.set(x, y + len * 0.3, z); sp.rotation.x = -0.6; sp.scale.z = 0.35; group.add(sp);
  }
  // скрыть человеческое
  h.hideRegions = new Set(['head']);
  h.updateBodyRegions();
  for (const m of h.hairMeshes || []) m.visible = false;
  for (const e of h.eyeMeshes || []) e.visible = false;
  for (const l of h.blinkLids || []) l.visible = false;
  h.noFace = true;
  h.mobHead = group;
  return group;
}
