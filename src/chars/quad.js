// Четвероногие звери (волк, медведь, кабан): цельное тело, вылепленное по анатомии (SDF),
// скелет со скиннингом и та же система аллюров, что у лошади. Окрас по зонам
// (седловина, светлое брюхо, тёмные уши и кончик хвоста), объёмная шерсть
// из слоёв-оболочек с разной длиной ворса по телу.
import * as THREE from 'three';
import { Creature } from './creature_base.js';
import { Sculpt } from './sdf.js';
import { Horse } from './horse.js';
import { IS_PHONE, IS_TOUCH } from '../core/device.js';
import { clamp, lerp } from '../core/util.js';
import { furLOD } from './beasts.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- Анатомия ----------
// Кости названы как у лошади — работают её аллюры (шаг, рысь, галоп с постановкой лап).
function legBones(S, f, r) {
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    S.bone('FU' + s, [sx * f[0][0], f[0][1], f[0][2]], 'torso');
    S.bone('FF' + s, [sx * f[1][0], f[1][1], f[1][2]], 'FU' + s);
    S.bone('FC' + s, [sx * f[2][0], f[2][1], f[2][2]], 'FF' + s);
    S.bone('FP' + s, [sx * f[3][0], f[3][1], f[3][2]], 'FC' + s);
    S.bone('RU' + s, [sx * r[0][0], r[0][1], r[0][2]], 'torso');
    S.bone('RG' + s, [sx * r[1][0], r[1][1], r[1][2]], 'RU' + s);
    S.bone('RC' + s, [sx * r[2][0], r[2][1], r[2][2]], 'RG' + s);
    S.bone('RP' + s, [sx * r[3][0], r[3][1], r[3][2]], 'RC' + s);
  }
}

