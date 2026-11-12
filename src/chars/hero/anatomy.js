// Анатомия героя для запекания: тело, кисти, стопы и лицо из гладко
// объединённых примитивов в A-позе. Все координаты — в локальных осях суставов.
import * as THREE from 'three';
import { Sculpt } from '../sdf.js';
import { HERO_BONES, heroLayout, buildRig, BIND_POSE } from './rig.js';
import { hairline, beardMask } from './hair.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Помощники: примитивы в системе координат сустава
export function makeKit(spec) {
  const layout = heroLayout(spec);
  const { bones } = buildRig(layout, BIND_POSE);
  const S = new Sculpt();
  for (const n of HERO_BONES) S.bone(n, [0, 0, 0]);
  const tmpQ = new THREE.Quaternion();
  const W = (bone, p) => bones[bone].localToWorld(V(p[0], p[1], p[2]));
  const rotOf = (bone, rot) => {
    bones[bone].getWorldQuaternion(tmpQ);
    if (rot) tmpQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    const e = new THREE.Euler().setFromQuaternion(tmpQ, 'XYZ');
    return [e.x, e.y, e.z];
  };
  const dirOf = (bone, d) => V(d[0], d[1], d[2]).applyQuaternion(bones[bone].getWorldQuaternion(new THREE.Quaternion())).normalize();
  const mk = (SS) => ({
    E(bone, c, r, o = {}) { return SS.ell(W(bone, c).toArray(), r, { bone: o.noBone ? undefined : bone, k: o.k ?? 0.03, rot: rotOf(bone, o.rot), sub: o.sub, tag: o.tag }); },
    C(bone, a, b, r1, r2, o = {}) {
      return SS.cone(W(bone, a).toArray(), W(bone, b).toArray(), r1, r2, { bone: o.noBone ? undefined : bone, k: o.k ?? 0.03, sq: o.sq ?? 1, q: o.q ? dirOf(bone, o.q).toArray() : [1, 0, 0], sub: o.sub, floor: o.floor ?? null, tag: o.tag });
    },
  });
  const kit = Object.assign({ S, layout, bones, dim: layout.dim, W }, mk(S));
  kit.withSculpt = mk;
  // переход из мира в локальные оси сустава (быстрый)
  const inv = {};
  for (const n of HERO_BONES) inv[n] = new THREE.Matrix4().copy(bones[n].matrixWorld).invert().elements;
  kit.toLocal = (bone, x, y, z) => { const e = inv[bone]; return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
  kit.inv = inv;
  // центр головы
  kit.HC = layout.headC;
  kit.hk = layout.dim.hr / 0.104;
  return kit;
}

// ---------- Тело ----------
export function sculptBody(kit, spec, opts = {}) {
  const { E, C, dim } = kit;
  const F = !!spec.female;
  const Wd = dim.W, D = dim.D, T = dim.T;
  const strong = !F && (spec.limb || 1) >= 1.1; // рельефная мускулатура
  const dwarf = (spec.legLen || 1) < 0.8;
  const lean = (spec.limb || 1) < 0.86;      // худощавый (некромант)
  const m = strong ? 1.08 : lean ? 0.92 : 1;

  // --- таз и ягодицы ---
  E('hips', [0, -0.025, 0], [0.15 * Wd * (F ? 1.12 : 1), 0.1, 0.105 * D], { k: 0.06 });
  for (const sx of [-1, 1]) {
    E('hips', [sx * 0.07 * Wd, -0.06, -0.06 * D], [0.083 * Wd * (F ? 1.1 : 1), 0.095, 0.072 * D * (F ? 1.1 : 1)], { k: 0.05 });
    E('hips', [sx * 0.125 * Wd * (F ? 1.08 : 1), -0.035, -0.005], [0.05, 0.075, 0.07 * D], { k: 0.05 }); // средняя ягодичная
  }
  E('hips', [0, 0.02, 0.04 * D], [0.12 * Wd, 0.07, 0.07 * D], { k: 0.05 });
  // --- талия, пресс, косые мышцы ---
  E('spine', [0, 0.07, 0], [0.13 * Wd * (F ? 0.9 : 1), 0.12, 0.095 * D], { k: 0.07 });
  E('spine', [0, 0.09, 0.045 * D], [0.088 * Wd, 0.1, 0.055 * D], { k: 0.05 });
  if (strong || !F && !lean) for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
    E('spine', [sx * 0.024 * Wd, 0.035 + i * 0.05, 0.088 * D], [0.021 * m, 0.02, 0.012], { k: 0.022 });
  }
  for (const sx of [-1, 1]) E('spine', [sx * 0.112 * Wd, 0.06, 0.0], [0.045 * m, 0.11, 0.075 * D], { k: 0.05 });
  E('spine', [0, 0.07, -0.04 * D], [0.11 * Wd, 0.11, 0.06 * D], { k: 0.05 });
  // --- грудная клетка ---
  E('chest', [0, 0.12, 0], [0.155 * Wd, 0.175, 0.11 * D], { k: 0.07 });
  E('chest', [0, 0.2, 0.008], [0.163 * Wd, 0.1, 0.098 * D], { k: 0.06 });
  for (const sx of [-1, 1]) {
    if (!F) {
      E('chest', [sx * 0.066 * Wd, 0.19, 0.068 * D], [0.074 * Wd * m, 0.057 * m, 0.048 * D * m], { k: 0.04, rot: [-0.12, 0, sx * 0.2] }); // грудные
    } else {
      E('chest', [sx * 0.066 * Wd, 0.158, 0.082 * D], [0.06, 0.058, 0.055], { k: 0.04, rot: [-0.3, 0, 0] });
      E('chest', [sx * 0.06 * Wd, 0.19, 0.06 * D], [0.06, 0.04, 0.04], { k: 0.04 });
    }
    E('chest', [sx * 0.118 * Wd, 0.08, -0.03 * D], [0.058 * Wd * m, 0.15, 0.075 * D], { k: 0.05 }); // широчайшие
    E('chest', [sx * 0.072 * Wd, 0.19, -0.083 * D], [0.06, 0.08, 0.03], { k: 0.04 });                 // лопатки
    C('chest', [sx * 0.04, 0.3, -0.02], [sx * 0.16 * Wd, 0.262, -0.012], 0.04 * m, 0.034 * m, { k: 0.04 }); // трапеция
    C('chest', [sx * 0.012, 0.284, 0.064 * D], [sx * 0.162 * Wd, 0.267, 0.02], 0.012, 0.012, { k: 0.02 }); // ключица
  }
  E('chest', [0, 0.272, -0.035 * D], [0.095 * Wd * m, 0.055, 0.058 * D], { k: 0.05 });
  // --- шея ---
  const nl = dim.neckLen;
  C('neck', [0, -0.035, -0.006], [0, nl + 0.035, 0.004], 0.057 * T * (F ? 0.9 : 1.05), 0.05 * T * (F ? 0.9 : 1), { k: 0.04 });
  for (const sx of [-1, 1]) C('neck', [sx * 0.034, nl + 0.03, -0.012], [sx * 0.012, -0.012, 0.04], 0.013, 0.012, { k: 0.02 });
  if (!F) E('neck', [0, nl * 0.4, 0.044], [0.007, 0.011, 0.007], { k: 0.012 });
  // --- руки ---
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const sh = 'shoulder' + sd, el = 'elbow' + sd, wr = 'wrist' + sd;
    E(sh, [sx * 0.012, -0.035, 0], [0.058 * T * m, 0.086 * T, 0.064 * T * m], { k: 0.045 });          // дельта
    C(sh, [0, -0.03, 0], [0, -dim.uarm + 0.035, 0], 0.05 * T, 0.04 * T, { k: 0.03 });
    E(sh, [0, -dim.uarm * 0.5, 0.02 * T], [0.035 * T * m, 0.075 * T, 0.036 * T * m], { k: 0.03 });    // бицепс
    E(sh, [0, -dim.uarm * 0.42, -0.022 * T], [0.038 * T * m, 0.085 * T, 0.035 * T * m], { k: 0.03 }); // трицепс
    E(el, [0, 0.002, -0.008], [0.033 * T, 0.034 * T, 0.033 * T], { k: 0.025 });
    C(el, [0, -0.012, 0], [0, -dim.farm + 0.016, 0], 0.039 * T, 0.025 * T, { k: 0.025, sq: 0.82, q: [0, 0, 1] });
    E(el, [sx * 0.01, -dim.farm * 0.28, 0.006], [0.036 * T * m, 0.075 * T, 0.031 * T], { k: 0.025 });
    E(el, [-sx * 0.008, -dim.farm * 0.3, -0.01], [0.029 * T, 0.07 * T, 0.029 * T], { k: 0.025 });
    E(wr, [0, -0.004, 0], [0.027 * T, 0.02, 0.019 * T], { k: 0.015 });
    sculptHand(kit, wr, sx, F, T);
  }
  // --- ноги ---
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const hp = 'hip' + sd, kn = 'knee' + sd, an = 'ankle' + sd;
    const th = dim.thigh, sh = dim.shin;
    C(hp, [0, -0.03, 0], [0, -th + 0.05, 0.005], 0.087 * T * (F ? 1.08 : 1), 0.054 * T, { k: 0.05 });
    E(hp, [sx * 0.008, -th * 0.42, 0.03 * T], [0.066 * T * m, th * 0.34, 0.057 * T * m], { k: 0.04 });      // квадрицепс
    E(hp, [-sx * 0.03, -th * 0.78, 0.028 * T], [0.04 * T, th * 0.14, 0.038 * T], { k: 0.03 });             // внутренняя головка
    E(hp, [0, -th * 0.45, -0.034 * T], [0.06 * T * m, th * 0.33, 0.05 * T], { k: 0.04 });                   // задняя поверхность
    E(hp, [-sx * 0.034, -0.12, 0], [0.05 * T * (F ? 1.1 : 1), th * 0.25, 0.054 * T], { k: 0.04 });          // приводящие
    E(kn, [0, 0.005, 0.006], [0.045 * T, 0.05, 0.044 * T], { k: 0.03 });
    E(kn, [0, 0.0, 0.044 * T], [0.023 * T, 0.027, 0.014], { k: 0.015 });                                    // надколенник
    C(kn, [0, -0.02, 0.008], [0, -sh + 0.035, 0], 0.047 * T, 0.029 * T, { k: 0.03 });
    E(kn, [sx * 0.006, -sh * 0.28, -0.03 * T], [0.045 * T * m, sh * 0.24, 0.044 * T * m], { k: 0.035 });  // икры
    E(kn, [-sx * 0.012, -sh * 0.32, -0.024 * T], [0.039 * T * m, sh * 0.22, 0.039 * T], { k: 0.035 });
    C(kn, [0, -0.04, 0.034 * T], [0, -sh + 0.06, 0.024 * T], 0.017, 0.013, { k: 0.02 });                   // большеберцовая
    E(an, [0, 0, 0], [0.029 * T, 0.028, 0.031 * T], { k: 0.02 });
    for (const s2 of [-1, 1]) E(an, [s2 * 0.023 * T, -0.006, 0], [0.011, 0.013, 0.012], { k: 0.012 });
    // стопа
    const fl = dwarf ? 1.1 : F ? 0.9 : 1;
    E(an, [0, -0.07, -0.028], [0.031 * T, 0.036, 0.04], { k: 0.025 });
    C(an, [0, -0.058, 0.0], [0, -0.088, 0.12 * fl], 0.037 * T, 0.029, { k: 0.03, sq: 0.62, q: [0, 1, 0] });
    E(an, [0, -0.095, 0.132 * fl], [0.042 * T, 0.019, 0.04 * fl], { k: 0.02 });
    for (let t = 0; t < 5; t++) E(an, [(t - 2) * 0.014 * T + sx * 0.004 * (t === 0 ? 1 : 0), -0.1, 0.165 * fl - Math.abs(t - 1) * 0.006], [0.008 + (t === 1 ? 0.002 : 0), 0.01, 0.012], { k: 0.012 });
  }
  // подошвы на земле
  for (const p of kit.S.prims) if (p.bone === kit.S.boneIdx.get('ankleL') || p.bone === kit.S.boneIdx.get('ankleR')) p.floor = 0.004;
  sculptHead(kit, spec, opts);
}

