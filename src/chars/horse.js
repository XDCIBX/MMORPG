// Реалистичная лошадь: цельное тело, вылепленное по анатомии (SDF → полигоны),
// скелет со скиннингом, окрас (гнедая, вороная, серая в яблоках…), грива и хвост
// из прядей, сбруя и броня, «облегающие» тело, и анимация аллюров
// (шаг, рысь, галоп) с постановкой копыт на землю.
import * as THREE from 'three';
import { Creature } from './creature_base.js';
import { Sculpt, drapeGeo, ribbonGeo, mergeGeos } from './sdf.js';
import { hairStrandTex } from './face.js';
import { metalMat, leatherMat, clothMat, gemMat } from './materials.js';
import { furTex, heightToNormal } from '../core/textures.js';
import { IS_PHONE, IS_TOUCH } from '../core/device.js';
import { clamp, lerp, mulberry32 } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Голова: ось от затылка к храпу
const HU = V(0, -0.692, 0.722), HN = V(0, 0.722, 0.692), HA = V(0, 2.0, 1.0);
const HROT = 0.764;

// ---------- Анатомия ----------
function anatomy(variant) {
  const pony = variant === 'pony';
  // деформация для тяжеловоза-пони: короче ноги, шире корпус, массивнее кости
  const W = (x, y, z) => {
    if (!pony) return [x, y, z];
    let Y = y < 1.0 ? y * 0.78 : y - 0.22;
    let X = x * (y > 0.9 ? 1.13 : 1.07);
    let Z = z;
    if (z > 0.5 && y > 1.15) { // шея и голова чуть короче
      const k = 0.9;
      Y = (1.3 - 0.22) + (Y - (1.3 - 0.22)) * k; Z = 0.55 + (Z - 0.55) * k;
    }
    return [X, Y, Z];
  };
  const RK = (y) => pony ? (y < 0.95 ? 1.22 : 1.07) : 1;
  const WX = (y) => pony ? (y > 0.9 ? 1.12 : 1.05) : 1;
  const S = new Sculpt();
  S.variant = variant;
  S.W = W;
  const B = (name, p, parent) => S.bone(name, W(...p), parent);
  const E = (c, r, o = {}) => S.ell(W(...c), [r[0] * RK(c[1]) * WX(c[1]), r[1] * RK(c[1]), r[2] * RK(c[1])], o);
  const C = (a, b, r1, r2, o = {}) => S.cone(W(...a), W(...b), r1 * RK(a[1]), r2 * RK(b[1]), { ...o, floor: o.floor });
  const HP = (s, h, x = 0) => [x, HA.y + HU.y * s + HN.y * h, HA.z + HU.z * s + HN.z * h];
  const HE = (s, h, x, r, o = {}) => E(HP(s, h, x), r, { rot: [HROT, 0, 0], ...o });

  // кости
  B('torso', [0, 1.17, 0]);
  B('neck0', [0, 1.34, 0.58], 'torso');
  B('neck1', [0, 1.68, 0.84], 'neck0');
  B('head', [0, 1.94, 0.97], 'neck1');
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    B('ear' + s, HP(0.02, 0.06, sx * 0.05), 'head');
  }
  B('tail0', [0, 1.42, -0.86], 'torso');
  B('tail1', [0, 1.27, -0.95], 'tail0');
  B('tail2', [0, 1.02, -1.0], 'tail1');
  B('tail3', [0, 0.74, -1.02], 'tail2');
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    B('FU' + s, [sx * 0.15, 1.12, 0.64], 'torso');
    B('FF' + s, [sx * 0.165, 0.9, 0.47], 'FU' + s);
    B('FC' + s, [sx * 0.15, 0.505, 0.5], 'FF' + s);
    B('FP' + s, [sx * 0.15, 0.175, 0.5], 'FC' + s);
    B('RU' + s, [sx * 0.18, 1.24, -0.56], 'torso');
    B('RG' + s, [sx * 0.2, 0.95, -0.4], 'RU' + s);
    B('RC' + s, [sx * 0.15, 0.585, -0.71], 'RG' + s);
    B('RP' + s, [sx * 0.15, 0.175, -0.665], 'RC' + s);
  }

  const T = { bone: 'torso' };
  // корпус
  E([0, 1.16, -0.06], [0.29, 0.3, 0.52], { ...T, k: 0.12 });                 // бочка (рёбра)
  E([0, 1.18, 0.37], [0.225, 0.33, 0.36], { ...T, k: 0.1 });                 // грудная клетка
  C([0, 1.41, 0.1], [0, 1.49, 0.46], 0.09, 0.1, { ...T, k: 0.09, sq: 0.7 });  // холка
  E([0, 1.25, -0.56], [0.26, 0.27, 0.33], { ...T, k: 0.12 });                // круп
  E([0, 0.99, -0.1], [0.23, 0.13, 0.4], { ...T, k: 0.12 });                  // живот
  for (const sx of [1, -1]) {
    E([sx * 0.12, 1.36, -0.6], [0.13, 0.15, 0.27], { ...T, k: 0.1 });         // ягодичные мышцы
    E([sx * 0.13, 1.1, -0.7], [0.12, 0.23, 0.2], { ...T, k: 0.08 });          // задняя поверхность бедра
    E([sx * 0.225, 1.37, -0.4], [0.05, 0.05, 0.06], { ...T, k: 0.06 });       // маклок
    C([sx * 0.14, 1.44, 0.33], [sx * 0.16, 1.12, 0.66], 0.1, 0.1, { ...T, k: 0.08, sq: 0.62 }); // лопатка
    E([sx * 0.085, 1.03, 0.66], [0.085, 0.13, 0.12], { ...T, k: 0.07 });      // грудные мышцы
    E([sx * 0.2, 1.2, 0.15], [0.09, 0.2, 0.3], { ...T, k: 0.1 });             // рёберная дуга
  }
  // шея
  C([0, 1.25, 0.55], [0, 1.6, 0.82], 0.26, 0.18, { bone: 'neck0', k: 0.1, sq: 0.58 });
  C([0, 1.6, 0.82], [0, 1.88, 0.98], 0.18, 0.12, { bone: 'neck1', k: 0.08, sq: 0.62 });
  C([0, 1.52, 0.46], [0, 1.82, 0.73], 0.11, 0.095, { bone: 'neck0', k: 0.08, sq: 0.55 }); // гребень
  C([0, 1.82, 0.73], [0, 2.0, 0.93], 0.095, 0.075, { bone: 'neck1', k: 0.07, sq: 0.6 });
  C([0, 1.1, 0.76], [0, 1.48, 0.92], 0.12, 0.095, { bone: 'neck0', k: 0.08, sq: 0.6 });   // низ шеи
  C([0, 1.48, 0.92], [0, 1.76, 1.03], 0.095, 0.075, { bone: 'neck1', k: 0.07, sq: 0.6 });
  // голова
  const H = { bone: 'head' };
  HE(0.09, -0.03, 0, [0.1, 0.1, 0.13], { ...H, k: 0.06 });                     // черепная коробка
  for (const sx of [1, -1]) {
    HE(0.15, -0.1, sx * 0.062, [0.05, 0.1, 0.105], { ...H, k: 0.05 });          // ганаши (щёки)
    HE(0.13, 0.045, sx * 0.078, [0.03, 0.02, 0.045], { ...H, k: 0.03 });        // надбровья
    C(HP(0.17, -0.04, sx * 0.083), HP(0.31, -0.045, sx * 0.068), 0.016, 0.012, { ...H, k: 0.03 }); // скуловой гребень
    HE(0.505, -0.03, sx * 0.04, [0.024, 0.032, 0.03], { ...H, k: 0.03 });      // крылья ноздрей
  }
  HE(0.17, -0.13, 0, [0.075, 0.07, 0.12], { ...H, k: 0.05 });                   // нижняя челюсть
  C(HP(0.16, -0.01), HP(0.44, -0.035), 0.088, 0.06, { ...H, k: 0.05 });          // лицевая часть
  HE(0.47, -0.06, 0, [0.07, 0.085, 0.08], { ...H, k: 0.05 });                   // храп
  HE(0.52, -0.085, 0, [0.06, 0.05, 0.045], { ...H, k: 0.035 });                 // верхняя губа
  HE(0.48, -0.14, 0, [0.046, 0.034, 0.055], { ...H, k: 0.03 });                 // нижняя губа
  // уши
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    const base = V(...W(...HP(0.02, 0.05, sx * 0.055)));
    const dir = V(sx * 0.2, 1, 0.18).normalize();
    const q = V(sx * 0.4, -0.15, 1).normalize();
    const tip = base.clone().addScaledVector(dir, 0.16 * (pony ? 0.85 : 1));
    S.cone(base.toArray(), tip.toArray(), 0.038, 0.007, { bone: 'ear' + s, k: 0.035, sq: 0.42, q: q.toArray(), tag: 'ear' });
    S.cone(base.clone().addScaledVector(dir, 0.04).addScaledVector(q, 0.017).toArray(), base.clone().addScaledVector(dir, 0.135).addScaledVector(q, 0.007).toArray(), 0.02, 0.004, { k: 0.008, sq: 0.55, q: q.toArray(), sub: true, tag: 'earcup' });
  }
  // глазницы и ноздри (вычитание)
  for (const sx of [1, -1]) {
    HE(0.15, 0.005, sx * 0.1, [0.022, 0.022, 0.028], { sub: true, k: 0.012 });
    E(HP(0.525, -0.03, sx * 0.045), [0.011, 0.022, 0.016], { sub: true, k: 0.008, rot: [HROT, sx * 0.3, 0] });
  }
  // хвост (репица)
  C([0, 1.42, -0.86], [0, 1.25, -0.96], 0.065, 0.047, { bone: 'tail0', k: 0.05 });
  C([0, 1.25, -0.96], [0, 1.06, -1.0], 0.047, 0.035, { bone: 'tail1', k: 0.03 });

  // ноги
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    // передняя
    C([sx * 0.16, 1.12, 0.66], [sx * 0.17, 0.92, 0.48], 0.1, 0.085, { bone: 'FU' + s, k: 0.07, sq: 0.75 });
    E([sx * 0.15, 1.0, 0.52], [0.085, 0.13, 0.11], { bone: 'FU' + s, k: 0.07 });
    C([sx * 0.168, 0.9, 0.48], [sx * 0.152, 0.54, 0.5], 0.08, 0.048, { bone: 'FF' + s, k: 0.045, sq: 0.85 });
    E([sx * 0.16, 0.8, 0.497], [0.064, 0.12, 0.07], { bone: 'FF' + s, k: 0.04 });
    E([sx * 0.152, 0.505, 0.505], [0.05, 0.06, 0.054], { bone: 'FC' + s, k: 0.03 });
    C([sx * 0.15, 0.5, 0.507], [sx * 0.15, 0.19, 0.507], 0.038, 0.035, { bone: 'FC' + s, k: 0.02, sq: 0.8 });
    C([sx * 0.15, 0.45, 0.474], [sx * 0.15, 0.22, 0.476], 0.022, 0.022, { bone: 'FC' + s, k: 0.02 });
    E([sx * 0.15, 0.175, 0.493], [0.045, 0.05, 0.053], { bone: 'FP' + s, k: 0.025 });
    C([sx * 0.15, 0.17, 0.5], [sx * 0.15, 0.085, 0.55], 0.036, 0.04, { bone: 'FP' + s, k: 0.02 });
    C([sx * 0.15, 0.09, 0.553], [sx * 0.15, 0.0, 0.585], 0.047, 0.062, { bone: 'FP' + s, k: 0.016, floor: 0, tag: 'hoof' });
    // задняя
    E([sx * 0.17, 1.08, -0.5], [0.12, 0.24, 0.22], { bone: 'RU' + s, k: 0.1 });
    E([sx * 0.2, 0.95, -0.38], [0.07, 0.08, 0.08], { bone: 'RU' + s, k: 0.06 });
    C([sx * 0.19, 0.94, -0.42], [sx * 0.15, 0.6, -0.69], 0.095, 0.055, { bone: 'RG' + s, k: 0.05, sq: 0.7 });
    E([sx * 0.175, 0.82, -0.58], [0.07, 0.13, 0.09], { bone: 'RG' + s, k: 0.05 });
    C([sx * 0.15, 0.86, -0.66], [sx * 0.15, 0.6, -0.77], 0.03, 0.028, { bone: 'RG' + s, k: 0.03 });
    E([sx * 0.15, 0.585, -0.71], [0.052, 0.07, 0.075], { bone: 'RC' + s, k: 0.03 });
    C([sx * 0.15, 0.58, -0.71], [sx * 0.15, 0.19, -0.665], 0.042, 0.036, { bone: 'RC' + s, k: 0.02, sq: 0.8 });
    C([sx * 0.15, 0.52, -0.745], [sx * 0.15, 0.22, -0.69], 0.022, 0.022, { bone: 'RC' + s, k: 0.02 });
    E([sx * 0.15, 0.175, -0.672], [0.045, 0.05, 0.053], { bone: 'RP' + s, k: 0.025 });
    C([sx * 0.15, 0.17, -0.665], [sx * 0.15, 0.085, -0.615], 0.036, 0.04, { bone: 'RP' + s, k: 0.02 });
    C([sx * 0.15, 0.09, -0.612], [sx * 0.15, 0.0, -0.582], 0.046, 0.06, { bone: 'RP' + s, k: 0.016, floor: 0, tag: 'hoof' });
  }
  // вычитание в конце
  S.prims.sort((a, b) => (a.sub ? 1 : 0) - (b.sub ? 1 : 0));
  S.HP = (s, h, x = 0) => V(...W(...HP(s, h, x)));
  return S;
}

