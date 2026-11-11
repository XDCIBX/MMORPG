// Полигонизация произвольной SDF-функции на мелкой сетке (послойно, экономно по памяти).
// Грубая сетка подсказывает, где поверхность; точное поле считается только у поверхности.
import { MeshoptSimplifier } from 'meshoptimizer';

export function meshSDF(sdf, bounds, h, { coarse = 4, log = null } = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const hc = h * coarse;
  const cx = Math.ceil((nx - 1) / coarse) + 1, cy = Math.ceil((ny - 1) / coarse) + 1, cz = Math.ceil((nz - 1) / coarse) + 1;
  const t0 = Date.now();
  // грубое поле
  const C = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) C[(k * cy + j) * cx + i] = sdf(x0 + i * hc, y0 + j * hc, z0 + k * hc);
  // отметка грубых ячеек у поверхности
  const band = hc * 1.9;
  const flag = new Uint8Array((cx - 1) * (cy - 1) * (cz - 1));
  for (let k = 0; k < cz - 1; k++) for (let j = 0; j < cy - 1; j++) for (let i = 0; i < cx - 1; i++) {
    let mn = 1e9, mx = -1e9;
    for (let c = 0; c < 8; c++) {
      const v = C[((k + (c >> 2)) * cy + j + ((c >> 1) & 1)) * cx + i + (c & 1)];
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    if ((mn < 0 && mx > 0) || Math.min(Math.abs(mn), Math.abs(mx)) < band) flag[(k * (cy - 1) + j) * (cx - 1) + i] = 1;
  }
  const coarseAt = (i, j, k) => {
    // трилинейная интерполяция грубого поля (вдали от поверхности знак верен)
    const fi = i / coarse, fj = j / coarse, fk = k / coarse;
    const i0 = Math.min(cx - 2, Math.floor(fi)), j0 = Math.min(cy - 2, Math.floor(fj)), k0 = Math.min(cz - 2, Math.floor(fk));
    const u = fi - i0, v = fj - j0, w = fk - k0;
    const g = (a, b, c) => C[((k0 + c) * cy + j0 + b) * cx + i0 + a];
    return (((g(0, 0, 0) * (1 - u) + g(1, 0, 0) * u) * (1 - v) + (g(0, 1, 0) * (1 - u) + g(1, 1, 0) * u) * v) * (1 - w) +
      ((g(0, 0, 1) * (1 - u) + g(1, 0, 1) * u) * (1 - v) + (g(0, 1, 1) * (1 - u) + g(1, 1, 1) * u) * v) * w);
  };
  const isNear = (i, j, k) => {
    const ci = Math.min(cx - 2, Math.floor(i / coarse)), cj = Math.min(cy - 2, Math.floor(j / coarse)), ck = Math.min(cz - 2, Math.floor(k / coarse));
    // узел на границе грубых ячеек — проверяем соседние
    for (let dk = (k % coarse === 0 && ck > 0 ? -1 : 0); dk <= 0; dk++)
      for (let dj = (j % coarse === 0 && cj > 0 ? -1 : 0); dj <= 0; dj++)
        for (let di = (i % coarse === 0 && ci > 0 ? -1 : 0); di <= 0; di++)
          if (flag[((ck + dk) * (cy - 1) + cj + dj) * (cx - 1) + ci + di]) return true;
    return false;
  };
  const layer = (k) => {
    const L = new Float32Array(nx * ny);
    const z = z0 + k * h;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * h;
      for (let i = 0; i < nx; i++) L[j * nx + i] = isNear(i, j, k) ? sdf(x0 + i * h, y, z) : coarseAt(i, j, k);
    }
    return L;
  };
  const pos = [];
  const idx = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  // четырёхугольник с ориентацией: внешняя нормаль вдоль оси ax со знаком sg
  const quad = (a, b, c, d, ax, sg) => {
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const n = ax === 0 ? uy * vz - uz * vy : ax === 1 ? uz * vx - ux * vz : ux * vy - uy * vx;
    if (n * sg >= 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  let Fa = layer(0), Fb = layer(1);
  let cellPrev = new Int32Array(nx * ny).fill(-1), cellCur = new Int32Array(nx * ny).fill(-1);
  for (let c = 0; c < nz - 1; c++) {
    // вершины ячеек слоя c (между узлами c и c+1)
    cellCur.fill(-1);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let q = 0; q < 8; q++) {
        const [a, b, d] = corner[q];
        const v = (d ? Fb : Fa)[(j + b) * nx + i + a];
        cv[q] = v; if (v < 0) mask |= 1 << q;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, b] of edges) {
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
        sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
        sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
        cnt++;
      }
      cellCur[j * nx + i] = pos.length / 3;
      pos.push(x0 + (i + sx / cnt) * h, y0 + (j + sy / cnt) * h, z0 + (c + sz / cnt) * h);
    }
    // рёбра по X и Y в узловом слое c (нужны ячейки слоёв c-1 и c)
    if (c >= 1) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const o = j * nx + i, inside = Fa[o] < 0;
      if (inside !== (Fa[o + 1] < 0)) {
        const a = cellPrev[(j - 1) * nx + i], b = cellPrev[j * nx + i], cc = cellCur[j * nx + i], d = cellCur[(j - 1) * nx + i];
        if (a >= 0 && b >= 0 && cc >= 0 && d >= 0) quad(a, b, cc, d, 0, inside ? 1 : -1);
      }
      if (inside !== (Fa[o + nx] < 0)) {
        const a = cellPrev[j * nx + i - 1], b = cellPrev[j * nx + i], cc = cellCur[j * nx + i], d = cellCur[j * nx + i - 1];
        if (a >= 0 && b >= 0 && cc >= 0 && d >= 0) quad(a, b, cc, d, 1, inside ? 1 : -1);
      }
    }
    // рёбра по Z между узлами c и c+1 (ячейки слоя c)
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const o = j * nx + i;
      if ((Fa[o] < 0) !== (Fb[o] < 0)) {
        const a = cellCur[(j - 1) * nx + i - 1], b = cellCur[(j - 1) * nx + i], cc = cellCur[j * nx + i], d = cellCur[j * nx + i - 1];
        if (a >= 0 && b >= 0 && cc >= 0 && d >= 0) quad(a, b, cc, d, 2, Fa[o] < 0 ? 1 : -1);
      }
    }
    const tmp = cellPrev; cellPrev = cellCur; cellCur = tmp;
    Fa = Fb;
    if (c + 2 < nz) Fb = layer(c + 2);
  }
  if (log) log(`  сетка ${nx}x${ny}x${nz}, вершин ${pos.length / 3}, треугольников ${idx.length / 3}, ${((Date.now() - t0) / 1000).toFixed(1)}с`);
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}

