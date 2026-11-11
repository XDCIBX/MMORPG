// Лицо и волосы: вылепленная геометрия головы, нарисованная текстура лица, волосы из прядей.
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';
import { IS_PHONE } from '../core/device.js';

const cache = new Map();
const memo = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

// Перевод направления на единичной сфере в UV SphereGeometry
function dirUV(x, y, z) {
  const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  let u = Math.atan2(z, -x) / (Math.PI * 2); if (u < 0) u += 1;
  const v = 1 - Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI;
  return [u, v];
}
const fd = (x, y) => [x, y, Math.sqrt(Math.max(0.05, 1 - x * x - y * y))];

// Гауссовы «выпуклости» для лепки лица (в единичной сфере до масштабирования)
const BUMPS = [
  // [x, y, sx, sy, сила]  — сила >0 наружу, <0 внутрь
  [0, -0.06, 0.07, 0.17, 0.2], // спинка носа
  [0, -0.2, 0.09, 0.07, 0.11], // кончик носа
  [0.08, -0.22, 0.05, 0.05, 0.04], [-0.08, -0.22, 0.05, 0.05, 0.04], // крылья носа
  [0.34, 0.12, 0.13, 0.1, -0.07], [-0.34, 0.12, 0.13, 0.1, -0.07], // глазницы
  [0.3, 0.27, 0.17, 0.05, 0.045], [-0.3, 0.27, 0.17, 0.05, 0.045], // надбровные дуги
  [0.5, -0.06, 0.13, 0.11, 0.05], [-0.5, -0.06, 0.13, 0.11, 0.05], // скулы
  [0, -0.38, 0.15, 0.045, 0.045], [0, -0.47, 0.13, 0.05, 0.04], // губы
  [0, -0.68, 0.14, 0.1, 0.06], // подбородок
  [0.42, -0.32, 0.12, 0.14, -0.025], [-0.42, -0.32, 0.12, 0.14, -0.025], // щёки под скулами
];