// Кисть, сжатая в «хват» вокруг рукояти (ось рукояти — Z сустава запястья)
function sculptHand(kit, wr, sx, F, T) {
  const { E, C } = kit;
  const hk = (F ? 0.9 : 1) * (T > 1.2 ? 1.12 : 1);
  E(wr, [0, -0.048 * hk, 0], [0.016 * hk, 0.05 * hk, 0.04 * hk], { k: 0.014 });                 // ладонь
  E(wr, [-sx * 0.009, -0.04 * hk, 0.024 * hk], [0.015 * hk, 0.026 * hk, 0.017 * hk], { k: 0.012 }); // возвышение большого пальца
  E(wr, [sx * 0.004, -0.06 * hk, -0.03 * hk], [0.013 * hk, 0.03 * hk, 0.012 * hk], { k: 0.012 });
  const fingers = [[0.026, [0.041, 0.025, 0.02]], [0.0085, [0.045, 0.028, 0.022]], [-0.0085, [0.042, 0.026, 0.02]], [-0.025, [0.034, 0.02, 0.017]]];
  const curl = [1.2, 1.45, 0.85];
  fingers.forEach(([z, segs], fi) => {
    let p = V(0, -0.094 * hk, z * hk);
    let a = 0;
    const r0 = (fi === 3 ? 0.0078 : 0.0092) * hk;
    segs.forEach((len, si) => {
      a += curl[si] + (fi === 0 ? -0.1 : fi === 3 ? 0.1 : 0);
      const d = V(-sx * Math.sin(a), -Math.cos(a), -z * 0.15);
      const q = p.clone().addScaledVector(d, len * hk);
      C(wr, p.toArray(), q.toArray(), r0 * (1 - si * 0.1), r0 * (0.92 - si * 0.1), { k: 0.004 });
      E(wr, q.toArray(), [r0 * 0.95, r0 * 0.95, r0 * 0.95], { k: 0.003 }); // сустав
      p = q;
    });
  });
  // большой палец обхватывает с другой стороны
  let p = V(-sx * 0.013 * hk, -0.034 * hk, 0.034 * hk);
  const t1 = p.clone().add(V(-sx * 0.012, -0.026, 0.012).multiplyScalar(hk));
  const t2 = t1.clone().add(V(-sx * 0.02, -0.018, -0.012).multiplyScalar(hk));
  C(wr, p.toArray(), t1.toArray(), 0.0125 * hk, 0.0105 * hk, { k: 0.008 });
  C(wr, t1.toArray(), t2.toArray(), 0.0103 * hk, 0.0088 * hk, { k: 0.004 });
}