export function gradient(sdf, x, y, z, e = 0.0008) {
  const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e);
  let gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

// Упростить сетку, затем спроецировать вершины на поверхность и взять нормали из поля
export async function simplifyAndFinish(sdf, mesh, targetTris, { error = 0.0015, log = null } = {}) {
  await MeshoptSimplifier.ready;
  let { position, index } = mesh;
  if (index.length / 3 > targetTris) {
    const [ix] = MeshoptSimplifier.simplify(index, position, 3, targetTris * 3, error, ['ErrorAbsolute']);
    index = ix;
  }
  // компактизация
  const remap = new Int32Array(position.length / 3).fill(-1);
  const P = [];
  const I = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) {
    const v = index[i];
    if (remap[v] < 0) { remap[v] = P.length / 3; P.push(position[v * 3], position[v * 3 + 1], position[v * 3 + 2]); }
    I[i] = remap[v];
  }
  const pos = new Float32Array(P), nrm = new Float32Array(P.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    for (let it = 0; it < 3; it++) {
      const f = sdf(x, y, z);
      const g = gradient(sdf, x, y, z);
      x -= g[0] * f; y -= g[1] * f; z -= g[2] * f;
    }
    const g = gradient(sdf, x, y, z);
    pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    nrm[v] = g[0]; nrm[v + 1] = g[1]; nrm[v + 2] = g[2];
  }
  // ориентация треугольников по нормалям
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cxp = uy * vz - uz * vy, cyp = uz * vx - ux * vz, czp = ux * vy - uy * vx;
    const nx = nrm[a] + nrm[b] + nrm[c], ny = nrm[a + 1] + nrm[b + 1] + nrm[c + 1], nz = nrm[a + 2] + nrm[b + 2] + nrm[c + 2];
    if (cxp * nx + cyp * ny + czp * nz < 0) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
  }
  if (log) log(`  упрощено: вершин ${pos.length / 3}, треугольников ${I.length / 3}`);
  return { position: pos, normal: nrm, index: I };
}
