// Детальное оружие и щиты для запекания (ось оружия +Y, хват в начале координат).
// Материалы: B — клинок (металл c1), T — отделка, L — кожа рукояти, W — дерево,
// G — камень, O — кость, S — тетива, C — ткань/герб (c2), F — лицевая сторона щита, D — тёмный металл.

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const lerp = (a, b, t) => a + (b - a) * t;

function cap(x, y, z, a, b, r1, r2 = r1) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = x - a[0], qy = y - a[1], qz = z - a[2];
  const t = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(qx - bx * t, qy - by * t, qz - bz * t) - lerp(r1, r2, t);
}
function rbox(x, y, z, c, h, r) {
  const qx = Math.abs(x - c[0]) - h[0] + r, qy = Math.abs(y - c[1]) - h[1] + r, qz = Math.abs(z - c[2]) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// цилиндр вдоль Y
function cylY(x, y, z, c, r, h) {
  const dr = Math.hypot(x - c[0], z - c[2]) - r, dy = Math.abs(y - c[1]) - h;
  return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
}
const octa = (x, y, z, c, r) => (Math.abs(x - c[0]) + Math.abs(y - c[1]) * 0.75 + Math.abs(z - c[2]) - r) * 0.57;
// цепочка капсул по точкам
function chain(x, y, z, pts, r0, r1, k = 0) {
  let v = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = cap(x, y, z, pts[i], pts[i + 1], lerp(r0, r1, i / (pts.length - 1)), lerp(r0, r1, (i + 1) / (pts.length - 1)));
    v = k ? smin(v, d, k) : Math.min(v, d);
  }
  return v;
}
function bez(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([0, 1, 2].map(a => u * u * u * p0[a] + 3 * u * u * t * p1[a] + 3 * u * t * t * p2[a] + t * t * t * p3[a]));
  }
  return out;
}

// клинок с ромбическим сечением, долом и острием
function blade(x, y, z, y0, L, W, Tk, tip) {
  const yy = y - y0;
  const t = Math.min(1, Math.max(0, yy / L));
  let w = W * (1 - 0.14 * t);
  if (yy > L - tip) w *= Math.pow(Math.max(0, (L - yy) / tip), 0.8);
  w = Math.max(w, 1e-4);
  let th = Tk * (0.55 + 0.45 * Math.min(1, w / W));
  const fuller = Math.exp(-((x / (W * 0.13)) ** 2)) * sstep(0.02, 0.06, yy) * (1 - sstep(L * 0.62, L * 0.72, yy));
  th *= 1 - 0.42 * fuller;
  const e = Math.abs(x) / w + Math.abs(z) / th - 1;
  let d = e * (w * th) / Math.hypot(w, th);
  d = Math.max(d, -yy, yy - L);
  return d;
}
// гарда с загнутыми концами
function guard(x, y, z, gy, half, r, drop = 0.03) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const u = (i / 8) * 2 - 1; pts.push([u * half, gy - drop * u * u, 0]); }
  let v = chain(x, y, z, pts, r, r, 0.006);
  for (const s of [-1, 1]) v = smin(v, Math.hypot(x - s * half, y - gy + drop, z) - r * 1.35, 0.006);
  return smin(v, rbox(x, y, z, [0, gy, 0], [0.022, 0.018, 0.022], 0.006), 0.008);
}
// рукоять с обмоткой
function grip(x, y, z, y0, y1, r) {
  const a = Math.atan2(z, x);
  const wrap = 0.0016 * Math.max(0, Math.sin(a + y * 230));
  return cylY(x, y, z, [0, (y0 + y1) / 2, 0], r + wrap, (y1 - y0) / 2);
}
function woodShaft(x, y, z, y0, y1, r0, r1) {
  const a = Math.atan2(z, x);
  const grain = 0.0007 * Math.sin(a * 7 + y * 18) + 0.0005 * Math.sin(y * 90);
  return cap(x, y, z, [0, y0, 0], [0, y1, 0], r0, r1) - grain;
}

