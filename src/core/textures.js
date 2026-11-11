// Процедурные текстуры, нарисованные на canvas: камень, черепица, дерево, мрамор и т.д.
import * as THREE from 'three';
import { mulberry32, Noise } from './util.js';

const cache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

// Карта нормалей из карты высот (канал R)
function heightToNormal(src, strength = 2) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const sd = sctx.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function noiseFill(ctx, w, h, seed, scale, amp, base = 128) {
  const n = new Noise(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // тайлируемый шум: смешиваем 4 сдвинутых сэмпла
    const u = x / w, v = y / h;
    const s = (a, b) => n.fbm(a * scale, b * scale, 4);
    const v1 = s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
    const i = (y * w + x) * 4;
    const d = v1 * amp;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + d));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + d));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + d));
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx, w, h, rnd, count, colors, sizeMin = 1, sizeMax = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const s = sizeMin + rnd() * (sizeMax - sizeMin);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// Детальная текстура для террейна (тайлируемый шум в разных каналах)
export function terrainDetail() {
  return memo('terrainDetail', () => {
    const w = 256;
    const c = canvas(w);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, w);
    const n1 = new Noise(11), n2 = new Noise(22), n3 = new Noise(33);
    const tile = (n, u, v, sc) => {
      const s = (a, b) => n.fbm(a * sc, b * sc, 4);
      return s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
    };
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / w;
      const i = (y * w + x) * 4;
      img.data[i] = 128 + tile(n1, u, v, 24) * 120;
      img.data[i + 1] = 128 + tile(n2, u, v, 6) * 110;
      img.data[i + 2] = 128 + tile(n3, u, v, 48) * 127;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = toTex(c, { srgb: false });
    return t;
  });
}

export function stoneWall(tint = '#8a8378', key = 'a') {
  return memo('stone' + tint + key, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    const rnd = mulberry32(5 + key.charCodeAt(0));
    ctx.fillStyle = '#3a3632'; ctx.fillRect(0, 0, w, w);
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, w, w);
    const rows = 8, rh = w / rows;
    const base = new THREE.Color(tint);
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -24 - rnd() * 10;
      while (x < w) {
        const bw = 36 + rnd() * 34;
        const col = base.clone().offsetHSL(0, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.14);
        ctx.fillStyle = col.getStyle();
        const pad = 2;
        const rr = 4;
        roundRect(ctx, x + pad, r * rh + pad, bw - pad * 2, rh - pad * 2, rr);
        ctx.fill();
        hctx.fillStyle = `rgb(${190 + rnd() * 60 | 0},0,0)`;
        roundRect(hctx, x + pad, r * rh + pad, bw - pad * 2, rh - pad * 2, rr + 2);
        hctx.fill();
        // wrap
        if (x + bw > w) {
          ctx.fillStyle = col.getStyle(); roundRect(ctx, x + pad - w, r * rh + pad, bw - pad * 2, rh - pad * 2, rr); ctx.fill();
          roundRect(hctx, x + pad - w, r * rh + pad, bw - pad * 2, rh - pad * 2, rr + 2); hctx.fill();
        }
        x += bw;
      }
    }
    noiseFill(ctx, w, w, 3, 8, 26);
    noiseFill(hctx, w, w, 4, 10, 40);
    speckle(ctx, w, w, rnd, 900, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.08)', 'rgba(60,80,40,0.12)']);
    const map = toTex(c);
    const normalMap = toTex(heightToNormal(hc, 3), { srgb: false });
    return { map, normalMap };
  });
}

export function cobblestone(tint = '#7d776e') {
  return memo('cobble' + tint, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    const rnd = mulberry32(77);
    ctx.fillStyle = '#2e2b27'; ctx.fillRect(0, 0, w, w);
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, w, w);
    const base = new THREE.Color(tint);
    const cells = 10;
    for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
      const cx = (gx + 0.5 + (rnd() - 0.5) * 0.3) * w / cells;
      const cy = (gy + 0.5 + (rnd() - 0.5) * 0.3) * w / cells;
      const r = w / cells * (0.42 + rnd() * 0.08);
      const col = base.clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.16);
      for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) {
        ctx.fillStyle = col.getStyle();
        ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, r, r * (0.8 + rnd() * 0.2), rnd() * 3, 0, Math.PI * 2); ctx.fill();
        const g = hctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#aaa'); g.addColorStop(1, '#000');
        hctx.fillStyle = g;
        hctx.beginPath(); hctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); hctx.fill();
      }
    }
    noiseFill(ctx, w, w, 9, 12, 22);
    speckle(ctx, w, w, rnd, 600, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.06)']);
    return { map: toTex(c), normalMap: toTex(heightToNormal(hc, 2.5), { srgb: false }) };
  });
}