// ---------- Окрасы ----------
export const COATS = {
  black: { coat: '#16130f', belly: '#1d1915', points: null, muzzle: '#2a2420', mane: '#0b0907', hoof: '#26221e', socks: [0.26, 0.12, 0.3, 0.12], face: 'star' },
  bay: { coat: '#7a4022', belly: '#94562e', points: '#1a120c', pointsH: 0.62, muzzle: '#3a2216', mane: '#120c08', hoof: '#2a2420', socks: [0, 0, 0.14, 0], face: 'star', earTips: true },
  grey: { coat: '#d4d2ce', belly: '#e2e0dc', dapple: '#a4a29f', points: '#5e5c5a', pointsH: 0.5, muzzle: '#6a6060', mane: '#e8eaf2', hoof: '#5a5450', socks: [0, 0, 0, 0], face: null },
  ghost: { coat: '#24262a', belly: '#2e3034', dapple: '#3a4a40', points: '#0e0f10', pointsH: 0.55, muzzle: '#101212', mane: '#1a3a24', hoof: '#0c0c0c', socks: [0, 0, 0, 0], face: 'skull' },
  chestnut: { coat: '#8a4a26', belly: '#a8643a', points: null, muzzle: '#5a3424', mane: '#e8d8a8', hoof: '#3a3028', socks: [0.34, 0.34, 0.36, 0.36], face: 'blaze' },
};

function mixC(out, c, t) { out.r += (c.r - out.r) * t; out.g += (c.g - out.g) * t; out.b += (c.b - out.b) * t; return out; }
function dappleNoise(x, y, z) {
  // ячеистый шум: светлые «яблоки» с тёмными краями
  const s = 17;
  const X = x * s, Y = y * s, Z = z * s;
  const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
  let d1 = 9, d2 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    let h = Math.sin(cx * 127.1 + cy * 311.7 + cz * 74.7) * 43758.5453;
    const fx = h - Math.floor(h); h = Math.sin(cx * 269.5 + cy * 183.3 + cz * 246.1) * 43758.5453;
    const fy = h - Math.floor(h); h = Math.sin(cx * 113.5 + cy * 271.9 + cz * 124.6) * 43758.5453;
    const fz = h - Math.floor(h);
    const dx = cx + fx - X, dy = cy + fy - Y, dz = cz + fz - Z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return Math.sqrt(d2) - Math.sqrt(d1); // ~0 на границах ячеек
}

// ---------- Построение формы (кэшируется) ----------
const shapeCache = new Map();
export function buildShape(variant) {
  if (shapeCache.has(variant)) return shapeCache.get(variant);
  const S = anatomy(variant);
  const h = IS_PHONE ? 0.022 : IS_TOUCH ? 0.018 : 0.015;
  const { position, normal, index } = S.mesh(h, [-0.46, -0.03, -1.12, 0.46, 2.3, 1.5]);
  const nv = position.length / 3;
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
  const ao = new Float32Array(nv), dom = new Int16Array(nv);
  const p = V(0, 0, 0), n = V(0, 0, 0);
  for (let i = 0; i < nv; i++) {
    p.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    n.set(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    S.focus(p.x, p.y, p.z, 0.12);
    const w = S.weightsAt(p.x, p.y, p.z);
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = w.idx[k]; skinWeight[i * 4 + k] = w.wt[k]; }
    dom[i] = w.idx[0];
    S.focus(p.x, p.y, p.z, 0.24);
    ao[i] = S.ao(p, n);
    S.unfocus();
  }
  const shape = { S, position, normal, index, skinIndex, skinWeight, ao, dom, nv };
  shapeCache.set(variant, shape);
  return shape;
}

