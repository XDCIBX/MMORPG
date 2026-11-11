// Причёски и бороды героев как объёмные SDF-детали (для запекания).
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const lerp = (a, b, t) => a + (b - a) * t;

// линия роста волос (высота в осях головы) по углу вокруг вертикали
export function hairline(th, style) {
  const a = Math.abs(th);
  const pts = style === 'short'
    ? [[0, 0.06], [0.55, 0.034], [1.15, 0.02], [1.45, 0.022], [1.9, -0.035], [2.5, -0.07], [Math.PI, -0.08]]
    : [[0, 0.058], [0.55, 0.03], [1.15, 0.012], [1.45, 0.0], [1.9, -0.06], [2.5, -0.09], [Math.PI, -0.1]];
  for (let i = 1; i < pts.length; i++) if (a <= pts[i][0]) { const t = (a - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return lerp(pts[i - 1][1], pts[i][1], t * t * (3 - 2 * t)); }
  return pts[pts.length - 1][1];
}

// Отрезок со скруглением (капсула) с переменным радиусом
function capsule(px, py, pz, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const t = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(qx - bx * t, qy - by * t, qz - bz * t) - (r1 + (r2 - r1) * t);
}
function roundBox(px, py, pz, c, hs, r) {
  const qx = Math.abs(px - c[0]) - hs[0] + r, qy = Math.abs(py - c[1]) - hs[1] + r, qz = Math.abs(pz - c[2]) - hs[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// область бороды (в осях головы): < 0 внутри
export function beardMask(lx, ly, lz) {
  const ax = Math.abs(lx);
  const line = lerp(-0.068, -0.012, sstep(0.024, 0.068, ax));
  let md = Math.max(ly - line, (0.004 - lz), -0.136 - ly);
  const mouth = Math.hypot(lx / 0.022, (ly + 0.075) / 0.0105) - 1;
  return Math.max(md, -mouth * 0.012);
}

export function hairPieces(kit, spec) {
  const out = [];
  const S = kit.S, hk = kit.hk;
  const body = (x, y, z) => S.sdf(x, y, z);
  const hw = kit.bones.head.getWorldPosition(new THREE.Vector3());
  const HC = new THREE.Vector3(...kit.HC).add(hw); // центр головы в мире (поза запекания)
  const bi = (n) => S.boneIdx.get(n);
  // кусок волос/бороды: веса по высоте относительно головы
  const hairWeights = (p) => {
    const y = (p.y - HC.y) / hk;
    const t = sstep(-0.05, -0.2, y);
    if (t <= 0) return { idx: [bi('head'), 0, 0, 0], wt: [1, 0, 0, 0] };
    const t2 = sstep(-0.16, -0.32, y);
    return { idx: [bi('head'), bi('neck'), bi('chest'), 0], wt: [1 - t, t * (1 - t2), t * t2, 0] };
  };
  const loc = (x, y, z) => [(x - HC.x) / hk, (y - HC.y) / hk, (z - HC.z) / hk];
  const style = spec.hair && spec.hair.style || 'none';
  if (style !== 'none' && spec.hair && spec.hair.color) {
    const long = style === 'long', pony = style === 'ponytail', braids = style === 'braids';
    const F = !!spec.female;
    const sdf = (x, y, z) => {
      const [lx, ly, lz] = loc(x, y, z);
      const th = Math.atan2(lx, lz);
      const b = body(x, y, z);
      // шапка: оболочка над кожей головы, к линии роста волос сходит на нет
      const hl = hairline(th, style === 'short' ? 'short' : 'long');
      const md = (hl - ly);                                   // < 0 — внутри области волос
      const fade = Math.pow(sstep(0, 0.028, -md), 1.4);
      const top = sstep(-0.02, 0.09, ly);
      let thick = ((style === 'short' ? 0.0075 : 0.011 + 0.005 * top) * fade - 0.0018 * (1 - fade)) * hk;
      thick += 0.0012 * hk * Math.sin(th * 23 + ly * 70) * fade * (1 - Math.abs(ly) * 4);
      let cap = smax(b - thick, -(b + 0.004), 0.002);
      cap = smax(cap, (md - 0.01) * hk, 0.003 * hk);
      // уши открыты у коротких
      let d = cap;
      if (long) {
        // ниспадающие волосы за спиной
        const curtain = roundBox(lx, ly, lz, [0, -0.17, -0.095], [F ? 0.095 : 0.088, 0.17, 0.028], 0.025) * hk
          + 0.003 * hk * Math.sin(lx * 160 + ly * 20);
        let c = smax(curtain, -(b - 0.006), 0.008);
        c = smax(c, (ly + 0.33 - 0.03 * Math.cos(lx * 30)) * -hk, 0.01); // неровный край
        d = smin(d, c, 0.02 * hk);
        // боковые пряди вдоль шеи
        for (const sx of [-1, 1]) {
          let side = capsule(lx, ly, lz, [sx * 0.07, 0.02, -0.02], [sx * 0.075, F ? -0.2 : -0.14, -0.035], 0.022, 0.016) * hk;
          side = smax(side, -(b - 0.005), 0.006);
          d = smin(d, side, 0.012 * hk);
        }
      }
      if (pony) {
        const pt = [[0, 0.04, -0.1], [0, 0.0, -0.135], [0, -0.12, -0.15], [0, -0.28, -0.13]];
        let tail = capsule(lx, ly, lz, pt[0], pt[1], 0.03, 0.032);
        tail = smin(tail, capsule(lx, ly, lz, pt[1], pt[2], 0.032, 0.026), 0.02);
        tail = smin(tail, capsule(lx, ly, lz, pt[2], pt[3], 0.026, 0.008), 0.02);
        d = smin(d, smax(tail * hk, -(b - 0.004), 0.004), 0.01 * hk);
      }
      if (braids) {
        for (const sx of [-1, 1]) {
          let br = 1;
          for (let i = 0; i < 9; i++) {
            const t = i / 8;
            const c = [sx * (0.07 + t * 0.02), -0.03 - t * 0.3, 0.0 + t * 0.05 + (i % 2 ? 0.006 : -0.006)];
            const r = 0.024 - t * 0.008;
            const e = Math.hypot((lx - c[0]) / r, (ly - c[1]) / (r * 1.25), (lz - c[2]) / r) - 1;
            br = smin(br, e * r, 0.006);
          }
          d = smin(d, smax(br * hk, -(b - 0.004), 0.004), 0.008 * hk);
        }
      }
      return d;
    };
    const b = [HC.x - 0.16, HC.y - (long ? 0.42 : pony ? 0.36 : braids ? 0.4 : 0.14), HC.z - 0.2, HC.x + 0.16, HC.y + 0.14, HC.z + 0.15];
    out.push({
      name: 'hair', slot: 'hair', kind: 'hair', style: 0, sdf, bounds: b, res: 0.8, tris: long ? 16000 : 11000,
      weights: hairWeights, mats: braids ? ['H', 'T'] : ['H'],
      matAt: braids ? (p) => { const [lx, ly] = loc(p.x, p.y, p.z); return ly < -0.3 && Math.abs(lx) > 0.06 ? 1 : 0; } : null,
    });
  }
  if (spec.beard) {
    const big = spec.beard === 'dwarf';
    const sdf = (x, y, z) => {
      const [lx, ly, lz] = loc(x, y, z);
      const b = body(x, y, z);
      let md = beardMask(lx, ly, lz);
      const fade = Math.pow(sstep(0, 0.032, -md), 1.5);
      const th = Math.atan2(lx, lz);
      const thick = ((big ? 0.02 : 0.0085) * fade - 0.0018 * (1 - fade)) * hk + 0.0015 * hk * Math.sin(th * 21 + ly * 60) * fade;
      let d = smax(b - thick, -(b + 0.004), 0.002);
      d = smax(d, (md - 0.01) * hk, 0.003 * hk);
      // усы
      for (const sx of [-1, 1]) {
        const mu = capsule(lx, ly, lz, [sx * 0.004, -0.0605, 0.1], [sx * (big ? 0.038 : 0.027), big ? -0.088 : -0.08, 0.087], big ? 0.0085 : 0.0052, big ? 0.006 : 0.0035);
        d = smin(d, mu * hk, 0.004 * hk);
      }
      if (!big) {
        // аккуратная бородка под подбородком
        const gt = capsule(lx, ly, lz, [0, -0.108, 0.078], [0, -0.128, 0.072], 0.017, 0.01);
        d = smin(d, gt * hk, 0.01 * hk);
      } else {
        // большая борода до пояса, с косичками на конце
        const w = (t) => lerp(0.075, 0.05, t);
        let mass = 1;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const c = [0, -0.115 - t * 0.33, 0.075 + Math.sin(t * 2.4) * 0.05];
          const e = Math.hypot((lx - c[0]) / w(t), (ly - c[1]) / 0.07, (lz - c[2]) / 0.045) - 1;
          mass = smin(mass, e * 0.045, 0.02);
        }
        mass += 0.002 * Math.sin(lx * 220 + ly * 30);
        mass = smax(mass * hk, -(b - 0.006), 0.008);
        d = smin(d, mass, 0.02 * hk);
        for (const sx of [-1, 1]) {
          let br = 1;
          for (let i = 0; i < 5; i++) {
            const c = [sx * 0.028, -0.42 - i * 0.035, 0.1 + i * 0.005 + (i % 2 ? 0.004 : -0.004)];
            const r = 0.016 - i * 0.0015;
            br = smin(br, Math.hypot(lx - c[0], (ly - c[1]) / 1.3, lz - c[2]) - r, 0.004);
          }
          d = smin(d, br * hk, 0.006 * hk);
        }
      }
      return d;
    };
    const b = [HC.x - 0.12, HC.y - (big ? 0.66 : 0.2), HC.z - 0.06, HC.x + 0.12, HC.y + 0.0, HC.z + 0.2];
    out.push({
      name: 'beard', slot: 'hair', kind: 'hair', style: 0, sdf, bounds: b, res: 0.75, tris: big ? 14000 : 7000,
      weights: hairWeights, mats: big ? ['H', 'T'] : ['H'],
      matAt: big ? (p) => { const [, ly] = loc(p.x, p.y, p.z); return ly < -0.555 ? 1 : 0; } : null,
    });
  }
  return out;
}
