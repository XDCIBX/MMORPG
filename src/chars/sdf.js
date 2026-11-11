// Скульптинг существ через поле расстояний (SDF): гладкое объединение
// эллипсоидов и конусов в единую поверхность, полигонизация Surface Nets,
// нормали по градиенту поля, веса скиннинга по близости к примитивам,
// запечённое затенение (AO) и «драпировка» снаряжения по поверхности тела.
import * as THREE from 'three';

const BIG = 1e3;

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------- Примитивы ----------
// Эллипсоид: центр c, радиусы r, поворот (Euler XYZ). Конус: отрезок a→b, радиусы r1→r2,
// сплющивание sq вдоль оси q (по умолчанию по X — бока).
export class Sculpt {
  constructor() { this.prims = []; this.bones = []; this.boneIdx = new Map(); }

  bone(name, pos, parent = null) {
    this.boneIdx.set(name, this.bones.length);
    this.bones.push({ name, pos: new THREE.Vector3(...pos), parent });
    return name;
  }

  ell(c, r, { bone, k = 0.05, rot = null, sub = false, tag = null } = {}) {
    const m = new THREE.Matrix3();
    if (rot) {
      const m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      m.setFromMatrix4(m4).transpose(); // мир → локальные оси эллипсоида
    }
    const R = Math.max(r[0], r[1], r[2]);
    const p = { t: 0, cx: c[0], cy: c[1], cz: c[2], rx: r[0], ry: r[1], rz: r[2], m: m.elements.slice(), rot: !!rot, k, sub, tag, bone: bone ? this.boneIdx.get(bone) : -1, floor: null };
    this._bbox(p, [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R]);
    this.prims.push(p);
    return p;
  }

  cone(a, b, r1, r2, { bone, k = 0.05, sq = 1, q = [1, 0, 0], sub = false, floor = null, tag = null } = {}) {
    const ql = Math.hypot(q[0], q[1], q[2]);
    const p = {
      t: 1, ax: a[0], ay: a[1], az: a[2], bx: b[0] - a[0], by: b[1] - a[1], bz: b[2] - a[2], r1, r2,
      sq, qx: q[0] / ql, qy: q[1] / ql, qz: q[2] / ql, k, sub, tag, bone: bone ? this.boneIdx.get(bone) : -1, floor,
    };
    p.bb2 = p.bx * p.bx + p.by * p.by + p.bz * p.bz || 1e-9;
    const R = Math.max(r1, r2);
    this._bbox(p, [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R]);
    this.prims.push(p);
    return p;
  }

  _bbox(p, bb) {
    const m = p.k + 0.03;
    p.bb = [bb[0] - m, bb[1] - m, bb[2] - m, bb[3] + m, bb[4] + m, bb[5] + m];
  }