// Точка хвата оружия в системе запястья
export function gripPoint(spec, sx) {
  const F = !!spec.female;
  const T = (spec.limb || 1) * (F ? 0.86 : 1);
  const hk = (F ? 0.9 : 1) * (T > 1.2 ? 1.12 : 1);
  return [-sx * 0.03 * hk, -0.098 * hk, 0];
}

// ---------- Голова и лицо ----------
// Ключевые точки лица (метры при hr = 0.104, начало — центр головы на уровне зрачков)
export const EYE = { x: 0.0315, y: 0.0, z: 0.0705, r: 0.0122 };
// линии век (смещение от центра глаза): верхнее/нижнее веко и полуширина разреза
export const LID = { up: 0.0047, lo: -0.0056, w: 0.0148, tilt: 0.07 };

export function sculptHead(kit, spec, opts = {}) {
  const { E, C, HC, hk, S } = kit;
  const F = !!spec.female;
  const dwarf = (spec.legLen || 1) < 0.8;
  const gaunt = (spec.limb || 1) < 0.86;
  const H = (x, y, z) => [HC[0] + x * hk, HC[1] + y * hk, HC[2] + z * hk];
  const R = (a, b, c) => [a * hk, b * hk, c * hk];
  const h = 'head';
  const jw = F ? 0.76 : dwarf ? 1.12 : 1;        // массивность челюсти
  // --- череп, лоб, надбровье (мягкие переходы, без бугров) ---
  E(h, H(0, 0.03, -0.012), R(0.073, 0.09, 0.096), { k: 0.035 });
  E(h, H(0, 0.045, 0.03), R(0.063, 0.055, 0.063), { k: 0.04 });
  C(h, H(-0.034, 0.018, 0.082), H(0.034, 0.018, 0.082), (F ? 0.0055 : dwarf ? 0.012 : 0.008) * hk, (F ? 0.0055 : dwarf ? 0.012 : 0.008) * hk, { k: 0.03 });
  E(h, H(0, 0.012, 0.087), R(0.011, 0.012, 0.008), { k: 0.02 });                          // переносица
  // --- средняя зона лица: скулы чёткие, щёки умеренные ---
  for (const sx of [-1, 1]) {
    E(h, H(sx * 0.049, F ? -0.008 : -0.012, 0.053), R(0.021, 0.0135, 0.029), { k: 0.032 });  // скуловая кость
    E(h, H(sx * 0.038, -0.044, 0.053), R(F ? 0.021 : 0.023, F ? 0.022 : 0.024, F ? 0.02 : 0.022), { k: 0.036 }); // щека
    E(h, H(sx * 0.063, 0.004, 0.03), R(0.011, 0.022, 0.03), { k: 0.036 });                  // скуловая дуга
    if (F) E(h, H(sx * 0.034, -0.024, 0.062), R(0.016, 0.013, 0.014), { k: 0.022 });        // «яблочки»
    E(h, H(sx * 0.07, 0.03, 0.035), R(0.012, 0.018, 0.016), { k: 0.03, sub: true });         // висок
    if (!F) E(h, H(sx * 0.053, -0.045, 0.049), R(0.011, 0.014, 0.011), { k: 0.032, sub: true }); // под скулой
    // носогубная складка и носослёзная борозда
    C(h, H(sx * 0.0178, -0.042, 0.0945), H(sx * 0.0262, -0.069, 0.0868), (F ? 0.0012 : 0.002) * hk, (F ? 0.0009 : 0.0015) * hk, { k: 0.008, sub: true });
    E(h, H(sx * 0.026, -0.0155, 0.0815), R(0.012, 0.0026, 0.0038), { k: 0.007, sub: true, rot: [0, 0, sx * 0.35] });
  }
  E(h, H(0, -0.058, 0.057), R(F ? 0.035 : 0.038, 0.033, 0.039), { k: 0.032 });            // зубная дуга
  // --- нижняя челюсть ---
  for (const sx of [-1, 1]) {
    C(h, H(sx * 0.057 * jw, -0.07, -0.018), H(sx * (F ? 0.02 : 0.024), -0.1, 0.074), 0.015 * hk * jw, (F ? 0.011 : 0.013) * hk, { k: 0.032 });
    C(h, H(sx * 0.057 * jw, -0.07, -0.018), H(sx * 0.061, -0.022, -0.014), 0.014 * hk * jw, 0.012 * hk, { k: 0.032 });
  }
  E(h, H(0, -0.099, 0.08), R(F ? 0.015 : 0.02 * jw, F ? 0.013 : 0.015, F ? 0.012 : 0.014), { k: 0.026 }); // подбородок
  // --- глазницы ---
  for (const sx of [-1, 1]) {
    E(h, H(sx * EYE.x, EYE.y + 0.002, EYE.z + 0.012), R(0.0172, 0.0128, 0.0145), { k: 0.012, sub: true });
    // складка верхнего века — тонкая
    E(h, H(sx * (EYE.x + 0.001), EYE.y + 0.0112, EYE.z + 0.0058), R(0.0152, 0.003, 0.0075), { k: 0.008 });
    if (gaunt) E(h, H(sx * 0.05, -0.042, 0.048), R(0.012, 0.016, 0.011), { k: 0.03, sub: true });
  }
  // --- нос ---
  const nk = dwarf ? 1.28 : F ? 0.84 : 1;
  const tipZ = 0.109 + (nk - 1) * 0.006;
  const tipY = F ? -0.033 : -0.036;
  C(h, H(0, 0.008, 0.087), H(0, tipY + 0.006, 0.105 + (nk - 1) * 0.004), 0.0058 * hk * nk, 0.0084 * hk * nk, { k: 0.008 });
  E(h, H(0, tipY, tipZ), R(0.0092 * nk, 0.0088 * nk, 0.0084 * nk), { k: 0.005 });
  C(h, H(0, -0.038, tipZ - 0.004), H(0, -0.045, 0.099), 0.0032 * hk * nk, 0.0028 * hk * nk, { k: 0.004 }); // колумелла
  for (const sx of [-1, 1]) {
    E(h, H(sx * (F ? 0.0105 : 0.0118) * nk, -0.0415, 0.0978), R(0.0072 * nk, 0.0062, 0.0076), { k: 0.0045 });   // крылья
    E(h, H(sx * 0.0105, -0.016, 0.091), R(0.0065, 0.018, 0.009), { k: 0.012 });                   // скаты носа
  }
  // --- губы: естественный объём, не выпирают ---
  const lk = F ? 1.16 : 1.06;
  for (const sx of [-1, 1]) C(h, H(sx * 0.0042, -0.048, 0.0972), H(sx * 0.0052, -0.0605, 0.0968), 0.0015 * hk, 0.0015 * hk, { k: 0.005 }); // фильтрум
  E(h, H(0, -0.0628, 0.0966), R(0.0082, 0.0039 * lk, 0.0048 * lk), { k: 0.005, tag: 'lip' });
  for (const sx of [-1, 1]) E(h, H(sx * 0.0112, -0.0638, 0.0935), R(0.011, 0.0035 * lk, 0.0048 * lk), { k: 0.005, tag: 'lip' });
  E(h, H(0, -0.0714, 0.0932), R(0.0155, 0.0049 * lk, 0.0058 * lk), { k: 0.006, tag: 'lip' });
  E(h, H(0, -0.0668, 0.0995), R(0.0205, 0.0007, 0.0066), { k: 0.0015, sub: true });           // разрез рта
  for (const sx of [-1, 1]) E(h, H(sx * 0.0222, -0.0662, 0.0905), R(0.0022, 0.0016, 0.003), { k: 0.003, sub: true }); // уголки чуть вверх
  E(h, H(0, -0.082, 0.089), R(0.012, 0.0035, 0.005), { k: 0.01, sub: true });               // подбородочная складка
  // --- уши ---
  for (const sx of [-1, 1]) {
    E(h, H(sx * 0.0745, -0.01, -0.012), R(0.009, 0.031, 0.019), { k: 0.01, rot: [0, sx * 0.4, 0] });
    E(h, H(sx * 0.0745, -0.038, -0.008), R(0.0068, 0.0088, 0.0082), { k: 0.006 });
    E(h, H(sx * 0.0705, -0.014, 0.004), R(0.0042, 0.0062, 0.0042), { k: 0.004 });          // козелок
    E(h, H(sx * 0.0795, -0.012, -0.011), R(0.0052, 0.017, 0.0105), { k: 0.003, sub: true, rot: [0, sx * 0.4, 0] }); // раковина
    E(h, H(sx * 0.0815, 0.004, -0.016), R(0.003, 0.009, 0.006), { k: 0.002, sub: true, rot: [0, sx * 0.4, 0] });
  }
  // --- веки: оболочка вокруг глазного яблока, разрез миндалевидный ---
  for (const sx of [-1, 1]) {
    const e = kit.W(h, H(sx * EYE.x, EYE.y, EYE.z));
    const r = EYE.r * hk;
    const up = LID.up * hk * (F ? 1.12 : 1), lo = LID.lo * hk, w = LID.w * hk;
    const lid = (x, y, z) => {
      const dx = x - e.x, dy = y - e.y, dz = z - e.z;
      const shell = Math.abs(Math.hypot(dx, dy, dz) - (r + 0.0023 * hk)) - 0.0012 * hk;
      const u = Math.min(1, Math.abs(dx - sx * 0.0015 * hk) / w);
      const tilt = sx * dx * LID.tilt;                         // внешний уголок чуть выше
      const yU = up * (1 - u * u) + tilt, yL = lo * (1 - Math.pow(u, 2.4)) + tilt;
      const open = Math.max(dy - yU, yL - dy, Math.abs(dx) - w); // < 0 — в разрезе
      const front = -dz - 0.003 * hk;
      return Math.max(shell, -open, front, Math.abs(dx) - w - 0.0025 * hk);
    };
    S.custom(lid, [e.x - r * 1.7, e.y - r * 1.7, e.z - r * 1.7, e.x + r * 1.7, e.y + r * 1.7, e.z + r * 1.7], { bone: h, k: 0.0025 * hk });
  }
  void opts;
}