// Окраска вершин и разбиение на «шерсть» и «копыта»
function coatGeometry(shape, coat) {
  const { S, position, normal, index, ao, dom, nv } = shape;
  const col = new Float32Array(nv * 3);
  const bn = S.bones.map(b => b.name);
  const c0 = new THREE.Color(coat.coat), cb = new THREE.Color(coat.belly || coat.coat), cp = coat.points ? new THREE.Color(coat.points) : null;
  const cm = new THREE.Color(coat.muzzle), ch = new THREE.Color(coat.hoof), cw = new THREE.Color('#ece8e2'), cd = coat.dapple ? new THREE.Color(coat.dapple) : null;
  const dark = new THREE.Color('#0a0807'), pink = new THREE.Color('#6a4a46');
  const isHoof = new Uint8Array(nv);
  const rnd = mulberry32(5);
  const c = new THREE.Color();
  const legY = S.variant === 'pony' ? 0.78 : 1;
  const hp = V(0, 0, 0);
  const HA2 = V(...S.W(HA.x, HA.y, HA.z));
  for (let i = 0; i < nv; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    const nx = normal[i * 3], ny = normal[i * 3 + 1], nz = normal[i * 3 + 2];
    const b = bn[dom[i]];
    c.copy(c0);
    const leg = b[0] === 'F' || b[0] === 'R';
    const front = b[0] === 'F';
    // светлее снизу (живот, пах)
    if (!leg) mixC(c, cb, sstep(1.0 * legY + 0.1, 0.86 * legY + 0.05, y) * (ny < 0 ? 1 : 0.6));
    // яблоки
    if (cd && y > 0.7 * legY) {
      const dn = dappleNoise(x, y, z);
      const t = (1 - sstep(0.0, 0.22, dn)) * 0.45 * sstep(0.85 * legY, 1.05 * legY, y);
      mixC(c, cd, t);
    }
    // «отметины» ног (гнедая — чёрные чулки)
    if (cp && leg) mixC(c, cp, sstep(coat.pointsH * legY + 0.06, coat.pointsH * legY - 0.04, y));
    if (cp && coat.earTips && b.startsWith('ear')) mixC(c, cp, 0.7);
    // белые носочки / чулки
    if (leg) {
      const li = (front ? 0 : 2) + (b.endsWith('L') ? 0 : 1);
      const sh = coat.socks[li] * legY;
      if (sh > 0) {
        const wave = Math.sin(Math.atan2(x - Math.sign(x) * 0.15, z) * 3) * 0.015;
        mixC(c, cw, sstep(sh + 0.02 + wave, sh - 0.02 + wave, y));
      }
    }
    // копыта
    if (leg && (b.startsWith('FP') || b.startsWith('RP')) && y < 0.085 * legY) {
      isHoof[i] = 1;
      c.copy(ch);
      // вертикальные «волокна» рога
      const f = 0.9 + 0.1 * Math.sin(Math.atan2(nx, nz) * 40);
      c.multiplyScalar(f * (0.75 + y * 3));
    }
    // голова
    if (b === 'head' || b.startsWith('ear')) {
      hp.set(x, y, z).sub(HA2);
      const s = hp.dot(HU), hh = hp.dot(HN);
      mixC(c, cm, sstep(0.38, 0.5, s));                           // тёмный храп
      if (s > 0.46 && hh < -0.09) mixC(c, pink, 0.25);             // губы
      // разрез рта
      if (s > 0.43) { const m = Math.abs(hh + 0.112) < 0.007 && Math.abs(x) > 0.02 ? 1 : 0; mixC(c, dark, m * 0.8); }
      // маркировка морды
      const fn = nx * 0 + ny * HN.y + nz * HN.z; // насколько вершина смотрит «лбом»
      if (coat.face === 'star') mixC(c, cw, sstep(0.032, 0.022, Math.hypot(x, (s - 0.1) * 0.8)) * sstep(0.5, 0.8, fn));
      if (coat.face === 'blaze') {
        const wdt = lerp(0.035, 0.055, sstep(0.1, 0.5, s));
        mixC(c, cw, sstep(wdt + 0.008, wdt - 0.008, Math.abs(x)) * sstep(0.06, 0.1, s) * sstep(0.2, 0.55, fn));
      }
      if (coat.face === 'skull') { // светлая «маска черепа» у призрачного коня
        mixC(c, new THREE.Color('#8a948c'), sstep(0.06, 0.03, Math.abs(x) - (s < 0.3 ? 0.04 : 0.02)) * sstep(0.4, 0.7, fn) * 0.85);
        if (Math.abs(x) > 0.07 && Math.abs(s - 0.15) < 0.06) mixC(c, dark, 0.6);
      }
      // ноздри и глаза — темнее
      for (const sx of [1, -1]) {
        const dn = Math.hypot(x - sx * 0.045, (s - 0.525) * 0.8, (hh + 0.03) * 0.8);
        mixC(c, dark, sstep(0.03, 0.012, dn) * 0.9);
        const de = Math.hypot(x - sx * 0.098, (s - 0.15), hh);
        mixC(c, dark, sstep(0.045, 0.02, de) * 0.35);
      }
    }
    if (b.startsWith('ear')) {
      // внутренняя сторона уха
      const sx = b.endsWith('L') ? 1 : -1;
      const q = V(sx * 0.4, -0.15, 1).normalize();
      const facing = nx * q.x + ny * q.y + nz * q.z;
      mixC(c, dark, sstep(0.3, 0.7, facing) * 0.7);
    }
    // мелкие вариации
    c.multiplyScalar(0.96 + rnd() * 0.06);
    // фоновое затенение
    c.multiplyScalar(lerp(0.38, 1, ao[i]));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(shape.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(shape.skinWeight, 4));
  const body = [], hoof = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], d = index[t + 2];
    (isHoof[a] && isHoof[b] && isHoof[d] ? hoof : body).push(a, b, d);
  }
  g.setIndex([...body, ...hoof]);
  g.addGroup(0, body.length, 0);
  g.addGroup(body.length, hoof.length, 1);
  return g;
}

