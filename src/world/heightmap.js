// Карта высот мира. Без зависимостей от браузера — её можно считать и в node (tools/terrain).
//
// Как устроены настоящие горы и как это повторено здесь:
//  • горы стоят массивами, а не ровным «частоколом»: огибающая крупного шума решает, где массив;
//  • внутри массива — хребты с отрогами (ridged multifractal: детали гуще на гребнях, долины гладкие);
//    вершины лежат на гребнях, между ними седловины;
//  • профиль склона вогнутый: круто у вершины, полого к подножию (степень > 1);
//  • предгорья — округлые холмы, на равнинах — отдельные пологие холмы;
//  • осыпание круче угла естественного откоса убирает иглы и даёт осыпи у подножия;
//  • дождевые капли прорезают овраги и ложбины, а смытый грунт ложится конусами выноса.
import { Noise, clamp, lerp, smoothstep, distToSegment, mulberry32 } from '../core/util.js';
import { CITIES, ROADS, BIOMES, BIOME_LIST, BIOME_SEEDS, LAKES, LAVA_POOLS, SECRET_SHOPS, POIS } from '../data/world.js';
import { thermalErode, hydraulicErode } from './erosion.js';
import { SPAWNS } from '../data/mobs.js';

// высота гор по биомам (м) и по краю мира
const MOUNT_H = { highland: 34, snow: 70, volcanic: 50 };
const EDGE_H = 82;

function biomeWeightsAt(n2, x, z, out) {
  const wx = x + n2.fbm(x * 0.004, z * 0.004, 3) * 70;
  const wz = z + n2.fbm(x * 0.004 + 50, z * 0.004 + 50, 3) * 70;
  out.fill(0);
  let sum = 0;
  for (const s of BIOME_SEEDS) {
    const d = Math.hypot(wx - s.x, wz - s.z) / s.r;
    const w = Math.exp(-d * d * 2.2);
    out[BIOMES[s.b].id] += w; sum += w;
  }
  if (sum < 1e-4) { out[BIOMES.meadow.id] = 1; return; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
}

// «Эродированный» fbm (приём И. Килеса): вклад октавы гасится накопленным уклоном,
// поэтому на склонах рельеф гладкий, а мелкие детали остаются на гребнях и вершинах — как у размытых гор
function erodedFbm(n, x, z, oct = 6) {
  let a = 0, b = 1, f = 1, dx = 0, dz = 0, norm = 0;
  const e = 0.004;
  for (let o = 0; o < oct; o++) {
    // поворот между октавами — без сеточных выравниваний
    const X = (x * 0.8 - z * 0.6) * f + o * 17.3, Z = (x * 0.6 + z * 0.8) * f - o * 9.1;
    const v = n.noise(X, Z);
    dx += (n.noise(X + e, Z) - v) / e * 0.35;
    dz += (n.noise(X, Z + e) - v) / e * 0.35;
    a += b * v / (1 + dx * dx + dz * dz);
    norm += b; b *= 0.5; f *= 2.0;
  }
  return a / norm;
}
// Ridged multifractal (Мусгрейв): октавы весятся сигналом предыдущей — детали гуще на гребнях
function ridgedMF(n, x, z, oct = 4) {
  let sum = 0, freq = 1, amp = 1, weight = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    let s = 1 - Math.abs(n.noise(x * freq, z * freq));
    s *= s; s *= weight;
    weight = clamp(s * 1.6, 0, 1);
    sum += s * amp; norm += amp;
    freq *= 2.07; amp *= 0.5;
  }
  return sum / norm;
}
// Мягкий гребень: 1 - |n| со сглаженным изломом — длинные главные хребты без «лезвия»
const softRidge = (v) => 1 - Math.sqrt(v * v + 0.015);