function wolfAnatomy() {
  const S = new Sculpt();
  const E = (c, r, o) => S.ell(c, r, o), C = (a, b, r1, r2, o) => S.cone(a, b, r1, r2, o);
  // голова держится на уровне холки: всё, что на голове, сдвигаем вниз и чуть назад
  const hp = (p) => [p[0], p[1] - 0.075, p[2] - 0.02];
  const HE = (c, r, o) => S.ell(hp(c), r, o), HC = (a, b, r1, r2, o) => S.cone(hp(a), hp(b), r1, r2, o);
  S.bone('torso', [0, 0.6, 0]);
  S.bone('neck0', [0, 0.72, 0.4], 'torso');
  S.bone('neck1', [0, 0.77, 0.5], 'neck0');
  S.bone('head', hp([0, 0.86, 0.58]), 'neck1');
  S.bone('jaw', hp([0, 0.835, 0.64]), 'head');
  for (const sx of [1, -1]) S.bone('ear' + (sx > 0 ? 'L' : 'R'), hp([sx * 0.045, 0.925, 0.6]), 'head');
  S.bone('tail0', [0, 0.69, -0.44], 'torso');
  S.bone('tail1', [0, 0.61, -0.52], 'tail0');
  S.bone('tail2', [0, 0.49, -0.56], 'tail1');
  S.bone('tail3', [0, 0.37, -0.58], 'tail2');
  legBones(S,
    [[0.085, 0.62, 0.36], [0.085, 0.43, 0.31], [0.07, 0.15, 0.35], [0.07, 0.065, 0.37]],
    [[0.08, 0.64, -0.34], [0.095, 0.45, -0.22], [0.075, 0.2, -0.42], [0.075, 0.065, -0.39]]);
  const T = { bone: 'torso' };
  // корпус: глубокая узкая грудь, подтянутый живот, длинная спина
  E([0, 0.585, 0.17], [0.118, 0.17, 0.26], { ...T, k: 0.08, tag: 'body' });         // грудная клетка
  E([0, 0.5, 0.36], [0.085, 0.11, 0.1], { ...T, k: 0.07, tag: 'chest' });           // грудь
  C([0, 0.73, 0.06], [0, 0.755, 0.34], 0.06, 0.068, { ...T, k: 0.07, sq: 0.7 });   // холка
  E([0, 0.63, -0.15], [0.09, 0.098, 0.21], { ...T, k: 0.08 });                      // поясница, подрыв живота
  E([0, 0.65, -0.34], [0.1, 0.1, 0.13], { ...T, k: 0.08 });                         // круп
  for (const sx of [1, -1]) {
    C([sx * 0.07, 0.745, 0.22], [sx * 0.09, 0.6, 0.38], 0.045, 0.055, { ...T, k: 0.05, sq: 0.6 }); // лопатка
    E([sx * 0.1, 0.58, 0.1], [0.04, 0.12, 0.18], { ...T, k: 0.08 });                // рёбра
  }
  // шея: короткая, мощная, с «гривой»
  C([0, 0.64, 0.32], [0, 0.775, 0.52], 0.11, 0.082, { bone: 'neck0', k: 0.08, tag: 'ruff' });
  HC([0, 0.85, 0.54], [0, 0.865, 0.6], 0.08, 0.07, { bone: 'neck1', k: 0.06, tag: 'ruff' });
  C([0, 0.55, 0.42], [0, 0.7, 0.58], 0.07, 0.052, { bone: 'neck0', k: 0.06, tag: 'throat' });
  // голова
  const H = { bone: 'head' };
  HE([0, 0.885, 0.615], [0.076, 0.068, 0.085], { ...H, k: 0.04 });                  // черепная коробка
  HC([0, 0.915, 0.57], [0, 0.905, 0.66], 0.012, 0.01, { ...H, k: 0.03 });           // сагиттальный гребень
  for (const sx of [1, -1]) {
    HE([sx * 0.058, 0.853, 0.655], [0.04, 0.045, 0.058], { ...H, k: 0.035, tag: 'cheek' });
    HE([sx * 0.032, 0.9, 0.69], [0.026, 0.02, 0.03], { ...H, k: 0.025 });
  }
  HC([0, 0.875, 0.68], [0, 0.85, 0.815], 0.042, 0.027, { ...H, k: 0.035, sq: 0.95, tag: 'muzzle' });
  HE([0, 0.853, 0.82], [0.022, 0.019, 0.017], { ...H, k: 0.012, tag: 'nose' });
  HC([0, 0.83, 0.67], [0, 0.825, 0.805], 0.034, 0.022, { bone: 'jaw', k: 0.025, tag: 'jaw' });
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    HC([sx * 0.047, 0.915, 0.6], [sx * 0.07, 1.02, 0.585], 0.05, 0.006, { bone: 'ear' + s, k: 0.022, sq: 0.42, q: [0, 0, 1], tag: 'ear' });
    HC([sx * 0.05, 0.935, 0.609], [sx * 0.066, 1.0, 0.598], 0.032, 0.004, { k: 0.006, sq: 0.5, q: [0, 0, 1], sub: true });
    HE([sx * 0.045, 0.895, 0.703], [0.014, 0.01, 0.012], { sub: true, k: 0.008 });
    HE([sx * 0.009, 0.857, 0.835], [0.006, 0.006, 0.01], { sub: true, k: 0.004 });
  }
  // хвост: пушистый, висит до скакательных суставов
  C([0, 0.69, -0.42], [0, 0.61, -0.52], 0.032, 0.046, { bone: 'tail0', k: 0.04, tag: 'tail' });
  C([0, 0.61, -0.52], [0, 0.49, -0.56], 0.046, 0.05, { bone: 'tail1', k: 0.04, tag: 'tail' });
  C([0, 0.49, -0.56], [0, 0.37, -0.58], 0.05, 0.042, { bone: 'tail2', k: 0.04, tag: 'tail' });
  C([0, 0.37, -0.58], [0, 0.3, -0.575], 0.042, 0.012, { bone: 'tail3', k: 0.03, tag: 'tailtip' });
  // ноги
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    C([sx * 0.088, 0.61, 0.36], [sx * 0.085, 0.44, 0.31], 0.052, 0.042, { bone: 'FU' + s, k: 0.05 });
    E([sx * 0.088, 0.51, 0.29], [0.04, 0.08, 0.05], { bone: 'FU' + s, k: 0.05 });
    C([sx * 0.085, 0.43, 0.31], [sx * 0.072, 0.16, 0.345], 0.034, 0.02, { bone: 'FF' + s, k: 0.03, tag: 'leg' });
    E([sx * 0.07, 0.15, 0.35], [0.02, 0.024, 0.022], { bone: 'FC' + s, k: 0.02, tag: 'leg' });
    C([sx * 0.07, 0.15, 0.352], [sx * 0.07, 0.06, 0.372], 0.019, 0.021, { bone: 'FC' + s, k: 0.02, tag: 'leg' });
    E([sx * 0.07, 0.026, 0.395], [0.03, 0.024, 0.042], { bone: 'FP' + s, k: 0.02, floor: 0, tag: 'paw' });
    for (const tx of [-1, 1]) E([sx * 0.07 + tx * 0.014, 0.018, 0.425], [0.012, 0.014, 0.014], { bone: 'FP' + s, k: 0.008, tag: 'paw' });
    E([sx * 0.08, 0.54, -0.32], [0.058, 0.12, 0.095], { bone: 'RU' + s, k: 0.06 });
    C([sx * 0.085, 0.63, -0.34], [sx * 0.095, 0.45, -0.22], 0.065, 0.045, { bone: 'RU' + s, k: 0.05 });
    C([sx * 0.095, 0.45, -0.22], [sx * 0.075, 0.2, -0.42], 0.038, 0.022, { bone: 'RG' + s, k: 0.03, tag: 'leg' });
    E([sx * 0.085, 0.37, -0.3], [0.03, 0.06, 0.04], { bone: 'RG' + s, k: 0.03, tag: 'leg' });
    E([sx * 0.075, 0.2, -0.425], [0.018, 0.026, 0.028], { bone: 'RC' + s, k: 0.016, tag: 'leg' });
    C([sx * 0.075, 0.2, -0.422], [sx * 0.075, 0.06, -0.392], 0.02, 0.02, { bone: 'RC' + s, k: 0.02, tag: 'leg' });
    E([sx * 0.075, 0.026, -0.365], [0.028, 0.023, 0.04], { bone: 'RP' + s, k: 0.02, floor: 0, tag: 'paw' });
    for (const tx of [-1, 1]) E([sx * 0.075 + tx * 0.013, 0.018, -0.338], [0.011, 0.013, 0.013], { bone: 'RP' + s, k: 0.008, tag: 'paw' });
  }
  S.prims.sort((a, b) => (a.sub ? 1 : 0) - (b.sub ? 1 : 0));
  S.bounds = [-0.2, -0.01, -0.64, 0.2, 0.99, 0.86];
  S.eyes = { pos: hp([0.044, 0.896, 0.698]), r: 0.012 };
  S.teeth = { up: hp([0, 0.84, 0.79]), lo: hp([0, 0.826, 0.775]) };
  S.soleZ = { front: 0.03, rear: 0.03 };
  S.gaitScale = 0.48;
  S.fur = (p, tag) => {
    if (tag === 'nose' || tag === 'paw') return 0.002;
    if (tag === 'ruff') return 0.05;
    if (tag === 'tail' || tag === 'tailtip') return 0.055;
    if (tag === 'leg') return 0.012;
    if (tag === 'muzzle' || tag === 'jaw') return 0.008;
    if (tag === 'ear') return 0.01;
    if (tag === 'cheek') return 0.03;
    return p.y > 0.66 ? 0.035 : 0.026;
  };
  return S;
}

