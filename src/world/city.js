// Построение городов: стены, башни, ворота, дома, рынок, кузница, достопримечательности.
import * as THREE from 'three';
import { Batcher, boxUV, cylUV, gableRoof, gableWall, M4 } from './builders.js';
import { stoneWall, cobblestone, timberPlaster, roofTiles, woodPlanks, marble, cloth } from '../core/textures.js';
import { mulberry32 } from '../core/util.js';

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

function clothMatC(color, pattern = 1) {
  return texMat('cloth_' + color + pattern, () => new THREE.MeshStandardMaterial({ color, map: cloth('#ffffff', pattern), roughness: 0.9, side: THREE.DoubleSide }));
}

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
  const gateHalf = 0.13;
  const isGateAngle = (a, extra = 0) => city.gates.some(g => { let d = Math.abs(((a - g) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); return d < gateHalf + extra; });

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
  const N = 30;
  const wallH = city.style === 'stone' ? 9 : city.style === 'marble' ? 10 : 7;
  const wallMat = M.wallStone;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const [x0, z0] = W(Math.cos(a0) * R, Math.sin(a0) * R);
    const [x1, z1] = W(Math.cos(a1) * R, Math.sin(a1) * R);
    const gate = isGateAngle(am);
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
      collision.addBox(mx, mz, L / 2 + 0.3, 1.1, yaw);
      // знамёна
      if (i % 3 === 1) {
        const bx = (x0 + x1) / 2 - Math.cos(am) * 1.0, bz = (z0 + z1) / 2 - Math.sin(am) * 1.0;
        void bx; void bz;
        const ox = Math.cos(am) * 1.0, oz = Math.sin(am) * 1.0;
        B.add(new THREE.PlaneGeometry(1.6, 3.6), clothMatC(city.banner, 2), M4(mx + ox, cy + wallH - 2.6, mz + oz, yaw + Math.PI), { noShadow: true });
      }
    }
    // башня в каждой 3-й вершине и у ворот
    const nextGate = isGateAngle(a1 + 0.1) || isGateAngle(a1 - 0.1);
    if (i % 3 === 0 || nextGate) {
      const [tx, tz] = W(Math.cos(a1) * R, Math.sin(a1) * R);
      const tr = nextGate ? 3.3 : 2.7, th = wallH + (nextGate ? 5 : 3.5);
      B.add(cylUV(tr, tr + 0.3, th, 18, 3), wallMat, M4(tx, cy + th / 2 - 0.5, tz));
      for (let k = 0; k < 12; k++) {
        const ka = k / 12 * Math.PI * 2;
        B.add(boxUV(0.9, 1.1, 0.6, 1), wallMat, M4(tx + Math.cos(ka) * (tr - 0.1), cy + th + 0.0, tz + Math.sin(ka) * (tr - 0.1), -ka + Math.PI / 2));
      }
      if (city.style !== 'stone') {
        const cone = new THREE.ConeGeometry(tr + 0.7, city.style === 'marble' ? 6 : 4.5, 18, 1, false);
        const cu = cone.attributes.uv; for (let q = 0; q < cu.count; q++) cu.setXY(q, cu.getX(q) * 8, cu.getY(q) * 3);
        B.add(cone, M.roof, M4(tx, cy + th + 0.6 + (city.style === 'marble' ? 3 : 2.25), tz));
        B.add(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5), ironMat, M4(tx, cy + th + (city.style === 'marble' ? 7 : 5.5), tz));
        B.add(new THREE.PlaneGeometry(1.2, 0.7), clothMatC(city.banner, 0), M4(tx + 0.6, cy + th + (city.style === 'marble' ? 7.8 : 6.3), tz), { noShadow: true });
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
  // Ворота: арка
  for (const g of city.gates) {
    const [gx, gz] = W(Math.cos(g) * R, Math.sin(g) * R);
    const yaw = Math.atan2(-Math.cos(g), -Math.sin(g)) + Math.PI / 2;
    void yaw;
    const tyaw = Math.atan2(Math.cos(g + Math.PI / 2) * 0 - Math.sin(g) * 0, 1);
    void tyaw;
    const ayaw = -g + Math.PI / 2; // поперёк дороги
    void ayaw;
    B.add(boxUV(10, 2.4, 2.2, 2), wallMat, M4(gx, cy + wallH + 0.2, gz, Math.atan2(-Math.cos(g), -Math.sin(g))));
    // решётка-портcullis (поднята)
    for (let k = -3; k <= 3; k++) B.add(new THREE.BoxGeometry(0.12, 2.0, 0.12), ironMat, M4(gx + Math.sin(g) * k * 0.7 * -1 + 0, cy + wallH - 1.6, gz + Math.cos(g) * k * 0.7, 0));
    B.add(new THREE.BoxGeometry(0.15, 0.15, 5), ironMat, M4(gx, cy + wallH - 0.8, gz, -g));
    // факелы у ворот
    for (const s of [-1, 1]) {
      const fx = gx - Math.cos(g) * 1.6 + Math.sin(g) * s * 3.4 * -1, fz = gz - Math.sin(g) * 1.6 + Math.cos(g) * s * 3.4;
      B.add(new THREE.CylinderGeometry(0.06, 0.04, 0.8, 6), M.darkWood, M4(fx, cy + 3.3, fz));
      B.add(new THREE.SphereGeometry(0.16, 8, 6), flameMat, M4(fx, cy + 3.8, fz), { noShadow: true });
      animated.push({ type: 'fire', x: fx, y: cy + 3.9, z: fz, small: true });
    }
    // стражники у ворот (снаружи-внутри)
    for (const s of [-1, 1]) {
      const px = gx - Math.cos(g) * 3 + Math.sin(g) * s * 4.5 * -1, pz = gz - Math.sin(g) * 3 + Math.cos(g) * s * 4.5;
      spots.push({ role: 'guard', x: px, z: pz, yaw: Math.atan2(Math.cos(g), Math.sin(g)) });
    }
  }

  // Центральная площадь: фонтан
  const fy = cy;
  B.add(cylUV(4.2, 4.4, 0.9, 32, 2), M.stone, M4(cx, fy + 0.45, cz));
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.85, 32).rotateX(-Math.PI / 2), waterMat);
  water.position.set(cx, fy + 0.8, cz);
  group.add(water);
  B.add(cylUV(0.45, 0.6, 2.6, 12, 1), M.wall, M4(cx, fy + 1.6, cz));
  B.add(new THREE.CylinderGeometry(1.5, 0.5, 0.5, 20), M.stone, M4(cx, fy + 2.9, cz));
  B.add(cylUV(0.25, 0.3, 1.2, 10, 1), M.wall, M4(cx, fy + 3.6, cz));
  animated.push({ type: 'fountain', x: cx, y: fy + 4.3, z: cz });
  collision.addCircle(cx, cz, 4.4);
  // скамейки и фонари вокруг площади
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2;
    if (isGateAngle(a, 0.2)) continue;
    const lx = cx + Math.cos(a) * 10, lz = cz + Math.sin(a) * 10;
    lantern(B, M, lx, cy, lz, animated);
    collision.addCircle(lx, lz, 0.3);
    const bx = cx + Math.cos(a + 0.35) * 9, bz = cz + Math.sin(a + 0.35) * 9;
    const yaw = Math.atan2(-Math.cos(a + 0.35), -Math.sin(a + 0.35));
    B.add(boxUV(2.2, 0.12, 0.6, 1), M.wood, M4(bx, cy + 0.55, bz, yaw));
    B.add(boxUV(2.2, 0.5, 0.1, 1), M.wood, M4(bx - Math.sin(yaw) * 0.28, cy + 0.85, bz - Math.cos(yaw) * 0.28, yaw));
    for (const s of [-0.9, 0.9]) B.add(boxUV(0.12, 0.5, 0.5, 1), M.stone, M4(bx + Math.cos(yaw) * s, cy + 0.27, bz - Math.sin(yaw) * s, yaw));
  }
  // Камень телепортации
  const tpA = city.gates[0] + Math.PI * 0.25;
  const tpx = cx + Math.cos(tpA) * 15, tpz = cz + Math.sin(tpA) * 15;
  const tp = buildTeleportStone(B, M, tpx, cy, tpz, animated, city.banner);
  collision.addCircle(tpx, tpz, 1.4);
  spots.push({ role: 'teleport', x: tpx, z: tpz, yaw: 0, obj: tp });

  // Особые здания: площадь-знамение напротив главных ворот
  const landA = city.gates[0] + Math.PI;
  const lmx = cx + Math.cos(landA) * (R * 0.55), lmz = cz + Math.sin(landA) * (R * 0.55);
  const lyaw = Math.atan2(-Math.cos(landA), -Math.sin(landA));
  buildLandmark(B, M, city, lmx, cy, lmz, lyaw, collision, animated, group);
  const landR = city.style === 'marble' ? 15 : 12;

  // Рынок: прилавки по кругу у площади
  const stallCols = ['#b03030', '#2a6ab0', '#c8a030', '#3a8a40', '#8a3aa0'];
  const marketA = city.gates[0] + Math.PI * 0.55;
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
  const smA = city.gates[0] + Math.PI * 1.45;
  const smx = cx + Math.cos(smA) * 22, smz = cz + Math.sin(smA) * 22;
  const smyaw = Math.atan2(-Math.cos(smA), -Math.sin(smA));
  forge(B, M, smx, cy, smz, smyaw, animated);
  collision.addBox(smx, smz, 3.2, 2.4, smyaw);
  spots.push({ role: 'smith', x: smx + Math.sin(smyaw) * 3.3, z: smz + Math.cos(smyaw) * 3.3, yaw: smyaw });

  // Квестодатели вокруг площади
  const qa = [city.gates[0] + 0.5, city.gates[0] - 0.55, city.gates[0] + Math.PI - 0.5];
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
    if (city.gates.some(g => { const da = Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))); return da * rr < 5 + rad; })) continue;
    if (rr + rad > R - 2) continue;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    const floors = rnd() < 0.55 ? 2 : (rnd() < 0.5 ? 1 : 3);
    buildHouse(B, M, hx, cy, hz, yaw, w, d, floors, city.style, rnd, city.banner);
    collision.addBox(hx, hz, w / 2 + 0.3, d / 2 + 0.3, yaw);
    occupied.push({ x: hx, z: hz, r: rad });
    placed++;
    // бочки/ящики
    if (rnd() < 0.6) {
      const bx = hx + Math.sin(yaw) * (d / 2 + 1) + Math.cos(yaw) * (w / 2 - 0.5), bz = hz + Math.cos(yaw) * (d / 2 + 1) - Math.sin(yaw) * (w / 2 - 0.5);
      barrel(B, M, bx, cy, bz);
      collision.addCircle(bx, bz, 0.5);
    }
    if (rnd() < 0.3) spots.push({ role: 'citizen', x: hx + Math.sin(yaw) * (d / 2 + 2.5), z: hz + Math.cos(yaw) * (d / 2 + 2.5), yaw });
  }
  // Фонари вдоль улиц
  for (const g of city.gates) {
    for (let k = 1; k <= 3; k++) {
      for (const s of [-1, 1]) {
        const rr = 12 + k * (R - 16) / 4;
        const lx = cx + Math.cos(g) * rr - Math.sin(g) * 4 * s, lz = cz + Math.sin(g) * rr + Math.cos(g) * 4 * s;
        if (occupied.some(o => Math.hypot(o.x - lx, o.z - lz) < o.r)) continue;
        lantern(B, M, lx, cy, lz, animated);
        collision.addCircle(lx, lz, 0.3);
      }
    }
  }
  // Деревья во дворах
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, rr = 18 + rnd() * (R - 22);
    const tx = cx + Math.cos(a) * rr, tz = cz + Math.sin(a) * rr;
    if (occupied.some(o => Math.hypot(o.x - tx, o.z - tz) < o.r + 1.5)) continue;
    if (isGateAngle(a, 0.15)) continue;
    B.add(cylUV(0.18, 0.28, 2.8, 8, 1), M.darkWood, M4(tx, cy + 1.4, tz));
    const fol = texMat('fol', () => new THREE.MeshStandardMaterial({ color: '#3e6e2a', roughness: 0.9 }));
    B.add(new THREE.IcosahedronGeometry(1.6, 1), fol, M4(tx, cy + 3.6, tz, rnd() * 3, 1, 1.1, 1));
    B.add(new THREE.IcosahedronGeometry(1.1, 1), fol, M4(tx + 0.7, cy + 4.3, tz - 0.3));
    collision.addCircle(tx, tz, 0.4);
    occupied.push({ x: tx, z: tz, r: 2 });
  }
  B.build(group);
  return { group, spots, animated, cy };
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
