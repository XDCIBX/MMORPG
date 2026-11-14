// Процедурные текстуры земли: цвет (sRGB) + высота в альфа-канале, бесшовные.
// дёрн, почва, скала, песок, щебень. Рисуются на canvas, собираются в DataTexture
// (без премультипликации альфы — иначе цвет под низкой «высотой» теряется).
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { IS_PHONE } from './device.js';

const S = IS_PHONE ? 256 : 512;

function cv() { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
// рисовать с переносом через края (бесшовность)
function wrapDraw(x, y, r, fn) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    if (x + dx < -r || x + dx > S + r || y + dy < -r || y + dy > S + r) continue;
    fn(x + dx, y + dy);
  }
}
// бесшовный шум: случайная решётка + бикубическая интерполяция (быстро)
function valueNoise(rnd, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbmTex(rnd, base, oct) {
  const ns = []; for (let o = 0; o < oct; o++) ns.push(valueNoise(rnd, base << o));
  return (u, v) => { let s = 0, a = 0.5, n = 0; for (const f of ns) { s += f(u, v) * a; n += a; a *= 0.5; } return s / n; };
}
// основа: цветной шум в ImageData (цвет по функции)
function fillNoise(ctx, colorFn) {
  const img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [r, g, b] = colorFn(x / S, y / S);
    const i = (y * S + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
function grey(ctx, fn) { fillNoise(ctx, (u, v) => { const g = fn(u, v) * 255; return [g, g, g]; }); }

// собрать: цвет из одного canvas, высота — из другого (красный канал)
function pack(colC, hC) {
  const a = colC.getContext('2d').getImageData(0, 0, S, S).data;
  const h = hC.getContext('2d').getImageData(0, 0, S, S).data;
  const data = new Uint8Array(S * S * 4);
  let mr = 0, mg = 0, mb = 0;
  const lin = (v) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = a[i * 4]; data[i * 4 + 1] = a[i * 4 + 1]; data[i * 4 + 2] = a[i * 4 + 2]; data[i * 4 + 3] = h[i * 4];
    mr += lin(a[i * 4]); mg += lin(a[i * 4 + 1]); mb += lin(a[i * 4 + 2]);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  const n = S * S;
  t.userData.mean = new THREE.Vector3(mr / n, mg / n, mb / n);
  return t;
}

// ---------- Дёрн: густые мелкие травинки, клевер, сухие стебли ----------
function grassTex() {
  const rnd = mulberry32(9101);
  const c = cv(), x = c.getContext('2d'), h = cv(), hx = h.getContext('2d');
  const n1 = fbmTex(rnd, 4, 4);
  fillNoise(x, (u, v) => { const k = n1(u, v); return [52 + k * 30, 46 + k * 26, 26 + k * 14]; }); // почва под травой
  grey(hx, (u, v) => 0.15 + n1(u, v) * 0.15);
  const K = S / 512;
  const blades = Math.round(15000 * K * K);
  x.lineCap = hx.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const px = rnd() * S, py = rnd() * S;
    const len = (5 + rnd() * 13) * K, ang = rnd() * Math.PI * 2;
    const t = i / blades;                       // позже нарисованные — «выше»
    const dry = rnd() < 0.12;
    const hue = dry ? 45 + rnd() * 12 : 72 + rnd() * 38;
    const sat = dry ? 35 + rnd() * 15 : 32 + rnd() * 28;
    const lit = (dry ? 40 : 17) + t * 22 + rnd() * 8;
    const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len;
    const bend = (rnd() - 0.5) * len * 0.5;
    wrapDraw(px, py, len, (X, Y) => {
      x.strokeStyle = `hsl(${hue},${sat}%,${lit}%)`; x.lineWidth = (0.9 + rnd() * 1.4) * K;
      x.beginPath(); x.moveTo(X, Y); x.quadraticCurveTo(X + ex * 0.5 - ey * bend / len, Y + ey * 0.5 + ex * bend / len, X + ex, Y + ey); x.stroke();
      const hv = Math.round((0.35 + t * 0.6) * 255);
      hx.strokeStyle = `rgb(${hv},${hv},${hv})`; hx.lineWidth = x.lineWidth;
      hx.beginPath(); hx.moveTo(X, Y); hx.lineTo(X + ex, Y + ey); hx.stroke();
    });
  }
  // клевер и мелкие листочки
  for (let i = 0; i < 160 * K * K; i++) {
    const px = rnd() * S, py = rnd() * S, r = (2.2 + rnd() * 2) * K;
    const lit = 22 + rnd() * 12;
    wrapDraw(px, py, r * 3, (X, Y) => {
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + rnd() * 0.3;
        x.fillStyle = `hsl(${95 + rnd() * 20},45%,${lit}%)`;
        x.beginPath(); x.arc(X + Math.cos(a) * r, Y + Math.sin(a) * r, r, 0, 6.28); x.fill();
        hx.fillStyle = '#e8e8e8'; hx.beginPath(); hx.arc(X + Math.cos(a) * r, Y + Math.sin(a) * r, r, 0, 6.28); hx.fill();
      }
    });
  }
  return pack(c, h);
}

// ---------- Почва: комья, камешки, веточки, опавшие листья, трещины ----------
function dirtTex() {
  const rnd = mulberry32(9202);
  const c = cv(), x = c.getContext('2d'), h = cv(), hx = h.getContext('2d');
  const n1 = fbmTex(rnd, 3, 5), n2 = fbmTex(rnd, 16, 3);
  fillNoise(x, (u, v) => { const k = n1(u, v) * 0.7 + n2(u, v) * 0.3, g = (rnd() - 0.5) * 22; return [88 + k * 50 + g, 70 + k * 40 + g, 50 + k * 28 + g * 0.8]; });
  grey(hx, (u, v) => 0.25 + n1(u, v) * 0.35 + n2(u, v) * 0.15);
  const K = S / 512;
  // трещинки
  x.lineCap = 'round';
  for (let i = 0; i < 25; i++) {
    let px = rnd() * S, py = rnd() * S, a = rnd() * 6.28;
    const segs = 4 + Math.floor(rnd() * 8);
    x.strokeStyle = 'rgba(40,30,20,0.4)'; x.lineWidth = (0.6 + rnd() * 0.6) * K;
    hx.strokeStyle = '#141414'; hx.lineWidth = x.lineWidth * 1.4;
    x.beginPath(); hx.beginPath(); x.moveTo(px, py); hx.moveTo(px, py);
    for (let s = 0; s < segs; s++) { a += (rnd() - 0.5) * 1.2; px += Math.cos(a) * 6 * K; py += Math.sin(a) * 6 * K; x.lineTo(px, py); hx.lineTo(px, py); }
    x.stroke(); hx.stroke();
  }
  // веточки и сухие листья
  for (let i = 0; i < 90 * K * K; i++) {
    const px = rnd() * S, py = rnd() * S, a = rnd() * 6.28, L = (8 + rnd() * 22) * K;
    wrapDraw(px, py, L, (X, Y) => {
      x.strokeStyle = `hsl(${25 + rnd() * 10},${30 + rnd() * 20}%,${16 + rnd() * 12}%)`; x.lineWidth = (1 + rnd() * 1.5) * K;
      x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(a) * L, Y + Math.sin(a) * L); x.stroke();
      hx.strokeStyle = '#a0a0a0'; hx.lineWidth = x.lineWidth;
      hx.beginPath(); hx.moveTo(X, Y); hx.lineTo(X + Math.cos(a) * L, Y + Math.sin(a) * L); hx.stroke();
    });
  }
  for (let i = 0; i < 140 * K * K; i++) {
    const px = rnd() * S, py = rnd() * S, r = (3 + rnd() * 4) * K, a = rnd() * 3.14;
    wrapDraw(px, py, r, (X, Y) => {
      x.fillStyle = `hsl(${20 + rnd() * 25},${45 + rnd() * 25}%,${20 + rnd() * 16}%)`;
      x.beginPath(); x.ellipse(X, Y, r, r * 0.45, a, 0, 6.28); x.fill();
      hx.fillStyle = '#8c8c8c'; hx.beginPath(); hx.ellipse(X, Y, r, r * 0.45, a, 0, 6.28); hx.fill();
    });
  }
  // камешки: тень, тело, блик
  pebbles(x, hx, rnd, 520 * K * K, 1.5 * K, 6 * K, [[100, 92, 82], [130, 120, 105], [80, 72, 64], [150, 138, 120]]);
  return pack(c, h);
}
function pebbles(x, hx, rnd, n, r0, r1, cols) {
  for (let i = 0; i < n; i++) {
    const px = rnd() * S, py = rnd() * S, r = r0 + Math.pow(rnd(), 2.2) * (r1 - r0), a = rnd() * 3.14, e = 0.6 + rnd() * 0.4;
    const col = cols[Math.floor(rnd() * cols.length)], v = 0.85 + rnd() * 0.3;
    wrapDraw(px, py, r * 2, (X, Y) => {
      x.fillStyle = 'rgba(20,16,12,0.45)'; x.beginPath(); x.ellipse(X + r * 0.25, Y + r * 0.3, r * 1.05, r * e * 1.05, a, 0, 6.28); x.fill();
      x.fillStyle = `rgb(${col[0] * v | 0},${col[1] * v | 0},${col[2] * v | 0})`; x.beginPath(); x.ellipse(X, Y, r, r * e, a, 0, 6.28); x.fill();
      x.fillStyle = 'rgba(255,250,240,0.18)'; x.beginPath(); x.ellipse(X - r * 0.3, Y - r * 0.3, r * 0.45, r * e * 0.4, a, 0, 6.28); x.fill();
      const g = hx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#b0b0b0'); g.addColorStop(1, 'rgba(90,90,90,0)');
      hx.fillStyle = g; hx.beginPath(); hx.ellipse(X, Y, r, r * e, a, 0, 6.28); hx.fill();
    });
  }
}