function bearAnatomy() {
  const S = new Sculpt();
  const E = (c, r, o) => S.ell(c, r, o), C = (a, b, r1, r2, o) => S.cone(a, b, r1, r2, o);
  // голова крупнее (×1.25 от центра) и ниже — медведь держит её у линии плеч
  const HC0 = [0, 0.98, 0.8], HK = 1.25;
  const hp = (p) => [HC0[0] + (p[0] - HC0[0]) * HK, HC0[1] + (p[1] - HC0[1]) * HK - 0.08, HC0[2] + (p[2] - HC0[2]) * HK - 0.02];
  const HE = (c, r, o) => S.ell(hp(c), r.map(v => v * HK), o), HCn = (a, b, r1, r2, o) => S.cone(hp(a), hp(b), r1 * HK, r2 * HK, o);
  S.bone('torso', [0, 0.92, 0]);
  S.bone('neck0', [0, 1.0, 0.5], 'torso');
  S.bone('neck1', [0, 1.0, 0.66], 'neck0');
  S.bone('head', hp([0, 0.98, 0.8]), 'neck1');
  S.bone('jaw', hp([0, 0.92, 0.9]), 'head');
  for (const sx of [1, -1]) S.bone('ear' + (sx > 0 ? 'L' : 'R'), hp([sx * 0.11, 1.12, 0.8]), 'head');
  S.bone('tail0', [0, 0.98, -0.66], 'torso');
  S.bone('tail1', [0, 0.94, -0.7], 'tail0');
  S.bone('tail2', [0, 0.9, -0.72], 'tail1');
  S.bone('tail3', [0, 0.86, -0.73], 'tail2');
  legBones(S,
    [[0.2, 0.92, 0.42], [0.2, 0.6, 0.38], [0.19, 0.18, 0.42], [0.19, 0.08, 0.46]],
    [[0.2, 0.95, -0.5], [0.22, 0.62, -0.38], [0.2, 0.22, -0.56], [0.2, 0.08, -0.48]]);
  const T = { bone: 'torso' };
  E([0, 0.93, 0.04], [0.35, 0.37, 0.5], { ...T, k: 0.15, tag: 'body' });           // массивная бочка
  E([0, 1.15, 0.3], [0.28, 0.22, 0.27], { ...T, k: 0.14, tag: 'ruff' });             // горб (мышцы плеч)
  E([0, 0.98, -0.4], [0.3, 0.31, 0.29], { ...T, k: 0.14 });                          // круп
  E([0, 0.72, 0.0], [0.27, 0.2, 0.42], { ...T, k: 0.14, tag: 'belly' });             // провисшее брюхо
  for (const sx of [1, -1]) {
    E([sx * 0.2, 0.92, 0.38], [0.14, 0.24, 0.2], { ...T, k: 0.1 });                   // плечи
    E([sx * 0.2, 0.9, -0.5], [0.14, 0.24, 0.22], { ...T, k: 0.1 });                   // бёдра
  }
  C([0, 0.98, 0.4], hp([0, 1.0, 0.72]), 0.27, 0.22, { bone: 'neck0', k: 0.12, tag: 'ruff' });
  HCn([0, 1.0, 0.72], [0, 0.99, 0.8], 0.17, 0.14, { bone: 'neck1', k: 0.1 });
  const H = { bone: 'head' };
  HE([0, 1.02, 0.82], [0.16, 0.15, 0.15], { ...H, k: 0.07 });                          // широкий лоб
  for (const sx of [1, -1]) HE([sx * 0.1, 0.97, 0.84], [0.08, 0.09, 0.1], { ...H, k: 0.06, tag: 'cheek' });
  HCn([0, 0.98, 0.9], [0, 0.94, 1.05], 0.085, 0.06, { ...H, k: 0.05, tag: 'muzzle' }); // морда
  HE([0, 0.95, 1.06], [0.04, 0.032, 0.028], { ...H, k: 0.02, tag: 'nose' });
  HCn([0, 0.9, 0.9], [0, 0.89, 1.02], 0.06, 0.04, { bone: 'jaw', k: 0.04, tag: 'jaw' });
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    HE([sx * 0.115, 1.14, 0.79], [0.045, 0.045, 0.022], { bone: 'ear' + s, k: 0.03, tag: 'ear' });
    HE([sx * 0.065, 1.03, 0.94], [0.018, 0.014, 0.016], { sub: true, k: 0.01 });
    HE([sx * 0.016, 0.955, 1.083], [0.009, 0.008, 0.01], { sub: true, k: 0.005 });
  }
  E([0, 0.96, -0.72], [0.06, 0.05, 0.05], { bone: 'tail0', k: 0.04, tag: 'tail' });
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    C([sx * 0.2, 0.92, 0.42], [sx * 0.2, 0.6, 0.38], 0.15, 0.12, { bone: 'FU' + s, k: 0.08 });
    C([sx * 0.2, 0.6, 0.38], [sx * 0.19, 0.18, 0.42], 0.11, 0.085, { bone: 'FF' + s, k: 0.06, tag: 'leg' });
    E([sx * 0.19, 0.12, 0.44], [0.085, 0.08, 0.09], { bone: 'FC' + s, k: 0.05, tag: 'leg' });
    E([sx * 0.19, 0.045, 0.5], [0.1, 0.05, 0.13], { bone: 'FP' + s, k: 0.04, floor: 0, tag: 'paw' });
    for (let t = -2; t <= 2; t++) C([sx * 0.19 + t * 0.035, 0.05, 0.6], [sx * 0.19 + t * 0.037, 0.012, 0.66], 0.012, 0.004, { bone: 'FP' + s, k: 0.004, tag: 'claw' });
    E([sx * 0.2, 0.82, -0.48], [0.15, 0.26, 0.2], { bone: 'RU' + s, k: 0.1 });
    C([sx * 0.22, 0.62, -0.38], [sx * 0.2, 0.22, -0.56], 0.12, 0.085, { bone: 'RG' + s, k: 0.06, tag: 'leg' });
    E([sx * 0.2, 0.16, -0.54], [0.085, 0.09, 0.09], { bone: 'RC' + s, k: 0.05, tag: 'leg' });
    E([sx * 0.2, 0.045, -0.44], [0.095, 0.05, 0.16], { bone: 'RP' + s, k: 0.04, floor: 0, tag: 'paw' });
  }
  S.prims.sort((a, b) => (a.sub ? 1 : 0) - (b.sub ? 1 : 0));
  S.bounds = [-0.5, -0.01, -0.9, 0.5, 1.4, 1.2];
  S.eyes = { pos: hp([0.068, 1.035, 0.945]), r: 0.02 };
  S.teeth = { up: hp([0, 0.93, 1.03]), lo: hp([0, 0.9, 1.0]) };
  S.soleZ = { front: 0.06, rear: 0.06 };
  S.gaitScale = 0.65;
  S.fur = (p, tag) => tag === 'nose' || tag === 'paw' || tag === 'claw' ? 0.002 : tag === 'muzzle' || tag === 'jaw' ? 0.012 : tag === 'ear' ? 0.02 : tag === 'leg' ? 0.05 : tag === 'ruff' ? 0.08 : 0.065;
  return S;
}