  // расстояние до одного примитива
  static dist(p, x, y, z) {
    if (p.t === 0) {
      let lx = x - p.cx, ly = y - p.cy, lz = z - p.cz;
      if (p.rot) {
        const e = p.m; // column-major 3x3
        const tx = e[0] * lx + e[3] * ly + e[6] * lz;
        const ty = e[1] * lx + e[4] * ly + e[7] * lz;
        const tz = e[2] * lx + e[5] * ly + e[8] * lz;
        lx = tx; ly = ty; lz = tz;
      }
      const ax = lx / p.rx, ay = ly / p.ry, az = lz / p.rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / p.rx, by = ay / p.ry, bz = az / p.rz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-9) return -Math.min(p.rx, p.ry, p.rz);
      return k0 * (k0 - 1) / k1;
    }
    const px = x - p.ax, py = y - p.ay, pz = z - p.az;
    let t = (px * p.bx + py * p.by + pz * p.bz) / p.bb2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    let vx = px - p.bx * t, vy = py - p.by * t, vz = pz - p.bz * t;
    const r = p.r1 + (p.r2 - p.r1) * t;
    let d;
    if (p.sq !== 1) {
      const dq = vx * p.qx + vy * p.qy + vz * p.qz;
      const f = 1 / p.sq - 1;
      vx += dq * f * p.qx; vy += dq * f * p.qy; vz += dq * f * p.qz;
      d = (Math.sqrt(vx * vx + vy * vy + vz * vz) - r) * p.sq;
    } else d = Math.sqrt(vx * vx + vy * vy + vz * vz) - r;
    if (p.floor !== null) d = Math.max(d, p.floor - y);
    return d;
  }

  // полное поле в точке
  // ограничить вычисления примитивами рядом с точкой (ускорение)
  focus(x, y, z, pad) {
    const L = this._focus || (this._focus = []);
    L.length = 0;
    for (const p of this.prims) {
      const b = p.bb;
      if (x < b[0] - pad || y < b[1] - pad || z < b[2] - pad || x > b[3] + pad || y > b[4] + pad || z > b[5] + pad) continue;
      L.push(p);
    }
    this._list = L;
  }
  unfocus() { this._list = null; }

  sdf(x, y, z) {
    let f = BIG;
    const P = this._list || this.prims;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], b = p.bb;
      if (x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) continue;
      const d = Sculpt.dist(p, x, y, z);
      f = p.sub ? -smin(-f, d, p.k) : smin(f, d, p.k);
    }
    return f;
  }

  grad(x, y, z, out, e = 0.003) {
    // тетраэдральная схема: 4 выборки
    const a = this.sdf(x + e, y - e, z - e), b = this.sdf(x - e, y - e, z + e), c = this.sdf(x - e, y + e, z - e), d = this.sdf(x + e, y + e, z + e);
    out.set(a - b - c + d, -a - b + c + d, -a + b - c + d);
    const l = out.length();
    if (l > 1e-12) out.multiplyScalar(1 / l); else out.set(0, 1, 0);
    return out;
  }

  // Луч изнутри тела наружу до поверхности (+ отступ)
  hit(o, dir, off = 0, max = 1.5) {
    const d = dir.clone().normalize();
    let t0 = 0, f0 = this.sdf(o.x, o.y, o.z) - off;
    if (f0 > 0) return { p: o.clone(), n: this.grad(o.x, o.y, o.z, new THREE.Vector3()) };
    const step = 0.01;
    let t1 = step;
    for (; t1 < max; t1 += step) {
      const f = this.sdf(o.x + d.x * t1, o.y + d.y * t1, o.z + d.z * t1) - off;
      if (f > 0) break;
      t0 = t1;
    }
    for (let i = 0; i < 12; i++) {
      const tm = (t0 + t1) / 2;
      const f = this.sdf(o.x + d.x * tm, o.y + d.y * tm, o.z + d.z * tm) - off;
      if (f > 0) t1 = tm; else t0 = tm;
    }
    const p = o.clone().addScaledVector(d, (t0 + t1) / 2);
    return { p, n: this.grad(p.x, p.y, p.z, new THREE.Vector3()) };
  }

  // вытолкнуть точку наружу до расстояния off от поверхности
  pushOut(p, off) {
    const g = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const f = this.sdf(p.x, p.y, p.z);
      if (f >= off) return p;
      this.grad(p.x, p.y, p.z, g);
      p.addScaledVector(g, off - f + 0.001);
    }
    return p;
  }

  // Веса костей в точке: мягкий минимум расстояний до примитивов
  weightsAt(x, y, z, sigma = 0.022, allow = null) {
    const P = this._list || this.prims;
    const nb = this.bones.length;
    const acc = this._acc || (this._acc = new Float32Array(64));
    acc.fill(0, 0, nb);
    let dmin = BIG;
    const ds = this._ds || (this._ds = new Float32Array(this.prims.length));
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.sub || p.bone < 0 || (allow && !allow.has(p.bone))) { ds[i] = BIG; continue; }
      const d = Sculpt.dist(p, x, y, z);
      ds[i] = d;
      if (d < dmin) dmin = d;
    }
    for (let i = 0; i < P.length; i++) {
      if (ds[i] >= BIG) continue;
      const w = Math.exp(-(ds[i] - dmin) / sigma);
      if (w > 1e-3) acc[P[i].bone] += w;
    }
    // четыре самые весомые кости
    const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0];
    for (let b = 0; b < nb; b++) {
      const w = acc[b];
      if (w <= wt[3]) continue;
      let s = 3;
      while (s > 0 && w > wt[s - 1]) { wt[s] = wt[s - 1]; idx[s] = idx[s - 1]; s--; }
      wt[s] = w; idx[s] = b;
    }
    const sum = wt[0] + wt[1] + wt[2] + wt[3] || 1;
    return { idx, wt: wt.map(w => w / sum) };
  }

  // Фоновое затенение по полю (дешёвый AO)
  ao(p, n) {
    let occ = 0, sc = 1;
    for (const h of [0.025, 0.06, 0.12, 0.22]) {
      const d = this.sdf(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h);
      occ += (h - Math.max(0, d)) * sc;
      sc *= 0.6;
    }
    return Math.max(0, Math.min(1, 1 - occ * 3.2));
  }

  // ---------- Полигонизация (Surface Nets) ----------
  mesh(h, bounds) {
    const [x0, y0, z0, x1, y1, z1] = bounds;
    const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
    const N = nx * ny * nz;
    const _t0 = performance.now();
    const F = new Float32Array(N).fill(BIG);
    const sxy = nx * ny;
    // накопление поля по примитивам в их рамках
    for (const p of this.prims) {
      const b = p.bb;
      const i0 = Math.max(0, Math.floor((b[0] - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((b[3] - x0) / h));
      const j0 = Math.max(0, Math.floor((b[1] - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((b[4] - y0) / h));
      const k0 = Math.max(0, Math.floor((b[2] - z0) / h)), k1 = Math.min(nz - 1, Math.ceil((b[5] - z0) / h));
      for (let k = k0; k <= k1; k++) {
        const z = z0 + k * h;
        for (let j = j0; j <= j1; j++) {
          const y = y0 + j * h;
          let o = k * sxy + j * nx + i0;
          for (let i = i0; i <= i1; i++, o++) {
            const d = Sculpt.dist(p, x0 + i * h, y, z);
            const f = F[o];
            F[o] = p.sub ? -smin(-f, d, p.k) : smin(f, d, p.k);
          }
        }
      }
    }
    const _t1 = performance.now();
    // вершины в ячейках со сменой знака
    const cell = new Int32Array(N).fill(-1);
    const pos = [];
    const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    const skip = h * 2.5;
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const f0 = F[k * sxy + j * nx + i];
      if (f0 > skip || f0 < -skip) continue;
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = F[(k + corner[c][2]) * sxy + (j + corner[c][1]) * nx + i + corner[c][0]];
        cv[c] = v;
        if (v < 0) mask |= 1 << c;
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
      cell[k * sxy + j * nx + i] = pos.length / 3;
      pos.push(x0 + (i + sx / cnt) * h, y0 + (j + sy / cnt) * h, z0 + (k + sz / cnt) * h);
    }
    // грани: по каждому ребру решётки со сменой знака — четырёхугольник
    const idx = [];
    const C = (i, j, k) => cell[k * sxy + j * nx + i];
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const o = k * sxy + j * nx + i;
      const inside = F[o] < 0;
      // ребро по X
      if (inside !== (F[o + 1] < 0)) {
        const a = C(i, j - 1, k - 1), b = C(i, j, k - 1), c = C(i, j, k), d = C(i, j - 1, k);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, b, c, a, c, d);
      }
      if (inside !== (F[o + nx] < 0)) {
        const a = C(i - 1, j, k - 1), b = C(i, j, k - 1), c = C(i, j, k), d = C(i - 1, j, k);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, b, c, a, c, d);
      }
      if (inside !== (F[o + sxy] < 0)) {
        const a = C(i - 1, j - 1, k), b = C(i, j - 1, k), c = C(i, j, k), d = C(i - 1, j, k);
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, b, c, a, c, d);
      }
    }
    const _t2 = performance.now();
    // уточнение вершин к поверхности и нормали по градиенту
    const P = new Float32Array(pos), Nn = new Float32Array(pos.length);
    const g = new THREE.Vector3();
    for (let v = 0; v < P.length; v += 3) {
      let x = P[v], y = P[v + 1], z = P[v + 2];
      this.focus(x, y, z, h * 2);
      for (let it = 0; it < 2; it++) {
        const f = this.sdf(x, y, z);
        this.grad(x, y, z, g);
        const s = Math.max(-h, Math.min(h, f));
        x -= g.x * s; y -= g.y * s; z -= g.z * s;
      }
      this.grad(x, y, z, g);
      P[v] = x; P[v + 1] = y; P[v + 2] = z;
      Nn[v] = g.x; Nn[v + 1] = g.y; Nn[v + 2] = g.z;
    }
    this.unfocus();
    // согласование ориентации треугольников с нормалями
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      A.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
      B.set(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]);
      Cc.crossVectors(A, B);
      const nx_ = Nn[a] + Nn[b] + Nn[c], ny_ = Nn[a + 1] + Nn[b + 1] + Nn[c + 1], nz_ = Nn[a + 2] + Nn[b + 2] + Nn[c + 2];
      if (Cc.x * nx_ + Cc.y * ny_ + Cc.z * nz_ < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
    }
    if (globalThis.__sdfDebug) console.log('field', (_t1 - _t0) | 0, 'nets', (_t2 - _t1) | 0, 'proj', (performance.now() - _t2) | 0);
    return { position: P, normal: Nn, index: idx };
  }
}