// ---------- Скала: зернистость, слои, прожилки, трещины, лишайник ----------
function rockTex() {
  const rnd = mulberry32(9303);
  const c = cv(), x = c.getContext('2d'), h = cv(), hx = h.getContext('2d');
  const n1 = fbmTex(rnd, 2, 6), n2 = fbmTex(rnd, 8, 4), n3 = fbmTex(rnd, 32, 2);
  fillNoise(x, (u, v) => {
    const k = n1(u, v), m = n2(u, v), f = n3(u, v);
    const band = Math.sin((v + k * 0.35) * 6.28 * 3) * 0.5 + 0.5;          // пласты
    const t = k * 0.55 + m * 0.3 + f * 0.15 + band * 0.12;
    const g = (rnd() - 0.5) * 34, warm = (m - 0.5) * 14;   // зерно и тёплые/холодные пятна
    return [92 + t * 90 + g + warm, 90 + t * 86 + g, 86 + t * 80 + g - warm];
  });
  grey(hx, (u, v) => Math.min(1, n1(u, v) * 0.6 + n2(u, v) * 0.3 + n3(u, v) * 0.15));
  const K = S / 512;
  // прожилки (светлые) и трещины (тёмные со светлой кромкой)
  for (let i = 0; i < 14; i++) {
    let px = rnd() * S, py = rnd() * S, a = rnd() * 6.28;
    x.strokeStyle = `rgba(215,210,198,${0.25 + rnd() * 0.3})`; x.lineWidth = (1 + rnd() * 2.5) * K;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 30; s++) { a += (rnd() - 0.5) * 0.5; px += Math.cos(a) * 8 * K; py += Math.sin(a) * 8 * K; x.lineTo(px, py); }
    x.stroke();
  }
  // поры и выбоины
  for (let i = 0; i < 700 * K * K; i++) { const px = rnd() * S, py = rnd() * S, r = (0.6 + rnd() * 2.2) * K; x.fillStyle = `rgba(30,28,26,${0.25 + rnd() * 0.35})`; x.beginPath(); x.arc(px, py, r, 0, 6.28); x.fill(); hx.fillStyle = 'rgba(0,0,0,0.6)'; hx.beginPath(); hx.arc(px, py, r, 0, 6.28); hx.fill(); }
  for (let i = 0; i < 9; i++) {
    let px = rnd() * S, py = rnd() * S, a = rnd() * 6.28;
    const segs = 10 + Math.floor(rnd() * 25), lw = (0.7 + rnd() * 1.2) * K;
    const pts = [[px, py]];
    for (let s = 0; s < segs; s++) { a += (rnd() - 0.5) * 0.9; px += Math.cos(a) * 7 * K; py += Math.sin(a) * 7 * K; pts.push([px, py]); }
    for (const [col, w, off] of [['rgba(225,220,210,0.18)', lw * 1.8, -1], ['rgba(28,25,22,0.6)', lw, 0]]) {
      x.strokeStyle = col; x.lineWidth = w; x.beginPath();
      pts.forEach(([X, Y], k) => k ? x.lineTo(X + off, Y + off) : x.moveTo(X + off, Y + off)); x.stroke();
    }
    hx.strokeStyle = '#000'; hx.lineWidth = lw * 1.6; hx.beginPath(); pts.forEach(([X, Y], k) => k ? hx.lineTo(X, Y) : hx.moveTo(X, Y)); hx.stroke();
  }
  // лишайник: пятна жёлто-зелёные и рыжие
  for (let i = 0; i < 28 * K * K; i++) {
    const px = rnd() * S, py = rnd() * S, r = (3 + rnd() * 8) * K;
    const lich = rnd() < 0.7 ? [`hsla(${70 + rnd() * 25},25%,${50 + rnd() * 12}%,0.3)`] : [`hsla(${25 + rnd() * 10},45%,${48 + rnd() * 10}%,0.28)`];
    wrapDraw(px, py, r * 2, (X, Y) => {
      for (let k = 0; k < 6; k++) { x.fillStyle = lich[0]; x.beginPath(); x.arc(X + (rnd() - 0.5) * r * 1.5, Y + (rnd() - 0.5) * r * 1.5, r * (0.3 + rnd() * 0.5), 0, 6.28); x.fill(); }
    });
  }
  return pack(c, h);
}