// Белая штукатурка с тёмными балками (фахверк)
export function timberPlaster(plaster = '#e8dcc4', beam = '#4a3020') {
  return memo('timber' + plaster + beam, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    ctx.fillStyle = plaster; ctx.fillRect(0, 0, w, w);
    hctx.fillStyle = '#777'; hctx.fillRect(0, 0, w, w);
    noiseFill(ctx, w, w, 21, 6, 22);
    ctx.fillStyle = beam; hctx.fillStyle = '#fff';
    const b = 14;
    const beams = (g) => {
      g.fillRect(0, 0, w, b); g.fillRect(0, w - b, w, b);
      g.fillRect(0, 0, b, w); g.fillRect(w / 2 - b / 2, 0, b, w);
      g.save(); g.translate(w / 4, w / 2); g.rotate(Math.PI / 4.6); g.fillRect(-w * 0.36, -b / 2, w * 0.72, b); g.restore();
      g.save(); g.translate(w * 3 / 4, w / 2); g.rotate(-Math.PI / 4.6); g.fillRect(-w * 0.36, -b / 2, w * 0.72, b); g.restore();
    };
    beams(ctx); beams(hctx);
    const rnd = mulberry32(8);
    speckle(ctx, w, w, rnd, 400, ['rgba(0,0,0,0.08)', 'rgba(120,90,60,0.1)'], 1, 3);
    return { map: toTex(c), normalMap: toTex(heightToNormal(hc, 2), { srgb: false }) };
  });
}

export function roofTiles(color = '#9b3b2a') {
  return memo('roof' + color, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    const rnd = mulberry32(31);
    const base = new THREE.Color(color);
    ctx.fillStyle = base.clone().multiplyScalar(0.4).getStyle(); ctx.fillRect(0, 0, w, w);
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, w, w);
    const rows = 10, cols = 8, rh = w / rows, cw = w / cols;
    for (let r = rows; r >= -1; r--) {
      for (let k = -1; k <= cols; k++) {
        const x = k * cw + (r % 2) * cw / 2;
        const y = r * rh;
        const col = base.clone().offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.12);
        const g = ctx.createLinearGradient(0, y, 0, y + rh * 1.3);
        g.addColorStop(0, col.clone().multiplyScalar(0.7).getStyle());
        g.addColorStop(1, col.getStyle());
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + cw - 1, y); ctx.lineTo(x + cw - 1, y + rh); ctx.quadraticCurveTo(x + cw / 2, y + rh * 1.45, x + 1, y + rh); ctx.closePath(); ctx.fill();
        const hg = hctx.createLinearGradient(0, y, 0, y + rh * 1.3);
        hg.addColorStop(0, '#333'); hg.addColorStop(1, '#fff');
        hctx.fillStyle = hg;
        hctx.beginPath(); hctx.moveTo(x + 1, y); hctx.lineTo(x + cw - 1, y); hctx.lineTo(x + cw - 1, y + rh); hctx.quadraticCurveTo(x + cw / 2, y + rh * 1.45, x + 1, y + rh); hctx.closePath(); hctx.fill();
      }
    }
    noiseFill(ctx, w, w, 41, 10, 14);
    speckle(ctx, w, w, rnd, 300, ['rgba(40,60,20,0.15)', 'rgba(0,0,0,0.12)'], 1, 4);
    return { map: toTex(c), normalMap: toTex(heightToNormal(hc, 2.5), { srgb: false }) };
  });
}

