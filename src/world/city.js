// Построение городов: стены, башни, ворота, дома, рынок, кузница, достопримечательности.
import * as THREE from 'three';
import { Batcher, boxUV, cylUV, gableRoof, gableWall, M4 } from './builders.js';
import { stoneWall, cobblestone, timberPlaster, roofTiles, woodPlanks, marble, cloth } from '../core/textures.js';
import { mulberry32 } from '../core/util.js';
import { buildFountain, fountainUniforms } from './fountain.js';

const matCache = new Map();
function texMat(key, fn) {
  if (!matCache.has(key)) matCache.set(key, fn());
  return matCache.get(key);
}
function pbr(t, color = '#ffffff', rough = 0.9, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, map: t.map, normalMap: t.normalMap, roughness: rough, metalness: 0 }, extra));
}

// Общие материалы (окна светятся ночью — интенсивность меняет цикл дня)
export const windowMat = new THREE.MeshStandardMaterial({ color: '#1c2a38', emissive: '#ffb050', emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.7 });
export const flameMat = new THREE.MeshStandardMaterial({ color: '#ffcc66', emissive: '#ff9a30', emissiveIntensity: 3, roughness: 1 });
export const waterMat = new THREE.MeshPhysicalMaterial({ color: '#2a6a80', roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1 });
const goldMat = new THREE.MeshStandardMaterial({ color: '#d4a640', roughness: 0.3, metalness: 0.9 });
const ironMat = new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.5, metalness: 0.8 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#0a0806', roughness: 1 });

export function styleMats(style) {
  return texMat('style_' + style, () => {
    const wood = pbr(woodPlanks('#6a4a2e'), '#ffffff', 0.85);
    const darkWood = pbr(woodPlanks('#3a2818'), '#ffffff', 0.85);
    if (style === 'timber') return {
      wall: pbr(timberPlaster('#ece0c8', '#4a3020')), wall2: pbr(timberPlaster('#e0d4bc', '#5a3a24')),
      stone: pbr(stoneWall('#8a8070', 'a')), roof: pbr(roofTiles('#8e3b26'), '#ffffff', 0.8), roof2: pbr(roofTiles('#5a4a3a'), '#ffffff', 0.85),
      ground: pbr(cobblestone('#857c70')), wood, darkWood, trim: wood, wallStone: pbr(stoneWall('#958b7c', 'b')),
    };
    if (style === 'stone') return {
      wall: pbr(stoneWall('#8a8478', 'c')), wall2: pbr(stoneWall('#7a7468', 'd')),
      stone: pbr(stoneWall('#6a665e', 'e')), roof: pbr(roofTiles('#465868'), '#ffffff', 0.7), roof2: pbr(roofTiles('#3a4652'), '#ffffff', 0.7),
      ground: pbr(cobblestone('#6e6a64')), wood, darkWood, trim: pbr(stoneWall('#5a564e', 'f')), wallStone: pbr(stoneWall('#7a7468', 'g')),
    };
    return {
      wall: pbr(marble('#efe9de'), '#ffffff', 0.45), wall2: pbr(marble('#e6dccb'), '#ffffff', 0.45),
      stone: pbr(stoneWall('#c8c0b0', 'h')), roof: pbr(roofTiles('#2a5a8a'), '#ffffff', 0.6), roof2: pbr(roofTiles('#2a6a6a'), '#ffffff', 0.6),
      ground: pbr(cobblestone('#bdb5a6')), wood, darkWood, trim: goldMat, wallStone: pbr(stoneWall('#d8d0c0', 'i'), '#ffffff', 0.7),
    };
  });
}

