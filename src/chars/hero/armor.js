// Броня и одежда героев как облегающие SDF-детали (для запекания).
// Каждая деталь — набор компонентов {mat, fn(x,y,z,b)}; b — расстояние до тела.
import * as THREE from 'three';
import { Sculpt } from '../sdf.js';
import { HERO_BONES } from './rig.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// оболочка над телом: снаружи на out, внутри на inn под кожей
const shell = (b, out, inn = 0.004) => Math.max(b - out, -(b + inn));
function seg(p, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = p[0] - a[0], qy = p[1] - a[1], qz = p[2] - a[2];
  const t = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz || 1)));
  return [Math.hypot(qx - bx * t, qy - by * t, qz - bz * t), t];
}
// эллиптический цилиндр/конус вокруг оси Y (в локальных осях): расстояние до стенки
function ellRing(x, z, rx, rz) {
  const e = Math.hypot(x / rx, z / rz);
  return (e - 1) * Math.min(rx, rz);
}

export function armorPieces(kit, spec, kind, cls) {
  const S = kit.S, d = kit.dim, L = kit.toLocal;
  const Wd = d.W, D = d.D, T = d.T, F = d.F;
  const body = (x, y, z) => S.sdf(x, y, z);
  const out = [];
  const bi = (n) => S.boneIdx.get(n);
  const wpos = (bone, p = [0, 0, 0]) => kit.bones[bone].localToWorld(V(...p));
  // рамка по набору точек
  const box = (pts, pad) => {
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of pts) { b[0] = Math.min(b[0], p.x); b[1] = Math.min(b[1], p.y); b[2] = Math.min(b[2], p.z); b[3] = Math.max(b[3], p.x); b[4] = Math.max(b[4], p.y); b[5] = Math.max(b[5], p.z); }
    return [b[0] - pad, Math.max(-0.005, b[1] - pad), b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad];
  };
  // сборка детали из компонентов
  const piece = (o) => {
    const comps = o.comps;
    const sdf = (x, y, z) => {
      const b = body(x, y, z);
      let v = 1e9;
      for (const c of comps) { const dd = c.fn(x, y, z, b); v = c.k ? smin(v, dd, c.k) : Math.min(v, dd); }
      return v;
    };
    const matAt = (p) => {
      const b = body(p.x, p.y, p.z);
      let best = 1e9, mi = 0;
      for (const c of comps) {
        const dd = c.fn(p.x, p.y, p.z, b);
        if (dd < best - 1e-5) { best = dd; mi = o.mats.indexOf(c.matFn ? c.matFn(p.x, p.y, p.z, b) : c.mat); }
      }
      return Math.max(0, mi);
    };
    return Object.assign({ sdf, matAt, res: 1.2 }, o);
  };
  const legBones = ['hips', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];
  const armBones = (sd) => ['shoulder' + sd, 'elbow' + sd, 'wrist' + sd];
  const headPts = [wpos('head', [0, d.hr * 2.3, 0]), wpos('head', [0, -0.1, 0]), wpos('head', [0.15, 0.1, 0.15]), wpos('head', [-0.15, 0.1, -0.15])];
  const torsoPts = [wpos('hips', [0, -0.12, 0]), wpos('neck', [0, 0.04, 0]), wpos('shoulderL', [0.08, 0.05, 0]), wpos('shoulderR', [-0.08, 0.05, 0]), wpos('chest', [0, 0.1, 0.2]), wpos('chest', [0, 0.1, -0.2])];
  const armPts = (sd) => [wpos('shoulder' + sd, [0, 0.08, 0]), wpos('elbow' + sd), wpos('wrist' + sd, [0, -0.13, 0])];
  const legPts = [wpos('hips', [0, 0.05, 0]), wpos('ankleL', [0.06, -0.12, 0.2]), wpos('ankleR', [-0.06, -0.12, 0.2]), wpos('hipL', [0.15, 0, 0.15]), wpos('hipR', [-0.15, 0, -0.15])];

  // ---------- общие маски ----------
  // торс: от низа таза до основания шеи, без шеи, рукава до доли плеча
  const neckHole = (x, y, z, r = 0.064, low = -0.05) => { const [nx, ny, nz] = L('neck', x, y, z); return ny > low ? r - Math.hypot(nx, nz * 1.05) : -1; };
  const armSide = (x, y, z) => {
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      const [ax, ay, az] = L('shoulder' + sd, x, y, z);
      const cx = L('chest', x, y, z)[0];
      if (sx * cx > 0.13 * Wd && ay < 0.02 && Math.hypot(ax, az) < 0.13) return { sd, ay };
    }
    return null;
  };
  const torsoMask = (x, y, z, sleeve, bottom, top = 0.318) => {
    const [, hy] = L('hips', x, y, z);
    const [, cy] = L('chest', x, y, z);
    let m = Math.max(bottom - hy, cy - top);
    m = Math.max(m, neckHole(x, y, z));
    const a = armSide(x, y, z);
    if (a) m = Math.max(m, -sleeve * d.uarm - a.ay);
    return m;
  };

  // ======== БАЗОВАЯ ОДЕЖДА (если слот пуст) ========
  out.push(piece({
    name: 'base_shirt', slot: 'chest', kind: 'base', style: 0, mats: ['SH'], covers: ['torso'], tris: 9000,
    bounds: box([...torsoPts, ...armPts('L').slice(0, 2), ...armPts('R').slice(0, 2)], 0.06),
    comps: [{ mat: 'SH', fn: (x, y, z, b) => {
      const [, hy] = L('hips', x, y, z);
      const loose = 0.004 + 0.004 * sstep(0.12, -0.04, hy);
      return smax(shell(b, 0.0055 + loose + 0.0008 * Math.sin(hy * 90 + x * 40)), torsoMask(x, y, z, 0.55, -0.085), 0.002);
    } }],
  }));
  out.push(piece({
    name: 'base_pants', slot: 'legs', kind: 'base', style: 0, mats: ['PA'], covers: ['pelvis', 'thighL', 'thighR', 'shinL', 'shinR'], tris: 8000,
    bounds: box(legPts, 0.05),
    comps: [{ mat: 'PA', fn: (x, y, z, b) => {
      const [, hy] = L('hips', x, y, z);
      let m = hy - 0.045;
      for (const sd of ['L', 'R']) { const [, ky] = L('knee' + sd, x, y, z); const [, ay] = L('ankle' + sd, x, y, z); if (ky < 0) m = Math.max(m, 0.03 - ay); }
      if (armSide(x, y, z)) m = 1;
      return smax(shell(b, 0.0052), m, 0.002);
    } }],
  }));
  const bootsMask = (x, y, z, topK) => {
    let m = 1;
    for (const sd of ['L', 'R']) {
      const [, ky, kz] = L('knee' + sd, x, y, z);
      const [, , az] = L('ankle' + sd, x, y, z);
      const near = Math.hypot(L('ankle' + sd, x, y, z)[0], 0) < 0.12 && az < 0.25;
      if (near) m = Math.min(m, ky + d.shin * topK);
      void kz;
    }
    return Math.max(m, -y);
  };
  out.push(piece({
    name: 'base_boots', slot: 'feet', kind: 'base', style: 0, mats: ['BO'], covers: ['footL', 'footR'], tris: 5000,
    bounds: box([wpos('kneeL', [0, -d.shin * 0.4, 0]), wpos('kneeR', [0, -d.shin * 0.4, 0]), wpos('ankleL', [0.08, -0.13, 0.22]), wpos('ankleR', [-0.08, -0.13, -0.1])], 0.04),
    comps: [{ mat: 'BO', fn: (x, y, z, b) => smax(shell(b, 0.0065), bootsMask(x, y, z, 0.62), 0.002) }],
  }));

  // ======== ЛАТЫ ========
  if (kind === 'heavy') {
    // гладкая форма торса для кирасы
    const TS = new Sculpt();
    for (const n of HERO_BONES) TS.bone(n, [0, 0, 0]);
    const sub = kit.withSculpt(TS);
    sub.E('chest', [0, 0.13, 0.0], [0.17 * Wd, 0.2, 0.124 * D], { k: 0.06 });
    sub.E('chest', [0, 0.212, 0.004], [0.182 * Wd, 0.1, 0.113 * D], { k: 0.06 });
    sub.E('spine', [0, 0.05, 0.004], [0.145 * Wd, 0.14, 0.11 * D], { k: 0.06 });
    for (const sx of [-1, 1]) sub.E('chest', [sx * 0.068 * Wd, 0.185, 0.07 * D], [0.075 * Wd, 0.07, 0.055 * D], { k: 0.06 });
    const ts = (x, y, z) => TS.sdf(x, y, z);
    // кираса
    const cuirass = (x, y, z, b, extra = 0) => {
      const t = ts(x, y, z);
      const [cx, cy, cz] = L('chest', x, y, z);
      const [, sy] = L('spine', x, y, z);
      let th = 0.016 + extra;
      if (cz > 0) th += 0.0045 * Math.exp(-((cx / 0.012) ** 2)) * sstep(-0.05, 0.05, cy);          // ребро жёсткости
      for (const gy of [0.0, 0.05, 0.1]) th -= 0.003 * Math.exp(-(((sy - gy) / 0.0035) ** 2));     // пластины пояса
      let dd = Math.max(t - th, -(t - 0.004));
      dd = Math.max(dd, -(b - 0.003));
      let m = Math.max(-0.032 - sy, cy - 0.3);
      m = Math.max(m, neckHole(x, y, z, 0.074, -0.06));
      for (const sd of ['L', 'R']) { const sp = wpos('shoulder' + sd, [0, -0.01, 0]); m = Math.max(m, 0.088 * T - Math.hypot(x - sp.x, y - sp.y, z - sp.z)); }
      return smax(dd, m, 0.003);
    };
    const cuirassEdge = (x, y, z) => {
      const [, cy] = L('chest', x, y, z); const [, sy] = L('spine', x, y, z);
      let e = Math.min(Math.abs(-0.032 - sy), Math.abs(cy - 0.3), Math.abs(neckHole(x, y, z, 0.074, -0.06)));
      for (const sd of ['L', 'R']) { const sp = wpos('shoulder' + sd, [0, -0.01, 0]); e = Math.min(e, Math.abs(0.088 * T - Math.hypot(x - sp.x, y - sp.y, z - sp.z))); }
      return e;
    };
    // набедренная юбка из трёх пластин
    const faulds = (x, y, z, b) => {
      const [hx, hy, hz] = L('hips', x, y, z);
      let v = 1e9;
      for (let i = 0; i < 3; i++) {
        const top = 0.015 - i * 0.06, bot = top - 0.078;
        const tt = sstep(top, bot, hy);
        const rx = (0.168 + i * 0.016 + tt * 0.025) * Wd, rz = (0.13 + i * 0.012 + tt * 0.02) * D;
        let r = Math.abs(ellRing(hx, hz - 0.005, rx, rz)) - 0.0035;
        r = Math.max(r, hy - top, bot - hy);
        v = Math.min(v, r);
      }
      return Math.max(v, -(b - 0.004));
    };
    const gorget = (x, y, z) => {
      const [nx, ny, nz] = L('neck', x, y, z);
      return Math.hypot(Math.hypot(nx, nz * 1.08) - 0.078, (ny + 0.02) * 0.7) - 0.017;
    };
    const mailSleeves = (x, y, z, b) => {
      const a = armSide(x, y, z);
      if (!a) return 1;
      return smax(shell(b, 0.0055), Math.max(a.ay - 0.0, -d.uarm * 1.04 - a.ay), 0.002);
    };
    const belt = (x, y, z) => {
      const [hx, hy, hz] = L('hips', x, y, z);
      return Math.max(Math.abs(ellRing(hx, hz - 0.004, 0.172 * Wd, 0.134 * D)) - 0.005, Math.abs(hy - 0.035) - 0.017);
    };
    const buckle = (x, y, z) => {
      const [hx, hy, hz] = L('hips', x, y, z);
      return Math.max(Math.abs(hx) - 0.028, Math.abs(hy - 0.035) - 0.022, Math.abs(hz - 0.135 * D - 0.004) - 0.008);
    };
    out.push(piece({
      name: 'plate_chest', slot: 'chest', kind: 'heavy', style: 0, mats: ['P', 'T', 'S', 'M', 'L'], covers: ['torso', 'pelvis', 'uarmL', 'uarmR'], tris: 16000,
      bounds: box([...torsoPts, ...armPts('L').slice(0, 2), ...armPts('R').slice(0, 2), wpos('hips', [0, -0.26, 0])], 0.06),
      comps: [
        { mat: 'P', fn: cuirass },
        { mat: 'T', fn: (x, y, z, b) => Math.max(cuirass(x, y, z, b, 0.0028), cuirassEdge(x, y, z) - 0.011) },
        { mat: 'S', fn: faulds },
        { mat: 'T', fn: gorget },
        { mat: 'M', fn: mailSleeves },
        { mat: 'L', fn: belt },
        { mat: 'T', fn: buckle },
      ],
    }));
    // наплечники
    for (const style of (cls === 'dwarf' ? [0, 2] : [0, 1])) {
      const big = style === 2 ? 1.22 : style === 1 ? 1.08 : 1.0;
      const paul = (sd, sx, extra = 0) => (x, y, z, b) => {
        const [ax, ay, az] = L('shoulder' + sd, x, y, z);
        const [cx] = L('chest', x, y, z);
        let v = 1e9;
        const layers = [[0.0, 0.098], [-0.042, 0.09], [-0.076, 0.082]];
        layers.forEach(([oy, R], i) => {
          const r = R * T * big;
          const dd = Math.abs(Math.hypot(ax - sx * 0.01, (ay - oy - 0.004) * (i === 0 ? 1.15 : 1), az) - r) - 0.0038 - extra;
          const band = i === 0 ? -0.052 * big - ay : Math.max(oy - 0.03 - ay, ay - oy + 0.004);
          v = Math.min(v, Math.max(dd, band));
        });
        if (style === 2) v = Math.min(v, Math.hypot(Math.hypot(ax - sx * 0.01, az) - 0.06 * T * big, ay - 0.068 * T * big) - 0.008); // гребень
        return Math.max(v, -(b - 0.005), sx * 0.112 * Wd - sx * cx);
      };
      const rim = (sd, sx) => (x, y, z, b) => { const [, ay] = L('shoulder' + sd, x, y, z); return Math.max(paul(sd, sx, 0.0025)(x, y, z, b), Math.abs(ay + 0.052 * big) - 0.011); };
      out.push(piece({
        name: 'plate_shoulders' + style, slot: 'shoulders', kind: 'heavy', style, mats: ['P', 'T'], covers: [], tris: 9000,
        bounds: box([wpos('shoulderL', [0.2, 0.17, 0.2]), wpos('shoulderL', [-0.2, -0.2, -0.2]), wpos('shoulderR', [0.2, 0.17, 0.2]), wpos('shoulderR', [-0.2, -0.2, -0.2])], 0.02),
        comps: [
          { mat: 'P', fn: paul('L', 1) }, { mat: 'T', fn: rim('L', 1) },
          { mat: 'P', fn: paul('R', -1) }, { mat: 'T', fn: rim('R', -1) },
        ],
        bones: ['chest', 'shoulderL', 'shoulderR'], sigma: 0.04,
      }));
    }
    // латные рукавицы и наручи
    const gaunt = (sd) => [
      { mat: 'P', fn: (x, y, z, b) => { const [, ey] = L('elbow' + sd, x, y, z); const t = sstep(-d.farm * 0.6, -d.farm, ey); return smax(shell(b, 0.009 + t * 0.008), Math.max(ey + d.farm * 0.18, -d.farm - ey - 0.005), 0.002); } },
      { mat: 'S', fn: (x, y, z, b) => { const [, wy] = L('wrist' + sd, x, y, z); return smax(shell(b, 0.0052), wy - 0.004, 0.002); } },
      { mat: 'T', fn: (x, y, z) => { const [ex, ey, ez] = L('elbow' + sd, x, y, z); return Math.max(Math.abs(Math.hypot(ex, ey, ez + 0.012) - 0.048 * T) - 0.004, ez + 0.005); } },
    ];
    out.push(piece({
      name: 'plate_hands', slot: 'hands', kind: 'heavy', style: 0, mats: ['P', 'S', 'T'], covers: ['farmL', 'farmR', 'handL', 'handR'], tris: 9000,
      bounds: box([...armPts('L').slice(1), ...armPts('R').slice(1), wpos('elbowL', [0, 0.06, 0]), wpos('elbowR', [0, 0.06, 0])], 0.06),
      comps: [...gaunt('L'), ...gaunt('R')],
    }));
    // набедренники и наколенники
    const leg = (sd, sx) => [
      { mat: 'P', fn: (x, y, z, b) => { const [, hy, hz] = L('hip' + sd, x, y, z); return smax(shell(b, 0.012), Math.max(hy + 0.03, -d.thigh + 0.05 - hy, -0.015 - hz * 1.0), 0.003); } },
      { mat: 'M', fn: (x, y, z, b) => { const [, hy] = L('hip' + sd, x, y, z); return smax(shell(b, 0.0055), Math.max(hy + 0.02, -d.thigh + 0.04 - hy), 0.002); } },
      { mat: 'T', fn: (x, y, z) => { const [kx, ky, kz] = L('knee' + sd, x, y, z); return Math.max(Math.abs(Math.hypot(kx, ky * 0.9, kz - 0.008) - 0.06 * T) - 0.0045, 0.004 - kz); } },
      { mat: 'P', fn: (x, y, z) => { const [kx, ky, kz] = L('knee' + sd, x, y, z); return Math.hypot((sx * kx - 0.06 * T) / 0.6, ky / 1.1, kz - 0.005) - 0.032; } },
    ];
    out.push(piece({
      name: 'plate_legs', slot: 'legs', kind: 'heavy', style: 0, mats: ['P', 'M', 'T'], covers: ['thighL', 'thighR'], tris: 9000,
      bounds: box([wpos('hipL', [0.14, 0.05, 0.14]), wpos('hipR', [-0.14, 0.05, -0.14]), wpos('kneeL', [0.1, -0.08, 0.1]), wpos('kneeR', [-0.1, -0.08, -0.1])], 0.03),
      comps: [...leg('L', 1), ...leg('R', -1)],
    }));
    // поножи и сабатоны
    const foot = (sd) => [
      { mat: 'P', fn: (x, y, z, b) => { const [, ky] = L('knee' + sd, x, y, z); const [, ay] = L('ankle' + sd, x, y, z); return smax(shell(b, 0.0115), Math.max(ky + 0.055, 0.0 - ay), 0.003); } },
      { mat: 'S', fn: (x, y, z, b) => {
        const [, ay, az] = L('ankle' + sd, x, y, z);
        let th = 0.0085 - 0.0022 * Math.max(0, Math.sin(az * 160)) * sstep(0.02, 0.06, az);
        return Math.max(smax(shell(b, th), ay - 0.01, 0.002), -y);
      } },
      { mat: 'T', fn: (x, y, z) => { const [ax, ay, az] = L('ankle' + sd, x, y, z); return Math.max(Math.abs(Math.hypot(ax, az) - 0.042 * T) - 0.005, Math.abs(ay - 0.012) - 0.009); } },
    ];
    out.push(piece({
      name: 'plate_feet', slot: 'feet', kind: 'heavy', style: 0, mats: ['P', 'S', 'T'], covers: ['shinL', 'shinR', 'footL', 'footR'], tris: 8000,
      bounds: box([wpos('kneeL', [0.1, 0.0, 0.1]), wpos('kneeR', [-0.1, 0, -0.1]), wpos('ankleL', [0.08, -0.13, 0.24]), wpos('ankleR', [-0.08, -0.13, -0.1])], 0.03),
      comps: [...foot('L'), ...foot('R')],
    }));
    // шлемы
    const H = (x, y, z) => { const [a, b2, c] = L('head', x, y, z); return [(a - kit.HC[0]) / kit.hk, (b2 - kit.HC[1]) / kit.hk, (c - kit.HC[2]) / kit.hk]; };
    const hk = kit.hk;
    const helmStyles = cls === 'dwarf' ? [0, 2] : [0, 1];
    for (const style of helmStyles) {
      const comps = [];
      if (style !== 1) {
        comps.push({ mat: 'P', fn: (x, y, z, b) => {
          const [hx, hy, hz] = H(x, y, z);
          const th = 0.0145 + 0.003 * Math.exp(-((hx / 0.008) ** 2)) * sstep(0.0, 0.06, hz);
          let m = 0.028 - hy;                                                  // край над бровями
          const side = Math.abs(hx) > 0.042 && hz < 0.075;                      // нащёчники
          if (side) m = Math.min(m, Math.max(-0.08 - hy, Math.abs(hx) < 0.06 && hz > 0.03 ? 0.02 : -1));
          if (hz < -0.02) m = Math.min(m, -0.06 - hy);                          // затылок ниже
          return smax(shell(b, th * hk, 0.006), m * hk, 0.003);
        } });
        comps.push({ mat: 'T', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); return (seg([hx, hy, hz], [0, 0.05, 0.111], [0, -0.024, 0.119])[0] - 0.0062) * hk; } });
        comps.push({ mat: 'T', fn: (x, y, z, b) => { const [, hy] = H(x, y, z); return smax(shell(b, 0.0185 * hk, 0.0), Math.abs(hy - 0.036) * hk - 0.006 * hk, 0.002); } });
        // кольчужная бармица
        comps.push({ mat: 'M', fn: (x, y, z, b) => {
          const [hx, hy, hz] = H(x, y, z);
          if (hz > 0.05 && Math.abs(hx) < 0.05) return 1;
          return smax(shell(b, 0.009 * hk, 0.004), Math.max(hy + 0.035, -0.17 - hy, hz - 0.06), 0.003);
        } });
      } else {
        // закрытый шлем с забралом
        comps.push({ mat: 'P', fn: (x, y, z, b) => {
          const [hx, hy, hz] = H(x, y, z);
          const r = Math.hypot(hx / 0.095, (hy - 0.005) / 0.125, (hz - 0.005) / 0.112) - 1;
          let dd = Math.abs(r * 0.1) - 0.006;
          dd = Math.max(dd, -0.14 - hy);
          dd = smax(dd, -(Math.max(Math.abs(hy - 0.0) - 0.0045, Math.abs(hx) - 0.055, 0.04 - hz)), 0.002); // смотровая щель
          for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) dd = Math.max(dd, -(Math.hypot(hx - sx * (0.018 + i * 0.012), hy + 0.05 + (i % 2) * 0.008) - 0.003));
          return Math.max(dd, -(b - 0.004));
        } });
        comps.push({ mat: 'T', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); const r = Math.hypot(hx / 0.101, (hy - 0.005) / 0.131, (hz - 0.005) / 0.118) - 1; return Math.max(Math.abs(hx) - 0.006, Math.abs(r * 0.1) - 0.0045, -0.13 - hy, -0.04 - hz) * hk; } });
        comps.push({ mat: 'C', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); let v = 1e9; for (let i = 0; i < 7; i++) { const a = i / 6; v = smin(v, Math.hypot(hx / 0.6, hy - 0.13 - Math.sin(a * Math.PI) * 0.035, hz - 0.06 + a * 0.2) - 0.022 * (1 - a * 0.5), 0.02); } return v; } });
      }
      if (style === 2) {
        for (const sx of [-1, 1]) comps.push({ mat: 'B', fn: (x, y, z) => {
          const [hx, hy, hz] = H(x, y, z);
          let v = 1e9;
          for (let i = 0; i < 8; i++) {
            const t = i / 7;
            const c = [sx * (0.085 + Math.sin(t * 1.6) * 0.07), 0.04 + t * 0.11 - Math.sin(t * 3.1) * 0.01, -0.005 + Math.sin(t * 2) * 0.02];
            v = smin(v, Math.hypot(hx - c[0], hy - c[1], hz - c[2]) - 0.026 * (1 - t * 0.82), 0.012);
          }
          return v;
        } });
      }
      out.push(piece({
        name: 'plate_head' + style, slot: 'head', kind: 'heavy', style, mats: ['P', 'T', 'M', 'C', 'B'], covers: [], hideHair: style === 1 ? true : 'hair', tris: 9000,
        bounds: box([...headPts, wpos('head', [0.25, 0.32, 0.1]), wpos('head', [-0.25, 0.32, 0.1]), wpos('neck', [0, -0.05, 0])], 0.04),
        comps, bones: ['head', 'neck'], sigma: 0.05,
        weights: (p) => { const [, hy] = H(p.x, p.y, p.z); const t = sstep(-0.06, -0.15, hy); return { idx: [bi('head'), bi('neck'), 0, 0], wt: [1 - t, t, 0, 0] }; },
      }));
    }
  }

  // ======== КОЖА (лучник) ========
  if (kind === 'leather') {
    const jerkin = (x, y, z, b) => {
      const [hx, hy, hz] = L('hips', x, y, z);
      const [, cy] = L('chest', x, y, z);
      let th = 0.0085 - 0.0018 * Math.exp(-(((cy - 0.12) / 0.004) ** 2)) - 0.0018 * Math.exp(-((L('chest', x, y, z)[0] / 0.003) ** 2));
      let v = smax(shell(b, th), torsoMask(x, y, z, 0.0, -0.06, 0.322), 0.002);
      // юбка-полы с разрезом спереди
      const tt = sstep(-0.04, -0.3, hy);
      let sk = Math.abs(ellRing(hx, hz, (0.17 + 0.07 * tt) * Wd, (0.13 + 0.06 * tt) * D)) - 0.004;
      sk = Math.max(sk, hy - 0.0, -0.3 - hy + 0.012 * Math.sin(hx * 60));
      if (hz > 0 && Math.abs(hx) < 0.018 + tt * 0.03) sk = Math.max(sk, (0.018 + tt * 0.03) - Math.abs(hx));
      sk = Math.max(sk, -(b - 0.004));
      return Math.min(v, sk);
    };
    const collar = (x, y, z) => { const [nx, ny, nz] = L('neck', x, y, z); return Math.max(Math.abs(Math.hypot(nx, nz * 1.05) - 0.07) - 0.006, ny - 0.035, -0.02 - ny); };
    const sleeves = (x, y, z, b) => { const a = armSide(x, y, z); if (!a) return 1; return smax(shell(b, 0.0045), Math.max(a.ay, -d.uarm * 1.0 - a.ay), 0.002); };
    // перевязь через грудь
    const p0 = wpos('chest', [0.12 * Wd, 0.27, 0.0]), p1 = wpos('spine', [-0.13 * Wd, -0.02, 0.0]);
    const strap = (x, y, z, b) => {
      const ax = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z]; const al = Math.hypot(...ax);
      const qx = x - p0.x, qy = y - p0.y, qz = z - p0.z;
      const t = (qx * ax[0] + qy * ax[1] + qz * ax[2]) / al;
      const perpx = qx - ax[0] * t / al, perpy = qy - ax[1] * t / al;
      const dd = Math.hypot(perpx, perpy) - 0.024; // ширина ремня в плоскости XY
      return Math.max(Math.abs(b - 0.0125) - 0.0028, dd, -t, t - al);
    };
    const belt = (x, y, z) => { const [hx, hy, hz] = L('hips', x, y, z); return Math.max(Math.abs(ellRing(hx, hz, 0.172 * Wd, 0.134 * D)) - 0.005, Math.abs(hy - 0.03) - 0.016); };
    const pouches = (x, y, z) => { const [hx, hy, hz] = L('hips', x, y, z); let v = 1e9; for (const sx of [-1, 1]) v = Math.min(v, Math.max(Math.abs(hx - sx * 0.12 * Wd) - 0.028, Math.abs(hy + 0.005) - 0.032, Math.abs(hz - 0.09 * D) - 0.022) - 0.006); return v; };
    out.push(piece({
      name: 'leather_chest', slot: 'chest', kind: 'leather', style: 0, mats: ['P', 'S', 'C', 'L', 'T'], covers: ['torso', 'pelvis', 'uarmL', 'uarmR'], tris: 15000,
      bounds: box([...torsoPts, ...armPts('L').slice(0, 2), ...armPts('R').slice(0, 2), wpos('hips', [0, -0.34, 0])], 0.07),
      comps: [{ mat: 'P', fn: jerkin }, { mat: 'S', fn: collar }, { mat: 'C', fn: sleeves }, { mat: 'L', fn: strap }, { mat: 'L', fn: belt }, { mat: 'S', fn: pouches }],
    }));
    out.push(piece({
      name: 'leather_shoulders', slot: 'shoulders', kind: 'leather', style: 0, mats: ['P', 'F'], covers: [], tris: 8000,
      bounds: box([wpos('shoulderL', [0.16, 0.14, 0.16]), wpos('shoulderR', [-0.16, 0.14, -0.16]), wpos('neck', [0, 0.06, 0]), wpos('chest', [0, 0.15, 0])], 0.03),
      comps: [
        ...[['L', 1], ['R', -1]].map(([sd, sx]) => ({ mat: 'P', fn: (x, y, z, b) => { const [ax, ay, az] = L('shoulder' + sd, x, y, z); const [cx] = L('chest', x, y, z); return Math.max(Math.abs(Math.hypot(ax - sx * 0.01, ay - 0.005, az) - 0.088 * T) - 0.0045, -0.045 - ay, sx * 0.12 * Wd - sx * cx, -(b - 0.004)); } })),
        { mat: 'F', fn: (x, y, z) => { const [nx, ny, nz] = L('neck', x, y, z); return Math.hypot(Math.hypot(nx, nz * 1.1) - 0.09, (ny + 0.02) * 0.9) - 0.03 + 0.004 * Math.sin(Math.atan2(nx, nz) * 30 + ny * 200); } },
      ],
      bones: ['chest', 'neck', 'shoulderL', 'shoulderR'], sigma: 0.04,
    }));
    const bracer = (sd) => [
      { mat: 'P', fn: (x, y, z, b) => { const [ex, ey] = L('elbow' + sd, x, y, z); const lace = 0.0016 * Math.max(0, Math.sin(ey * 300)) * Math.exp(-((ex / 0.01) ** 2)); return smax(shell(b, 0.0095 - lace), Math.max(ey + d.farm * 0.32, -d.farm - ey), 0.002); } },
      { mat: 'S', fn: (x, y, z, b) => { const [, wy] = L('wrist' + sd, x, y, z); return smax(shell(b, 0.0032), wy + 0.0, 0.002); } },
    ];
    out.push(piece({
      name: 'leather_hands', slot: 'hands', kind: 'leather', style: 0, mats: ['P', 'S'], covers: ['handL', 'handR'], tris: 7000,
      bounds: box([...armPts('L').slice(1), ...armPts('R').slice(1)], 0.06),
      comps: [...bracer('L'), ...bracer('R')],
    }));
    out.push(piece({
      name: 'leather_legs', slot: 'legs', kind: 'leather', style: 0, mats: ['P', 'S'], covers: ['pelvis', 'thighL', 'thighR', 'shinL', 'shinR'], tris: 9000,
      bounds: box(legPts, 0.05),
      comps: [
        { mat: 'P', fn: (x, y, z, b) => { const [, hy] = L('hips', x, y, z); let m = hy - 0.04; for (const sd of ['L', 'R']) { const [, ky] = L('knee' + sd, x, y, z); const [, ay] = L('ankle' + sd, x, y, z); if (ky < 0) m = Math.max(m, 0.03 - ay); } if (armSide(x, y, z)) m = 1; return smax(shell(b, 0.0055), m, 0.002); } },
        ...['L', 'R'].map(sd => ({ mat: 'S', fn: (x, y, z) => { const [kx, ky, kz] = L('knee' + sd, x, y, z); return Math.hypot(kx / 1.1, ky / 1.3, kz - 0.04 * T) - 0.032; } })),
      ],
    }));
    out.push(piece({
      name: 'leather_feet', slot: 'feet', kind: 'leather', style: 0, mats: ['P', 'S', 'L'], covers: ['footL', 'footR', 'shinL', 'shinR'], tris: 7000,
      bounds: box([wpos('kneeL', [0.1, 0.02, 0.1]), wpos('kneeR', [-0.1, 0.02, -0.1]), wpos('ankleL', [0.08, -0.13, 0.24]), wpos('ankleR', [-0.08, -0.13, -0.1])], 0.03),
      comps: [
        { mat: 'P', matFn: (x, y) => y < 0.018 ? 'L' : 'P', fn: (x, y, z, b) => Math.max(smax(shell(b, 0.0075), bootsMask(x, y, z, 0.1), 0.002), -y) },
        ...['L', 'R'].map(sd => ({ mat: 'S', fn: (x, y, z, b) => { const [, ky] = L('knee' + sd, x, y, z); return smax(shell(b, 0.013), Math.abs(ky + d.shin * 0.13) - 0.022, 0.003); } })),
      ],
    }));
    const H = (x, y, z) => { const [a, b2, c] = L('head', x, y, z); return [(a - kit.HC[0]) / kit.hk, (b2 - kit.HC[1]) / kit.hk, (c - kit.HC[2]) / kit.hk]; };
    const hk = kit.hk;
    // капюшон с пелериной
    out.push(piece({
      name: 'leather_head0', slot: 'head', kind: 'leather', style: 0, mats: ['P', 'S'], covers: [], hideHair: true, tris: 11000,
      bounds: box([...headPts, wpos('chest', [0.25, 0.12, 0.2]), wpos('chest', [-0.25, 0.12, -0.2]), wpos('head', [0, 0.1, -0.3])], 0.04),
      comps: [
        { mat: 'P', fn: (x, y, z, b) => {
          const [hx, hy, hz] = H(x, y, z);
          const [, cy] = L('chest', x, y, z);
          let th = (0.026 + 0.008 * sstep(0.0, -0.1, hz)) * hk;
          const bh = smin(b, (Math.hypot(hx / 0.088, (hy - 0.01) / 0.118, (hz + 0.005) / 0.108) - 1) * 0.088 * hk, 0.03 * hk);
          let v = Math.max(bh - th, -(bh - th + 0.011 * hk));
          // открытое лицо
          const face = Math.hypot(hx / 0.06, (hy + 0.025) / 0.088) - 1;
          if (hz > 0.02) v = smax(v, -face * 0.05 * hk, 0.003);
          // кончик капюшона назад
          v = smin(v, (Math.hypot(hx, hy - 0.04 + (hz + 0.11) * 0.6, (hz + 0.13) * 0.8) - 0.03) * hk, 0.02);
          return Math.max(v, 0.16 - cy - 0.001);
        } },
        { mat: 'S', fn: (x, y, z, b) => {
          const [nx, ny, nz] = L('neck', x, y, z);
          const [, cy] = L('chest', x, y, z);
          const r = Math.hypot(nx, nz * 1.1);
          const [, hy] = H(x, y, z);
          return Math.max(smax(Math.max(b - 0.024, -(b - 0.014)), Math.max(r - 0.2 - 0.015 * Math.sin(Math.atan2(nx, nz) * 6), 0.17 - cy), 0.003), ny - 0.06, (hy + 0.125) * hk);
        } },
      ],
      weights: (p) => { const [, hy] = H(p.x, p.y, p.z); const t = sstep(-0.05, -0.16, hy), t2 = sstep(-0.14, -0.26, hy); return { idx: [bi('head'), bi('neck'), bi('chest'), 0], wt: [1 - t, t * (1 - t2), t * t2, 0] }; },
    }));
    // шапка с пером
    out.push(piece({
      name: 'leather_head1', slot: 'head', kind: 'leather', style: 1, mats: ['P', 'S', 'C'], covers: [], hideHair: 'hair', tris: 7000,
      bounds: box([...headPts, wpos('head', [0.2, 0.35, -0.2])], 0.04),
      comps: [
        { mat: 'P', fn: (x, y, z, b) => { const [, hy] = H(x, y, z); return smax(shell(b, 0.016 * hk, 0.004), (0.04 - hy) * hk, 0.003); } },
        { mat: 'S', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); return Math.max(Math.abs(Math.hypot(hx / 0.098, (hz - 0.004) / 0.112) - 1) * 0.1 - 0.008, Math.abs(hy - 0.045) - 0.008) * hk; } },
        { mat: 'C', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); let v = 1e9; for (let i = 0; i < 6; i++) { const t = i / 5; v = smin(v, Math.hypot((hx - 0.085 - t * 0.02) / 0.35, hy - 0.06 - t * 0.12, hz + 0.02 + t * 0.12) - 0.02 * (1 - t * 0.6), 0.02); } return v * hk; } },
      ],
      bones: ['head'], sigma: 0.05,
      weights: () => ({ idx: [bi('head'), 0, 0, 0], wt: [1, 0, 0, 0] }),
    }));
  }

  // ======== ТКАНЬ (маг, некромант) ========
  if (kind === 'cloth') {
    const ankleY = -(d.hipY - 0.07);
    const robeSkirt = (x, y, z, b, extra = 0) => {
      const [hx, hy, hz] = L('hips', x, y, z);
      if (hy > 0.02) return 1;
      const t = Math.min(1, Math.max(0, hy / ankleY));
      const rx = (0.172 + 0.17 * Math.pow(t, 0.9)) * Wd, rz = (0.132 + 0.15 * Math.pow(t, 0.9)) * D;
      const fold = 0.006 * Math.sin(Math.atan2(hx, hz) * 9) * t;
      let v = Math.abs(ellRing(hx, hz, rx + fold, rz + fold)) - 0.0045 - extra;
      v = Math.max(v, hy - 0.02, ankleY - 0.02 - hy);
      return Math.max(v, -(b - 0.004));
    };
    const robeTop = (x, y, z, b) => {
      let m = torsoMask(x, y, z, 2.0, -0.03, 0.325);
      // V-образный ворот
      const [cx, cy, cz] = L('chest', x, y, z);
      if (cz > 0.02 && cy > 0.17) m = Math.max(m, (0.025 + (0.3 - cy) * 0.3) - Math.abs(cx));
      return smax(shell(b, 0.0075), m, 0.002);
    };
    const bell = (sd, extra = 0) => (x, y, z, b) => {
      const [ex, ey, ez] = L('elbow' + sd, x, y, z);
      if (ey > 0.03) return 1;
      const t = Math.min(1, Math.max(0, -ey / d.farm));
      const r = 0.05 * T + 0.045 * t * t;
      let v = Math.abs(Math.hypot(ex, ez) - r) - 0.004 - extra;
      v = Math.max(v, ey - 0.02, -d.farm * 1.0 - ey);
      return Math.max(v, -(b - 0.004));
    };
    const hem = (x, y, z) => { const [, hy] = L('hips', x, y, z); return hy - (ankleY + 0.05); };
    const sash = (x, y, z) => { const [hx, hy, hz] = L('hips', x, y, z); return Math.max(Math.abs(ellRing(hx, hz, 0.176 * Wd, 0.137 * D)) - 0.007, Math.abs(hy - 0.045) - 0.024); };
    out.push(piece({
      name: 'robe', slot: 'chest', kind: 'cloth', style: 0, mats: ['P', 'C'], covers: ['torso', 'pelvis', 'uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR'], tris: 18000,
      bounds: box([...torsoPts, ...armPts('L'), ...armPts('R'), wpos('ankleL', [0.3, -0.12, 0.3]), wpos('ankleR', [-0.3, -0.12, -0.3])], 0.05),
      comps: [
        { mat: 'P', fn: robeTop },
        { mat: 'P', fn: robeSkirt, k: 0.02 },
        { mat: 'C', fn: (x, y, z, b) => Math.max(robeSkirt(x, y, z, b, 0.0025), hem(x, y, z)) },
        { mat: 'P', fn: bell('L'), k: 0.012 },
        { mat: 'P', fn: bell('R'), k: 0.012 },
        ...['L', 'R'].map(sd => ({ mat: 'C', fn: (x, y, z, b) => { const [, ey] = L('elbow' + sd, x, y, z); return Math.max(bell(sd, 0.0025)(x, y, z, b), ey + d.farm * 0.86); } })),
        { mat: 'C', fn: sash },
      ],
      weights: (p) => {
        const [, hy] = L('hips', p.x, p.y, p.z);
        S.focus(p.x, p.y, p.z, 0.4);
        const allow = hy < -0.06 ? new Set(legBones.map(bi)) : null;
        const w = S.weightsAt(p.x, p.y, p.z, hy < -0.06 ? 0.05 : 0.02, allow);
        S.unfocus();
        return w;
      },
    }));
    for (const style of [0, 1]) {
      const comps = [
        { mat: 'C', fn: (x, y, z, b) => {
          const [cx, cy, cz] = L('chest', x, y, z);
          const ang = Math.atan2(cx, cz);
          const low = 0.17 + 0.012 * Math.cos(ang * 7);
          let m = Math.max(low - cy, cy - 0.335);
          const a = armSide(x, y, z);
          if (a) m = Math.max(m, -0.09 - a.ay);
          m = Math.max(m, neckHole(x, y, z, 0.07, -0.05));
          return smax(shell(b, 0.016), m, 0.003);
        } },
      ];
      if (style === 0) comps.push({ mat: 'C', fn: (x, y, z) => { const [nx, ny, nz] = L('neck', x, y, z); return Math.max(Math.abs(Math.hypot(nx, nz) - 0.082 - (ny + 0.03) * 0.5) - 0.005, ny - 0.03, -0.03 - ny); } });
      else for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i - 3) * 0.33;
        comps.push({ mat: 'B', fn: (x, y, z) => {
          const [nx, ny, nz] = L('chest', x, y, z);
          const base = [Math.sin(a) * 0.115, 0.3, Math.cos(a) * 0.095];
          const tip = [Math.sin(a) * 0.19, 0.5 - Math.abs(i - 3) * 0.03, Math.cos(a) * 0.17];
          const [dd, t] = seg([nx, ny, nz], base, tip);
          return dd - 0.016 * (1 - t * 0.85);
        } });
      }
      out.push(piece({
        name: 'cloth_shoulders' + style, slot: 'shoulders', kind: 'cloth', style, mats: ['C', 'T', 'B'], covers: [], tris: 8000,
        bounds: box([wpos('shoulderL', [0.16, 0.12, 0.16]), wpos('shoulderR', [-0.16, 0.12, -0.16]), wpos('chest', [0, 0.55, -0.25]), wpos('chest', [0.25, 0.12, 0.2])], 0.03),
        comps, bones: ['chest', 'neck', 'shoulderL', 'shoulderR'], sigma: 0.04,
      }));
    }
    const wraps = (sd) => [{ mat: 'C', fn: (x, y, z, b) => { const [, ey] = L('elbow' + sd, x, y, z); let v = 1e9; for (let i = 0; i < 3; i++) v = Math.min(v, Math.abs(ey + d.farm * (0.62 + i * 0.12)) - 0.012); return smax(shell(b, 0.006), v, 0.002); } }];
    out.push(piece({
      name: 'cloth_hands', slot: 'hands', kind: 'cloth', style: 0, mats: ['C'], covers: [], tris: 3000,
      bounds: box([...armPts('L').slice(1), ...armPts('R').slice(1)], 0.05),
      comps: [...wraps('L'), ...wraps('R')],
    }));
    out.push(piece({
      name: 'cloth_legs', slot: 'legs', kind: 'cloth', style: 0, mats: ['P'], covers: ['pelvis', 'thighL', 'thighR', 'shinL', 'shinR'], tris: 6000,
      bounds: box(legPts, 0.05),
      comps: [{ mat: 'P', fn: (x, y, z, b) => { const [, hy] = L('hips', x, y, z); let m = hy - 0.04; for (const sd of ['L', 'R']) { const [, ky] = L('knee' + sd, x, y, z); const [, ay] = L('ankle' + sd, x, y, z); if (ky < 0) m = Math.max(m, 0.03 - ay); } if (armSide(x, y, z)) m = 1; return smax(shell(b, 0.006), m, 0.002); } }],
    }));
    out.push(piece({
      name: 'cloth_feet', slot: 'feet', kind: 'cloth', style: 0, mats: ['S'], covers: ['footL', 'footR'], tris: 4000,
      bounds: box([wpos('ankleL', [0.08, 0.06, 0.3]), wpos('ankleR', [-0.08, -0.13, -0.1])], 0.03),
      comps: ['L', 'R'].map(sd => ({ mat: 'S', fn: (x, y, z, b) => {
        const [ax, ay, az] = L('ankle' + sd, x, y, z);
        let v = Math.max(smax(shell(b, 0.006), ay - 0.025, 0.002), -y);
        v = smin(v, Math.hypot(ax, ay + 0.085, az - 0.19) - 0.016, 0.02);
        return v;
      } })),
    }));
    const H = (x, y, z) => { const [a, b2, c] = L('head', x, y, z); return [(a - kit.HC[0]) / kit.hk, (b2 - kit.HC[1]) / kit.hk, (c - kit.HC[2]) / kit.hk]; };
    const hk = kit.hk;
    // шляпа мага
    out.push(piece({
      name: 'cloth_head0', slot: 'head', kind: 'cloth', style: 0, mats: ['P', 'C', 'G'], covers: [], hideHair: 'hair', tris: 8000,
      bounds: box([...headPts, wpos('head', [0.3, 0.6, 0.3]), wpos('head', [-0.3, 0.1, -0.35])], 0.04),
      comps: [
        { mat: 'P', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); return Math.max(Math.hypot(hx, hz + 0.01) - 0.22 + 0.004 * Math.sin(Math.atan2(hx, hz) * 5), Math.abs(hy - 0.06 - (hz + 0.01) * 0.12) - 0.004) * hk; } },
        { mat: 'P', fn: (x, y, z) => {
          const [hx, hy, hz] = H(x, y, z);
          let v = 1e9;
          for (let i = 0; i < 10; i++) {
            const t = i / 9, t2 = (i + 1) / 9;
            const c = (tt) => [0, 0.065 + tt * 0.3, -0.012 - Math.pow(tt, 2.2) * 0.17];
            const [dd, s2] = seg([hx, hy, hz], c(t), c(Math.min(1, t2)));
            v = Math.min(v, dd - lerp(0.105 * (1 - t), 0.105 * (1 - t2), s2) - 0.004);
          }
          return v * hk;
        } },
        { mat: 'C', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); return Math.max(Math.abs(Math.hypot(hx, hz + 0.012) - 0.1) - 0.007, Math.abs(hy - 0.09) - 0.018) * hk; } },
        { mat: 'G', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); return (Math.abs(hx) + Math.abs(hy - 0.09) + Math.abs(hz - 0.103) - 0.016) * hk; } },
      ],
      weights: () => ({ idx: [bi('head'), 0, 0, 0], wt: [1, 0, 0, 0] }),
    }));
    // глубокий капюшон
    out.push(piece({
      name: 'cloth_head1', slot: 'head', kind: 'cloth', style: 1, mats: ['P', 'C'], covers: [], hideHair: true, tris: 10000,
      bounds: box([...headPts, wpos('chest', [0.27, 0.12, 0.22]), wpos('chest', [-0.27, 0.12, -0.22]), wpos('head', [0, 0.12, -0.32])], 0.04),
      comps: [
        { mat: 'P', fn: (x, y, z, b) => {
          const [hx, hy, hz] = H(x, y, z);
          const [, cy] = L('chest', x, y, z);
          const th = (0.034 + 0.012 * sstep(0.0, -0.1, hz) + 0.01 * sstep(0.05, 0.12, hy)) * hk;
          const bh = smin(b, (Math.hypot(hx / 0.088, (hy - 0.01) / 0.118, (hz + 0.005) / 0.108) - 1) * 0.088 * hk, 0.03 * hk);
          let v = Math.max(bh - th, -(bh - th + 0.011 * hk));
          const face = Math.hypot(hx / 0.058, (hy + 0.03) / 0.085) - 1;
          if (hz > 0.04) v = smax(v, -face * 0.05 * hk, 0.003);
          v = smin(v, (Math.hypot(hx, hy - 0.05 + (hz + 0.12) * 0.7, (hz + 0.14) * 0.8) - 0.034) * hk, 0.02);
          return Math.max(v, 0.15 - cy);
        } },
        { mat: 'C', fn: (x, y, z, b) => {
          const [nx, ny, nz] = L('neck', x, y, z);
          const [, cy] = L('chest', x, y, z);
          const r = Math.hypot(nx, nz * 1.1);
          const [, hy] = H(x, y, z);
          return Math.max(smax(Math.max(b - 0.028, -(b - 0.018)), Math.max(r - 0.21 - 0.02 * Math.sin(Math.atan2(nx, nz) * 5), 0.16 - cy), 0.003), ny - 0.07, (hy + 0.125) * hk);
        } },
      ],
      weights: (p) => { const [, hy] = H(p.x, p.y, p.z); const t = sstep(-0.05, -0.16, hy), t2 = sstep(-0.14, -0.26, hy); return { idx: [bi('head'), bi('neck'), bi('chest'), 0], wt: [1 - t, t * (1 - t2), t * t2, 0] }; },
    }));
    // обруч
    out.push(piece({
      name: 'cloth_head2', slot: 'head', kind: 'cloth', style: 2, mats: ['T', 'G'], covers: [], hideHair: false, tris: 3000,
      bounds: box(headPts, 0.03),
      comps: [
        { mat: 'T', fn: (x, y, z, b) => { const [, hy, hz] = H(x, y, z); return smax(shell(b, 0.0075 * hk, 0.0), Math.abs(hy - 0.052 + hz * 0.12) * hk - 0.005 * hk, 0.002); } },
        { mat: 'G', fn: (x, y, z) => { const [hx, hy, hz] = H(x, y, z); return (Math.abs(hx) + Math.abs(hy - 0.062) * 0.8 + Math.abs(hz - 0.1) - 0.014) * hk; } },
      ],
      weights: () => ({ idx: [bi('head'), 0, 0, 0], wt: [1, 0, 0, 0] }),
    }));
  }
  return out;
}