// Вся эрозия: осыпи → дождь → осыпи → сглаживание ямок
function erodeAll(raw, V, mask, CELL, N, opts, rnd) {
  const scale = (N / 480) * (N / 480);
  // 1) осыпи: всё, что круче ~40°, сползает вниз
  if (opts.thermal !== false) thermalErode(raw, V, mask, Math.tan(43 * Math.PI / 180) * CELL, opts.thermalIters || 18, 0.5);
  // 2) дождь: овраги, ложбины, конусы выноса
  hydraulicErode(raw, V, mask, Math.round((opts.drops == null ? 70000 : opts.drops) * scale), rnd, CELL, opts.erosion || {});
  // 3) ещё немного осыпания, чтобы края оврагов не были ступеньками
  if (opts.thermal !== false) thermalErode(raw, V, mask, Math.tan(44 * Math.PI / 180) * CELL, opts.finalThermal || (opts.bakeOnly ? 50 : 8), 0.5);
  // 4) лёгкое сглаживание в горах: убирает ямки от капель и «ступеньки» сетки
  {
    const tmp = new Float32Array(raw);
    for (let j = 1; j < V - 1; j++) for (let i = 1; i < V - 1; i++) {
      const idx = j * V + i, mk = mask[idx];
      if (mk < 0.01) continue;
      const avg = (tmp[idx - 1] + tmp[idx + 1] + tmp[idx - V] + tmp[idx + V]) * 0.25;
      // ямки (ниже всех соседей) заполняем сильнее
      const pit = tmp[idx] < Math.min(tmp[idx - 1], tmp[idx + 1], tmp[idx - V], tmp[idx + V]) ? 0.8 : 0.25;
      raw[idx] = lerp(tmp[idx], avg, pit * mk);
    }
  }
}