export function woodPlanks(color = '#7a5232') {
  return memo('wood' + color, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    const rnd = mulberry32(51);
    const base = new THREE.Color(color);
    const planks = 6, pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const col = base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.1);
      ctx.fillStyle = col.getStyle(); ctx.fillRect(i * pw, 0, pw, w);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = `rgba(30,15,5,${0.05 + rnd() * 0.12})`;
        ctx.lineWidth = 0.5 + rnd();
        const x = i * pw + rnd() * pw;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, w * 0.3, x + (rnd() - 0.5) * 6, w * 0.6, x, w); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(i * pw, 0, 2, w);
      hctx.fillStyle = '#ccc'; hctx.fillRect(i * pw, 0, pw, w);
      hctx.fillStyle = '#000'; hctx.fillRect(i * pw, 0, 2, w);
      if (rnd() < 0.6) { // сучок
        const ky = rnd() * w, kx = i * pw + pw * (0.3 + rnd() * 0.4);
        ctx.fillStyle = 'rgba(40,20,8,0.6)'; ctx.beginPath(); ctx.ellipse(kx, ky, 3, 6, 0, 0, 7); ctx.fill();
      }
    }
    noiseFill(hctx, w, w, 52, 20, 30);
    return { map: toTex(c), normalMap: toTex(heightToNormal(hc, 1.5), { srgb: false }) };
  });
}

export function marble(tint = '#ece6da') {
  return memo('marble' + tint, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    ctx.fillStyle = tint; ctx.fillRect(0, 0, w, w);
    const n = new Noise(61);
    const img = ctx.getImageData(0, 0, w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / w;
      const s = (a, b) => Math.abs(Math.sin((a + b) * 9 + n.fbm(a * 3, b * 3, 5) * 6));
      const val = s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
      const vein = Math.pow(1 - val, 6) * 90;
      const i = (y * w + x) * 4;
      img.data[i] -= vein; img.data[i + 1] -= vein * 0.95; img.data[i + 2] -= vein * 0.85;
    }
    ctx.putImageData(img, 0, 0);
    // блоки
    ctx.strokeStyle = 'rgba(80,70,60,0.35)'; ctx.lineWidth = 2;
    hctx.fillStyle = '#fff'; hctx.fillRect(0, 0, w, w);
    hctx.strokeStyle = '#000'; hctx.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
      const y = r * w / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      hctx.beginPath(); hctx.moveTo(0, y); hctx.lineTo(w, y); hctx.stroke();
      for (let k = 0; k < 2; k++) {
        const x = k * w / 2 + (r % 2) * w / 4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + w / 4); ctx.stroke();
        hctx.beginPath(); hctx.moveTo(x, y); hctx.lineTo(x, y + w / 4); hctx.stroke();
      }
    }
    return { map: toTex(c), normalMap: toTex(heightToNormal(hc, 1.5), { srgb: false }) };
  });
}

export function bark(color = '#5a4030') {
  return memo('bark' + color, () => {
    const w = 128, c = canvas(w), ctx = c.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, w);
    const rnd = mulberry32(71);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(20,10,5,${0.2 + rnd() * 0.4})`;
      ctx.lineWidth = 1 + rnd() * 2;
      const x = rnd() * w;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= w; y += 16) ctx.lineTo(x + (rnd() - 0.5) * 6, y);
      ctx.stroke();
    }
    noiseFill(ctx, w, w, 72, 8, 25);
    return toTex(c);
  });
}

export function cloth(color = '#884422', pattern = 0) {
  return memo('cloth' + color + pattern, () => {
    const w = 128, c = canvas(w), ctx = c.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, w);
    for (let y = 0; y < w; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.04 + (y % 4 === 0 ? 0.04 : 0)})`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(x, 0, 1, w);
    }
    if (pattern === 1) { // полосы
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 10, w);
    }
    if (pattern === 2) { // кайма-узор
      ctx.strokeStyle = 'rgba(255,215,120,0.55)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) { ctx.lineTo(x, 10 + (x / 16 % 2) * 8); }
      ctx.stroke();
    }
    noiseFill(ctx, w, w, 81, 6, 14);
    return toTex(c);
  });
}