function boarAnatomy() {
  const S = new Sculpt();
  const E = (c, r, o) => S.ell(c, r, o), C = (a, b, r1, r2, o) => S.cone(a, b, r1, r2, o);
  S.bone('torso', [0, 0.56, 0]);
  S.bone('neck0', [0, 0.62, 0.38], 'torso');
  S.bone('neck1', [0, 0.58, 0.48], 'neck0');
  S.bone('head', [0, 0.54, 0.56], 'neck1');
  S.bone('jaw', [0, 0.45, 0.64], 'head');
  for (const sx of [1, -1]) S.bone('ear' + (sx > 0 ? 'L' : 'R'), [sx * 0.08, 0.68, 0.56], 'head');
  S.bone('tail0', [0, 0.62, -0.44], 'torso');
  S.bone('tail1', [0, 0.56, -0.47], 'tail0');
  S.bone('tail2', [0, 0.48, -0.48], 'tail1');
  S.bone('tail3', [0, 0.42, -0.48], 'tail2');
  legBones(S,
    [[0.12, 0.5, 0.3], [0.12, 0.32, 0.27], [0.11, 0.12, 0.29], [0.11, 0.055, 0.3]],
    [[0.12, 0.52, -0.32], [0.13, 0.33, -0.24], [0.11, 0.14, -0.36], [0.11, 0.055, -0.33]]);
  const T = { bone: 'torso' };
  // клиновидное тело: высокая мощная холка, лёгкий зад
  E([0, 0.56, 0.12], [0.2, 0.25, 0.36], { ...T, k: 0.12, tag: 'body' });
  E([0, 0.66, 0.24], [0.15, 0.17, 0.22], { ...T, k: 0.1, tag: 'ruff' });             // холка с гривой-щетиной
  E([0, 0.54, -0.28], [0.16, 0.19, 0.2], { ...T, k: 0.1 });
  E([0, 0.43, 0.0], [0.14, 0.12, 0.3], { ...T, k: 0.1, tag: 'belly' });
  C([0, 0.58, 0.32], [0, 0.56, 0.5], 0.19, 0.15, { bone: 'neck0', k: 0.1, tag: 'ruff' });
  const H = { bone: 'head' };
  E([0, 0.58, 0.56], [0.12, 0.13, 0.14], { ...H, k: 0.06 });
  C([0, 0.56, 0.6], [0, 0.48, 0.82], 0.1, 0.055, { ...H, k: 0.05, tag: 'muzzle' }); // длинное рыло
  for (const sx of [1, -1]) E([sx * 0.07, 0.5, 0.64], [0.06, 0.06, 0.08], { ...H, k: 0.05, tag: 'cheek' });
  C([0, 0.48, 0.81], [0, 0.465, 0.86], 0.06, 0.06, { ...H, k: 0.01, sq: 0.8, q: [1, 0, 0], tag: 'nose' }); // пятачок
  C([0, 0.45, 0.64], [0, 0.44, 0.78], 0.05, 0.03, { bone: 'jaw', k: 0.03, tag: 'jaw' });
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    C([sx * 0.07, 0.66, 0.55], [sx * 0.12, 0.76, 0.52], 0.04, 0.008, { bone: 'ear' + s, k: 0.02, sq: 0.4, q: [0, 0, 1], tag: 'ear' });
    E([sx * 0.06, 0.6, 0.67], [0.013, 0.011, 0.012], { sub: true, k: 0.006 });
    E([sx * 0.02, 0.468, 0.865], [0.01, 0.012, 0.012], { sub: true, k: 0.004 });
  }
  C([0, 0.6, -0.44], [0, 0.45, -0.48], 0.015, 0.008, { bone: 'tail0', k: 0.01, tag: 'tail' });
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    E([sx * 0.12, 0.44, 0.27], [0.07, 0.12, 0.08], { bone: 'FU' + s, k: 0.06 });
    C([sx * 0.12, 0.32, 0.27], [sx * 0.11, 0.12, 0.29], 0.04, 0.025, { bone: 'FF' + s, k: 0.03, tag: 'leg' });
    C([sx * 0.11, 0.12, 0.29], [sx * 0.11, 0.05, 0.31], 0.024, 0.022, { bone: 'FC' + s, k: 0.02, tag: 'leg' });
    for (const tx of [-1, 1]) C([sx * 0.11 + tx * 0.012, 0.05, 0.31], [sx * 0.11 + tx * 0.015, 0.0, 0.33], 0.016, 0.012, { bone: 'FP' + s, k: 0.004, floor: 0, tag: 'hoof' });
    E([sx * 0.12, 0.45, -0.3], [0.075, 0.14, 0.11], { bone: 'RU' + s, k: 0.06 });
    C([sx * 0.13, 0.33, -0.24], [sx * 0.11, 0.14, -0.36], 0.045, 0.024, { bone: 'RG' + s, k: 0.03, tag: 'leg' });
    C([sx * 0.11, 0.14, -0.36], [sx * 0.11, 0.05, -0.33], 0.024, 0.022, { bone: 'RC' + s, k: 0.02, tag: 'leg' });
    for (const tx of [-1, 1]) C([sx * 0.11 + tx * 0.012, 0.05, -0.33], [sx * 0.11 + tx * 0.015, 0.0, -0.31], 0.016, 0.012, { bone: 'RP' + s, k: 0.004, floor: 0, tag: 'hoof' });
  }
  S.prims.sort((a, b) => (a.sub ? 1 : 0) - (b.sub ? 1 : 0));
  S.bounds = [-0.3, -0.01, -0.62, 0.3, 0.86, 0.92];
  S.eyes = { pos: [0.07, 0.605, 0.66], r: 0.011 };
  S.soleZ = { front: 0.02, rear: 0.02 };
  S.gaitScale = 0.38;
  S.tusks = true;
  S.fur = (p, tag) => tag === 'nose' || tag === 'hoof' ? 0.0 : tag === 'ruff' ? 0.06 : tag === 'muzzle' || tag === 'jaw' ? 0.01 : tag === 'leg' ? 0.012 : tag === 'ear' ? 0.012 : 0.028;
  return S;
}