// Цвет кожи с росписью лица (губы, брови, румянец, щетина) — в системе головы
export function facePaint(kit, spec, p, out) {
  const { HC, hk } = kit;
  const hb = kit.bones.head;
  const l = hb.worldToLocal(p.clone());
  const x = (l.x - HC[0]) / hk, y = (l.y - HC[1]) / hk, z = (l.z - HC[2]) / hk;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix = (c, t) => { out.r += (c[0] - out.r) * t; out.g += (c[1] - out.g) * t; out.b += (c[2] - out.b) * t; };
  const F = !!spec.female;
  const lip = spec.lips ? hexRGB(spec.lips) : F ? [0.62, 0.3, 0.3] : [0.58, 0.36, 0.33];
  // губы
  const dl = Math.hypot(x / 0.021, (y + 0.074) / 0.0155);
  if (z > 0.08) mix(lip.map((c, i) => c * (i === 0 ? 1 : 1)), (1 - sm(0.85, 1.05, dl)) * (F ? 0.85 : 0.55));
  // линия рта
  if (z > 0.09 && Math.abs(y + 0.074) < 0.0016 && Math.abs(x) < 0.019) mix([0.15, 0.06, 0.06], 0.6);
  // брови
  const hair = spec.hair && spec.hair.color ? hexRGB(spec.hair.color) : [0.2, 0.15, 0.1];
  for (const sx of [-1, 1]) {
    const bx = (x - sx * 0.03) / 0.022, by = (y - 0.022 + Math.pow(x - sx * 0.03, 2) * 6) / (F ? 0.0032 : 0.0048);
    const db = Math.hypot(bx, by);
    if (z > 0.07) mix(hair.map(c => c * 0.8), (1 - sm(0.7, 1.05, db)) * 0.9);
    // тени у глаз
    const de = Math.hypot((x - sx * 0.031) / 0.02, (y + 0.002) / 0.015);
    if (z > 0.06) mix([out.r * 0.7, out.g * 0.62, out.b * 0.62], (1 - sm(0.6, 1.2, de)) * 0.35);
    // румянец
    const dc = Math.hypot((x - sx * 0.042) / 0.025, (y + 0.04) / 0.02);
    if (z > 0.04) mix([Math.min(1, out.r * 1.08), out.g * 0.85, out.b * 0.85], (1 - sm(0.3, 1, dc)) * (F ? 0.35 : 0.18));
  }
  // мягкий переход к волосам: тень у линии роста волос и бороды
  const hc = hair.map(c => c * 0.75);
  const style = spec.hair && spec.hair.style;
  if (style && style !== 'none') {
    const th = Math.atan2(x, z);
    const md = hairline(th, style === 'short' ? 'short' : 'long') - y;
    mix(hc, (1 - sm(-0.004, 0.022, md)) * 0.85);
  }
  if (spec.beard) mix(hc, (1 - sm(-0.004, 0.02, beardMask(x, y, z))) * 0.8);
  // щетина у мужчин без бороды
  if (!F && !spec.beard && spec.headType !== 'skull') {
    const jaw = sm(-0.03, -0.06, y) * sm(0.02, 0.05, z) * (1 - sm(0.7, 1.0, Math.hypot(x / 0.021, (y + 0.074) / 0.0155)));
    mix(hair.map(c => c * 0.9 + 0.08), jaw * 0.28);
  }
  return out;
}

export function hexRGB(h) {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
}

export { V };
