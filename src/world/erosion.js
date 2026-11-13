// Эрозия карты высот (на месте). h — высоты в метрах, V — вершин по стороне, mask — где разрешено размывать.

// Осыпание: если перепад к соседу больше talus (м на клетку), часть грунта сползает вниз.
// Так острые иглы оплывают, а у подножия копятся осыпи с углом естественного откоса.
export function thermalErode(h, V, mask, talus, iters, rate) {
  const nb = [1, -1, V, -V, V + 1, V - 1, -V + 1, -V - 1];
  const nbd = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  const ex = new Float32Array(8);
  for (let it = 0; it < iters; it++) {
    // чередуем направление обхода, чтобы не было «волны» в одну сторону
    const rev = it & 1;
    for (let jj = 1; jj < V - 1; jj++) {
      const j = rev ? V - 1 - jj : jj;
      for (let ii = 1; ii < V - 1; ii++) {
        const i = rev ? V - 1 - ii : ii;
        const idx = j * V + i;
        const mk = mask[idx];
        if (mk < 0.01) continue;
        const hc = h[idx];
        // делим излишек между всеми соседями, что ниже угла откоса
        let tot = 0, mxd = 0;
        for (let k = 0; k < 8; k++) {
          const d = (hc - h[idx + nb[k]]) - talus * nbd[k];
          ex[k] = d > 0 ? d : 0;
          tot += ex[k]; if (d > mxd) mxd = d;
        }
        if (tot <= 0) continue;
        const mv = mxd * 0.5 * rate * mk;
        h[idx] -= mv;
        for (let k = 0; k < 8; k++) if (ex[k] > 0) h[idx + nb[k]] += mv * ex[k] / tot;
      }
    }
  }
}

// Дождевые капли (по мотивам Hans Theobald Beyer / Sebastian Lague):
// капля катится по склону, набирает скорость и грунт, на пологом — откладывает его.
export function hydraulicErode(h, V, mask, drops, rnd, CELL, o = {}) {
  const inertia = o.inertia ?? 0.06;
  const capF = o.capacity ?? 3.0;
  const minCap = o.minCap ?? 0.01;
  const erodeS = o.erode ?? 0.3;
  const depositS = o.deposit ?? 0.25;
  const evap = o.evaporate ?? 0.02;
  const grav = o.gravity ?? 4;
  const maxSteps = o.steps ?? 70;
  const R = o.radius ?? 2;
  const maxErode = (o.maxErode ?? 0.7);    // м за шаг, чтобы капля не прокопала шахту
  // кисть: клетки в радиусе R с весами
  const bOff = [], bW = [];
  let wsum = 0;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const d = Math.hypot(di, dj);
    if (d > R) continue;
    bOff.push([di, dj]); bW.push(R - d + 0.25); wsum += R - d + 0.25;
  }
  for (let k = 0; k < bW.length; k++) bW[k] /= wsum;
  // склоны считаем в «метрах на клетку», переводим в безразмерный уклон
  const s = 1 / CELL;
  const hg = (px, py, out) => {
    const x = px | 0, y = py | 0, fx = px - x, fy = py - y;
    const i = y * V + x;
    const a = h[i], b = h[i + 1], c = h[i + V], d = h[i + V + 1];
    out[0] = ((b - a) * (1 - fy) + (d - c) * fy) * s;
    out[1] = ((c - a) * (1 - fx) + (d - b) * fx) * s;
    out[2] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  };
  const g = [0, 0, 0], g2 = [0, 0, 0];
  // старт только там, где горы (с вероятностью по маске)
  let made = 0, tries = 0;
  while (made < drops && tries < drops * 30) {
    tries++;
    let px = 2 + rnd() * (V - 5), py = 2 + rnd() * (V - 5);
    if (mask[(py | 0) * V + (px | 0)] < rnd()) continue;
    made++;
    let dx = 0, dy = 0, speed = 1, water = 1, sed = 0;
    for (let step = 0; step < maxSteps; step++) {
      const nx = px | 0, ny = py | 0;
      const fx = px - nx, fy = py - ny;
      hg(px, py, g);
      dx = dx * inertia - g[0] * (1 - inertia);
      dy = dy * inertia - g[1] * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-7) break;
      dx /= len; dy /= len;
      px += dx; py += dy;
      if (px < 2 || py < 2 || px >= V - 3 || py >= V - 3) break;
      hg(px, py, g2);
      const dH = g2[2] - g[2];              // м
      const slope = -dH * s;                // безразмерный уклон по ходу капли
      const cap = Math.max(slope * speed * water * capF, minCap);
      const i0 = ny * V + nx;
      if (sed > cap || dH > 0) {
        // откладываем: в яму — не больше её глубины
        const dep = dH > 0 ? Math.min(dH, sed) : (sed - cap) * depositS;
        sed -= dep;
        h[i0] += dep * (1 - fx) * (1 - fy);
        h[i0 + 1] += dep * fx * (1 - fy);
        h[i0 + V] += dep * (1 - fx) * fy;
        h[i0 + V + 1] += dep * fx * fy;
      } else {
        const mk = mask[i0];
        const amt = Math.min((cap - sed) * erodeS, -dH, maxErode) * mk;
        for (let k = 0; k < bOff.length; k++) {
          const bx = nx + bOff[k][0], by = ny + bOff[k][1];
          if (bx < 0 || by < 0 || bx >= V || by >= V) continue;
          h[by * V + bx] -= amt * bW[k];
        }
        sed += amt;
      }
      speed = Math.sqrt(Math.max(0, speed * speed + slope * grav));
      water *= 1 - evap;
      if (water < 0.02) break;
    }
  }
  return made;
}