const ANATOMY = { wolf: wolfAnatomy, bear: bearAnatomy, boar: boarAnatomy };

// ---------- Полигонизация и данные вершин ----------
const shapeCache = new Map();
export function buildQuadShape(kind) {
  if (shapeCache.has(kind)) return shapeCache.get(kind);
  const S = ANATOMY[kind]();
  const sizeK = (S.bounds[4] - S.bounds[1]);
  const h = sizeK * (IS_PHONE ? 0.016 : IS_TOUCH ? 0.013 : 0.0105);
  const M = S.mesh(h, S.bounds);
  const position = Float32Array.from(M.position), normal = Float32Array.from(M.normal), index = Uint32Array.from(M.index);
  const nv = position.length / 3;
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
  const ao = new Float32Array(nv), tags = new Array(nv), fur = new Float32Array(nv);
  const p = V(0, 0, 0), n = V(0, 0, 0);
  const sig = 0.016 * sizeK;
  for (let i = 0; i < nv; i++) {
    p.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    n.set(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    S.focus(p.x, p.y, p.z, 0.1 * sizeK);
    const w = S.weightsAt(p.x, p.y, p.z, sig);
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = w.idx[k]; skinWeight[i * 4 + k] = w.wt[k]; }
    // тег ближайшего примитива
    let best = 1e9, tag = null;
    for (const pr of S._list || S.prims) {
      if (pr.sub) continue;
      const d = Sculpt.dist(pr, p.x, p.y, p.z);
      if (d < best) { best = d; tag = pr.tag; }
    }
    tags[i] = tag;
    S.focus(p.x, p.y, p.z, 0.2 * sizeK);
    ao[i] = S.ao(p, n);
    S.unfocus();
    fur[i] = S.fur(p, tag);
  }
  const shape = { S, kind, position, normal, index, skinIndex, skinWeight, ao, tags, fur, nv };
  shapeCache.set(kind, shape);
  return shape;
}