// ткань колышется на ветру: mode 'hang' — закреплена сверху, 'flag' — у древка слева
function clothMatC(color, pattern = 1, mode = null) {
  return texMat('cloth_' + color + pattern + mode, () => {
    const m = new THREE.MeshStandardMaterial({ color, map: cloth('#ffffff', pattern), roughness: 0.9, side: THREE.DoubleSide });
    if (mode) {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = fountainUniforms.uTime;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            float cw = ${mode === 'flag' ? 'uv.x' : '(1.0 - uv.y)'};
            float ph = uTime * 2.4 + position.x * 0.9 + position.z * 0.9 + position.y * 1.7;
            transformed += objectNormal * (sin(ph) * 0.16 + sin(ph * 2.3 + 1.0) * 0.05) * cw;`);
      };
      m.customProgramCacheKey = () => 'clothwave' + mode;
    }
    return m;
  });
}
const flatMat = (c, rough = 0.8) => texMat('flat' + c + rough, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, side: THREE.DoubleSide }));

// ---------------- Дом ----------------
export function buildHouse(B, M, x, y, z, yaw, w, d, floors, style, rnd, col, opts = {}) {
  const fh = 3.1;
  const H = floors * fh;
  const T = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  const put = (geo, mat, m, o) => B.add(geo, mat, new THREE.Matrix4().multiplyMatrices(T, m), o);
  put(boxUV(w + 0.4, 1.0, d + 0.4, 2), M.stone, M4(0, 0.2, 0));
  const wallMat = rnd() < 0.5 ? M.wall : M.wall2;
  if (style === 'timber' && floors >= 2) {
    put(boxUV(w, fh, d, 3), M.wallStone, M4(0, 0.7 + fh / 2, 0));
    put(boxUV(w + 0.5, H - fh, d + 0.5, 3), wallMat, M4(0, 0.7 + fh + (H - fh) / 2, 0));
    put(boxUV(w + 0.7, 0.25, d + 0.7, 2), M.darkWood, M4(0, 0.7 + fh, 0));
  } else {
    put(boxUV(w, H, d, 3), wallMat, M4(0, 0.7 + H / 2, 0));
  }
  const top = 0.7 + H;
  const ridgeX = w >= d;
  const rw = ridgeX ? w : d, rd = ridgeX ? d : w;
  const rh = style === 'stone' ? rd * 0.38 : style === 'marble' ? rd * 0.3 : rd * 0.55;
  const over = style === 'timber' && floors >= 2 ? 0.55 : 0.4;
  const roofMat = opts.roofMat || (rnd() < 0.7 ? M.roof : M.roof2);
  const rr = ridgeX ? 0 : Math.PI / 2;
  put(gableRoof(rw + 0.2, rd + (style === 'timber' && floors >= 2 ? 0.5 : 0), rh, over, 0.18), roofMat, M4(0, top, 0, rr));
  for (const s of [-1, 1]) {
    const gw = gableWall(rd + (style === 'timber' && floors >= 2 ? 0.5 : 0), rh, 3);
    const gyaw = ridgeX ? (s > 0 ? Math.PI / 2 : -Math.PI / 2) : (s > 0 ? 0 : Math.PI);
    put(gw, wallMat, M4(ridgeX ? s * (rw / 2 + (style === 'timber' && floors >= 2 ? 0.25 : 0)) : 0, top, ridgeX ? 0 : s * (rw / 2 + (style === 'timber' && floors >= 2 ? 0.25 : 0)), gyaw));
  }
  // труба
  if (style !== 'marble' || rnd() < 0.3) put(boxUV(0.8, rh + 1.5, 0.8, 1.5), M.stone, M4(rw * 0.28 * (ridgeX ? 1 : 0), top + rh * 0.5 + 0.4, ridgeX ? -rd * 0.15 : rw * 0.28));
  // дверь
  const fz = d / 2 + (style === 'timber' && floors >= 2 ? 0.0 : 0);
  put(boxUV(1.5, 2.6, 0.25, 1), M.trim, M4(0, 0.7 + 1.3, fz + 0.02));
  put(boxUV(1.15, 2.25, 0.2, 1), M.darkWood, M4(0, 0.7 + 1.15, fz + 0.08));
  put(new THREE.SphereGeometry(0.06, 6, 4), goldMat, M4(0.4, 0.7 + 1.1, fz + 0.2));
  // окна
  const winRow = (len, depthPos, axis, floorsN) => {
    const n = Math.max(1, Math.floor(len / 2.6));
    for (let f = 0; f < floorsN; f++) {
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * (len / n);
        if (axis === 'front' && f === 0 && Math.abs(off) < 1.2) continue;
        const wy = 0.7 + f * fh + 1.75;
        const extra = style === 'timber' && floors >= 2 && f >= 1 ? 0.25 : 0;
        let m1, m2, m3;
        if (axis === 'front' || axis === 'back') {
          const zz = (axis === 'front' ? 1 : -1) * (depthPos + extra + 0.02);
          m1 = M4(off, wy, zz); m2 = M4(off, wy, zz + (axis === 'front' ? 0.03 : -0.03));
          m3 = [M4(off - 0.65, wy, zz, 0), M4(off + 0.65, wy, zz, 0)];
        } else {
          const xx = (axis === 'right' ? 1 : -1) * (depthPos + extra + 0.02);
          m1 = M4(xx, wy, off, Math.PI / 2); m2 = M4(xx + (axis === 'right' ? 0.03 : -0.03), wy, off, Math.PI / 2);
          m3 = [M4(xx, wy, off - 0.65, Math.PI / 2), M4(xx, wy, off + 0.65, Math.PI / 2)];
        }
        put(boxUV(1.1, 1.45, 0.14, 1), M.trim, m1);
        put(new THREE.BoxGeometry(0.85, 1.2, 0.14), windowMat, m2, { noShadow: true });
        if (style === 'timber') for (const sm of m3) put(boxUV(0.4, 1.4, 0.08, 1), M.darkWood, sm);
      }
    }
  };
  winRow(w, d / 2, 'front', floors);
  winRow(w, d / 2, 'back', floors);
  if (d > 4) { winRow(d, w / 2, 'right', floors); winRow(d, w / 2, 'left', floors); }
  // колонны для мраморного стиля
  if (style === 'marble' && opts.columns !== false) {
    const n = Math.max(2, Math.floor(w / 2.5));
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * (w / n) * 0.95;
      put(cylUV(0.28, 0.32, H, 12, 2), M.wall, M4(cx, 0.7 + H / 2, d / 2 + 1.0));
      put(boxUV(0.8, 0.3, 0.8, 1), M.trim, M4(cx, 0.7 + H, d / 2 + 1.0));
    }
    put(boxUV(w + 0.4, 0.4, 1.8, 2), M.wall, M4(0, 0.7 + H + 0.2, d / 2 + 0.8));
  }
  // ---- детали фасада ----
  const ext = style === 'timber' && floors >= 2 ? 0.25 : 0;
  put(boxUV(1.9, 0.3, 0.9, 1), M.stone, M4(0, 0.5, fz + 0.5));                         // ступень
  if (style !== 'marble') {                                                           // навес над дверью
    put(boxUV(2.2, 0.1, 1.1, 1), roofMat, M4(0, 0.7 + 2.95, fz + 0.5, 0, 1, 1, 1, 0.38));
    for (const sx of [-1, 1]) put(boxUV(0.08, 0.08, 1.0, 1), M.darkWood, M4(sx * 1.0, 0.7 + 2.6, fz + 0.45, 0, 1, 1, 1, -0.5));
  } else {
    put(boxUV(2.4, 0.3, 0.5, 1), M.wall2, M4(0, 0.7 + 2.95, fz + 0.2));
    put(new THREE.ConeGeometry(1.5, 0.7, 3).rotateY(Math.PI / 6), M.wall2, M4(0, 0.7 + 3.45, fz + 0.2, 0, 1, 1, 0.25));
  }
  // фонарь у двери
  put(new THREE.BoxGeometry(0.05, 0.05, 0.4), ironMat, M4(1.0, 0.7 + 2.25, fz + 0.2));
  put(new THREE.BoxGeometry(0.2, 0.28, 0.2), windowMat, M4(1.0, 0.7 + 2.05, fz + 0.38), { noShadow: true });
  // цветочные ящики под окнами фасада
  {
    const n = Math.max(1, Math.floor(w / 2.6));
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (w / n);
      if (f === 0 && Math.abs(off) < 1.2) continue;
      if (rnd() > (style === 'stone' ? 0.25 : 0.6)) continue;
      const wy = 0.7 + f * fh + 0.92, zz = d / 2 + (f >= 1 ? ext : 0) + 0.2;
      put(boxUV(1.0, 0.2, 0.3, 1), M.darkWood, M4(off, wy, zz));
      put(new THREE.SphereGeometry(0.2, 7, 5), flatMat('#3f6e2c', 0.9), M4(off, wy + 0.16, zz, 0, 2.2, 0.8, 0.7), { noShadow: true });
      const fc = ['#e0485a', '#f0d040', '#e8e8f0', '#c060d0', '#f08a30'][Math.floor(rnd() * 5)];
      for (let k = 0; k < 5; k++) put(new THREE.SphereGeometry(0.07, 6, 4), flatMat(fc, 0.7), M4(off - 0.38 + k * 0.19, wy + 0.27 + (k % 2) * 0.05, zz + 0.04), { noShadow: true });
    }
  }
  // вывеска на кронштейне
  if (opts.sign !== false && rnd() < 0.35) {
    const sx = (rnd() < 0.5 ? -1 : 1) * Math.min(w / 2 - 0.7, 2.2);
    put(new THREE.BoxGeometry(0.06, 0.06, 1.1), ironMat, M4(sx, 0.7 + 3.0, fz + 0.55));
    put(boxUV(0.08, 0.6, 0.8, 1), M.wood, M4(sx, 0.7 + 2.55, fz + 0.75));
    const ec = ['#c8a040', '#b03030', '#2a6ab0', '#3a8a40'][Math.floor(rnd() * 4)];
    for (const s2 of [-1, 1]) put(new THREE.CircleGeometry(0.2, 12).rotateY(s2 * Math.PI / 2), flatMat(ec, 0.5), M4(sx + s2 * 0.045, 0.7 + 2.55, fz + 0.75), { noShadow: true });
  }
  // углы и карнизы
  if (style === 'stone') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(boxUV(0.55, H + 0.3, 0.55, 1.5), M.trim, M4(sx * w / 2, 0.7 + H / 2, sz * d / 2));
  } else if (style === 'marble') {
    put(boxUV(w + 0.5, 0.3, d + 0.5, 2), M.wall2, M4(0, 0.7 + H - 0.1, 0));
    put(boxUV(w + 0.3, 0.14, d + 0.3, 2), goldMat, M4(0, 0.7 + H - 0.36, 0));
    put(boxUV(w + 0.3, 0.5, d + 0.3, 2), M.wall2, M4(0, 0.95, 0));
  } else if (floors >= 2) {
    // подкосы под выступом второго этажа
    const nb = Math.max(2, Math.floor(w / 1.8));
    for (let i = 0; i < nb; i++) put(boxUV(0.14, 0.14, 0.6, 1), M.darkWood, M4((i - (nb - 1) / 2) * (w / nb), 0.7 + fh - 0.3, d / 2 + 0.1, 0, 1, 1, 1, 0.7));
  }
  // коньковый брус
  put(boxUV(rw + 0.5 + over, 0.16, 0.16, 1), M.darkWood, M4(0, top + rh + 0.12, 0, rr));
  // дым из трубы
  if (opts.animated && (style !== 'marble') && rnd() < 0.45) {
    const wp = new THREE.Vector3(rw * 0.28 * (ridgeX ? 1 : 0), top + rh + 1.3, ridgeX ? -rd * 0.15 : rw * 0.28).applyMatrix4(T);
    opts.animated.push({ type: 'smoke', x: wp.x, y: wp.y, z: wp.z });
  }
  return { w, d, H, top: top + rh };
}

// ---------------- Город ----------------
export function buildCity(city, terrain, collision, root) {
  const rnd = mulberry32(city.x * 31 + city.z * 17);
  const M = styleMats(city.style);
  const B = new Batcher();
  const cx = city.x, cz = city.z;
  const cy = terrain.getHeight(cx, cz);
  const R = city.r;
  const group = new THREE.Group();
  group.name = 'city_' + city.id;
  root.add(group);
  const spots = [];
  const animated = [];
  const W = (x, z) => [cx + x, cz + z];
  // Ворота привязываем ровно к одному сегменту стены, чтобы арка опиралась на две башни
  const N = 30;
  const gateSegs = new Set();
  const gates = city.gates.map(g => {
    const i = ((Math.round((g / (Math.PI * 2)) * N - 0.5) % N) + N) % N;
    gateSegs.add(i);
    return (i + 0.5) / N * Math.PI * 2;
  });
  const gateHalf = 0.13;
  const isGateAngle = (a, extra = 0) => gates.some(g => { let d = Math.abs(((a - g) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); return d < gateHalf + extra; });

  // Мостовая
  const ground = new THREE.CircleGeometry(R + 3, 64);
  ground.rotateX(-Math.PI / 2);
  const uv = ground.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (R + 3) * 2 / 3, uv.getY(i) * (R + 3) * 2 / 3);
  const gm = new THREE.Mesh(ground, M.ground);
  gm.position.set(cx, cy + 0.06, cz);
  gm.receiveShadow = true;
  group.add(gm);
  // Стены и башни
  const wallH = city.style === 'stone' ? 9 : city.style === 'marble' ? 10 : 7;
  const wallMat = M.wallStone;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const [x0, z0] = W(Math.cos(a0) * R, Math.sin(a0) * R);
    const [x1, z1] = W(Math.cos(a1) * R, Math.sin(a1) * R);
    const gate = gateSegs.has(i);
    if (!gate) {
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dz, dx);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      B.add(boxUV(L + 0.4, wallH, 1.8, 3), wallMat, M4(mx, cy + wallH / 2 - 0.5, mz, yaw));
      // зубцы
      const nm = Math.floor(L / 1.6);
      for (let k = 0; k < nm; k++) {
        const t = (k + 0.5) / nm - 0.5;
        const ox = Math.sin(yaw) * 0.65, oz = Math.cos(yaw) * 0.65;
        B.add(boxUV(0.8, 1.0, 0.5, 1), wallMat, M4(mx + Math.cos(yaw) * t * L - ox, cy + wallH, mz - Math.sin(yaw) * t * L - oz, yaw));
        B.add(boxUV(0.8, 1.0, 0.5, 1), wallMat, M4(mx + Math.cos(yaw) * t * L + ox, cy + wallH, mz - Math.sin(yaw) * t * L + oz, yaw));
      }
      B.add(boxUV(L + 0.5, 1.3, 2.5, 3), M.stone, M4(mx, cy + 0.3, mz, yaw));                         // цоколь
      B.add(boxUV(1.3, wallH * 0.78, 2.9, 2), M.stone, M4(mx, cy + wallH * 0.39 - 0.5, mz, yaw));     // контрфорс
      B.add(boxUV(L + 0.5, 0.3, 2.3, 3), M.stone, M4(mx, cy + wallH - 0.62, mz, yaw));                // карниз под зубцами
      for (const tt of [-0.28, 0.28]) for (const sd of [-1, 1]) {                                     // бойницы
        B.add(new THREE.BoxGeometry(0.2, 1.2, 0.12), darkMat, M4(mx + Math.cos(yaw) * tt * L + Math.sin(yaw) * sd * 0.93, cy + wallH - 2.6, mz - Math.sin(yaw) * tt * L + Math.cos(yaw) * sd * 0.93, yaw), { noShadow: true });
      }
      collision.addBox(mx, mz, L / 2 + 0.3, 1.1, yaw);
      // знамёна
      if (i % 3 === 1) {
        const bx = (x0 + x1) / 2 - Math.cos(am) * 1.0, bz = (z0 + z1) / 2 - Math.sin(am) * 1.0;
        void bx; void bz;
        const ox = Math.cos(am) * 1.0, oz = Math.sin(am) * 1.0;
        B.add(new THREE.PlaneGeometry(1.6, 3.6, 3, 8), clothMatC(city.banner, 2, 'hang'), M4(mx + ox, cy + wallH - 2.6, mz + oz, yaw + Math.PI), { noShadow: true });
        B.add(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6).rotateZ(Math.PI / 2), ironMat, M4(mx + ox, cy + wallH - 0.75, mz + oz, yaw));
      }
    }
    // башня в каждой 3-й вершине и у ворот
    const nextGate = gateSegs.has(i) || gateSegs.has((i + 1) % N);
    if (i % 3 === 0 || nextGate) {
      const [tx, tz] = W(Math.cos(a1) * R, Math.sin(a1) * R);
      const tr = nextGate ? 3.3 : 2.7, th = wallH + (nextGate ? 5 : 3.5);
      B.add(cylUV(tr, tr + 0.3, th, 18, 3), wallMat, M4(tx, cy + th / 2 - 0.5, tz));
      // пояса и окна башни
      B.add(new THREE.TorusGeometry(tr + 0.22, 0.2, 6, 20).rotateX(Math.PI / 2), M.stone, M4(tx, cy + th - 0.7, tz));
      B.add(new THREE.TorusGeometry(tr + 0.28, 0.16, 6, 20).rotateX(Math.PI / 2), M.stone, M4(tx, cy + wallH * 0.5, tz));
      B.add(cylUV(tr + 0.5, tr + 0.75, 1.2, 18, 3), M.stone, M4(tx, cy + 0.2, tz));
      for (let k = 0; k < 4; k++) {
        const ka = k / 4 * Math.PI * 2 + a1;
        B.add(new THREE.BoxGeometry(0.34, 1.0, 0.3), windowMat, M4(tx + Math.cos(ka) * (tr + 0.02), cy + th - 2.4, tz + Math.sin(ka) * (tr + 0.02), -ka + Math.PI / 2), { noShadow: true });
      }
      for (let k = 0; k < 12; k++) {
        const ka = k / 12 * Math.PI * 2;
        B.add(boxUV(0.9, 1.1, 0.6, 1), wallMat, M4(tx + Math.cos(ka) * (tr - 0.1), cy + th + 0.0, tz + Math.sin(ka) * (tr - 0.1), -ka + Math.PI / 2));
      }
      if (city.style !== 'stone') {
        const cone = new THREE.ConeGeometry(tr + 0.7, city.style === 'marble' ? 6 : 4.5, 18, 1, false);
        const cu = cone.attributes.uv; for (let q = 0; q < cu.count; q++) cu.setXY(q, cu.getX(q) * 8, cu.getY(q) * 3);
        B.add(cone, M.roof, M4(tx, cy + th + 0.6 + (city.style === 'marble' ? 3 : 2.25), tz));
        B.add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5), ironMat, M4(tx, cy + th + (city.style === 'marble' ? 7 : 5.5), tz));
        B.add(new THREE.PlaneGeometry(1.5, 0.85, 6, 3).translate(0.75, 0, 0), clothMatC(city.banner, 0, 'flag'), M4(tx, cy + th + (city.style === 'marble' ? 7.8 : 6.3), tz), { noShadow: true });
      } else {
        B.add(cylUV(tr - 0.6, tr - 0.6, 1.2, 14, 2), M.stone, M4(tx, cy + th + 0.3, tz));
        // жаровня
        B.add(new THREE.CylinderGeometry(0.5, 0.3, 0.6, 10), ironMat, M4(tx, cy + th + 1.1, tz));
        B.add(new THREE.SphereGeometry(0.35, 8, 6), flameMat, M4(tx, cy + th + 1.4, tz), { noShadow: true });
        animated.push({ type: 'fire', x: tx, y: cy + th + 1.5, z: tz });
      }
      collision.addCircle(tx, tz, tr + 0.2);
    }
  }
  // Ворота: надвратная арка от башни до башни, открытые створки
  const chord = 2 * R * Math.sin(Math.PI / N);
  const gR = R * Math.cos(Math.PI / N);
  for (const g of gates) {
    const [gx, gz] = W(Math.cos(g) * gR, Math.sin(g) * gR);
    const tyaw = Math.atan2(-Math.cos(g), -Math.sin(g)); // ось арки вдоль стены
    const tx = -Math.sin(g), tz = Math.cos(g); // касательная
    B.add(boxUV(chord + 0.6, 3.0, 2.4, 2), wallMat, M4(gx, cy + wallH + 0.0, gz, tyaw));
    // арочный свод
    const arch = new THREE.TorusGeometry(3.0, 0.45, 8, 20, Math.PI);
    B.add(arch, M.stone, M4(gx, cy + wallH - 4.4, gz, tyaw, 1, 1, 1.8));
    // зубцы над воротами
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6 - 0.5;
      for (const sd of [-0.75, 0.75]) B.add(boxUV(0.8, 1.0, 0.5, 1), wallMat, M4(gx + tx * t * chord + Math.cos(g) * sd, cy + wallH + 1.9, gz + tz * t * chord + Math.sin(g) * sd, tyaw));
    }
    // поднятая решётка
    for (let k = -3; k <= 3; k++) B.add(new THREE.BoxGeometry(0.12, 1.6, 0.12), ironMat, M4(gx + tx * k * 0.75, cy + wallH - 2.2, gz + tz * k * 0.75, 0));
    B.add(new THREE.BoxGeometry(0.15, 0.15, 5.4), ironMat, M4(gx, cy + wallH - 1.5, gz, -g));
    // распахнутые деревянные створки
    for (const sd of [-1, 1]) {
      const hx = gx + tx * sd * 2.9 - Math.cos(g) * 0.9, hz = gz + tz * sd * 2.9 - Math.sin(g) * 0.9;
      B.add(boxUV(2.6, 5.4, 0.22, 1), M.darkWood, M4(hx - Math.cos(g) * 1.2, cy + 2.7, hz - Math.sin(g) * 1.2, tyaw + sd * Math.PI / 2 + Math.PI / 2));
    }
    // факелы у ворот
    for (const s of [-1, 1]) {
      const fx = gx - Math.cos(g) * 1.6 + tx * s * 3.6, fz = gz - Math.sin(g) * 1.6 + tz * s * 3.6;
      B.add(new THREE.CylinderGeometry(0.06, 0.04, 0.8, 6), M.darkWood, M4(fx, cy + 3.3, fz));
      B.add(new THREE.SphereGeometry(0.16, 8, 6), flameMat, M4(fx, cy + 3.8, fz), { noShadow: true });
      animated.push({ type: 'fire', x: fx, y: cy + 3.9, z: fz, small: true });
    }
    // стражники у ворот
    for (const s of [-1, 1]) {
      const px = gx - Math.cos(g) * 3 + tx * s * 4.5, pz = gz - Math.sin(g) * 3 + tz * s * 4.5;
      spots.push({ role: 'guard', x: px, z: pz, yaw: Math.atan2(Math.cos(g), Math.sin(g)) });
    }
  }

  // Центральная площадь: фонтан (в каждом городе свой)
  const fy = cy;
  buildFountain(city, B, M, group, cx, fy, cz, animated, collision);
  {
    // мощёная площадь вокруг фонтана: кольцо другой кладки и бордюр
    const ring = new THREE.RingGeometry(5.6, 13.5, 72, 1).rotateX(-Math.PI / 2);
    const ru = ring.attributes.uv, rp = ring.attributes.position;
    for (let i = 0; i < ru.count; i++) ru.setXY(i, rp.getX(i) / 2.2, rp.getZ(i) / 2.2);
    B.add(ring, M.stone, M4(cx, cy + 0.085, cz), { noShadow: true });
    B.add(new THREE.TorusGeometry(13.5, 0.12, 5, 72).rotateX(Math.PI / 2), M.wallStone, M4(cx, cy + 0.09, cz), { noShadow: true });
  }
  const ringPosts = [];
  const props = [];
  const treeSpots = [];
  // скамейки и фонари вокруг площади
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2;
    if (isGateAngle(a, 0.2)) continue;
    const lx = cx + Math.cos(a) * 10, lz = cz + Math.sin(a) * 10;
    lantern(B, M, lx, cy, lz, animated);
    ringPosts[i] = new THREE.Vector3(lx, cy + 3.55, lz);
    // клумба
    const pa = a - 0.38, px = cx + Math.cos(pa) * 11.6, pz = cz + Math.sin(pa) * 11.6;
    if (!isGateAngle(pa, 0.16)) { planter(B, M, px, cy, pz, -pa, rnd, city.style); collision.addCircle(px, pz, 0.95); }
    collision.addCircle(lx, lz, 0.3);
    const bx = cx + Math.cos(a + 0.35) * 9, bz = cz + Math.sin(a + 0.35) * 9;
    const yaw = Math.atan2(-Math.cos(a + 0.35), -Math.sin(a + 0.35));
    B.add(boxUV(2.2, 0.12, 0.6, 1), M.wood, M4(bx, cy + 0.55, bz, yaw));
    B.add(boxUV(2.2, 0.5, 0.1, 1), M.wood, M4(bx - Math.sin(yaw) * 0.28, cy + 0.85, bz - Math.cos(yaw) * 0.28, yaw));
    for (const s of [-0.9, 0.9]) B.add(boxUV(0.12, 0.5, 0.5, 1), M.stone, M4(bx + Math.cos(yaw) * s, cy + 0.27, bz - Math.sin(yaw) * s, yaw));
  }
  const flagCols = [city.banner, '#f0e6c8', '#d4a83a'];
  for (let i = 0; i < 8; i++) { const a = ringPosts[i], b = ringPosts[(i + 1) % 8]; if (a && b) pennants(B, a, b, flagCols, rnd); }
  // Камень телепортации
  const tpA = gates[0] + Math.PI * 0.25;
  const tpx = cx + Math.cos(tpA) * 15, tpz = cz + Math.sin(tpA) * 15;
  const tp = buildTeleportStone(B, M, tpx, cy, tpz, animated, city.banner);
  collision.addCircle(tpx, tpz, 1.4);
  spots.push({ role: 'teleport', x: tpx, z: tpz, yaw: 0, obj: tp });

  // Особые здания: площадь-знамение напротив главных ворот
  const landA = gates[0] + Math.PI;
  const lmx = cx + Math.cos(landA) * (R * 0.55), lmz = cz + Math.sin(landA) * (R * 0.55);
  const lyaw = Math.atan2(-Math.cos(landA), -Math.sin(landA));
  buildLandmark(B, M, city, lmx, cy, lmz, lyaw, collision, animated, group);
  const landR = city.style === 'marble' ? 15 : 12;

  // Рынок: прилавки по кругу у площади
  const stallCols = ['#b03030', '#2a6ab0', '#c8a030', '#3a8a40', '#8a3aa0'];
  const marketA = gates[0] + Math.PI * 0.55;
  for (let i = 0; i < 4; i++) {
    const a = marketA + (i - 1.5) * 0.28;
    const sx = cx + Math.cos(a) * 17, sz = cz + Math.sin(a) * 17;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    stall(B, M, sx, cy, sz, yaw, stallCols[i % stallCols.length], rnd);
    collision.addBox(sx, sz, 1.6, 1.0, yaw);
    if (i === 1) spots.push({ role: 'merchant', x: sx - Math.sin(yaw) * 1.6, z: sz - Math.cos(yaw) * 1.6, yaw });
    else if (rnd() < 0.8) spots.push({ role: 'vendorExtra', x: sx - Math.sin(yaw) * 1.6, z: sz - Math.cos(yaw) * 1.6, yaw });
  }
  // Кузница
  const smA = gates[0] + Math.PI * 1.45;
  const smx = cx + Math.cos(smA) * 22, smz = cz + Math.sin(smA) * 22;
  const smyaw = Math.atan2(-Math.cos(smA), -Math.sin(smA));
  forge(B, M, smx, cy, smz, smyaw, animated);
  collision.addBox(smx, smz, 3.2, 2.4, smyaw);
  spots.push({ role: 'smith', x: smx + Math.sin(smyaw) * 3.3, z: smz + Math.cos(smyaw) * 3.3, yaw: smyaw });

  // Квестодатели вокруг площади
  const qa = [gates[0] + 0.5, gates[0] - 0.55, gates[0] + Math.PI - 0.5];
  qa.forEach((a, i) => spots.push({ role: 'quest', idx: i, x: cx + Math.cos(a) * 7, z: cz + Math.sin(a) * 7, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI }));

  // Жилые дома
  const occupied = [{ x: lmx, z: lmz, r: landR + 3 }, { x: smx, z: smz, r: 6 }, { x: tpx, z: tpz, r: 4 }];
  for (let i = 0; i < 4; i++) { const a = marketA + (i - 1.5) * 0.28; occupied.push({ x: cx + Math.cos(a) * 17, z: cz + Math.sin(a) * 17, r: 3.5 }); }
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < (city.style === 'marble' ? 22 : 26); tries++) {
    const a = rnd() * Math.PI * 2;
    if (isGateAngle(a, 0.12)) continue;
    const rr = 22 + rnd() * (R - 30);
    const w = 5 + rnd() * 4, d = 4.5 + rnd() * 3;
    const hx = cx + Math.cos(a) * rr, hz = cz + Math.sin(a) * rr;
    const rad = Math.hypot(w, d) / 2 + 1.6;
    if (occupied.some(o => Math.hypot(o.x - hx, o.z - hz) < o.r + rad)) continue;
    // улицы к воротам
    if (gates.some(g => { const da = Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))); return da * rr < 5 + rad; })) continue;
    if (rr + rad > R - 2) continue;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    const floors = rnd() < 0.55 ? 2 : (rnd() < 0.5 ? 1 : 3);
    buildHouse(B, M, hx, cy, hz, yaw, w, d, floors, city.style, rnd, city.banner, { animated });
    collision.addBox(hx, hz, w / 2 + 0.3, d / 2 + 0.3, yaw);
    occupied.push({ x: hx, z: hz, r: rad });
    placed++;
    // бочки и ящики у домов — их можно толкать
    const side = (lx, lz) => [hx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, hz - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
    if (rnd() < 0.55) {
      const [bx, bz] = side(w / 2 - 0.6, d / 2 + 1.0);
      props.push({ kind: 'barrel', x: bx, z: bz });
      if (rnd() < 0.6) { const [qx, qz] = side(w / 2 - 1.6, d / 2 + 0.9); props.push({ kind: 'crate', x: qx, z: qz }); }
    }
    // поленница или мешки у боковой стены
    const r2 = rnd();
    if (r2 < 0.3) { const [wx, wz] = side(-w / 2 - 0.6, 0); woodpile(B, M, wx, cy, wz, yaw + Math.PI / 2); collision.addCircle(wx, wz, 0.7); }
    else if (r2 < 0.5) { const [wx, wz] = side(-w / 2 + 0.8, d / 2 + 0.8); sacks(B, wx, cy, wz, rnd); }
    if (rnd() < 0.3) spots.push({ role: 'citizen', x: hx + Math.sin(yaw) * (d / 2 + 2.5), z: hz + Math.cos(yaw) * (d / 2 + 2.5), yaw });
  }
  // Фонари вдоль улиц
  for (const g of gates) {
    for (let k = 1; k <= 3; k++) {
      const pair = [];
      for (const s of [-1, 1]) {
        const rr = 12 + k * (R - 16) / 4;
        const lx = cx + Math.cos(g) * rr - Math.sin(g) * 4 * s, lz = cz + Math.sin(g) * rr + Math.cos(g) * 4 * s;
        if (occupied.some(o => Math.hypot(o.x - lx, o.z - lz) < o.r)) continue;
        lantern(B, M, lx, cy, lz, animated);
        collision.addCircle(lx, lz, 0.3);
        pair.push(new THREE.Vector3(lx, cy + 3.55, lz));
      }
      if (pair.length === 2) pennants(B, pair[0], pair[1], flagCols, rnd);
    }
  }
  // Деревья во дворах
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, rr = 16 + rnd() * (R - 20);
    const tx = cx + Math.cos(a) * rr, tz = cz + Math.sin(a) * rr;
    if (occupied.some(o => Math.hypot(o.x - tx, o.z - tz) < o.r + 1.5)) continue;
    if (isGateAngle(a, 0.15)) continue;
    treeSpots.push({ x: tx, z: tz, y: cy });
    // приствольный круг
    B.add(new THREE.TorusGeometry(0.9, 0.14, 5, 14).rotateX(Math.PI / 2), M.stone, M4(tx, cy + 0.1, tz), { noShadow: true });
    collision.addCircle(tx, tz, 0.4);
    occupied.push({ x: tx, z: tz, r: 2 });
  }
  // Колодец, телеги, сено, доска объявлений и прочее
  const freeSpot = (rmin, rmax, rad) => {
    for (let t = 0; t < 60; t++) {
      const a = rnd() * Math.PI * 2, rr = rmin + rnd() * (rmax - rmin);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (isGateAngle(a, 0.14)) continue;
      if (gates.some(g => { const da = Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))); return da * rr < 4.5 + rad; })) continue;
      if (occupied.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rad)) continue;
      occupied.push({ x, z, r: rad });
      return { x, z, a };
    }
    return null;
  };
  let sp = freeSpot(15, 22, 2.2);
  if (sp) { well(B, M, sp.x, cy, sp.z, rnd() * 3); collision.addCircle(sp.x, sp.z, 1.3); props.push({ kind: 'bucket', x: sp.x + 1.7, z: sp.z + 0.4 }); }
  for (let i = 0; i < 2; i++) {
    sp = freeSpot(16, R - 12, 2.6);
    if (sp) { const yw = rnd() * 6.28; cart(B, M, sp.x, cy, sp.z, yw, i === 0 ? 'hay' : 'crates'); collision.addBox(sp.x, sp.z, 1.7, 1.0, yw); }
  }
  for (let i = 0; i < 3; i++) {
    sp = freeSpot(18, R - 10, 1.6);
    if (sp) { hayBales(B, sp.x, cy, sp.z, rnd); collision.addCircle(sp.x, sp.z, 1.1); }
  }
  {
    const na = gates[0] + 0.32, nx = cx + Math.cos(na) * 14.5, nz = cz + Math.sin(na) * 14.5;
    noticeBoard(B, M, nx, cy, nz, Math.atan2(-Math.cos(na), -Math.sin(na)));
    collision.addCircle(nx, nz, 0.8);
  }
  // товары у рынка: ящики, тыквы, бочки (можно толкать)
  for (let i = 0; i < 4; i++) {
    const a = marketA + (i - 1.5) * 0.28;
    const sx = cx + Math.cos(a) * 19.4, sz = cz + Math.sin(a) * 19.4;
    props.push({ kind: i % 2 ? 'crate' : 'barrel', x: sx + rnd() - 0.5, z: sz + rnd() - 0.5 });
    props.push({ kind: 'pumpkin', x: cx + Math.cos(a + 0.09) * 15.2, z: cz + Math.sin(a + 0.09) * 15.2 });
    if (i % 2 === 0) props.push({ kind: 'pumpkin', x: cx + Math.cos(a - 0.07) * 15.0, z: cz + Math.sin(a - 0.07) * 15.0 });
  }
  // особенности стиля
  for (let i = 0; i < 4; i++) {
    const a = gates[0] + Math.PI / 4 + i * Math.PI / 2;
    if (isGateAngle(a, 0.25)) continue;
    const x = cx + Math.cos(a) * 14.6, z = cz + Math.sin(a) * 14.6;
    if (occupied.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 1)) continue;
    if (city.style === 'marble') {
      // колонны с золотыми сферами
      B.add(boxUV(1.3, 0.5, 1.3, 1), M.wall2, M4(x, cy + 0.25, z));
      B.add(cylUV(0.36, 0.42, 5.2, 14, 2), M.wall, M4(x, cy + 3.1, z));
      B.add(boxUV(1.0, 0.3, 1.0, 1), M.wall2, M4(x, cy + 5.85, z));
      B.add(new THREE.SphereGeometry(0.42, 14, 10), goldMat, M4(x, cy + 6.4, z));
      collision.addCircle(x, z, 0.8);
    } else if (city.style === 'stone') {
      // жаровни на каменных тумбах
      B.add(boxUV(1.1, 1.3, 1.1, 1), M.stone, M4(x, cy + 0.65, z));
      B.add(new THREE.CylinderGeometry(0.6, 0.35, 0.6, 10), ironMat, M4(x, cy + 1.6, z));
      B.add(new THREE.SphereGeometry(0.42, 8, 6), flameMat, M4(x, cy + 1.95, z), { noShadow: true });
      animated.push({ type: 'fire', x, y: cy + 2.05, z });
      collision.addCircle(x, z, 0.8);
    } else {
      // майское дерево с лентами
      B.add(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 8), M.darkWood, M4(x, cy + 3.25, z));
      B.add(new THREE.TorusGeometry(0.55, 0.09, 5, 14).rotateX(Math.PI / 2), flatMat('#3f6e2c', 0.9), M4(x, cy + 5.9, z));
      for (let k = 0; k < 6; k++) {
        const ka = k / 6 * Math.PI * 2;
        const rb = new THREE.PlaneGeometry(0.14, 3.6, 1, 6).translate(0, -1.8, 0);
        B.add(rb, clothMatC(['#c8303a', '#f0d040', '#3a7ac8'][k % 3], 0, 'hang'), M4(x + Math.cos(ka) * 0.4, cy + 5.9, z + Math.sin(ka) * 0.4, -ka, 1, 1, 1, 0, 0.28), { noShadow: true });
      }
      collision.addCircle(x, z, 0.3);
    }
  }
  B.build(group);
  return { group, spots, animated, cy, props, treeSpots };
}

function lantern(B, M, x, y, z, animated) {
  B.add(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 8), ironMat, M4(x, y + 1.8, z));
  B.add(new THREE.BoxGeometry(0.9, 0.06, 0.06), ironMat, M4(x + 0.4, y + 3.5, z));
  B.add(new THREE.BoxGeometry(0.34, 0.45, 0.34), windowMat, M4(x + 0.75, y + 3.15, z), { noShadow: true });
  B.add(new THREE.ConeGeometry(0.3, 0.25, 4), ironMat, M4(x + 0.75, y + 3.5, z, Math.PI / 4));
  animated.push({ type: 'lamp', x: x + 0.75, y: y + 3.15, z });
}

function barrel(B, M, x, y, z) {
  B.add(cylUV(0.42, 0.42, 1.0, 12, 1), M.wood, M4(x, y + 0.5, z));
  B.add(new THREE.TorusGeometry(0.44, 0.03, 4, 14), ironMat, M4(x, y + 0.25, z, 0, 1, 1, 1, Math.PI / 2));
  B.add(new THREE.TorusGeometry(0.44, 0.03, 4, 14), ironMat, M4(x, y + 0.75, z, 0, 1, 1, 1, Math.PI / 2));
  B.add(boxUV(0.7, 0.7, 0.7, 1), M.wood, M4(x + 0.8, y + 0.35, z + 0.2, 0.3));
}

function stall(B, M, x, y, z, yaw, color, rnd) {
  const T = M4(x, y, z, yaw);
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(T, mm), o);
  for (const [px, pz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) put(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), M.darkWood, M4(px, 1.4, pz));
  put(boxUV(3.2, 1.0, 1.2, 1), M.wood, M4(0, 0.5, 0.3));
  const aw = new THREE.PlaneGeometry(3.6, 2.4, 1, 1);
  put(aw, clothMatC(color, 1), M4(0, 2.75, 0, 0, 1, 1, 1, -Math.PI / 2 + 0.25), { noShadow: false });
  // товары
  const goods = [['#c03020', 0.14], ['#e0a020', 0.13], ['#40a030', 0.12], ['#8a5a30', 0.18]];
  for (let i = 0; i < 9; i++) {
    const [c, r] = goods[Math.floor(rnd() * goods.length)];
    const gm = texMat('good' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    put(new THREE.SphereGeometry(r, 8, 6), gm, M4(-1.2 + (i % 5) * 0.55, 1.1, 0.1 + Math.floor(i / 5) * 0.4));
  }
}

function forge(B, M, x, y, z, yaw, animated) {
  const T = M4(x, y, z, yaw);
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(T, mm), o);
  for (const [px, pz] of [[-3, -2.2], [3, -2.2], [-3, 2.2], [3, 2.2]]) put(boxUV(0.3, 3.6, 0.3, 1), M.darkWood, M4(px, 1.8, pz));
  put(gableRoof(6.6, 4.8, 1.6, 0.4), M.roof2, M4(0, 3.6, 0));
  put(boxUV(2.4, 1.4, 2.0, 1.5), M.stone, M4(-1.6, 0.7, -1.0));
  put(boxUV(1.4, 0.5, 1.2, 1), flameMat, M4(-1.6, 1.45, -1.0), { noShadow: true });
  put(boxUV(0.8, 3.0, 0.8, 1.5), M.stone, M4(-1.6, 2.8, -1.6));
  animated.push({ type: 'forge', x: x, y: y + 1.6, z: z, yaw });
  // наковальня
  put(boxUV(0.4, 0.6, 0.3, 1), ironMat, M4(1.2, 0.3, 0.5));
  put(boxUV(0.9, 0.25, 0.4, 1), ironMat, M4(1.2, 0.7, 0.5));
  put(new THREE.ConeGeometry(0.12, 0.4, 6), ironMat, M4(1.75, 0.7, 0.5, 0, 1, 1, 1, 0, -Math.PI / 2));
  // стойка с оружием
  put(boxUV(2.0, 0.12, 0.2, 1), M.wood, M4(2.0, 1.5, -1.9));
  for (let i = 0; i < 4; i++) {
    put(new THREE.BoxGeometry(0.08, 1.2, 0.02), texMat('steel', () => new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.9, roughness: 0.25 })), M4(1.4 + i * 0.4, 1.0, -1.85, 0, 1, 1, 1, 0.1));
  }
}

function buildTeleportStone(B, M, x, y, z, animated, color) {
  B.add(cylUV(2.0, 2.3, 0.5, 8, 1), M.stone, M4(x, y + 0.25, z));
  B.add(cylUV(1.6, 1.8, 0.3, 8, 1), M.stone, M4(x, y + 0.6, z));
  const ob = new THREE.ConeGeometry(0.75, 4.5, 4);
  B.add(ob, texMat('obel', () => new THREE.MeshStandardMaterial({ color: '#2a2a38', roughness: 0.35, metalness: 0.4 })), M4(x, y + 3.0, z, Math.PI / 4));
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    B.add(new THREE.BoxGeometry(0.08, 1.8, 0.04), texMat('runeglow', () => new THREE.MeshStandardMaterial({ color: '#80e0ff', emissive: '#40c0ff', emissiveIntensity: 2.5 })), M4(x + Math.cos(a) * 0.36, y + 2.4, z + Math.sin(a) * 0.36, -a + Math.PI / 2, 1, 1, 1, 0.16));
  }
  animated.push({ type: 'teleport', x, y: y + 2.5, z, color });
  return { x, z };
}

function buildLandmark(B, M, city, x, y, z, yaw, collision, animated, group) {
  const T = M4(x, y, z, yaw);
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(T, mm), o);
  if (city.style === 'timber') {
    // Ратуша с часовой башней
    buildHouse(B, M, x, y, z, yaw, 13, 8, 2, 'timber', () => 0.3, city.banner, { roofMat: M.roof });
    put(boxUV(4, 15, 4, 3), M.wallStone, M4(0, 7.5, -1));
    put(new THREE.ConeGeometry(3.4, 6, 4), M.roof, M4(0, 18, -1, Math.PI / 4));
    put(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 24), texMat('clock', () => new THREE.MeshStandardMaterial({ color: '#f0e8d0', roughness: 0.6 })), M4(0, 12.5, 1.05, 0, 1, 1, 1, Math.PI / 2));
    put(new THREE.BoxGeometry(0.08, 0.9, 0.05), ironMat, M4(0, 12.8, 1.2));
    put(new THREE.BoxGeometry(0.6, 0.08, 0.05), ironMat, M4(0.25, 12.5, 1.2));
    collision.addBox(x, z, 7, 4.6, yaw);
  } else if (city.style === 'stone') {
    // Чертог клана
    put(boxUV(18, 10, 13, 3), M.wall, M4(0, 5, 0));
    put(gableRoof(18.4, 13, 4.5, 0.6, 0.3), M.roof, M4(0, 10, 0));
    for (const s of [-1, 1]) put(gableWall(13, 4.5, 3), M.wall, M4(s * 9.2, 10, 0, s * Math.PI / 2));
    put(boxUV(5, 6, 0.6, 2), M.trim, M4(0, 3, 6.6));
    put(boxUV(4, 5.4, 0.3, 1), M.darkWood, M4(0, 2.7, 6.85));
    put(new THREE.BoxGeometry(0.4, 0.4, 0.3), goldMat, M4(0, 6.2, 6.9));
    // гномьи статуи-стражи у входа
    for (const s of [-1, 1]) {
      put(boxUV(2, 1.5, 2, 1), M.stone, M4(s * 4.2, 0.75, 7.8));
      put(cylUV(0.9, 0.7, 2.2, 10, 2), M.stone, M4(s * 4.2, 2.6, 7.8));
      put(new THREE.SphereGeometry(0.6, 10, 8), M.stone, M4(s * 4.2, 4.1, 7.8));
      put(new THREE.ConeGeometry(0.55, 1.5, 8), M.stone, M4(s * 4.2, 3.4, 8.3, 0, 1, 1, 0.6, Math.PI));
      put(boxUV(0.4, 2.8, 0.4, 1), M.stone, M4(s * 4.2 + s * 1.0, 3.0, 7.8));
      put(boxUV(1.4, 0.7, 0.7, 1), M.stone, M4(s * 4.2 + s * 1.0, 4.6, 7.8));
    }
    // большие жаровни
    for (const s of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.8, 0.4, 1.2, 10), ironMat, M4(s * 7.5, 1.6, 8.5));
      put(new THREE.SphereGeometry(0.6, 8, 6), flameMat, M4(s * 7.5, 2.3, 8.5), { noShadow: true });
      const wp = new THREE.Vector3(s * 7.5, 2.4, 8.5).applyMatrix4(T);
      animated.push({ type: 'fire', x: wp.x, y: wp.y, z: wp.z });
    }
    collision.addBox(x, z, 9.3, 6.8, yaw);
  } else {
    // Собор Зари
    put(boxUV(14, 13, 24, 3), M.wall, M4(0, 6.5, 0));
    put(gableRoof(24.4, 14, 6, 0.6, 0.3), M.roof, M4(0, 13, 0, Math.PI / 2));
    for (const s of [-1, 1]) put(gableWall(14, 6, 3), M.wall, M4(0, 13, s * 12.2, s > 0 ? 0 : Math.PI));
    // фасадные башни
    for (const s of [-1, 1]) {
      put(boxUV(4.5, 24, 4.5, 3), M.wall2, M4(s * 6.5, 12, 12));
      put(new THREE.ConeGeometry(3.4, 10, 8), M.roof, M4(s * 6.5, 29, 12, Math.PI / 8));
      put(new THREE.SphereGeometry(0.4, 8, 6), goldMat, M4(s * 6.5, 34.2, 12));
    }
    // купол
    put(new THREE.CylinderGeometry(5, 5.2, 3, 24), M.wall, M4(0, 14.5, -4));
    put(new THREE.SphereGeometry(5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), goldMat, M4(0, 16, -4));
    put(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), goldMat, M4(0, 22.5, -4));
    put(new THREE.BoxGeometry(1.6, 0.18, 0.18), goldMat, M4(0, 23.4, -4));
    // окно-роза
    put(new THREE.CircleGeometry(2.2, 24), texMat('rose', () => new THREE.MeshStandardMaterial({ color: '#4060c0', emissive: '#6080ff', emissiveIntensity: 0.9, roughness: 0.2 })), M4(0, 10, 12.06), { noShadow: true });
    put(new THREE.TorusGeometry(2.25, 0.18, 8, 28), goldMat, M4(0, 10, 12.1));
    put(boxUV(4, 6.5, 0.4, 1), M.darkWood, M4(0, 3.25, 12.1));
    put(new THREE.TorusGeometry(2.0, 0.25, 6, 20, Math.PI), M.trim, M4(0, 6.5, 12.15));
    // колонны
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) put(cylUV(0.4, 0.45, 10, 12, 2), M.wall2, M4(s * 7.5, 5, 8 - i * 5));
    collision.addBox(x + Math.sin(yaw) * 2, z + Math.cos(yaw) * 2, 8.5, 14.5, yaw);
    // светящийся символ над входом
    animated.push({ type: 'holy', x: x + Math.sin(yaw) * 12.5, y: y + 10, z: z + Math.cos(yaw) * 12.5 });
  }
  void group;
}


// ---------------- Реквизит улиц ----------------
function planter(B, M, x, y, z, yaw, rnd, style) {
  B.add(boxUV(1.7, 0.6, 1.7, 1), style === 'marble' ? M.wall2 : M.stone, M4(x, y + 0.3, z, yaw));
  B.add(boxUV(1.5, 0.1, 1.5, 1), flatMat('#3a2a1c', 1), M4(x, y + 0.6, z, yaw), { noShadow: true });
  B.add(new THREE.IcosahedronGeometry(0.62, 1), flatMat('#35652a', 0.9), M4(x, y + 1.05, z, rnd() * 3, 1, 0.8, 1));
  const cols = ['#e0485a', '#f0d040', '#e8e8f0', '#c060d0', '#f08a30'];
  const fc = cols[Math.floor(rnd() * cols.length)], fc2 = cols[Math.floor(rnd() * cols.length)];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + rnd(), r = 0.35 + rnd() * 0.35;
    B.add(new THREE.SphereGeometry(0.075, 6, 4), flatMat(i % 2 ? fc : fc2, 0.7), M4(x + Math.cos(a) * r, y + 0.95 + rnd() * 0.5 * (1 - r), z + Math.sin(a) * r), { noShadow: true });
  }
}

// гирлянда треугольных флажков между двумя точками
function pennants(B, a, b, cols, rnd) {
  const n = Math.max(6, Math.round(a.distanceTo(b) / 0.62));
  const dir = b.clone().sub(a);
  const yaw = Math.atan2(-dir.z, dir.x);
  const sag = Math.min(1.1, a.distanceTo(b) * 0.09);
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
  B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 0.012, 4), ironMat, new THREE.Matrix4(), { noShadow: true });
  for (let i = 0; i < n; i++) {
    const p = pts[i].clone().lerp(pts[i + 1], 0.5);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.48, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
    g.computeVertexNormals();
    B.add(g, clothMatC(cols[i % cols.length], 0, 'hang'), M4(p.x, p.y - 0.01, p.z, yaw), { noShadow: true });
  }
  void rnd;
}

function well(B, M, x, y, z, yaw) {
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(M4(x, y, z, yaw), mm), o);
  const ringG = new THREE.LatheGeometry([[0.75, 0], [0.8, 0.95], [1.05, 1.0], [1.08, 0.9], [1.1, 0]].map(([r, h]) => new THREE.Vector2(r, h)), 16);
  const uv = ringG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 1.5);
  const st = M.stone.clone(); st.side = THREE.DoubleSide;
  put(ringG, texMat('wellstone' + M.stone.uuid, () => st), M4(0, 0, 0));
  put(new THREE.CircleGeometry(0.78, 16).rotateX(-Math.PI / 2), texMat('wellwater', () => new THREE.MeshStandardMaterial({ color: '#0c2a36', roughness: 0.08, metalness: 0.4 })), M4(0, 0.55, 0), { noShadow: true });
  for (const sx of [-1, 1]) put(boxUV(0.16, 2.6, 0.16, 1), M.darkWood, M4(sx * 0.95, 1.3, 0));
  put(new THREE.CylinderGeometry(0.1, 0.1, 2.1, 8).rotateZ(Math.PI / 2), M.wood, M4(0, 2.0, 0));
  put(new THREE.TorusGeometry(0.22, 0.03, 5, 10).rotateY(Math.PI / 2), ironMat, M4(1.15, 2.0, 0));
  put(gableRoof(2.6, 1.9, 0.75, 0.25, 0.1), M.roof2, M4(0, 2.6, 0));
  put(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), ironMat, M4(0, 1.5, 0));
  put(new THREE.CylinderGeometry(0.2, 0.16, 0.32, 10), M.wood, M4(0, 1.0, 0));
}

function wheel(put, M, x, y, z, r) {
  put(new THREE.TorusGeometry(r, 0.06, 6, 18).rotateY(Math.PI / 2), M.darkWood, M4(x, y, z));
  for (let k = 0; k < 4; k++) put(boxUV(0.06, r * 2, 0.06, 1), M.wood, M4(x, y, z, 0, 1, 1, 1, k * Math.PI / 4));
  put(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8).rotateZ(Math.PI / 2), ironMat, M4(x, y, z));
}
function cart(B, M, x, y, z, yaw, load) {
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(M4(x, y, z, yaw), mm), o);
  put(boxUV(3.0, 0.12, 1.5, 1), M.wood, M4(0, 0.85, 0));
  for (const sz of [-1, 1]) put(boxUV(3.0, 0.5, 0.08, 1), M.wood, M4(0, 1.15, sz * 0.74));
  for (const sx of [-1, 1]) put(boxUV(0.08, 0.5, 1.5, 1), M.wood, M4(sx * 1.48, 1.15, 0));
  for (const sz of [-1, 1]) { wheel(put, M, 0.75, 0.6, sz * 0.9, 0.6); wheel(put, M, -0.85, 0.6, sz * 0.9, 0.6); }
  for (const sz of [-1, 1]) put(boxUV(1.9, 0.08, 0.08, 1), M.darkWood, M4(2.4, 0.72, sz * 0.45, 0, 1, 1, 1, 0, -0.16));
  if (load === 'hay') {
    const hay = flatMat('#c8a84a', 1);
    put(new THREE.SphereGeometry(1, 12, 8), hay, M4(0, 1.45, 0, 0, 1.35, 0.6, 0.72));
    put(new THREE.SphereGeometry(0.6, 10, 7), hay, M4(0.5, 1.8, 0.1, 0, 1.2, 0.6, 0.9));
  } else {
    put(boxUV(0.8, 0.8, 0.8, 1), M.wood, M4(-0.8, 1.32, 0.1, 0.2));
    put(boxUV(0.7, 0.7, 0.7, 1), M.darkWood, M4(0.2, 1.27, -0.2, -0.3));
    put(cylUV(0.36, 0.36, 0.9, 10, 1), M.wood, M4(0.95, 1.37, 0.2));
    put(new THREE.SphereGeometry(0.34, 8, 6), flatMat('#b8a078', 1), M4(0.1, 1.2, 0.42, 0, 1, 0.7, 1));
  }
}
function hayBales(B, x, y, z, rnd) {
  const hay = flatMat('#c8a84a', 1), band = flatMat('#7a5a2a', 1);
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const yw = rnd() * 3, px = x + (i - 1) * 0.95, top = i === 2;
    const g = new THREE.CylinderGeometry(0.62, 0.62, 1.1, 14).rotateZ(Math.PI / 2);
    B.add(g, hay, M4(top ? x - 0.45 : px, y + (top ? 1.62 : 0.6), z + (top ? 0 : rnd() * 0.3), yw));
    B.add(new THREE.TorusGeometry(0.63, 0.03, 4, 14).rotateY(Math.PI / 2), band, M4(top ? x - 0.45 : px, y + (top ? 1.62 : 0.6), z, yw), { noShadow: true });
  }
}
function woodpile(B, M, x, y, z, yaw) {
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(M4(x, y, z, yaw), mm), o);
  const endM = flatMat('#c8a070', 0.9);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5 - r; i++) {
    const px = (i - (4 - r) / 2) * 0.3;
    put(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 7).rotateX(Math.PI / 2), M.darkWood, M4(px, 0.14 + r * 0.25, 0));
    put(new THREE.CircleGeometry(0.13, 7), endM, M4(px, 0.14 + r * 0.25, 0.455), { noShadow: true });
  }
}
function sacks(B, x, y, z, rnd) {
  const m = flatMat('#b8a078', 1);
  for (let i = 0; i < 3; i++) B.add(new THREE.SphereGeometry(0.36, 9, 7), m, M4(x + (i - 1) * 0.5, y + 0.3 + (i === 1 ? 0.0 : 0), z + rnd() * 0.3, rnd() * 3, 1, 0.8, 0.75));
  B.add(new THREE.SphereGeometry(0.34, 9, 7), m, M4(x + 0.1, y + 0.78, z + 0.1, 1, 1, 0.75, 0.8));
}
function noticeBoard(B, M, x, y, z, yaw) {
  const put = (g, m, mm, o) => B.add(g, m, new THREE.Matrix4().multiplyMatrices(M4(x, y, z, yaw), mm), o);
  for (const sx of [-1, 1]) put(boxUV(0.14, 2.6, 0.14, 1), M.darkWood, M4(sx * 0.95, 1.3, 0));
  put(boxUV(2.0, 1.3, 0.1, 1), M.wood, M4(0, 1.75, 0));
  put(gableRoof(2.4, 0.5, 0.3, 0.15, 0.08), M.roof2, M4(0, 2.6, 0));
  const paper = flatMat('#e8dcc0', 0.9);
  for (const [px, py, w, h, r] of [[-0.6, 1.9, 0.5, 0.6, 0.06], [0.05, 1.8, 0.45, 0.7, -0.04], [0.62, 1.95, 0.4, 0.5, 0.1], [-0.3, 1.4, 0.4, 0.3, -0.08]]) {
    put(new THREE.PlaneGeometry(w, h), paper, M4(px, py, 0.06, 0, 1, 1, 1, 0, r), { noShadow: true });
  }
}