// ---- запечённая карта высот ----
// Формат: строка base64 с заголовком [V, half*10] (Int32) и высотами Int16 (см·2) с разностным кодированием по строкам
export function encodeBakedHeights(raw, V, WORLD_HALF) {
  const head = new Int32Array([V, Math.round(WORLD_HALF * 10)]);
  const q = new Int16Array(V * V);
  for (let j = 0; j < V; j++) {
    let prev = 0;
    for (let i = 0; i < V; i++) {
      const v = Math.round(raw[j * V + i] * 50);
      q[j * V + i] = v - prev; prev = v;
    }
  }
  const bytes = new Uint8Array(8 + q.byteLength);
  bytes.set(new Uint8Array(head.buffer), 0);
  bytes.set(new Uint8Array(q.buffer), 8);
  return bytes;
}
export function decodeBakedHeights(b64) {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const head = new Int32Array(bytes.buffer, 0, 2);
    const V = head[0], half = head[1] / 10;
    const q = new Int16Array(bytes.buffer, 8, V * V);
    const h = new Float32Array(V * V);
    for (let j = 0; j < V; j++) {
      let acc = 0;
      for (let i = 0; i < V; i++) { acc += q[j * V + i]; h[j * V + i] = acc / 50; }
    }
    return { V, half, h };
  } catch (e) { return null; }
}
function sampleBaked(B, x, z, WORLD_HALF) {
  const C = B.half * 2 / (B.V - 1);
  const gx = clamp((x + B.half) / C, 0, B.V - 1.0001), gz = clamp((z + B.half) / C, 0, B.V - 1.0001);
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, V = B.V, h = B.h;
  const a = h[j * V + i], b = h[j * V + i + 1], c = h[(j + 1) * V + i], d = h[(j + 1) * V + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

export function generateHeights(N, WORLD_HALF, opts = {}) {
  const V = N + 1, CELL = WORLD_HALF * 2 / N;
  const n = new Noise(1337), n2 = new Noise(4242), n3 = new Noise(9091);
  const nb = BIOME_LIST.length;
  const bw = new Float32Array(nb);
  const raw = new Float32Array(V * V);
  const mask = new Float32Array(V * V);
  const biome = new Uint8Array(V * V);
  const biomeW = new Float32Array(V * V * nb);
  const road = new Float32Array(V * V);
  const t0 = Date.now();
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
      const idx = j * V + i;
      biomeWeightsAt(n2, x, z, bw);
      let amp = 0, best = 0, bi = 0;
      for (let b = 0; b < nb; b++) {
        amp += bw[b] * BIOME_LIST[b].amp;
        if (bw[b] > best) { best = bw[b]; bi = b; }
        biomeW[idx * nb + b] = bw[b];
      }
      biome[idx] = bi;
      // расстояние до дороги: дороги идут по долинам и перевалам
      let rd = 1e9;
      for (const R of ROADS) for (let k = 0; k < R.length - 1; k++) {
        const d = distToSegment(x, z, R[k][0], R[k][1], R[k + 1][0], R[k + 1][1]);
        if (d < rd) rd = d;
      }
      const wob = n.noise(x * 0.05, z * 0.05) * 1.2;
      road[idx] = smoothstep(5.5 + wob, 2.5 + wob, rd);

      if (opts.baked) { raw[idx] = sampleBaked(opts.baked, x, z, WORLD_HALF); continue; }
      // искажённые координаты — у гор и холмов не будет «сеточных» очертаний
      const wx = x + n3.fbm(x * 0.004 + 31, z * 0.004 - 17, 3) * 55;
      const wz = z + n3.fbm(x * 0.004 - 71, z * 0.004 + 43, 3) * 55;

      // ---- равнина: длинные пологие волны ----
      const hiW = bw[BIOMES.highland.id], snW = bw[BIOMES.snow.id], voW = bw[BIOMES.volcanic.id];
      const mountB = hiW + snW + voW;
      const baseAmp = lerp(amp, Math.min(amp, 9), mountB);
      let h = 4.5 + (n.fbm(x * 0.0032, z * 0.0032, 4) * 0.5 + 0.5) * baseAmp * 1.1;
      // отдельные округлые холмы; в предгорьях выше и чаще
      // купол холма: широкое окно по шуму — склоны пологие (до ~15–20°), без уступов
      const hillN = n2.fbm(wx * 0.0085 + 5, wz * 0.0085 - 9, 2) * 0.5 + 0.5;
      const hills = smoothstep(0.3 - mountB * 0.06, 0.95, hillN);
      h += hills * hills * (2.2 + Math.min(amp, 12) * 0.35 + mountB * 6);
      // мягкая мелкая неровность
      h += n.fbm(x * 0.028, z * 0.028, 2) * 0.55;
      // болота почти плоские, с лужами
      const sw = bw[BIOMES.swamp.id];
      h = lerp(h, 0.5 + n.fbm(x * 0.025, z * 0.025, 3) * 1.6, smoothstep(0.3, 0.8, sw));

      // ---- горы ----
      const edge = smoothstep(560, 765, Math.max(Math.abs(x), Math.abs(z)));
      let Hm = hiW * MOUNT_H.highland + snW * MOUNT_H.snow + voW * MOUNT_H.volcanic;
      Hm = lerp(Hm, EDGE_H, edge);
      if (Hm > 0.5) {
        // где гор не должно быть: дороги идут перевалами, у городов, мест и стоянок монстров — пологие подступы
        const keepRoad = 0.3 + 0.7 * smoothstep(6, 48, rd);
        let keepPlace = 1;
        for (const c of CITIES) keepPlace *= smoothstep(c.r + 15, c.r + 140, Math.hypot(x - c.x, z - c.z));
        for (const p of POIS) keepPlace *= 0.3 + 0.7 * smoothstep(p.r * 0.8, p.r * 0.8 + 55, Math.hypot(x - p.x, z - p.z));
        for (const s of SECRET_SHOPS) keepPlace *= 0.3 + 0.7 * smoothstep(12, 60, Math.hypot(x - s.x, z - s.z));
        for (const s of SPAWNS) keepPlace *= 0.25 + 0.75 * smoothstep(s.r * 0.55, s.r * 1.2, Math.hypot(x - s.x, z - s.z));
        // озёра и лава лежат в долинах, а не в ямах посреди склона
        for (const L of LAKES) keepPlace *= 0.15 + 0.85 * smoothstep(L.r * 1.2, L.r * 2.4, Math.hypot(x - L.x, z - L.z));
        for (const L of LAVA_POOLS) keepPlace *= 0.15 + 0.85 * smoothstep(L.r * 1.2, L.r * 2.4, Math.hypot(x - L.x, z - L.z));
        // край мира — сплошная стена гор, но дороги и места прорезают её долинами
        const keep = Math.max(keepRoad, edge * 0.85 * smoothstep(4, 40, rd)) * keepPlace;
        // массивы: где горы собираются в группы (гладко, без порогов — нет складок)
        let env = clamp(n3.fbm(wx * 0.0021 + 3, wz * 0.0021 + 7, 3) * 0.95 + 0.62, 0.12, 1);
        env = lerp(env, 1, edge * 0.85);
        // вершины и отроги: эродированный шум, период ~330 м (растянут на весь диапазон 0..1)
        const pk = clamp(erodedFbm(n, wx / 330 + 11.3, wz / 330 - 4.7, 6) * 1.5 + 0.5, 0, 1);
        // главные хребты: длинные мягкие гребни, период ~560 м
        const rg = softRidge(n2.noise(wx / 560 - 3.1, wz / 560 + 8.4));
        // хребет задаёт цепь, вершины — где он пересекается с поднятиями: цепи вершин с седловинами
        let rgN = smoothstep(0.3, 0.9, rg);
        rgN = lerp(rgN, Math.max(rgN, 0.8), edge);     // пограничный хребет — сплошная цепь
        const S = env * (0.42 + 0.58 * pk) * (0.32 + 0.68 * rgN);
        // вогнутый профиль: круто у вершин, полого к подножию
        let m = Math.pow(S / 0.6, 1.45);
        m = m / (1 + 0.22 * m) * 1.22;          // мягкий потолок: высокие места — массивные плечи, без шпилей и столбов
        // широкое подножие: массив стоит на пологом поднятии, а не растёт из ровного поля
        m += 0.2 * smoothstep(0.08, 0.55, S);
        // выше «границы леса» склоны прорезаны кулуарами и ложбинами (вычитаем — без шипов на вершинах)
        const hiZone = smoothstep(0.2, 0.8, m);
        if (hiZone > 0) {
          const gul = ridgedMF(n3, wx / 115 + 2.7, wz / 115 - 6.1, 3);
          m -= hiZone * gul * 0.13 * (opts.detail ?? 1);
        }
        const mh = Hm * keep * m;
        h += mh;
        mask[idx] = clamp(mh / 18, 0, 1);
      }
      raw[idx] = h;
    }
  }
  const t1 = Date.now();
  if (opts.bakeOnly) {
    // для запекания: естественный рельеф после эрозии, до озёр, дорог и площадок
    const rnd0 = mulberry32(777);
    erodeAll(raw, V, mask, CELL, N, opts, rnd0);
    return { raw, V, mask };
  }
  if (!opts.baked) erodeAll(raw, V, mask, CELL, N, opts, mulberry32(777));
  const t2 = Date.now();
  // ---- эрозия (вынесена в erodeAll) ----

  // ---- озёра и лава (после эрозии, чтобы берега были ровными) ----
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
    const idx = j * V + i;
    let h = raw[idx];
    for (const L of LAKES.concat(LAVA_POOLS)) {
      const d = Math.hypot(x - L.x, z - L.z);
      const t = smoothstep(L.r * 1.35, L.r * 0.35, d);
      if (t > 0) h = lerp(h, -L.depth, t);
    }
    raw[idx] = h;
  }

  // ---- дороги и площадки ----
  const blur = new Float32Array(V * V);
  const RB = 3;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    let s = 0, c = 0;
    for (let dj = -RB; dj <= RB; dj++) for (let di = -RB; di <= RB; di++) {
      const ii = clamp(i + di, 0, V - 1), jj = clamp(j + dj, 0, V - 1);
      s += raw[jj * V + ii]; c++;
    }
    blur[j * V + i] = s / c;
  }
  const flatSpots = [];
  for (const c of CITIES) flatSpots.push({ x: c.x, z: c.z, r: c.r + 10, fall: 45, city: true });
  for (const s of SECRET_SHOPS) flatSpots.push({ x: s.x, z: s.z, r: 12, fall: 18 });
  for (const p of POIS) flatSpots.push({ x: p.x, z: p.z, r: p.r * 0.8, fall: 20 });
  for (const f of flatSpots) {
    const ci = Math.round((f.x + WORLD_HALF) / CELL), cj = Math.round((f.z + WORLD_HALF) / CELL);
    // площадка = средняя высота круга, а не одна точка
    let s = 0, c = 0;
    const rr = Math.max(1, Math.round(f.r * 0.6 / CELL));
    for (let dj = -rr; dj <= rr; dj += Math.max(1, rr >> 2)) for (let di = -rr; di <= rr; di += Math.max(1, rr >> 2)) {
      const ii = clamp(ci + di, 0, V - 1), jj = clamp(cj + dj, 0, V - 1);
      s += blur[jj * V + ii]; c++;
    }
    f.h = Math.max(f.city ? 3 : 1.2, s / c);
  }
  const h = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const idx = j * V + i;
    const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
    let hh = lerp(raw[idx], Math.max(blur[idx], raw[idx] < 0 ? raw[idx] : 0.6), road[idx] * 0.8);
    for (const f of flatSpots) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.fall) hh = lerp(hh, f.h, smoothstep(f.r + f.fall, f.r, d));
    }
    h[idx] = hh;
  }
  const t3 = Date.now();
  return { h, biome, biomeW, road, flatSpots, mask, baked: !!opts.baked, timing: { base: t1 - t0, erosion: t2 - t1, finish: t3 - t2 } };
}