// Окрас по зонам
function paint(shape, def) {
  const { position: P, normal: N, tags, ao, nv, kind } = shape;
  const col = new Float32Array(nv * 3);
  const c1 = new THREE.Color(def.fur || '#777'), c2 = new THREE.Color(def.fur2 || def.fur || '#aaa'), cb = new THREE.Color(def.belly || def.fur2 || '#bbb');
  const dark = c1.clone().multiplyScalar(0.42), nose = new THREE.Color('#141110'), pad = new THREE.Color('#231d19');
  const c = new THREE.Color();
  const mix = (a, t) => { c.r += (a.r - c.r) * t; c.g += (a.g - c.g) * t; c.b += (a.b - c.b) * t; };
  for (let i = 0; i < nv; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    const tag = tags[i];
    c.copy(c1);
    // агути: лёгкие полосы и пятна
    const nn = Math.sin(x * 61 + z * 13) * Math.sin(y * 47 - z * 29) * 0.5 + Math.sin(x * 23 - y * 17 + z * 37) * 0.5;
    if (kind === 'wolf') {
      mix(cb, sst(0.0, -0.5, ny) * 0.85);                         // светлое брюхо и низ шеи
      if (tag === 'throat' || tag === 'chest') mix(c2, 0.75);
      if (tag === 'cheek') mix(c2, sst(0.2, -0.4, ny) * 0.9);
      if (tag === 'jaw') mix(c2, 0.85);
      if (tag === 'muzzle') { mix(c2, sst(0.1, -0.6, ny) * 0.8); mix(dark, sst(0.5, 0.9, ny) * 0.5); }
      if (tag === 'leg' || tag === 'paw') mix(c2, sst(0.3, 0.06, y) * 0.4);
      mix(dark, sst(0.45, 0.85, ny) * sst(0.64, 0.74, y) * 0.55); // тёмная седловина
      if (tag === 'ear') mix(dark, sst(0.88, 0.94, y) * 0.8 + (nz < -0.2 ? 0.4 : 0));
      if (tag === 'tailtip') mix(dark, 0.85);
      if (tag === 'tail') mix(dark, sst(0.2, 0.8, ny) * 0.45);
    } else if (kind === 'bear') {
      if (tag === 'muzzle' || tag === 'jaw') mix(c2, 0.55);
      mix(cb, sst(0.0, -0.6, ny) * 0.4);
      mix(dark, sst(0.4, 0.05, y) * 0.5);                           // тёмные лапы
      if (tag === 'claw') c.set('#d8cfbf');
    } else {
      mix(dark, sst(0.4, 0.9, ny) * 0.35);
      if (tag === 'ruff') mix(c2, 0.4);
      if (tag === 'muzzle') mix(c2, 0.3);
      if (tag === 'leg' || tag === 'hoof') mix(dark, 0.4);
      if (tag === 'hoof') c.set('#2a221c');
    }
    if (tag === 'nose') c.copy(nose);
    if (tag === 'paw') { const sole = sst(0.02, 0.0, y); c.lerp(pad, sole * 0.9); }
    c.multiplyScalar(1 + nn * 0.08);
    const a = 0.45 + 0.55 * ao[i];
    col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a;
  }
  return col;
}