export function metalTex() {
  return memo('metal', () => {
    const w = 128, c = canvas(w), ctx = c.getContext('2d');
    ctx.fillStyle = '#c8c8c8'; ctx.fillRect(0, 0, w, w);
    const rnd = mulberry32(91);
    for (let i = 0; i < 260; i++) {
      ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.1})`;
      ctx.lineWidth = 0.5;
      const x = rnd() * w, y = rnd() * w, l = 4 + rnd() * 20, a = rnd() * Math.PI;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    noiseFill(ctx, w, w, 92, 5, 30);
    return toTex(c, { srgb: false });
  });
}

export function leatherTex() {
  return memo('leather', () => {
    const w = 128, c = canvas(w), ctx = c.getContext('2d');
    ctx.fillStyle = '#b0b0b0'; ctx.fillRect(0, 0, w, w);
    noiseFill(ctx, w, w, 93, 24, 40);
    const rnd = mulberry32(94);
    speckle(ctx, w, w, rnd, 500, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)'], 1, 2);
    return toTex(c, { srgb: false });
  });
}

export function waterNormal() {
  return memo('waterN', () => {
    const w = 256, hc = canvas(w), hctx = hc.getContext('2d');
    hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, w, w);
    noiseFill(hctx, w, w, 101, 6, 90);
    noiseFill(hctx, w, w, 102, 18, 40);
    return toTex(heightToNormal(hc, 4), { srgb: false });
  });
}

// Мягкий спрайт частицы
export function particleSprite() {
  return memo('psprite', () => {
    const w = 64, c = canvas(w), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    return toTex(c, { repeat: false });
  });
}

export function ringTexture() {
  return memo('ring', () => {
    const w = 128, c = canvas(w), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.88, 'rgba(255,255,255,1)');
    g.addColorStop(0.94, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    return toTex(c, { repeat: false });
  });
}

// Рунный круг для эффектов умений
export function runeCircle() {
  return memo('rune', () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    ctx.translate(w / 2, w / 2);
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 120, 0, 7); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 104, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, 7); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, b = (i + 2) / 6 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); ctx.lineTo(Math.cos(b) * 104, Math.sin(b) * 104); ctx.stroke();
    }
    ctx.font = 'bold 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      ctx.save(); ctx.rotate(a); ctx.fillText(runes[i], 0, -112); ctx.restore();
    }
    return toTex(c, { repeat: false });
  });
}

export function makeTextSprite(text, { color = '#ffd36b', size = 48, font = 'Cinzel, Georgia, serif', stroke = '#000' } = {}) {
  const c = canvas(512, 96);
  const ctx = c.getContext('2d');
  ctx.font = `bold ${size}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = stroke; ctx.strokeText(text, 256, 48);
  ctx.fillStyle = color; ctx.fillText(text, 256, 48);
  const t = toTex(c, { repeat: false });
  const m = new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(m);
  s.scale.set(4, 0.75, 1);
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Карты высот слоёв ландшафта (R — травяной дёрн, G — скала, B — земля с камешками), тайлируемые
export function terrainLayers() {
  return memo('terrainLayers', () => {
    const w = 512;
    const c = canvas(w);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, w);
    const nA = new Noise(501), nB = new Noise(502), nC = new Noise(503), nD = new Noise(504);
    const tile = (n, u, v, sc, oct = 4, ridge = false) => {
      const s = (a, b) => ridge ? n.ridge(a * sc, b * sc, oct) * 2 - 1 : n.fbm(a * sc, b * sc, oct);
      return s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
    };
    // камешки для слоя земли
    const rnd = mulberry32(505);
    const pebbles = new Float32Array(w * w);
    for (let k = 0; k < 900; k++) {
      const px = rnd() * w, py = rnd() * w, r = 2 + rnd() * 6;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d > 1) continue;
        const ix = ((Math.floor(px + x) % w) + w) % w, iy = ((Math.floor(py + y) % w) + w) % w;
        pebbles[iy * w + ix] = Math.max(pebbles[iy * w + ix], Math.sqrt(1 - d * d));
      }
    }
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / w, i = (y * w + x) * 4;
      const grass = tile(nA, u, v, 40, 3) * 0.6 + tile(nD, u, v, 9, 3) * 0.4;
      const rock = tile(nB, u, v, 6, 5, true) * 0.7 + tile(nC, u, v, 24, 3) * 0.3;
      const dirt = tile(nC, u, v, 14, 4) * 0.5 + pebbles[y * w + x] * 0.9 - 0.2;
      img.data[i] = 128 + grass * 120;
      img.data[i + 1] = 128 + rock * 125;
      img.data[i + 2] = Math.max(0, Math.min(255, 110 + dirt * 140));
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = toTex(c, { srgb: false });
    t.generateMipmaps = true;
    return t;
  });
}