export function weaponDefs() {
  const W = [];
  // ---- одноручный меч ----
  for (const big of [false, true]) {
    const gl = big ? 0.3 : 0.15, bl = big ? 1.25 : 0.82, bw = big ? 0.085 : 0.058, gw = big ? 0.19 : 0.12;
    const gy = gl - 0.04, by0 = gl - 0.02;
    W.push({
      type: big ? 'greatsword' : 'sword', mats: ['B', 'T', 'L', 'G'], tris: big ? 7000 : 6000,
      bounds: [-gw - 0.04, -0.12, -0.05, gw + 0.04, by0 + bl + 0.02, 0.05],
      comps: [
        { mat: 'B', fn: (x, y, z) => blade(x, y, z, by0, bl, bw / 2, 0.0085 * (big ? 1.2 : 1), bw * 1.5) },
        { mat: 'T', fn: (x, y, z) => guard(x, y, z, gy, gw, 0.011) },
        { mat: 'L', fn: (x, y, z) => grip(x, y, z, -0.055, gy - 0.012, 0.0165) },
        { mat: 'T', fn: (x, y, z) => smin(Math.hypot(x / 1.0, (y + 0.075) / 1.15, z / 0.8) - 0.025, cylY(x, y, z, [0, -0.052, 0], 0.019, 0.006), 0.006) },
        { mat: 'G', fn: (x, y, z) => octa(x, y, z, [0, gy, 0.021], 0.016) },
        { mat: 'G', fn: (x, y, z) => octa(x, y, z, [0, -0.075, 0.022], 0.011) },
      ],
    });
  }
  // ---- топор ----
  {
    const head = (x, y, z) => {
      // лезвие в плоскости Y-Z, толщина по X
      const u = z, v = y - 0.58;
      const R = Math.hypot(u - 0.0, v * 0.95) - 0.215;
      const top = v - (0.035 + Math.pow(Math.max(0, u) / 0.22, 2) * 0.12);
      const bot = -0.035 - Math.pow(Math.max(0, u) / 0.22, 2) * 0.15 - v;
      const d2 = Math.max(R, top, bot, 0.02 - u);
      const edge = Math.hypot(u, v * 0.95);
      const th = 0.013 * (1 - sstep(0.12, 0.214, edge)) + 0.0012 + 0.004 * (1 - sstep(0.02, 0.07, u));
      return Math.max(d2, Math.abs(x) - th);
    };
    W.push({
      type: 'axe', mats: ['W', 'B', 'D', 'L', 'G'], tris: 6000,
      bounds: [-0.05, -0.16, -0.12, 0.05, 0.74, 0.26],
      comps: [
        { mat: 'W', fn: (x, y, z) => woodShaft(x, y, z, -0.13, 0.7, 0.019, 0.0165) },
        { mat: 'L', fn: (x, y, z) => grip(x, y, z, -0.11, 0.1, 0.0205) },
        { mat: 'B', fn: head },
        { mat: 'D', fn: (x, y, z) => smin(rbox(x, y, z, [0, 0.58, 0.0], [0.025, 0.06, 0.03], 0.008), cap(x, y, z, [0, 0.58, -0.02], [0, 0.6, -0.1], 0.016, 0.004), 0.01) },
        { mat: 'G', fn: (x, y, z) => octa(x, y, z, [0.026, 0.58, 0.0], 0.013) },
      ],
    });
  }
  // ---- боевой молот ----
  {
    W.push({
      type: 'hammer', mats: ['W', 'B', 'T', 'L', 'G'], tris: 6000,
      bounds: [-0.11, -0.16, -0.24, 0.11, 0.84, 0.24],
      comps: [
        { mat: 'W', fn: (x, y, z) => woodShaft(x, y, z, -0.13, 0.66, 0.021, 0.019) },
        { mat: 'L', fn: (x, y, z) => grip(x, y, z, -0.11, 0.12, 0.023) },
        { mat: 'B', fn: (x, y, z) => {
          let v = rbox(x, y, z, [0, 0.65, 0], [0.07, 0.068, 0.13], 0.014);
          for (const s of [-1, 1]) v = smin(v, Math.max(Math.hypot(x, y - 0.65) - 0.085, Math.abs(z - s * 0.15) - 0.024), 0.01); // расширенные бойки
          return v;
        } },
        { mat: 'T', fn: (x, y, z) => { let v = 1e9; for (const s of [-1, 1]) v = Math.min(v, Math.max(Math.hypot(x, y - 0.65) - 0.081, Math.abs(z - s * 0.07) - 0.011)); return v; } },
        { mat: 'T', fn: (x, y, z) => cap(x, y, z, [0, 0.71, 0], [0, 0.82, 0], 0.024, 0.002) },
        { mat: 'G', fn: (x, y, z) => octa(x, y, z, [0.073, 0.65, 0], 0.018) },
      ],
    });
  }
  // ---- луки ----
  for (const big of [false, true]) {
    const half = big ? 0.72 : 0.55;
    const limbs = [1, -1].map(sy => bez([0, sy * 0.08, 0], [0, sy * half * 0.45, 0.06], [0, sy * half * 0.85, -0.02], [0, sy * half, -0.16], 14));
    W.push({
      type: big ? 'longbow' : 'bow', mats: ['W', 'L', 'T', 'S', 'G'], tris: 5000,
      bounds: [-0.04, -half - 0.04, -0.2, 0.04, half + 0.04, 0.1],
      comps: [
        ...limbs.map(pts => ({ mat: 'W', fn: (x, y, z) => chain(x / 1.25, y, z, pts, 0.019, 0.007, 0.004) })),
        { mat: 'L', fn: (x, y, z) => grip(x, y, z, -0.09, 0.09, 0.021) },
        ...[1, -1].map(sy => ({ mat: 'T', fn: (x, y, z) => Math.hypot(x, y - sy * half, z + 0.16) - 0.013 })),
        { mat: 'S', fn: (x, y, z) => cap(x, y, z, [0, -half, -0.16], [0, half, -0.16], 0.0024) },
        { mat: 'G', fn: (x, y, z) => Math.min(octa(x, y, z, [0, 0.11, 0.024], 0.013), octa(x, y, z, [0, -0.11, 0.024], 0.013)) },
      ],
    });
  }
  // ---- посох и жезл ----
  for (const big of [true, false]) {
    const y0 = big ? -0.65 : -0.08, y1 = big ? 1.1 : 0.34, top = y1 + 0.1;
    const r0 = big ? 0.024 : 0.013, r1 = big ? 0.019 : 0.01;
    W.push({
      type: big ? 'staff' : 'wand', mats: ['W', 'T', 'L'], tris: big ? 7000 : 4000, res: big ? 1.4 : 1,
      bounds: [-0.09, y0 - 0.03, -0.09, 0.09, top + 0.12, 0.09],
      comps: [
        { mat: 'W', fn: (x, y, z) => {
          const a = Math.atan2(z, x);
          const tw = 0.0024 * Math.sin(a * 2 + y * 9) * (big ? 1 : 0.5);
          let v = cap(x, y, z, [0, y0, 0], [0, y1, 0], r0, r1) - tw;
          if (big) for (const ky of [-0.2, 0.25, 0.62]) v = smin(v, Math.hypot(x - 0.012, (y - ky) / 1.6, z) - 0.024, 0.02);
          return v;
        } },
        ...(big ? [-0.35, 0.05, 0.45] : [0.05]).map(ry => ({ mat: 'T', fn: (x, y, z) => Math.max(Math.abs(Math.hypot(x, z) - r0 - 0.002) - 0.004, Math.abs(y - ry) - 0.012) })),
        { mat: 'L', fn: (x, y, z) => grip(x, y, z, big ? -0.08 : -0.06, big ? 0.12 : 0.04, r0 + 0.002) },
        // когти-держатель кристалла
        ...[0, 1, 2, 3].map(i => {
          const a = i / 4 * Math.PI * 2 + 0.4;
          const sc = big ? 1 : 0.55;
          const pts = bez([0, y1 - 0.02, 0], [Math.cos(a) * 0.06 * sc, y1 + 0.03 * sc, Math.sin(a) * 0.06 * sc], [Math.cos(a) * 0.075 * sc, y1 + 0.12 * sc, Math.sin(a) * 0.075 * sc], [Math.cos(a) * 0.025 * sc, y1 + 0.2 * sc, Math.sin(a) * 0.025 * sc], 8);
          return { mat: 'T', fn: (x, y, z) => chain(x, y, z, pts, 0.011 * sc, 0.003 * sc, 0.004) };
        }),
        { mat: 'T', fn: (x, y, z) => cylY(x, y, z, [0, y1 - 0.01, 0], r1 + 0.008, 0.018) },
      ],
    });
  }
  // ---- коса ----
  {
    const bladeY = 1.16;
    W.push({
      type: 'scythe', mats: ['W', 'B', 'T', 'O', 'L'], tris: 7000, res: 1.4,
      bounds: [-0.06, -0.66, -0.12, 0.06, 1.36, 0.86],
      comps: [
        { mat: 'W', fn: (x, y, z) => chain(x, y, z, [[0, -0.6, 0], [0, 0.3, 0.015], [0, 1.22, 0]], 0.021, 0.018, 0.01) },
        { mat: 'W', fn: (x, y, z) => cap(x, y, z, [0, 0.42, 0.0], [0.0, 0.48, 0.11], 0.012, 0.01) },
        { mat: 'L', fn: (x, y, z) => grip(x, y, z, -0.1, 0.12, 0.023) },
        { mat: 'B', fn: (x, y, z) => {
          const u = z, v = y - bladeY;
          const A = Math.hypot(u - 0.38, v + 0.3) - 0.47;
          const Bc = Math.hypot(u - 0.43, v + 0.37) - 0.47;
          let d2 = Math.max(A, -Bc, -u + 0.01, u - 0.8);
          const spine = Math.max(0, -A);
          const th = 0.007 * sstep(0.0, 0.03, spine) + 0.0012;
          return Math.max(d2, Math.abs(x) - th);
        } },
        { mat: 'T', fn: (x, y, z) => rbox(x, y, z, [0, bladeY, 0.02], [0.03, 0.04, 0.04], 0.01) },
        { mat: 'O', fn: (x, y, z) => smin(Math.hypot(x, (y - bladeY - 0.06) / 1.1, z + 0.01) - 0.04, Math.hypot(x, y - bladeY - 0.02, z - 0.025) - 0.022, 0.012) },
      ],
    });
  }
  // ---- костяной посох ----
  {
    const top = 1.0;
    W.push({
      type: 'bonestaff', mats: ['O', 'T'], tris: 7000, res: 1.4,
      bounds: [-0.12, -0.66, -0.1, 0.12, top + 0.3, 0.12],
      comps: [
        { mat: 'O', fn: (x, y, z) => {
          let v = cap(x, y, z, [0, -0.6, 0], [0, top, 0], 0.02, 0.017);
          for (let i = 0; i < 9; i++) { const yy = -0.5 + i * 0.16; v = smin(v, Math.hypot(x / 1.2, (y - yy) / 0.6, z / 1.2) - 0.03, 0.02); }
          return v;
        } },
        { mat: 'O', fn: (x, y, z) => {
          // череп
          const c = [0, top + 0.09, 0];
          let s = Math.hypot((x - c[0]) / 0.9, (y - c[1]) / 1.0, (z - c[2] + 0.005) / 1.05) - 0.068;
          s = smin(s, rbox(x, y, z, [0, top + 0.025, 0.03], [0.035, 0.025, 0.03], 0.012), 0.02);
          for (const sx of [-1, 1]) s = smax(s, -(Math.hypot(x - sx * 0.025, y - top - 0.085, z - 0.06) - 0.019), 0.006);
          s = smax(s, -(Math.hypot(x, (y - top - 0.05) / 1.5, z - 0.07) - 0.01), 0.004);
          for (const sx of [-1, 1]) s = smin(s, chain(x, y, z, bez([sx * 0.05, top + 0.13, -0.01], [sx * 0.1, top + 0.17, -0.02], [sx * 0.12, top + 0.24, -0.05], [sx * 0.09, top + 0.3, -0.08], 8), 0.016, 0.003, 0.004), 0.01);
          return s;
        } },
        { mat: 'T', fn: (x, y, z) => Math.max(Math.abs(Math.hypot(x, z) - 0.024) - 0.005, Math.abs(y - top + 0.06) - 0.016) },
      ],
    });
  }
  // ---- щиты ----
  W.push({
    type: 'shield0', mats: ['F', 'T', 'C'], tris: 7000, res: 1.6,
    bounds: [-0.36, -0.36, -0.08, 0.36, 0.36, 0.14],
    comps: [
      { mat: 'F', fn: (x, y, z) => {
        const r = Math.hypot(x, y);
        let v = Math.max(Math.abs(Math.hypot(x, y, z + 0.62) - 0.66) - 0.011, r - 0.318);
        v -= 0.0012 * Math.max(0, Math.sin(Math.atan2(y, x) * 0 + x * 60)) * (1 - sstep(0.2, 0.3, r));
        return v;
      } },
      { mat: 'T', fn: (x, y, z) => { const r = Math.hypot(x, y); const zz = Math.sqrt(Math.max(0, 0.66 * 0.66 - r * r)) - 0.62; return Math.hypot(r - 0.318, z - zz) - 0.016; } },
      { mat: 'T', fn: (x, y, z) => smax(Math.hypot(x, y, z - 0.0) - 0.085, 0.0 - z, 0.004) },
      { mat: 'T', fn: (x, y, z) => { let v = 1e9; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; v = Math.min(v, Math.hypot(x - Math.cos(a) * 0.29, y - Math.sin(a) * 0.29, z - 0.006) - 0.012); } return v; } },
      { mat: 'C', fn: (x, y, z) => { const r = Math.hypot(x, y); return Math.max(Math.abs(Math.hypot(x, y, z + 0.62) - 0.672) - 0.003, r - 0.24, 0.11 - r); } },
    ],
  });
  W.push({
    type: 'shield1', mats: ['F', 'T', 'C'], tris: 7000, res: 1.6,
    bounds: [-0.32, -0.5, -0.1, 0.32, 0.34, 0.12],
    comps: (() => {
      const half = (y) => 0.27 * Math.pow(Math.min(1, Math.max(0, (y + 0.45) / 0.73)), 0.55);
      const surfZ = (x) => -0.13 * (x / 0.27) ** 2;
      const shape2 = (x, y, inset) => Math.max(Math.abs(x) - (half(y) - inset), y - (0.28 - inset), -0.45 + inset * 1.6 - y);
      return [
        { mat: 'F', fn: (x, y, z) => Math.max(shape2(x, y, 0), Math.abs(z - surfZ(x)) - 0.012) },
        { mat: 'T', fn: (x, y, z) => Math.max(shape2(x, y, -0.006), -shape2(x, y, 0.026), Math.abs(z - surfZ(x) - 0.004) - 0.015) },
        { mat: 'C', fn: (x, y, z) => Math.max(shape2(x, y, 0.045), Math.abs(z - surfZ(x) - 0.013) - 0.003) },
        { mat: 'T', fn: (x, y, z) => Math.max(Math.min(Math.max(Math.abs(x) - 0.025, Math.abs(y + 0.05) - 0.27), Math.max(Math.abs(x) - 0.19, Math.abs(y - 0.1) - 0.025)), shape2(x, y, 0.04), Math.abs(z - surfZ(x) - 0.016) - 0.006) },
      ];
    })(),
  });
  // ---- колчан ----
  W.push({
    type: 'quiver', mats: ['L', 'T', 'W', 'C'], tris: 6000, res: 1.3,
    bounds: [-0.09, -0.29, -0.09, 0.09, 0.47, 0.09],
    comps: [
      { mat: 'L', fn: (x, y, z) => { let v = cylY(x, y, z, [0, 0, 0], 0.056 - y * 0.02, 0.25); v = Math.max(v, -(cylY(x, y, z, [0, 0.03, 0], 0.048, 0.25))); return v - 0.0008 * Math.sin(y * 200); } },
      ...[0.23, -0.05, -0.23].map(ry => ({ mat: 'T', fn: (x, y, z) => Math.max(Math.abs(Math.hypot(x, z) - 0.058 + ry * 0.02) - 0.004, Math.abs(y - ry) - 0.01) })),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => {
        const a = i / 7 * Math.PI * 2;
        const px = Math.cos(a) * 0.028, pz = Math.sin(a) * 0.028;
        return { mat: 'W', fn: (x, y, z) => cap(x, y, z, [px, 0.0, pz], [px * 1.2, 0.36, pz * 1.2], 0.0035) };
      }),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => {
        const a = i / 7 * Math.PI * 2;
        const px = Math.cos(a) * 0.034, pz = Math.sin(a) * 0.034;
        return { mat: 'C', fn: (x, y, z) => {
          const dx = x - px, dz = z - pz;
          const ca = Math.cos(a), sa = Math.sin(a);
          const across = -dx * sa + dz * ca, along = dx * ca + dz * sa;
          return Math.max(Math.abs(across) - 0.0012, Math.abs(along) - 0.013 + (y - 0.37) * 0.05, Math.abs(y - 0.37) - 0.04);
        } };
      }),
    ],
  });
  return W;
}

export function weaponSDF(def) {
  const comps = def.comps;
  const sdf = (x, y, z) => { let v = 1e9; for (const c of comps) { const d = c.fn(x, y, z); if (d < v) v = d; } return v; };
  const matAt = (x, y, z) => { let best = 1e9, mi = 0; for (const c of comps) { const d = c.fn(x, y, z); if (d < best) { best = d; mi = def.mats.indexOf(c.mat); } } return Math.max(0, mi); };
  return { sdf, matAt };
}