// ---------- Материалы ----------
const matCache = new Map();
function skinMatQ() {
  if (matCache.has('base')) return matCache.get('base');
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  matCache.set('base', m);
  return m;
}
// Слой шерсти: смещение по нормали (до скиннинга), прочёсанность назад и провис,
// узор ворсинок по устойчивой координате поверхности
function shellMat(k, combDir) {
  const key = 'shell' + k.toFixed(3);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uK = { value: k };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uK; attribute float aFur; varying vec3 vBase; varying float vFurL;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBase = position; vFurL = aFur;
        float L = aFur * uK;
        transformed += normal * L;
        transformed.z -= L * 0.55 * ${combDir.toFixed(2)};
        transformed.y -= uK * uK * aFur * 0.6;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uK; varying vec3 vBase; varying float vFurL;
        float hsh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFurL < 0.003) discard;
        // ворсинка: клетка поверхности, радиус убывает к кончику
        vec3 q = vBase * 260.0;
        vec3 cell = floor(q);
        float h = hsh(cell);
        vec3 f = fract(q) - 0.5 - (vec3(hsh(cell + 1.3), hsh(cell + 2.7), hsh(cell + 4.1)) - 0.5) * 0.5;
        float r = (1.0 - uK) * 0.55;
        if (dot(f, f) > r * r || h < uK * 0.6) discard;
        // у основания темнее (подшёрсток в тени), кончики остевых волос — тёмные
        diffuseColor.rgb *= mix(0.55, 1.05, uK) * mix(0.82, 1.1, h) * (1.0 - smoothstep(0.75, 1.0, uK) * step(0.55, h) * 0.45);`);
  };
  m.customProgramCacheKey = () => 'quadshell';
  matCache.set(key, m);
  return m;
}
// Шерсть одного цвета (для деталей без окраски вершин: головы, тела монстров)
export function furShellSolid(k, color) {
  const key = 'shellS' + color + k.toFixed(3);
  if (matCache.has(key)) return matCache.get(key);
  const m = shellMat(k, 0.3).clone();
  m.vertexColors = false;
  m.color = new THREE.Color(color);
  m.onBeforeCompile = shellMat(k, 0.3).onBeforeCompile;
  m.customProgramCacheKey = () => 'quadshellS';
  matCache.set(key, m);
  return m;
}
function eyeMatQ(c) {
  const k = 'eye' + c;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, clearcoat: 1, emissive: c, emissiveIntensity: 0.15 }));
  return matCache.get(k);
}

// ---------- Зверь ----------
export class Quad extends Creature {
  constructor(def, kind) {
    super();
    this.kind = kind;
    const shape = buildQuadShape(kind);
    const S = shape.S;
    this.S = S;
    const bones = S.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
    S.bones.forEach((b, i) => {
      const parent = b.parent ? S.bones[S.boneIdx.get(b.parent)] : null;
      bones[i].position.copy(b.pos).sub(parent ? parent.pos : V(0, 0, 0));
      if (parent) bones[S.boneIdx.get(b.parent)].add(bones[i]); else this.body.add(bones[i]);
    });
    const B = (n) => bones[S.boneIdx.get(n)];
    this.B = B;
    const skeleton = new THREE.Skeleton(bones);
    this.root.updateMatrixWorld(true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(shape.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(shape.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(paint(shape, def), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(shape.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(shape.skinWeight, 4));
    g.setAttribute('aFur', new THREE.BufferAttribute(shape.fur, 1));
    g.setIndex(new THREE.BufferAttribute(shape.index, 1));
    g.computeBoundingSphere();
    const body = new THREE.SkinnedMesh(g, skinMatQ());
    body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
    this.body.add(body); body.bind(skeleton);
    this.meshes.push(body);
    this.coatMesh = body;
    // шерсть
    this.shells = [];
    if (!def.noFur) {
      const n = IS_PHONE ? 4 : IS_TOUCH ? 6 : 10;
      for (let s = 1; s <= n; s++) {
        const sm = new THREE.SkinnedMesh(g, shellMat(s / n, 1));
        sm.frustumCulled = false; sm.castShadow = false; sm.receiveShadow = true;
        sm.userData.shell = true;
        this.body.add(sm); sm.bind(skeleton);
        this.shells.push(sm);
      }
    }
    this.furOn = true;
    // глаза
    const ec = def.eye || (kind === 'wolf' ? '#d8a020' : '#1a0c08');
    const hb = S.bones[S.boneIdx.get('head')].pos;
    for (const sx of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(S.eyes.r, 12, 10), def.eye ? new THREE.MeshStandardMaterial({ color: ec, emissive: ec, emissiveIntensity: 2.5 }) : eyeMatQ(ec));
      e.position.set(sx * S.eyes.pos[0], S.eyes.pos[1], S.eyes.pos[2]).sub(hb);
      e.scale.set(1, 0.8, 0.9);
      B('head').add(e);
    }
    // клыки
    const toothM = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.35 });
    if (kind === 'wolf' || kind === 'bear') {
      const sc = kind === 'bear' ? 1.8 : 1;
      const jb = S.bones[S.boneIdx.get('jaw')].pos;
      for (const sx of [1, -1]) {
        const up = new THREE.Mesh(new THREE.ConeGeometry(0.006 * sc, 0.03 * sc, 6), toothM);
        const tu = S.teeth ? S.teeth.up : [0, 0.925, 1.03], tl = S.teeth ? S.teeth.lo : [0, 0.905, 1.0];
        up.position.set(sx * 0.018 * sc, tu[1] - 0.006 * sc, tu[2]).sub(hb);
        up.rotation.x = Math.PI; B('head').add(up);
        const lo = new THREE.Mesh(new THREE.ConeGeometry(0.005 * sc, 0.024 * sc, 6), toothM);
        lo.position.set(sx * 0.016 * sc, tl[1] + 0.01 * sc, tl[2]).sub(jb);
        B('jaw').add(lo);
      }
    }
    if (S.tusks) for (const sx of [1, -1]) {
      const curve = new THREE.QuadraticBezierCurve3(V(0, 0, 0), V(sx * 0.03, 0.025, 0.02), V(sx * 0.045, 0.08, -0.005));
      const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.011, 7), toothM);
      const jb = S.bones[S.boneIdx.get('jaw')].pos;
      t.position.set(sx * 0.035, 0.455, 0.76).sub(jb);
      B('jaw').add(t);
    }
    // привязки для аллюров (как у лошади)
    this.torso = B('torso');
    this.restTorsoY = this.torso.position.y;
    this.bodyH = this.restTorsoY;
    this.head = B('head');
    this.jaw = B('jaw');
    this.neckSeg = [B('neck0'), B('neck1')];
    this.tailSeg = [B('tail0'), B('tail1'), B('tail2'), B('tail3')];
    this.ears = [B('earL'), B('earR')];
    this.legs = [];
    for (const [nm, front, sx] of [['L', true, 1], ['R', true, -1], ['L', false, 1], ['R', false, -1]]) {
      const pre = front ? 'F' : 'R';
      const L = { front, sx, up: B(pre + 'U' + nm), mid: B(pre + (front ? 'F' : 'G') + nm), can: B(pre + 'C' + nm), pas: B(pre + 'P' + nm) };
      L.top = L.up; L.low = L.can; L.foot = L.pas;
      L.id = (sx > 0 ? 'L' : 'R') + (front ? 'F' : 'H');
      const pb = S.bones[S.boneIdx.get(L.pas.name)].pos;
      L.sole = V(0, -pb.y, front ? S.soleZ.front : S.soleZ.rear);
      L.toe = V(0, -pb.y, (front ? S.soleZ.front : S.soleZ.rear) + 0.02);
      this.legs.push(L);
    }
    this.gaitScale = S.gaitScale;
    this.freqMul = 1 / Math.sqrt(S.gaitScale);
    this.height = S.bounds[4];
    this.gait = { w: 0, t: 0, g: 0 };
    this.gaitW = [1, 0, 0, 0];
    this.groundOff = 0;
    this.idle = { tail: 0, tailT: 2, earT: [1, 2], ear: [0, 0], shake: 0, shakeT: 99, rest: 0 };
    this._hoof = V(0, 0, 0);
    this._inv = new THREE.Matrix4();
    this.isQuad = true;
  }

  legPose(L, ph, duty, A, G, out) { return Horse.prototype.legPose.call(this, L, ph, duty, A, G, out); }

  update(dt, st = {}) {
    // аллюры лошади (без её «вставания на дыбы» — у хищников свой бросок)
    const act = this.action, at = this.actionT;
    this.action = null;
    Horse.prototype.update.call(this, dt, st);
    this.action = act;
    if (this.action) { this.actionT = at + dt / this.actionDur; if (this.actionT >= 1) this.action = null; }
    const t = this.time;
    // хвост волка висит, а не задран как у лошади
    if (this.kind === 'wolf') {
      const lift = this.gaitW[3] * 0.9 + this.gaitW[2] * 0.4;
      this.tailSeg[0].rotation.x = -0.15 + lift * 0.9 + Math.sin(t * 1.2) * 0.04;
      this.tailSeg[1].rotation.x = 0.1 - lift * 0.15;
      this.tailSeg[2].rotation.x = 0.05;
    } else if (this.kind === 'bear') {
      for (const s of this.tailSeg) s.rotation.set(0, 0, 0);
    }
    // дыхание пастью, вой
    let jaw = 0.04 + Math.max(0, Math.sin(t * (4 + this.gaitW[3] * 6))) * 0.05 * (this.gaitW[2] + this.gaitW[3]);
    if (st.howl) { this.neckSeg[0].rotation.x -= 0.6; this.head.rotation.x -= 0.5; jaw = 0.4; }
    // бросок с укусом
    if (this.action) {
      const p = this.actionT;
      const crouch = p < 0.35 ? Math.sin(p / 0.35 * Math.PI * 0.5) : 1 - Math.min(1, (p - 0.35) / 0.15);
      const lunge = p < 0.35 ? 0 : Math.sin(Math.min(1, (p - 0.35) / 0.45) * Math.PI);
      this.torso.position.z = lunge * 0.22 * (this.kind === 'bear' ? 1.5 : 1);
      this.torso.rotation.x += crouch * 0.12 - lunge * 0.08;
      this.torso.position.y -= crouch * 0.05;
      this.neckSeg[0].rotation.x += 0.25 * crouch - 0.2 * lunge;
      this.head.rotation.x += lunge * 0.3;
      jaw = Math.max(jaw, (p > 0.25 && p < 0.6 ? 0.55 : 0) * Math.sin(clamp((p - 0.25) / 0.35, 0, 1) * Math.PI));
    } else this.torso.position.z = 0;
    this.jaw.rotation.x = jaw;
    // шерсть: только вблизи (дальше её всё равно не видно)
    const on = this.shells.length > 0 && this.root.position.distanceTo(furLOD.cam) < furLOD.dist * 0.6 && this.deadT < 2;
    if (on !== this.furOn) { this.furOn = on; for (const sm of this.shells) sm.visible = on; }
  }
}
void lerp;