// Кора дерева (цвет + нормали). birch — берёзовая
export function barkTex(birch = false) {
  return memo('barkT' + birch, () => {
    const w = 256, h = 512;
    const c = canvas(w, h), ctx = c.getContext('2d');
    const hc = canvas(w, h), hctx = hc.getContext('2d');
    const rnd = mulberry32(birch ? 611 : 612);
    if (birch) {
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(0, 0, w, h);
      hctx.fillStyle = '#aaa'; hctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const y = rnd() * h, x = rnd() * w, len = 10 + rnd() * 50, th = 1 + rnd() * 4;
        ctx.fillStyle = `rgba(30,25,20,${0.5 + rnd() * 0.5})`;
        ctx.beginPath(); ctx.ellipse(x, y, len, th, 0, 0, 7); ctx.fill();
        if (x + len > w) { ctx.beginPath(); ctx.ellipse(x - w, y, len, th, 0, 0, 7); ctx.fill(); }
        hctx.fillStyle = '#222'; hctx.beginPath(); hctx.ellipse(x, y, len, th, 0, 0, 7); hctx.fill();
      }
      noiseFill(ctx, w, h, 613, 6, 14);
    } else {
      ctx.fillStyle = '#6a5848'; ctx.fillRect(0, 0, w, h);
      hctx.fillStyle = '#888'; hctx.fillRect(0, 0, w, h);
      // вертикальные пластины коры с трещинами
      for (let i = 0; i < 26; i++) {
        let x = rnd() * w;
        const wd = 3 + rnd() * 6;
        ctx.strokeStyle = `rgba(20,14,10,${0.6 + rnd() * 0.4})`; ctx.lineWidth = wd;
        hctx.strokeStyle = '#000'; hctx.lineWidth = wd;
        ctx.beginPath(); hctx.beginPath(); ctx.moveTo(x, 0); hctx.moveTo(x, 0);
        for (let y = 0; y <= h; y += 24) { x += (rnd() - 0.5) * 14; ctx.lineTo(x, y); hctx.lineTo(x, y); }
        ctx.stroke(); hctx.stroke();
      }
      for (let i = 0; i < 160; i++) {
        const x = rnd() * w, y = rnd() * h;
        ctx.strokeStyle = 'rgba(15,10,8,0.5)'; ctx.lineWidth = 1 + rnd() * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 20, y + 4); ctx.stroke();
      }
      noiseFill(ctx, w, h, 614, 10, 30);
      noiseFill(hctx, w, h, 615, 16, 50);
      speckle(ctx, w, h, rnd, 600, ['rgba(80,100,50,0.25)', 'rgba(0,0,0,0.2)', 'rgba(160,150,130,0.15)'], 1, 3);
    }
    const map = toTex(c); const normalMap = toTex(heightToNormal(hc, 4), { srgb: false });
    return { map, normalMap };
  });
}

// Пучок листьев с прозрачностью (для карточек кроны). kind: 'broad' | 'small' | 'willow'
export function leafCard(kind = 'broad') {
  return memo('leaf' + kind, () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const rnd = mulberry32(kind === 'broad' ? 621 : kind === 'small' ? 622 : 623);
    ctx.clearRect(0, 0, w, w);
    // веточки
    ctx.strokeStyle = 'rgba(70,50,30,1)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(w / 2, w / 2); ctx.lineTo(w / 2 + (rnd() - 0.5) * w * 0.8, w / 2 + (rnd() - 0.5) * w * 0.8); ctx.stroke(); }
    const n = kind === 'willow' ? 140 : kind === 'small' ? 170 : 110;
    for (let i = 0; i < n; i++) {
      let x, y;
      if (kind === 'willow') { x = w * (0.15 + rnd() * 0.7); y = rnd() * w; }
      else { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * w * 0.44; x = w / 2 + Math.cos(a) * r; y = w / 2 + Math.sin(a) * r; }
      const L = kind === 'small' ? 8 + rnd() * 6 : kind === 'willow' ? 14 + rnd() * 10 : 12 + rnd() * 9;
      const W = kind === 'willow' ? L * 0.22 : L * 0.5;
      const ang = kind === 'willow' ? Math.PI / 2 + (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2;
      const l = 0.55 + rnd() * 0.45;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      const g = ctx.createLinearGradient(-L, 0, L, 0);
      g.addColorStop(0, `rgb(${70 * l | 0},${125 * l | 0},${40 * l | 0})`);
      g.addColorStop(1, `rgb(${120 * l | 0},${175 * l | 0},${70 * l | 0})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -W, L, 0); ctx.quadraticCurveTo(0, W, -L, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(40,70,20,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.restore();
    }
    const t = toTex(c, { repeat: false });
    return t;
  });
}

// Хвойная лапа (вид сверху), прозрачный фон
export function pineCard(snow = false) {
  return memo('pine' + snow, () => {
    const w = 256, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    const rnd = mulberry32(snow ? 631 : 632);
    ctx.clearRect(0, 0, w, h);
    const branch = (x0, y0, len, ang, lvl) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      ctx.strokeStyle = '#4a3622'; ctx.lineWidth = lvl === 0 ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const steps = Math.floor(len / 3);
      for (let i = 0; i < steps; i++) {
        const t = i / steps, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
        const nl = (lvl === 0 ? 16 : 10) * (1 - t * 0.6);
        for (const sd of [-1, 1]) {
          const na = ang + sd * (0.9 + rnd() * 0.3);
          const l = 0.5 + rnd() * 0.5;
          ctx.strokeStyle = snow && rnd() < 0.45 ? `rgba(235,242,250,0.95)` : `rgb(${30 * l | 0},${(70 + rnd() * 30) * l | 0},${35 * l | 0})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
        }
      }
      if (lvl === 0) for (let i = 1; i < 6; i++) branch(x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6, len * 0.35 * (1 - i / 8), ang + (i % 2 ? 0.7 : -0.7), 1);
    };
    branch(4, h / 2, w - 12, 0, 0);
    return toTex(c, { repeat: false });
  });
}