// ---------- Геометрия-помощники для снаряжения ----------
// Сетка-«драпировка»: fn(u, v) → {o: Vector3, d: Vector3, off: number} — луч изнутри тела
export function drapeGeo(sc, fn, nu, nv, { uvScale = [1, 1] } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    const r = fn(u, v);
    let p, n;
    if (r.p) { p = r.p; n = r.n || new THREE.Vector3(0, 1, 0); }
    else { const h = sc.hit(r.o, r.d, r.off || 0); p = h.p; n = h.n; }
    pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u * uvScale[0], v * uvScale[1]);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // ориентация: лицевая сторона наружу
  g.computeVertexNormals();
  const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, Math.floor(pos.length / 6));
  const ref = new THREE.Vector3(nor[Math.floor(pos.length / 6) * 3], nor[Math.floor(pos.length / 6) * 3 + 1], nor[Math.floor(pos.length / 6) * 3 + 2]);
  if (n0.dot(ref) < 0) {
    const ix = g.index.array;
    for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
    g.computeVertexNormals();
  }
  return g;
}

// Лента вдоль пути точек; side(i) — направление ширины
export function ribbonGeo(pts, width, sideFn, { taper = 0, uvLen = 1 } = {}) {
  const pos = [], uv = [], idx = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const s = sideFn(i).clone().normalize();
    const w = width * (1 - taper * i / (n - 1)) * 0.5;
    const p = pts[i];
    pos.push(p.x - s.x * w, p.y - s.y * w, p.z - s.z * w, p.x + s.x * w, p.y + s.y * w, p.z + s.z * w);
    uv.push(0, 1 - (i / (n - 1)) * uvLen, 1, 1 - (i / (n - 1)) * uvLen);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Слить несколько геометрий (одинаковые атрибуты) в одну
export function mergeGeos(list) {
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  const idx = [];
  let base = 0;
  const arrays = {};
  for (const nm of names) arrays[nm] = [];
  for (const g of list) {
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (const nm of names) { const a = g.attributes[nm]; if (!a) continue; for (let i = 0; i < a.array.length; i++) arrays[nm].push(a.array[i]); }
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + base);
    base += g.attributes.position.count;
  }
  for (const nm of names) out.setAttribute(nm, new THREE.Float32BufferAttribute(arrays[nm], list[0].attributes[nm].itemSize));
  out.setIndex(idx);
  return out;
}