export function sculptedHead(type, female) {
  return memo('sh_' + type + female, () => {
    const g = new THREE.SphereGeometry(1, 48, 36);
    const p = g.attributes.position;
    const human = type === 'human' || type === 'orc' || type === 'goblin';
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // лепка в «лицевой» системе до общих искажений
      if (human && z > 0.2) {
        let push = 0;
        for (const [bx, by, sx, sy, k] of BUMPS) {
          const dx = (x - bx) / sx, dy = (y - by) / sy;
          push += k * Math.exp(-(dx * dx + dy * dy)) * (type === 'orc' && k > 0 && by < -0.5 ? 1.8 : 1) * (female && Math.abs(by + 0.68) < 0.01 ? 0.6 : 1);
        }
        z += push * Math.min(1, (z - 0.2) * 3);
      }
      x *= 0.84; y *= 1.08; z *= 0.98;
      if (y < -0.1) {
        const t = (-y - 0.1) / 1.0;
        x *= 1 - t * (type === 'orc' || type === 'bull' ? 0.12 : female ? 0.42 : 0.34);
        if (z > 0) z += t * 0.08;
      }
      if (z < 0 && y > -0.3) z *= 1.12; // затылок
      if (z > 0.62) z = 0.62 + (z - 0.62) * 0.7;
      if (y > 0.2) x *= 1 - (y - 0.2) * 0.08; // виски
      if (type === 'lizard' || type === 'bull') { if (z > 0.2 && y < 0.2) z += (z - 0.2) * 0.9 * (1 - Math.max(0, y)); }
      if (type === 'goblin') { if (y > 0) { x *= 1.08; z *= 1.05; } }
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Текстура лица: тон кожи, брови, губы, тени у глаз, румянец, щетина
export function faceTexture(skin, hair, female, opts = {}) {
  const key = ['face', skin, hair, female, opts.stubble, opts.lips, opts.paint].join('|');
  return memo(key, () => {
    const W = IS_PHONE ? 512 : 1024, H = W / 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const base = new THREE.Color(skin);
    ctx.fillStyle = skin; ctx.fillRect(0, 0, W, H);
    // мягкая неоднородность кожи
    const rnd = mulberry32(7);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 10;
      const k = (rnd() - 0.5) * 0.1;
      const cc = base.clone().offsetHSL(0.005 * (rnd() - 0.5), 0, k);
      ctx.fillStyle = `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},0.07)`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    const at = (x, y) => { const [u, v] = dirUV(...fd(x, y)); return [u * W, (1 - v) * H]; };
    const blob = (x, y, rx, ry, color, alpha) => {
      const [px, py] = at(x, y);
      const g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry) * W / 6.3);
      g.addColorStop(0, color.replace('A', alpha)); g.addColorStop(1, color.replace('A', 0));
      ctx.save(); ctx.translate(px, py); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.translate(-px, -py);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, Math.max(rx, ry) * W / 6.3, 0, 7); ctx.fill(); ctx.restore();
    };
    // тени глазниц и румянец
    for (const sx of [-1, 1]) {
      blob(sx * 0.34, 0.1, 0.16, 0.1, 'rgba(70,35,30,A)', female ? 0.32 : 0.38);
      blob(sx * 0.45, -0.18, 0.14, 0.1, 'rgba(210,90,80,A)', female ? 0.3 : 0.15);
      if (female && !opts.paint) blob(sx * 0.34, 0.16, 0.12, 0.05, 'rgba(90,60,110,A)', 0.25); // тени для век
    }
    // носогубные тени
    for (const sx of [-1, 1]) blob(sx * 0.17, -0.32, 0.04, 0.09, 'rgba(90,45,35,A)', 0.2);
    // губы
    const lips = opts.lips || (female ? '#b0505c' : '#a0625a');
    {
      const [px, py] = at(0, -0.41);
      const lw = W * 0.032, lh = H * 0.018;
      ctx.fillStyle = lips;
      ctx.beginPath();
      ctx.moveTo(px - lw, py);
      ctx.quadraticCurveTo(px - lw * 0.4, py - lh * 1.2, px, py - lh * 0.6);
      ctx.quadraticCurveTo(px + lw * 0.4, py - lh * 1.2, px + lw, py);
      ctx.quadraticCurveTo(px, py + lh * (female ? 1.8 : 1.4), px - lw, py);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,20,20,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - lw * 0.95, py); ctx.quadraticCurveTo(px, py + lh * 0.25, px + lw * 0.95, py); ctx.stroke();
    }
    // брови
    const hc = new THREE.Color(hair || '#3a2a1e');
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = `rgba(${hc.r * 255 | 0},${hc.g * 255 | 0},${hc.b * 255 | 0},0.92)`;
      ctx.lineCap = 'round';
      const pts = [[0.14, 0.27], [0.3, 0.32], [0.46, 0.27]].map(([x, y]) => at(sx * x, y + (female ? 0.015 : 0)));
      for (let k = 0; k < 14; k++) {
        ctx.lineWidth = (female ? 2.2 : 3.4) * (1 - k / 20);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] + k * 0.25); ctx.quadraticCurveTo(pts[1][0], pts[1][1] - 3 + k * 0.3, pts[2][0], pts[2][1] + k * 0.15); ctx.stroke();
      }
    }
    // ресницы/подводка вокруг глаз
    for (const sx of [-1, 1]) {
      const [px, py] = at(sx * 0.34, 0.12);
      ctx.strokeStyle = 'rgba(20,12,10,0.85)'; ctx.lineWidth = female ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(px, py, W * 0.024, H * 0.026, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
    // ноздри
    for (const sx of [-1, 1]) { const [px, py] = at(sx * 0.06, -0.25); ctx.fillStyle = 'rgba(50,20,15,0.6)'; ctx.beginPath(); ctx.ellipse(px, py, 4, 2.4, 0, 0, 7); ctx.fill(); }
    // щетина
    if (opts.stubble) {
      for (let i = 0; i < 9000; i++) {
        const x = (rnd() - 0.5) * 1.1, y = -0.25 - rnd() * 0.65;
        if (Math.abs(x) > 0.55 || (Math.abs(x) < 0.18 && y > -0.52 && y < -0.33)) continue;
        const [px, py] = at(x, y);
        ctx.fillStyle = `rgba(${hc.r * 120 | 0},${hc.g * 110 | 0},${hc.b * 100 | 0},0.35)`;
        ctx.fillRect(px, py, 1.4, 1.4);
      }
    }
    // боевая раскраска / татуировки некроманта
    if (opts.paint) {
      ctx.strokeStyle = opts.paint; ctx.lineWidth = 3;
      for (const sx of [-1, 1]) {
        const a = at(sx * 0.34, 0.03), b = at(sx * 0.36, -0.3);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

// Текстура пряди: множество тонких волос, прозрачные кончики (цвет задаёт материал)
export function hairStrandTex() {
  return memo('hairTex', () => {
    const W = 256, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const rnd = mulberry32(31);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * W, len = H * (0.55 + rnd() * 0.45), l = 0.55 + rnd() * 0.6;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(${200 * l | 0},${200 * l | 0},${200 * l | 0},1)`);
      g.addColorStop(0.75, `rgba(${235 * l | 0},${235 * l | 0},${235 * l | 0},0.95)`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.strokeStyle = g; ctx.lineWidth = 0.8 + rnd() * 1.6;
      ctx.beginPath(); ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 14, len * 0.3, x + (rnd() - 0.5) * 18, len * 0.7, x + (rnd() - 0.5) * 22, len);
      ctx.stroke();
    }
    // плотная основа сверху
    const base = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    base.addColorStop(0, 'rgba(170,170,170,1)'); base.addColorStop(1, 'rgba(170,170,170,0)');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H * 0.35);
    ctx.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
}

export function hairMat(color) {
  return memo('hairMat' + color, () => new THREE.MeshStandardMaterial({ color, map: hairStrandTex(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 }));
}
export function hairCapMat(color) {
  return memo('hairCap' + color, () => {
    const t = hairStrandTex().clone();
    t.repeat.set(5, 1.2); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), map: t, roughness: 0.6 });
  });
}

// Лента пряди вдоль пути точек (массив Vector3) шириной w, с UV по длине
function ribbon(path, w, normalHint) {
  const pos = [], uv = [], idx = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const t = path[Math.min(n - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
    const side = new THREE.Vector3().crossVectors(t, normalHint(p)).normalize();
    const ww = w * (1 - (i / (n - 1)) * 0.45);
    pos.push(p.x - side.x * ww, p.y - side.y * ww, p.z - side.z * ww, p.x + side.x * ww, p.y + side.y * ww, p.z + side.z * ww);
    uv.push(0, 1 - i / (n - 1), 1, 1 - i / (n - 1));
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Волосы из прядей: style short | long | ponytail | bun | mohawk | braids. r — радиус головы
export function buildHair(style, r, female, seed = 1) {
  const key = ['hair', style, r.toFixed(4), female, seed].join('|');
  return memo(key, () => {
    const rnd = mulberry32(seed * 97 + 13);
    const cards = [];
    const out = (p) => p.clone().normalize();
    // путь пряди: от макушки по поверхности черепа вниз, затем свободно свисает
    const strand = (az, startPolar, lenOnHead, hang, lift = 1.08, curl = 0) => {
      const pts = [];
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const pol = startPolar + (lenOnHead) * (k / steps);
        const rr = r * (lift + 0.02 * k / steps);
        pts.push(new THREE.Vector3(Math.sin(pol) * Math.sin(az) * rr * 0.9, Math.cos(pol) * rr * 1.08 + r * 0.06, Math.sin(pol) * Math.cos(az) * rr * 1.05 - r * 0.04));
      }
      const last = pts[pts.length - 1];
      const hs = 6;
      for (let k = 1; k <= hs && hang > 0; k++) {
        const t = k / hs;
        pts.push(new THREE.Vector3(last.x * (1 + t * 0.15) + Math.sin(az) * curl * t, last.y - hang * t, last.z * (1 + t * 0.12) + Math.cos(az) * curl * t - t * hang * 0.12));
      }
      return pts;
    };
    const add = (pts, w) => cards.push(ribbon(pts, w, out));
    if (style === 'none') return null;
    // макушка: пряди веером от темени
    const crownN = style === 'mohawk' ? 0 : 26;
    for (let i = 0; i < crownN; i++) {
      const az = (i / crownN) * Math.PI * 2 + rnd() * 0.2;
      const fz = Math.cos(az);
      // спереди чёлка зачёсана назад и не закрывает глаза
      const len = fz > 0.5 ? 0.5 : fz > 0 ? 0.8 : (style === 'short' ? 1.25 : 1.45);
      add(strand(az, 0.05, len, 0, 1.06 + rnd() * 0.04), r * (0.32 + rnd() * 0.1));
    }
    if (style === 'long') {
      for (let i = 0; i < 30; i++) {
        const az = Math.PI * (0.35 + 1.3 * (i / 29)) + (rnd() - 0.5) * 0.15; // бока и затылок
        add(strand(az, 0.5, 1.2, r * (female ? 3.6 : 3.0) * (0.8 + rnd() * 0.3), 1.1 + rnd() * 0.05, r * 0.2), r * (0.3 + rnd() * 0.1));
      }
    } else if (style === 'short') {
      for (let i = 0; i < 18; i++) {
        const az = Math.PI * (0.45 + 1.1 * (i / 17));
        add(strand(az, 0.6, 1.1, r * 0.25, 1.07), r * 0.3);
      }
    } else if (style === 'ponytail' || style === 'bun') {
      for (let i = 0; i < 16; i++) {
        const az = Math.PI * (0.4 + 1.2 * (i / 15));
        add(strand(az, 0.5, 1.1, 0, 1.06), r * 0.3);
      }
      const base = new THREE.Vector3(0, r * 0.45, -r * 1.02);
      if (style === 'ponytail') {
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          const pts = [];
          for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.12 * (1 - t * 0.5), base.y - t * r * 3.2, base.z - r * 0.25 * Math.sin(t * 2) + Math.sin(a) * r * 0.1)); }
          add(pts, r * 0.18);
        }
      } else {
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          const pts = [];
          for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI * 1.6 + a; pts.push(new THREE.Vector3(Math.cos(t) * r * 0.32, base.y + r * 0.15 + Math.sin(k / 8 * Math.PI) * r * 0.1, base.z + Math.sin(t) * r * 0.32 - r * 0.15)); }
          add(pts, r * 0.2);
        }
      }
    } else if (style === 'mohawk') {
      for (let i = 0; i < 14; i++) {
        const pol = -0.3 + i * 0.16;
        const pts = [];
        for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(new THREE.Vector3(0, Math.cos(pol) * r * (1.05 + t * 0.55), Math.sin(pol) * r * (1.05 + t * 0.55) - t * r * 0.2)); }
        add(pts, r * 0.18);
      }
    } else if (style === 'braids') {
      for (let i = 0; i < 16; i++) {
        const az = Math.PI * (0.4 + 1.2 * (i / 15));
        add(strand(az, 0.5, 1.1, r * 0.3, 1.06), r * 0.3);
      }
    }
    if (!cards.length) return null;
    // объединяем
    let total = 0;
    for (const g of cards) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), uvs = new Float32Array(total * 2), nrm = new Float32Array(total * 3);
    const idx = [];
    let off = 0;
    for (const g of cards) {
      pos.set(g.attributes.position.array, off * 3);
      uvs.set(g.attributes.uv.array.map((v, k) => (k % 2 === 0 ? v * 0.35 + rnd() * 0.65 : v)), off * 2);
      nrm.set(g.attributes.normal.array, off * 3);
      for (const i of g.index.array) idx.push(i + off);
      off += g.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    // нормали наружу от центра головы — мягкое освещение «объёма»
    const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i) - r * 0.2, p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
    return g;
  });
}