// Мех: короткие штрихи по направлению «шерсти» (оттенок задаёт цвет материала)
export function furTex() {
  return memo('fur', () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, w, w);
    hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, w, w);
    const rnd = mulberry32(701);
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * w, y = rnd() * w, len = 5 + rnd() * 10, a = Math.PI / 2 + (rnd() - 0.5) * 0.5;
      const l = 110 + rnd() * 145 | 0;
      ctx.strokeStyle = `rgba(${l},${l},${l},0.55)`; ctx.lineWidth = 0.8 + rnd() * 1.2;
      hctx.strokeStyle = `rgba(${l},${l},${l},0.6)`; hctx.lineWidth = 1;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) {
        ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); ctx.stroke();
        hctx.beginPath(); hctx.moveTo(x + ox, y + oy); hctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len); hctx.stroke();
      }
    }
    const map = toTex(c);
    map.repeat.set(3, 3);
    const normalMap = toTex(heightToNormal(hc, 2.5), { srgb: false });
    normalMap.repeat.set(3, 3);
    return { map, normalMap };
  });
}

// Чешуя (драконы, ящеры): цвет — от материала
export function scaleTex() {
  return memo('scales', () => {
    const w = 256, c = canvas(w), ctx = c.getContext('2d');
    const hc = canvas(w), hctx = hc.getContext('2d');
    ctx.fillStyle = '#707070'; ctx.fillRect(0, 0, w, w);
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, w, w);
    const rnd = mulberry32(801);
    const rows = 14, cols = 12, rw = w / cols, rh = w / rows;
    for (let r = -1; r <= rows; r++) for (let k = -1; k <= cols; k++) {
      const x = k * rw + (r % 2) * rw / 2, y = r * rh;
      const l = 150 + rnd() * 90 | 0;
      const g = ctx.createRadialGradient(x, y + rh * 0.2, 1, x, y + rh * 0.4, rw * 0.7);
      g.addColorStop(0, `rgb(${l},${l},${l})`); g.addColorStop(1, `rgb(${l * 0.45 | 0},${l * 0.45 | 0},${l * 0.45 | 0})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + rh * 0.5, rw * 0.55, rh * 0.95, 0, 0, Math.PI); ctx.fill();
      const hg = hctx.createRadialGradient(x, y + rh * 0.2, 1, x, y + rh * 0.4, rw * 0.7);
      hg.addColorStop(0, '#fff'); hg.addColorStop(1, '#222');
      hctx.fillStyle = hg; hctx.beginPath(); hctx.ellipse(x, y + rh * 0.5, rw * 0.55, rh * 0.95, 0, 0, Math.PI); hctx.fill();
    }
    const map = toTex(c); map.repeat.set(4, 4);
    const normalMap = toTex(heightToNormal(hc, 3), { srgb: false }); normalMap.repeat.set(4, 4);
    return { map, normalMap };
  });
}