// ---------- Песок: мелкая зернистость, рябь ----------
function sandTex() {
  const rnd = mulberry32(9404);
  const c = cv(), x = c.getContext('2d'), h = cv(), hx = h.getContext('2d');
  const n1 = fbmTex(rnd, 4, 3), n2 = fbmTex(rnd, 2, 3);
  const ripple = (u, v) => Math.sin((u * 9 + v * 3 + n2(u, v) * 2.2) * 6.28) * 0.5 + 0.5;
  fillNoise(x, (u, v) => { const k = n1(u, v) * 0.6 + ripple(u, v) * 0.3, g = (rnd() - 0.5) * 26; return [178 + k * 40 + g, 160 + k * 36 + g, 120 + k * 28 + g]; });
  grey(hx, (u, v) => 0.3 + ripple(u, v) * 0.45 + n1(u, v) * 0.2);
  pebbles(x, hx, rnd, 90 * (S / 512) ** 2, 1, 3.5 * S / 512, [[120, 110, 95], [90, 80, 70], [200, 190, 170]]);
  return pack(c, h);
}

// ---------- Щебень и утоптанная дорога ----------
function gravelTex() {
  const rnd = mulberry32(9505);
  const c = cv(), x = c.getContext('2d'), h = cv(), hx = h.getContext('2d');
  const n1 = fbmTex(rnd, 4, 4);
  fillNoise(x, (u, v) => { const k = n1(u, v); return [96 + k * 30, 84 + k * 26, 66 + k * 22]; });
  grey(hx, (u, v) => 0.2 + n1(u, v) * 0.2);
  pebbles(x, hx, rnd, 1800 * (S / 512) ** 2, 1.5 * S / 512, 7 * S / 512, [[118, 112, 104], [140, 132, 120], [96, 90, 84], [160, 150, 136], [110, 96, 80]]);
  return pack(c, h);
}

let SET = null;
export function groundTextures() {
  if (SET) return SET;
  const t0 = performance.now();
  SET = { grass: grassTex(), dirt: dirtTex(), rock: rockTex(), sand: sandTex(), gravel: gravelTex() };
  SET.ms = performance.now() - t0;
  return SET;
}