// Материал шерсти: короткий блестящий волос (трипланарная текстура по позе покоя)
const matCache = new Map();
function coatMat(glow = null) {
  const k = 'coat' + glow;
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.48, metalness: 0, sheen: 0.55, sheenRoughness: 0.4, sheenColor: new THREE.Color('#b8a898'), clearcoat: 0.12, clearcoatRoughness: 0.5 });
  if (glow) { m.emissive = new THREE.Color(glow); m.emissiveIntensity = 0.06; }
  const tex = furTex().map;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tHair = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest; varying vec3 vRestN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vRestN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tHair; varying vec3 vRest; varying vec3 vRestN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(vRestN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 tp = vRest * 3.2;
        float hx = texture2D(tHair, tp.zy).r, hy = texture2D(tHair, tp.xz).r, hz = texture2D(tHair, tp.xy).r;
        float hv = hx * bw.x + hy * bw.y + hz * bw.z;
        diffuseColor.rgb *= mix(0.86, 1.1, hv);`);
  };
  m.customProgramCacheKey = () => 'horsecoat';
  matCache.set(k, m);
  return m;
}
function hoofMat() {
  if (!matCache.has('hoof')) matCache.set('hoof', new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.38, metalness: 0.05 }));
  return matCache.get('hoof');
}
function maneMat(color, glow) {
  const k = 'mane' + color + glow;
  if (!matCache.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color, map: hairStrandTex(), alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.05 });
    if (glow) { m.emissive = new THREE.Color(glow); m.emissiveIntensity = 0.35; }
    matCache.set(k, m);
  }
  return matCache.get(k);
}
// Текстура волос хвоста: плотные тонкие волоски вдоль длины, кончики разной длины
const tailTexCache = {};
function tailTex(kind) {
  if (tailTexCache[kind]) return tailTexCache[kind];
  const Wd = 256, Hd = 1024;
  const c = document.createElement('canvas'); c.width = Wd; c.height = Hd;
  const ctx = c.getContext('2d');
  const hc = document.createElement('canvas'); hc.width = Wd; hc.height = Hd;
  const hctx = hc.getContext('2d', { willReadFrequently: true });
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, Wd, Hd);
  const rnd = mulberry32(kind === 'core' ? 91 : 133);
  const core = kind === 'core';
  if (core) {
    // сплошная основа сверху, плавно уходящая в отдельные пряди к концу
    const g = ctx.createLinearGradient(0, 0, 0, Hd);
    g.addColorStop(0, 'rgba(150,150,150,1)'); g.addColorStop(0.72, 'rgba(150,150,150,1)'); g.addColorStop(0.8, 'rgba(150,150,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Hd);
  }
  const N = core ? 2600 : 1500;
  for (let i = 0; i < N; i++) {
    const x = rnd() * Wd;
    const start = core ? 0 : rnd() * Hd * 0.35;
    const len = core ? Hd * (0.78 + rnd() * 0.22) : Hd * (0.45 + rnd() * 0.55);
    const l = 0.5 + rnd() * 0.55;
    const v = (l * 235) | 0;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.75 + rnd() * 0.25})`;
    ctx.lineWidth = 0.6 + rnd() * 1.3;
    const sway = (rnd() - 0.5) * 10;
    for (const ox of [0, Wd, -Wd]) {
      ctx.beginPath(); ctx.moveTo(x + ox, start);
      ctx.bezierCurveTo(x + ox + sway * 0.3, start + len * 0.35, x + ox + sway, start + len * 0.7, x + ox + sway * 1.4, Math.min(Hd - 2, start + len));
      ctx.stroke();
      hctx.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.4})`; hctx.lineWidth = 1;
      hctx.beginPath(); hctx.moveTo(x + ox, start); hctx.bezierCurveTo(x + ox + sway * 0.3, start + len * 0.35, x + ox + sway, start + len * 0.7, x + ox + sway * 1.4, Math.min(Hd - 2, start + len)); hctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = 8;
  const nrm = new THREE.CanvasTexture(heightToNormal(hc, 1.6));
  nrm.wrapS = THREE.RepeatWrapping;
  tailTexCache[kind] = { map, nrm };
  return tailTexCache[kind];
}
function tailMat(color, glow, kind) {
  const k = 'tail' + color + glow + kind;
  if (!matCache.has(k)) {
    const t = tailTex(kind);
    const m = new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.nrm, normalScale: new THREE.Vector2(0.8, 0.8), alphaTest: kind === 'core' ? 0.45 : 0.4, side: THREE.DoubleSide, roughness: 0.42, metalness: 0.05 });
    if (glow) { m.emissive = new THREE.Color(glow); m.emissiveIntensity = 0.35; m.emissiveMap = t.map; }
    matCache.set(k, m);
  }
  return matCache.get(k);
}

function eyeMat(glow) {
  const k = 'eye' + glow;
  if (!matCache.has(k)) {
    matCache.set(k, glow
      ? new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 3, roughness: 0.2 })
      : new THREE.MeshPhysicalMaterial({ color: '#1a0f08', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }));
  }
  return matCache.get(k);
}

// ---------- Волосы: грива, чёлка, хвост, «щётки» ----------
function strandPath(S, root, dir0, len, steps, off, grav, follow = true) {
  const pts = [root.clone()];
  const p = root.clone(), d = dir0.clone().normalize();
  const st = len / steps;
  for (let i = 1; i <= steps; i++) {
    d.y -= grav; d.normalize();
    const prev = p.clone();
    p.addScaledVector(d, st);
    if (follow) { S.pushOut(p, off + i * 0.0012); d.copy(p).sub(prev).normalize(); }
    pts.push(p.clone());
  }
  return pts;
}
function strandGeo(S, pts, width) {
  const n = pts.length;
  const g = new THREE.Vector3();
  return ribbonGeo(pts, width, (i) => {
    const t = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    S.grad(pts[i].x, pts[i].y, pts[i].z, g);
    const side = new THREE.Vector3().crossVectors(t, g);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    return side;
  }, { taper: 0.35 });
}
function skinStrands(S, geos, weightFn) {
  const g = mergeGeos(geos);
  const nv = g.attributes.position.count;
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const P = g.attributes.position.array;
  for (let i = 0; i < nv; i++) {
    const w = weightFn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = w.idx[k]; sw[i * 4 + k] = w.wt[k]; }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

const hairCache = new Map();
function buildHair(shape, opts) {
  const key = shape.S.variant + '|' + opts.maneLen + '|' + opts.feather;
  if (hairCache.has(key)) return hairCache.get(key);
  const S = shape.S;
  const rnd = mulberry32(77);
  const W = (x, y, z) => V(...S.W(x, y, z));
  const neckSet = new Set(['torso', 'neck0', 'neck1', 'head'].map(n => S.boneIdx.get(n)));
  const mane = [];
  // ось шеи от затылка к холке
  const axis = [W(0, 1.88, 0.96), W(0, 1.64, 0.79), W(0, 1.4, 0.6), W(0, 1.3, 0.44)];
  const crv = new THREE.CatmullRomCurve3(axis);
  const NM = IS_PHONE ? 30 : 56;
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < NM; i++) {
    const c = (i + rnd() * 0.8) / NM;
    const a = crv.getPoint(c), t = crv.getTangent(c).negate();
    const nrm = new THREE.Vector3().crossVectors(t, V(1, 0, 0)).normalize();
    const root = S.hit(a, nrm, 0.002).p;
    const side = rnd() < 0.85 ? -1 : 1;
    const dir = V(side * (0.55 + layer * 0.15), 0.55 - layer * 0.1, 0).addScaledVector(t, -0.25 - rnd() * 0.2);
    const len = opts.maneLen * (0.75 + rnd() * 0.4) * (0.8 + 0.25 * Math.sin(c * Math.PI));
    const pts = strandPath(S, root, dir, len, 9, 0.007 + layer * 0.011, 0.26);
    mane.push(strandGeo(S, pts, 0.034 + rnd() * 0.016));
  }
  // чёлка
  for (let i = 0; i < 12; i++) {
    const x = (rnd() - 0.5) * 0.06;
    const root = S.hit(S.HP(-0.01 + rnd() * 0.03, -0.02, x), HN.clone().addScaledVector(HU, -0.3), 0.003).p;
    const dir = HU.clone().addScaledVector(HN, 0.12).add(V(x * 3, 0, 0));
    const pts = strandPath(S, root, dir, 0.17 + rnd() * 0.09, 7, 0.006 + rnd() * 0.006, 0.08);
    mane.push(strandGeo(S, pts, 0.04));
  }
  const maneGeo = skinStrands(S, mane, (x, y, z) => S.weightsAt(x, y, z, 0.03, neckSet));
  // хвост
  const tail = [];
  const tb = ['tail0', 'tail1', 'tail2', 'tail3'].map(n => S.boneIdx.get(n));
  const tp = ['tail0', 'tail1', 'tail2', 'tail3'].map(n => S.bones[S.boneIdx.get(n)].pos);
  const tailCrv = new THREE.CatmullRomCurve3([W(0, 1.43, -0.86), W(0, 1.25, -0.96), W(0, 1.06, -1.0)]);
  // Хвост — плотный объёмный пучок: непрозрачная основа + полупрозрачные внешние слои
  const bottom = (S.variant === 'pony' ? 0.36 : 0.5);
  const hang = [W(0, 1.43, -0.86), W(0, 1.27, -0.965), W(0, 1.08, -1.015)];
  const dockEnd = hang[2];
  hang.push(V(0, lerp(dockEnd.y, bottom, 0.35), dockEnd.z - 0.04), V(0, lerp(dockEnd.y, bottom, 0.7), dockEnd.z - 0.05), V(0, bottom, dockEnd.z - 0.035));
  const tcurve = new THREE.CatmullRomCurve3(hang);
  const tailLayers = [];
  const NR = IS_PHONE ? 14 : 22, NL = IS_PHONE ? 20 : 32;
  for (const [off, extra, rep, seed] of [[0, 0, 3, 0], [0.014, 0.05, 2.5, 1.7], [0.028, 0.09, 2, 3.1]]) {
    const pos = [], uv = [], idx = [];
    const total = 1 + extra;
    const tEnd = tcurve.getTangentAt(1);
    for (let i = 0; i <= NL; i++) {
      const tt = i / NL * total;
      let c, T;
      if (tt <= 1) { c = tcurve.getPointAt(tt); T = tcurve.getTangentAt(tt); }
      else { c = tcurve.getPointAt(1).addScaledVector(tEnd, (tt - 1) * 0.9); T = tEnd.clone(); }
      const X = V(1, 0, 0);
      const Bk = new THREE.Vector3().crossVectors(X, T).normalize(); // назад от тела
      // профиль: обхватывает репицу, расширяется к середине, сужается к концу
      const t = Math.min(tt, 1);
      let w = t < 0.22 ? lerp(0.068, 0.09, t / 0.22) : t < 0.6 ? lerp(0.09, 0.118, (t - 0.22) / 0.38) : lerp(0.118, 0.07, Math.pow((t - 0.6) / 0.4, 1.3));
      if (S.variant === 'pony') w *= 1.15;
      const dpt = t < 0.22 ? 0.95 : lerp(0.95, 0.68, Math.min(1, (t - 0.22) / 0.3));
      for (let j = 0; j <= NR; j++) {
        const th = j / NR * Math.PI * 2;
        const bump = 1 + 0.07 * Math.sin(th * 3 + tt * 6 + seed) + 0.05 * Math.sin(th * 7 - tt * 11 + seed * 2);
        const r = (w + off) * bump;
        const p = c.clone().addScaledVector(X, Math.cos(th) * r).addScaledVector(Bk, Math.sin(th) * r * dpt);
        pos.push(p.x, p.y, p.z);
        uv.push(j / NR * rep, 1 - tt / total);
      }
    }
    for (let i = 0; i < NL; i++) for (let j = 0; j < NR; j++) {
      const a0 = i * (NR + 1) + j, b0 = a0 + 1, c0 = a0 + NR + 1, d0 = c0 + 1;
      idx.push(a0, c0, b0, b0, c0, d0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    tailLayers.push(g);
  }
  // несколько выбившихся прядей по краям
  for (let i = 0; i < (IS_PHONE ? 8 : 18); i++) {
    const t0 = 0.3 + rnd() * 0.5, th = rnd() * Math.PI * 2;
    const c = tcurve.getPointAt(t0);
    const dirOut = V(Math.cos(th), 0, -Math.abs(Math.sin(th)) * 0.7).normalize();
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const f = k / 8;
      const q = tcurve.getPointAt(Math.min(1, t0 + f * (1 - t0) * 1.05));
      pts.push(q.addScaledVector(dirOut, 0.1 + f * 0.05 + Math.sin(f * 3 + i) * 0.015));
    }
    tailLayers.push(ribbonGeo(pts, 0.03, (k) => {
      const tt = pts[Math.min(8, k + 1)].clone().sub(pts[Math.max(0, k - 1)]).normalize();
      return new THREE.Vector3().crossVectors(tt, dirOut);
    }, { taper: 0.6 }));
  }
  const tailW = (x, y, z) => {
    // вдоль цепочки костей хвоста по высоте
    const idx = [tb[0], tb[1], 0, 0], wt = [1, 0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = tp[k].y, b = tp[k + 1].y;
      if (y <= a && y >= b) { const f = (a - y) / (a - b); idx[0] = tb[k]; idx[1] = tb[k + 1]; wt[0] = 1 - f; wt[1] = f; return { idx, wt }; }
    }
    if (y < tp[3].y) { idx[0] = tb[3]; wt[0] = 1; idx[1] = tb[2]; wt[1] = 0; }
    return { idx, wt };
  };
  const tailGeo = skinStrands(S, [tailLayers[0]], tailW);
  const tailOuterGeo = skinStrands(S, tailLayers.slice(1), tailW);
  // «щётки» над копытами у тяжеловоза
  let featherGeo = null;
  if (opts.feather) {
    const fe = [];
    for (const nm of ['FPL', 'FPR', 'RPL', 'RPR']) {
      const bp = S.bones[S.boneIdx.get(nm)].pos;
      const legSet = new Set([S.boneIdx.get(nm), S.boneIdx.get(nm.replace('P', 'C'))]);
      for (let i = 0; i < 16; i++) {
        const ang = (rnd() - 0.5) * Math.PI * 1.4 + Math.PI; // сзади и по бокам
        const yy = bp.y + 0.02 + rnd() * 0.12;
        const o = V(bp.x, yy, bp.z + (nm[0] === 'F' ? 0.01 : -0.01));
        const root = S.hit(o, V(Math.sin(ang), 0, Math.cos(ang)), 0.002).p;
        const dir = V(Math.sin(ang) * 0.35, -1, Math.cos(ang) * 0.35);
        const pts = strandPath(S, root, dir, yy + 0.02, 6, 0.006, 0.05, false);
        for (const p of pts) { S.pushOut(p, 0.006); p.y = Math.max(0.005, p.y); }
        fe.push({ g: strandGeo(S, pts, 0.05), set: legSet });
      }
    }
    featherGeo = skinStrands(S, fe.map(f => f.g), (x, y, z) => S.weightsAt(x, y, z, 0.02, new Set(['FPL', 'FPR', 'RPL', 'RPR', 'FCL', 'FCR', 'RCL', 'RCR'].map(n => S.boneIdx.get(n)))));
  }
  const res = { maneGeo, tailGeo, tailOuterGeo, featherGeo };
  hairCache.set(key, res);
  return res;
}

// ---------- Сбруя и броня ----------
function roundedBox(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
  const pa = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c).normalize().multiplyScalar(r).add(c);
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function localize(geo, S, boneName) {
  const p = S.bones[S.boneIdx.get(boneName)].pos;
  geo.translate(-p.x, -p.y, -p.z);
  return geo;
}
function strapLoop(S, center, U, Vv, a0, a1, n, off, width) {
  const pts = [], nrm = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    const d = U.clone().multiplyScalar(Math.sin(a)).addScaledVector(Vv, Math.cos(a));
    const h = S.hit(center, d, off);
    pts.push(h.p); nrm.push(h.n);
  }
  const ax = new THREE.Vector3().crossVectors(U, Vv).normalize();
  return ribbonGeo(pts, width, () => ax);
}
function strapPath(S, pts0, off, width) {
  const pts = pts0.map(p => S.pushOut(p.clone(), off));
  const g = new THREE.Vector3();
  return ribbonGeo(pts, width, (i) => {
    const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    S.grad(pts[i].x, pts[i].y, pts[i].z, g);
    return new THREE.Vector3().crossVectors(g, t);
  });
}

const tackCache = new Map();
function buildTack(shape, style, key) {
  if (tackCache.has(key)) return tackCache.get(key);
  const S = shape.S;
  const W = (x, y, z) => V(...S.W(x, y, z));
  const parts = []; // {geo, mat: 'leather'|'trim'|'cloth'|'cloth2'|'armor'|'metal'|'gem', bone}
  const add = (geo, mat, bone) => parts.push({ geo: localize(geo, S, bone), mat, bone });
  const axisC = (z) => W(0, 1.16, z);
  const back = (u, z, off) => { const phi = u; return { o: axisC(z), d: V(Math.sin(phi), Math.cos(phi), 0), off }; };
  const zs = S.variant === 'pony' ? 0.92 : 1;
  // попона под седлом (с каймой)
  add(drapeGeo(S, (u, v) => back((u - 0.5) * 2.6, (-0.31 + v * 0.66) * zs, 0.007), 18, 12), 'cloth2', 'torso');
  add(drapeGeo(S, (u, v) => back((u - 0.5) * 2.45, (-0.28 + v * 0.6) * zs, 0.011), 18, 12, { uvScale: [2, 1.5] }), 'cloth', 'torso');
  // седло: сиденье с лукой и задней лукой
  add(drapeGeo(S, (u, v) => {
    const uu = (u - 0.5) * 2, z = (-0.23 + v * 0.45) * zs;
    const pommel = 0.075 * sstep(0.62, 1, v) * (1 - uu * uu * 0.7);
    const cantle = 0.11 * sstep(0.32, 0, v) * (1 - uu * uu * 0.85);
    return back(uu * 0.78, z, 0.028 + pommel + cantle + 0.01 * (1 - uu * uu));
  }, 16, 16, { uvScale: [1, 1.4] }), 'leather', 'torso');
  // крылья седла
  for (const sx of [1, -1]) {
    add(drapeGeo(S, (u, v) => back(sx * (0.62 + u * 0.75), (-0.08 + v * 0.3) * zs, 0.03), 8, 8), 'leather', 'torso');
  }
  // подпруга
  const gz = 0.33 * zs;
  add(strapLoop(S, W(0, 1.17, 0.33), V(1, 0, 0), V(0, 1, 0), 1.1, Math.PI * 2 - 1.1, 40, 0.014, 0.075), 'leather', 'torso');
  // нагрудник
  add(strapLoop(S, W(0, 1.12, 0.4), V(1, 0, 0), V(0, 0, 1), -1.45, 1.45, 30, 0.013, 0.05), 'leather', 'torso');
  // путлища и стремена
  const seatTop = S.hit(W(0, 1.16, 0.0), V(0, 1, 0), 0).p.y;
  for (const sx of [1, -1]) {
    const top = S.hit(W(0, 1.2, 0.06 * zs), V(sx, 0.6, 0), 0.032).p;
    const bot = V(top.x + sx * 0.06, (S.variant === 'pony' ? 0.62 : 0.8), top.z + 0.02);
    const pts = []; for (let i = 0; i <= 6; i++) pts.push(top.clone().lerp(bot, i / 6));
    for (const p of pts) S.pushOut(p, 0.035);
    add(ribbonGeo(pts, 0.03, () => V(0, 0, 1)), 'leather', 'torso');
    const st = new THREE.TorusGeometry(0.055, 0.008, 6, 16, Math.PI * 1.2);
    st.rotateZ(Math.PI * 1.4 - Math.PI * 0.6); st.rotateY(Math.PI / 2);
    st.translate(bot.x, bot.y - 0.045, bot.z);
    add(st, 'metal', 'torso');
    const tread = new THREE.BoxGeometry(0.03, 0.01, 0.11); tread.translate(bot.x, bot.y - 0.095, bot.z);
    add(tread, 'metal', 'torso');
  }
  // уздечка (на голове)
  const HP = S.HP;
  const hc = (s) => HP(s, -0.045);
  const loopHead = (s, a0, a1, w, off = 0.006) => strapLoop(S, hc(s), V(1, 0, 0), HN, a0, a1, 32, off, w);
  add(loopHead(0.035, -Math.PI, Math.PI, 0.03), 'leather', 'head');           // затылочный ремень
  add(loopHead(0.075, -1.25, 1.25, 0.024, 0.008), 'trim', 'head');           // налобный ремень
  add(loopHead(0.37, -Math.PI, Math.PI, 0.034), 'leather', 'head');           // капсюль
  for (const sx of [1, -1]) {
    const pts = []; for (let i = 0; i <= 10; i++) { const s = lerp(0.04, 0.48, i / 10); pts.push(S.hit(hc(s), V(sx, 0, 0).addScaledVector(HN, -0.15), 0).p); }
    add(strapPath(S, pts, 0.007, 0.024), 'leather', 'head');
    const ring = new THREE.TorusGeometry(0.022, 0.0045, 6, 14); ring.rotateY(Math.PI / 2);
    const rp = S.hit(HP(0.49, -0.1), V(sx, 0, 0), 0.008).p;
    ring.translate(rp.x, rp.y, rp.z);
    add(ring, 'metal', 'head');
    const ros = new THREE.SphereGeometry(0.014, 10, 8); ros.scale(0.5, 1, 1);
    const rpos = S.hit(hc(0.075), V(sx, 0, 0), 0.012).p; ros.translate(rpos.x, rpos.y, rpos.z);
    add(ros, 'trim', 'head');
  }
  // поводья: от трензеля к рукам всадника (кожа, со скиннингом голова→шея→корпус)
  const reinPts = [];
  const bitL = S.hit(HP(0.49, -0.1), V(1, 0, 0), 0.012).p, bitR = S.hit(HP(0.49, -0.1), V(-1, 0, 0), 0.012).p;
  const hands = W(0, 1.62, 0.3);
  const reinGeos = [];
  for (const bit of [bitL, bitR]) {
    const mid = bit.clone().lerp(hands, 0.5); mid.y -= 0.12;
    const c = new THREE.QuadraticBezierCurve3(bit, mid, hands.clone().add(V(Math.sign(bit.x) * 0.05, 0, 0)));
    reinGeos.push(new THREE.TubeGeometry(c, 16, 0.006, 5));
    reinPts.push(bit);
  }
  const headI = S.boneIdx.get('head'), n1 = S.boneIdx.get('neck1'), n0 = S.boneIdx.get('neck0'), tI = S.boneIdx.get('torso');
  const reins = mergeGeos(reinGeos);
  {
    const P = reins.attributes.position.array, nv = P.length / 3;
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) {
      const z = P[i * 3 + 2];
      const f = clamp((bitL.z - z) / (bitL.z - hands.z), 0, 1); // 0 — у морды, 1 — у рук
      if (f < 0.5) { si[i * 4] = headI; si[i * 4 + 1] = n1; sw[i * 4] = 1 - f * 2; sw[i * 4 + 1] = f * 2; }
      else { si[i * 4] = n0; si[i * 4 + 1] = tI; sw[i * 4] = (1 - f) * 2; sw[i * 4 + 1] = (f - 0.5) * 2; }
    }
    reins.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    reins.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  // седельные сумки
  if (style.bags) for (const sx of [1, -1]) {
    // мягкая кожаная сумка с клапаном и пряжкой
    const bp = S.hit(W(0, 1.22, -0.36 * zs), V(sx, 0.25, 0), 0.055).p;
    const bag = roundedBox(0.085, 0.19, 0.25, 0.03);
    bag.translate(bp.x, bp.y - 0.1, bp.z);
    add(bag, 'leather', 'torso');
    const flap = roundedBox(0.02, 0.09, 0.26, 0.008);
    flap.translate(bp.x + sx * 0.042, bp.y - 0.035, bp.z);
    add(flap, 'leather', 'torso');
    const buckle = new THREE.TorusGeometry(0.014, 0.003, 4, 10); buckle.rotateY(Math.PI / 2);
    buckle.translate(bp.x + sx * 0.05, bp.y - 0.1, bp.z);
    add(buckle, 'trim', 'torso');
  }
  // броня
  if (style.armor) {
    // налобник (шанфрон)
    add(drapeGeo(S, (u, v) => {
      const s = lerp(0.0, 0.44, v), a = (u - 0.5) * 2.4 * (1 - v * 0.25);
      return { o: hc(s), d: V(Math.sin(a), 0, 0).addScaledVector(HN, Math.cos(a)), off: 0.016 + 0.004 * Math.cos(a) };
    }, 14, 16, { uvScale: [1, 2] }), 'armor', 'head');
    // гребень налобника
    const ridge = []; for (let i = 0; i <= 8; i++) ridge.push(S.hit(hc(lerp(0.02, 0.42, i / 8)), HN, 0.024).p);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge), 16, 0.008, 6), 'trim', 'head');
    // нагрудная броня (пейтраль)
    add(drapeGeo(S, (u, v) => {
      const a = (u - 0.5) * 2.9, y = lerp(0.97, 1.36, v);
      return { o: W(0, y, 0.36), d: V(Math.sin(a), 0, Math.cos(a)), off: 0.024 + 0.006 * Math.sin(v * Math.PI) };
    }, 22, 10, { uvScale: [1.6, 0.7] }), 'armor', 'torso');
    for (const yy of [0.97, 1.36]) {
      add(strapLoop(S, W(0, yy, 0.36), V(1, 0, 0), V(0, 0, 1), -1.45, 1.45, 26, 0.03, 0.025), 'trim', 'torso');
    }
    // латы на шее (критнет) — пластины по гребню
    for (let i = 0; i < 4; i++) {
      const c0 = 0.15 + i * 0.19;
      const crv = new THREE.CatmullRomCurve3([W(0, 1.88, 0.96), W(0, 1.64, 0.79), W(0, 1.4, 0.6), W(0, 1.3, 0.44)]);
      const a0 = crv.getPoint(c0), a1 = crv.getPoint(c0 + 0.2);
      add(drapeGeo(S, (u, v) => {
        const a = a0.clone().lerp(a1, v);
        const t = a1.clone().sub(a0).normalize().negate();
        const nrm = new THREE.Vector3().crossVectors(t, V(1, 0, 0)).normalize();
        const ang = (u - 0.5) * 2.2;
        return { o: a, d: nrm.multiplyScalar(Math.cos(ang)).add(V(Math.sin(ang), 0, 0)), off: 0.03 + i * 0.002 + v * 0.008 };
      }, 10, 4), 'armor', i < 2 ? 'neck1' : 'neck0');
    }
  }
  // чепрак (попона на крупе)
  if (style.caparison) {
    add(drapeGeo(S, (u, v) => {
      const z = lerp(-0.88, -0.27, v) * zs;
      const side = u < 0.5 ? -1 : 1;
      const uu = Math.abs(u - 0.5) * 2; // 0 — хребет, 1 — край
      if (uu < 0.62) return back(side * uu / 0.62 * 1.35, z, 0.016);
      // свободно свисающая юбка
      const h = S.hit(axisC(z), V(side * Math.sin(1.35), Math.cos(1.35), 0), 0.016);
      const k = (uu - 0.62) / 0.38;
      const drop = (h.p.y - (S.variant === 'pony' ? 0.72 : 0.9)) * k;
      return { p: h.p.clone().add(V(side * 0.03 * k, -drop, 0)), n: V(side, 0, 0) };
    }, 22, 12, { uvScale: [3, 2] }), 'cloth', 'torso');
  }
  const res = { parts, reins };
  tackCache.set(key, res);
  return res;
}

// ---------- Класс лошади ----------
export class Horse extends Creature {
  constructor(opts = {}) {
    super();
    this.kind = 'horse';
    const variant = opts.variant || 'horse';
    const shape = buildShape(variant);
    const S = shape.S;
    this.S = S;
    const coat = opts.coat || COATS.bay;
    // скелет
    const bones = S.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
    S.bones.forEach((b, i) => {
      const parent = b.parent ? S.bones[S.boneIdx.get(b.parent)] : null;
      bones[i].position.copy(b.pos).sub(parent ? parent.pos : V(0, 0, 0));
      if (parent) bones[S.boneIdx.get(b.parent)].add(bones[i]); else this.body.add(bones[i]);
    });
    const B = (n) => bones[S.boneIdx.get(n)];
    this.B = B;
    this.boneList = bones;
    const skeleton = new THREE.Skeleton(bones);
    this.root.updateMatrixWorld(true);
    const glow = opts.glow || null;
    const body = new THREE.SkinnedMesh(coatGeometry(shape, coat), [coatMat(opts.coatGlow || null), hoofMat()]);
    body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
    this.body.add(body);
    body.bind(skeleton);
    this.meshes.push(body);
    this.coatMesh = body;
    // волосы
    const hair = buildHair(shape, { maneLen: opts.maneLen || 0.38, feather: !!opts.feather });
    const mm = maneMat(coat.mane, opts.maneGlow || null);
    for (const [g, mat] of [[hair.maneGeo, mm], [hair.tailGeo, tailMat(coat.mane, opts.maneGlow || null, 'core')], [hair.tailOuterGeo, tailMat(coat.mane, opts.maneGlow || null, 'shell')]]) {
      const m = new THREE.SkinnedMesh(g, mat);
      m.castShadow = true; m.frustumCulled = false;
      this.body.add(m); m.bind(skeleton);
    }
    if (hair.featherGeo) {
      const m = new THREE.SkinnedMesh(hair.featherGeo, maneMat('#e8e2d6', null));
      m.castShadow = true; m.frustumCulled = false;
      this.body.add(m); m.bind(skeleton);
    }
    // глаза
    for (const sx of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), eyeMat(glow));
      const p = S.HP(0.15, 0.004, sx * 0.087);
      const hb = S.bones[S.boneIdx.get('head')].pos;
      e.position.copy(p).sub(hb);
      e.scale.set(0.75, 0.9, 1.1);
      e.rotation.x = HROT;
      B('head').add(e);
    }
    // сбруя
    if (opts.tack) {
      const tack = buildTack(shape, opts.tack, (opts.tackKey || 'x') + variant);
      const mats = {
        leather: leatherMat(opts.tack.leather || '#3a2214'),
        trim: metalMat(opts.tack.trim || '#c9a640', 0.3),
        metal: metalMat('#b8bcc2', 0.28),
        cloth: clothMat(opts.tack.cloth || '#7a1c1c', 2),
        cloth2: clothMat(opts.tack.trimCloth || opts.tack.trim || '#c9a640', 0),
        armor: metalMat(opts.tack.armor || '#9aa0a8', 0.3, opts.tack.armorGlow || null, opts.tack.armorGlow ? 0.25 : 0),
      };
      for (const pt of tack.parts) {
        const m = new THREE.Mesh(pt.geo, mats[pt.mat]);
        m.castShadow = true;
        if (pt.mat === 'cloth' || pt.mat === 'cloth2' || pt.mat === 'armor' || pt.mat === 'leather') m.material = mats[pt.mat];
        B(pt.bone).add(m);
      }
      const reins = new THREE.SkinnedMesh(tack.reins, mats.leather);
      reins.frustumCulled = false; this.body.add(reins); reins.bind(skeleton);
      if (opts.tack.glow) {
        for (let i = 0; i < 3; i++) {
          const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), gemMat(opts.tack.glow, 3));
          const p = S.hit(V(...S.W(0, 1.12, 0.4)), V(Math.sin((i - 1) * 0.9), 0, Math.cos((i - 1) * 0.9)), 0.03).p;
          gm.position.copy(p).sub(S.bones[S.boneIdx.get('torso')].pos);
          B('torso').add(gm);
        }
        const gh = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), gemMat(opts.tack.glow, 3));
        gh.position.copy(S.hit(S.HP(0.075, -0.045), HN, 0.016).p).sub(S.bones[S.boneIdx.get('head')].pos);
        B('head').add(gh);
      }
    }
    // рог единорога — витой
    if (opts.horn) {
      const pts = [], N = 40;
      const g = new THREE.ConeGeometry(0.032, 0.42, 14, 24);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) + 0.21, a = y * 38;
        const x = pos.getX(i), z = pos.getZ(i);
        const r = 1 + 0.18 * Math.sin(Math.atan2(z, x) * 2 + a);
        pos.setXYZ(i, x * r, pos.getY(i), z * r);
      }
      g.computeVertexNormals(); g.translate(0, 0.21, 0);
      const horn = new THREE.Mesh(g, gemMat(opts.horn, 0.9));
      const base = S.hit(S.HP(0.07, -0.02), HN, -0.01).p;
      horn.position.copy(base).sub(S.bones[S.boneIdx.get('head')].pos);
      horn.rotation.x = 0.55;
      B('head').add(horn);
      void pts; void N;
    }
    // демонические рога у призрачного коня
    if (opts.demonHorns) for (const sx of [1, -1]) {
      const c = new THREE.QuadraticBezierCurve3(V(0, 0, 0), V(sx * 0.07, 0.1, -0.05), V(sx * 0.1, 0.2, -0.16));
      const g = new THREE.TubeGeometry(c, 12, 0.016, 7);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { const k = 1; void k; }
      const hm = new THREE.Mesh(g, metalMat('#1c1c20', 0.4, opts.glow, 0.3));
      hm.position.copy(S.hit(S.HP(0.04, 0.02, sx * 0.06), HN, 0.01).p).sub(S.bones[S.boneIdx.get('head')].pos);
      B('head').add(hm);
    }
    // привязки для анимации/всадника
    this.torso = B('torso');
    this.bodyH = this.torso.position.y;
    this.restTorsoY = this.bodyH;
    this.head = B('head');
    this.neckSeg = [B('neck0'), B('neck1')];
    this.tailSeg = [B('tail0'), B('tail1'), B('tail2'), B('tail3')];
    this.ears = [B('earL'), B('earR')];
    this.legs = [];
    for (const [nm, front, sx] of [['L', true, 1], ['R', true, -1], ['L', false, 1], ['R', false, -1]]) {
      const pre = front ? 'F' : 'R';
      const L = { front, sx, up: B(pre + 'U' + nm), mid: B(pre + (front ? 'F' : 'G') + nm), can: B(pre + 'C' + nm), pas: B(pre + 'P' + nm) };
      L.top = L.up; L.low = L.can; L.foot = L.pas;
      L.id = (sx > 0 ? 'L' : 'R') + (front ? 'F' : 'H');
      this.legs.push(L);
    }
    const seat = S.hit(V(...S.W(0, 1.16, 0.0)), V(0, 1, 0), 0).p;
    this.seatLocal = seat.y + (opts.tack ? 0.04 : 0.0);
    this.seatZ = 0.0;
    this.height = S.HP(0.02, 0.2).y;
    this.gait = { w: 0, t: 0, g: 0 };
    this.gaitW = [1, 0, 0, 0]; // стойка, шаг, рысь, галоп
    this.groundOff = 0;
    this.idle = { tail: 0, tailT: 2, earT: [1, 2], ear: [0, 0], shake: 0, shakeT: 6, rest: 0 };
    this._hoof = V(0, 0, 0);
    this._inv = new THREE.Matrix4();
    // смещения копыт (подошва) в системе кости путового сустава
    this.legs.forEach(L => {
      const pb = S.bones[S.boneIdx.get(L.pas.name)].pos;
      L.sole = V(0, -pb.y, (L.front ? 0.075 : 0.07));
      L.toe = V(0, -pb.y, (L.front ? 0.085 : 0.08));
    });
  }

  // позы аллюров: углы суставов для одной ноги
  legPose(L, ph, duty, A, G, out) {
    let a, fold, load;
    if (ph < duty) { const s = ph / duty; a = A * (1 - 2 * s); fold = 0; load = Math.sin(Math.PI * s); }
    else { const s = (ph - duty) / (1 - duty); a = -A + 2 * A * (0.5 - 0.5 * Math.cos(Math.PI * s)); fold = Math.sin(Math.PI * Math.pow(s, 0.75)); load = 0; }
    if (L.front) {
      out.u = -0.3 * a - 0.12 * fold * G;
      out.m = -0.72 * a - 0.32 * fold * G;
      out.c = 1.35 * fold * G;
      const level = -(out.u + out.m + out.c);
      out.p = lerp(level - load * 0.28, 0.75 * fold * G, fold);
    } else {
      out.u = -0.55 * a - 0.28 * fold * G;
      out.m = 0.45 * fold * G - 0.12 * a;
      out.c = -1.0 * fold * G + 0.1 * a;
      const level = -(out.u + out.m + out.c);
      out.p = lerp(level - load * 0.22, 0.7 * fold * G, fold);
    }
    out.stance = fold < 0.05 ? 1 : 0;
    return out;
  }

  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const v = Math.abs(speed);
    const dir = speed < 0 ? -1 : 1;
    // веса аллюров (плавный переход)
    const target = v < 0.25 ? 0 : v < 3.0 ? 1 : v < 7.2 ? 2 : 3;
    for (let i = 0; i < 4; i++) this.gaitW[i] += ((i === target ? 1 : 0) - this.gaitW[i]) * Math.min(1, dt * 5);
    const gw = this.gaitW;
    const freq = gw[1] * (0.55 + v * 0.22) + gw[2] * (1.0 + v * 0.1) + gw[3] * (1.55 + v * 0.045) + gw[0] * 0.6;
    this.phase = (this.phase + dt * freq * dir + 10) % 1;
    const ph = this.phase;
    const moving = 1 - gw[0];
    const air = st.airborne ? 1 : 0;
    const OFF = {
      1: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75 },
      2: { LF: 0, RH: 0, RF: 0.5, LH: 0.5 },
      3: { RH: 0, LH: 0.1, RF: 0.38, LF: 0.48 },
    };
    const DUTY = { 1: 0.62, 2: 0.38, 3: 0.25 };
    const GF = { 1: 0.75, 2: 1.0, 3: 1.15 };
    const tmp = { u: 0, m: 0, c: 0, p: 0, stance: 0 };
    const acc = { u: 0, m: 0, c: 0, p: 0 };
    const idl = this.idle;
    // отставленная задняя нога в покое
    idl.rest += ((gw[0] > 0.9 ? 1 : 0) - idl.rest) * Math.min(1, dt * 0.8);
    for (const L of this.legs) {
      acc.u = acc.m = acc.c = acc.p = 0;
      let stanceW = gw[0];
      for (let g = 1; g <= 3; g++) {
        if (gw[g] < 0.01) continue;
        const A = clamp(Math.max(v, 1.2) * DUTY[g] / (2 * 1.05 * Math.max(0.3, freq)), 0, g === 3 ? 0.65 : g === 2 ? 0.55 : 0.42);
        this.legPose(L, (ph + OFF[g][L.id] + 1) % 1, DUTY[g], A, GF[g], tmp);
        acc.u += tmp.u * gw[g]; acc.m += tmp.m * gw[g]; acc.c += tmp.c * gw[g]; acc.p += tmp.p * gw[g];
        stanceW += tmp.stance * gw[g];
      }
      // поза покоя / прыжка
      if (!L.front && L.sx < 0) { acc.m += idl.rest * 0.12; acc.c -= idl.rest * 0.3; acc.p += idl.rest * 0.75; acc.u -= idl.rest * 0.05; }
      if (air) {
        if (L.front) { acc.u = -0.5; acc.m = -0.6; acc.c = 1.6; acc.p = 0.6; }
        else { acc.u = 0.25; acc.m = 0.5; acc.c = -1.0; acc.p = 0.5; }
      }
      // плавное сглаживание
      const k = Math.min(1, dt * 18);
      L.up.rotation.x += (acc.u - L.up.rotation.x) * k;
      L.mid.rotation.x += (acc.m - L.mid.rotation.x) * k;
      L.can.rotation.x += (acc.c - L.can.rotation.x) * k;
      L.pas.rotation.x += (acc.p - L.pas.rotation.x) * k;
      L.stanceW = stanceW;
    }
    // корпус: тангаж/крен по аллюрам
    const t = this.time;
    const ph2 = ph * Math.PI * 2;
    const pitch = gw[3] * Math.sin(ph2 + 0.9) * 0.075 + gw[2] * Math.sin(ph2 * 2) * 0.012 + (air ? -0.12 : 0);
    const roll = gw[1] * Math.sin(ph2) * 0.025 + gw[0] * idl.rest * 0.03;
    this.torso.rotation.x = pitch;
    this.torso.rotation.z = roll;
    // дыхание
    const breath = Math.sin(t * (1.6 + moving * 3)) * (0.008 + moving * 0.01);
    this.torso.scale.set(1 + breath, 1 + breath * 0.6, 1);
    // высота корпуса: опорные копыта на земле
    this.torso.position.y = this.restTorsoY + this.groundOff;
    this.root.updateMatrixWorld(true);
    this._inv.copy(this.root.matrixWorld).invert();
    let minY = 1e9, any = false;
    for (const L of this.legs) {
      if (L.stanceW < 0.5) continue;
      const h = this._hoof.copy(L.sole).applyMatrix4(L.pas.matrixWorld).applyMatrix4(this._inv);
      const h2 = V(0, 0, 0).copy(L.toe).applyMatrix4(L.pas.matrixWorld).applyMatrix4(this._inv);
      minY = Math.min(minY, h.y, h2.y); any = true;
    }
    let goal = any ? this.groundOff - minY : this.groundOff + (gw[3] > 0.5 ? 0.02 : 0);
    goal = clamp(goal, -0.25, 0.12);
    if (air) goal = 0;
    this.groundOff += (goal - this.groundOff) * Math.min(1, dt * (any ? 14 : 3));
    this.torso.position.y = this.restTorsoY + this.groundOff;
    // шея и голова
    const nod = gw[1] * Math.sin(ph2 * 2 + 0.6) * 0.06 + gw[3] * Math.sin(ph2 + 2.6) * 0.16 + gw[2] * Math.sin(ph2 * 2) * 0.02;
    idl.shakeT -= dt;
    if (idl.shakeT < 0 && gw[0] > 0.9) { idl.shake = 1; idl.shakeT = 7 + Math.random() * 9; }
    idl.shake = Math.max(0, idl.shake - dt * 0.9);
    const shakeA = idl.shake > 0 ? Math.sin(idl.shake * 22) * idl.shake * 0.25 : 0;
    let neckX = gw[0] * (0.05 + Math.sin(t * 0.45) * 0.05) + gw[3] * 0.22 + gw[2] * 0.08 + nod - pitch * 0.8;
    let headX = gw[0] * Math.sin(t * 0.6 + 1) * 0.04 + gw[3] * 0.1 + (air ? -0.15 : 0);
    if (this.action) { // встать на дыбы (атака)
      const s = Math.sin(this.actionT * Math.PI);
      this.torso.rotation.x -= s * 0.45; neckX -= s * 0.3; this.torso.position.y += s * 0.25;
    }
    this.neckSeg[0].rotation.x = neckX * 0.6;
    this.neckSeg[1].rotation.x = neckX * 0.4;
    this.neckSeg[0].rotation.y = shakeA * 0.4 + Math.sin(t * 0.3) * 0.05 * gw[0];
    this.neckSeg[1].rotation.z = shakeA;
    this.head.rotation.x = headX;
    // уши: прядают
    for (let i = 0; i < 2; i++) {
      idl.earT[i] -= dt;
      if (idl.earT[i] < 0) { idl.ear[i] = (Math.random() - 0.3) * 0.9; idl.earT[i] = 1 + Math.random() * 4; }
      const ear = this.ears[i];
      const back = gw[3] * 0.5;
      ear.rotation.x += ((idl.ear[i] * 0.5 + back) - ear.rotation.x) * Math.min(1, dt * 6);
      ear.rotation.y += ((i ? -1 : 1) * idl.ear[i] * 0.6 - ear.rotation.y) * Math.min(1, dt * 6);
    }
    // хвост: взмахи, на галопе — по ветру
    idl.tailT -= dt;
    if (idl.tailT < 0) { idl.tail = 1; idl.tailT = 2 + Math.random() * 5; }
    idl.tail = Math.max(0, idl.tail - dt * 0.8);
    const swish = Math.sin(idl.tail * 14) * idl.tail * 0.5;
    const lift = gw[3] * 0.85 + gw[2] * 0.35 + gw[1] * 0.1 + air * 0.6;
    this.tailSeg[0].rotation.x = 0.04 + lift * 0.85;
    this.tailSeg[1].rotation.x = -lift * 0.12;
    this.tailSeg[2].rotation.x = -lift * 0.18 + Math.sin(t * 9) * 0.06 * lift;
    this.tailSeg[3].rotation.x = -lift * 0.12 + Math.sin(t * 11 + 1) * 0.08 * lift;
    this.tailSeg.forEach((s, i) => { s.rotation.y = swish * (0.4 + i * 0.25) + Math.sin(t * 1.3 + i) * 0.04 + (lift > 0.2 ? Math.sin(t * 7 + i * 0.8) * 0.06 * lift : 0); });
  }

  // для всадника: высота седла с учётом покачивания
  seatOffset() { return this.groundOff; }
}

// ---------- Ездовые животные героев ----------
export const MOUNTS = {
  dwarf: { name: 'Боевой тяжеловоз', variant: 'pony', coat: 'chestnut', scale: 0.92, feather: true, maneLen: 0.42, tack: { cloth: '#2d4f8a', trim: '#c9a640', armor: '#7a8290', leather: '#3a2214', caparison: true, bags: true } },
  warrior: { name: 'Боевой конь', coat: 'black', scale: 1.03, maneLen: 0.42, tack: { cloth: '#7a1414', trim: '#d4a640', armor: '#7c818a', leather: '#2a1a10', caparison: true } },
  archer: { name: 'Лесной скакун', coat: 'bay', scale: 0.98, maneLen: 0.34, tack: { cloth: '#3a5a2a', trim: '#b08a3a', leather: '#5a3418', bags: true } },
  mage: { name: 'Белый единорог', coat: 'grey', scale: 1.0, maneLen: 0.46, horn: '#e8e0ff', maneGlow: '#4060a0', tack: { cloth: '#1f2c72', trim: '#e0e8ff', trimCloth: '#c8d2f0', leather: '#e8e4dc', glow: '#80c0ff', caparison: true } },
  necro: { name: 'Конь-призрак', coat: 'ghost', scale: 1.0, maneLen: 0.4, glow: '#40ff90', maneGlow: '#18a050', coatGlow: '#103020', demonHorns: true, tack: { cloth: '#141a14', trim: '#6aa080', leather: '#1a1a1a', armor: '#2a2c30', armorGlow: '#40ff90', glow: '#40ff90', caparison: true } },
};

export function buildMount(cls) {
  const M = MOUNTS[cls] || MOUNTS.warrior;
  const h = new Horse({
    variant: M.variant, coat: COATS[M.coat], tack: M.tack, tackKey: cls, feather: M.feather, maneLen: M.maneLen,
    horn: M.horn, glow: M.glow, maneGlow: M.maneGlow, coatGlow: M.coatGlow, demonHorns: M.demonHorns,
  });
  h.root.scale.setScalar(M.scale);
  h.mountName = M.name;
  h.seatY = h.seatLocal * M.scale;
  h.update(0.016, { speed: 0 });
  return h;
}

// Заранее построить геометрию (во время призыва)
export function prepareMount(cls) {
  const M = MOUNTS[cls] || MOUNTS.warrior;
  buildShape(M.variant || 'horse');
}

// Лошадь как моб/НПС (окрас по описанию)
export function horseFromDef(def) {
  const coat = { ...COATS.bay, coat: def.fur || COATS.bay.coat, belly: def.belly || def.fur2 || def.fur || COATS.bay.belly, mane: def.mane || '#1a120c', points: def.fur2 || null };
  return new Horse({ coat, maneLen: 0.36 });
}
