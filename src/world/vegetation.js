// Растительность: деревья, кусты, камни (инстансинг по чанкам), трава с ветром (ленивые чанки).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, Noise, smoothstep } from '../core/util.js';
import { WORLD_HALF, CITIES, SECRET_SHOPS, POIS, BIOMES } from '../data/world.js';
import { IS_PHONE } from '../core/device.js';
import { barkTex, leafCard, pineCard, terrainLayers } from '../core/textures.js';

export const windUniforms = { uTime: { value: 0 } };

function colorize(g, fn) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    c.convertSRGBToLinear();
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function blob(r, detail, rnd, noise, sx = 1, sy = 1, sz = 1) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const off = rnd() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + noise.noise(x * 1.3 + off, (y + z) * 1.3) * 0.22;
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}

function trunk(h, r0, r1, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 3);
  g.translate(0, h / 2, 0);
  return g;
}

const N = new Noise(77);
const UPV = new THREE.Vector3(0, 1, 0);

// Раскраска вершин с сохранением UV (для коры и листвы)
function paint(g, fn) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    c.convertSRGBToLinear();
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Ствол или ветка: сужающийся неровный цилиндр, расширение у корней, UV под кору
function limb(len, r0, r1, seg = 8, flare = 0, seed = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, Math.max(2, Math.round(len * 1.5)), true);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = y / len, an = Math.atan2(z, x);
    const k = 1 + N.noise(an * 1.5 + seed, y * 1.2) * 0.1 + flare * Math.pow(1 - t, 7) * (1 + 0.45 * Math.sin(an * 5 + seed));
    p.setXYZ(i, x * k + N.noise(y * 0.5, seed) * 0.08 * t * len * 0.1, y, z * k);
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r0 * 8)), uv.getY(i) * len / 1.6);
  }
  g.computeVertexNormals();
  return g;
}
// Поставить геометрию (ось +Y) от точки from в направлении dir
function place(g, from, dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(UPV, dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(from.x, from.y, from.z);
  return g;
}
// Карточка листвы: квадрат со случайной ориентацией, нормали — от центра кроны (объёмное освещение)
function leafCards(rnd, cx, cy, cz, R, n, size, center, tint, opts = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), r = Math.cbrt(rnd()) * R;
    const px = cx + Math.sin(ph) * Math.cos(a) * r, py = cy + Math.cos(ph) * r * (opts.flat || 0.75), pz = cz + Math.sin(ph) * Math.sin(a) * r;
    const sz = size * (0.75 + rnd() * 0.5);
    const g = new THREE.PlaneGeometry(sz, sz * (opts.aspect || 1));
    g.rotateX(rnd() * Math.PI); g.rotateY(rnd() * Math.PI * 2); g.rotateZ((rnd() - 0.5) * 1.2);
    g.translate(px, py, pz);
    const pp = g.attributes.position, nn = g.attributes.normal;
    const v = new THREE.Vector3();
    for (let k = 0; k < pp.count; k++) {
      v.set(pp.getX(k) - center.x, (pp.getY(k) - center.y) * 1.3, pp.getZ(k) - center.z).normalize();
      v.y += 0.35; v.normalize();
      nn.setXYZ(k, v.x, v.y, v.z);
    }
    const shade = 0.55 + 0.6 * Math.min(1, Math.hypot(px - center.x, (py - center.y), pz - center.z) / (opts.span || R * 2));
    const tv = 0.88 + rnd() * 0.24;
    parts.push(paint(g, (c, x, y) => {
      const up = Math.min(1.15, 0.85 + (y - center.y) * 0.08);
      c.setRGB(tint[0] * shade * tv * up, tint[1] * shade * tv * up, tint[2] * shade * tv * up);
    }));
  }
  return parts;
}

const BARK = (c, k = 1) => c.setRGB(0.62 * k, 0.55 * k, 0.48 * k);
const TREE_BUILDERS = {
  oak(rnd) {
    const H = 3.8 + rnd() * 1.6, seed = rnd() * 50;
    const wood = [paint(limb(H + 0.6, 0.55, 0.32, 10, 0.7, seed), (c) => BARK(c))];
    const leaves = [];
    const center = new THREE.Vector3(0, H + 2.2, 0);
    const nb = 4 + Math.floor(rnd() * 2);
    const tint = [0.85 + rnd() * 0.15, 0.95 + rnd() * 0.1, 0.72];
    for (let i = 0; i < nb; i++) {
      const a = i / nb * Math.PI * 2 + rnd() * 0.6;
      const from = new THREE.Vector3(0, H * (0.6 + rnd() * 0.3), 0);
      const dir = new THREE.Vector3(Math.cos(a), 0.7 + rnd() * 0.5, Math.sin(a));
      const L = 2.4 + rnd() * 1.2;
      wood.push(paint(place(limb(L, 0.22, 0.07, 6, 0, seed + i), from, dir), (c) => BARK(c, 0.9)));
      const end = from.clone().addScaledVector(dir.normalize(), L);
      // мелкие веточки
      for (let k = 0; k < 2; k++) {
        const d2 = dir.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() * 0.5, rnd() - 0.5)).normalize();
        wood.push(paint(place(limb(1.2, 0.07, 0.02, 4, 0, seed + i * 3 + k), from.clone().lerp(end, 0.6), d2), (c) => BARK(c, 0.85)));
      }
      leaves.push(...leafCards(rnd, end.x, end.y + 0.3, end.z, 1.7, 13, 2.0, center, tint, { span: 4.5 }));
    }
    leaves.push(...leafCards(rnd, 0, H + 2.4, 0, 2.0, 16, 2.1, center, tint, { span: 4.5 }));
    return { trunk: mergeGeometries(wood), leaves: mergeGeometries(leaves), h: H + 4, r: 0.7, bark: 'oak', leaf: 'broad' };
  },
  birch(rnd) {
    const H = 7 + rnd() * 2.5, seed = rnd() * 50;
    const wood = [paint(limb(H, 0.24, 0.08, 8, 0.25, seed), (c) => c.setRGB(1, 1, 1))];
    const leaves = [];
    const center = new THREE.Vector3(0, H - 0.5, 0);
    const tint = [1.0, 1.05, 0.78];
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + rnd();
      const from = new THREE.Vector3(0, H * (0.45 + i * 0.1), 0);
      const dir = new THREE.Vector3(Math.cos(a), 1.1, Math.sin(a));
      wood.push(paint(place(limb(1.6, 0.08, 0.03, 5, 0, seed + i), from, dir), (c) => c.setRGB(0.95, 0.95, 0.95)));
      const end = from.clone().addScaledVector(dir.normalize(), 1.6);
      leaves.push(...leafCards(rnd, end.x, end.y + 0.4, end.z, 1.2, 9, 1.4, center, tint, { span: 3.2 }));
    }
    leaves.push(...leafCards(rnd, 0, H, 0, 1.3, 10, 1.4, center, tint, { span: 3.2 }));
    return { trunk: mergeGeometries(wood), leaves: mergeGeometries(leaves), h: H + 2, r: 0.35, bark: 'birch', leaf: 'small' };
  },
  pine(rnd, snow = false) {
    const H = 9 + rnd() * 5, seed = rnd() * 50;
    const wood = [paint(limb(H, 0.4, 0.04, 8, 0.5, seed), (c) => BARK(c, 0.85))];
    const leaves = [];
    const tiers = 13 + Math.floor(rnd() * 3);
    for (let t = 0; t < tiers; t++) {
      const k = t / tiers;
      const y = H * (0.2 + k * 0.78);
      const L = (1 - k) * 3.4 + 0.8;
      const nbr = 9;
      for (let b = 0; b < nbr; b++) {
        const a = b / nbr * Math.PI * 2 + t * 0.5 + rnd() * 0.3;
        const g = new THREE.PlaneGeometry(L, L * 0.62);
        g.rotateX(-Math.PI / 2);
        g.translate(L / 2, 0, 0);
        g.rotateZ(-(0.25 + (1 - k) * 0.25 + rnd() * 0.1));
        g.rotateY(-a);
        g.translate(0, y, 0);
        const nn = g.attributes.normal, pp = g.attributes.position;
        for (let q = 0; q < nn.count; q++) { const vx = pp.getX(q), vz = pp.getZ(q), l = Math.hypot(vx, vz) || 1; nn.setXYZ(q, vx / l * 0.5, 0.85, vz / l * 0.5); }
        const sh = 0.7 + k * 0.4;
        leaves.push(paint(g, (c) => c.setRGB(0.75 * sh, 0.85 * sh, 0.75 * sh)));
      }
    }
    return { trunk: mergeGeometries(wood), leaves: mergeGeometries(leaves), h: H, r: 0.5, bark: 'oak', leaf: snow ? 'pinesnow' : 'pine' };
  },
  willow(rnd) {
    const H = 3.6 + rnd(), seed = rnd() * 50;
    const wood = [paint(limb(H + 0.5, 0.65, 0.38, 10, 0.8, seed), (c) => BARK(c, 0.8))];
    const leaves = [];
    const center = new THREE.Vector3(0, H + 1.5, 0);
    const tint = [0.95, 0.92, 0.7];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const from = new THREE.Vector3(0, H * 0.85, 0), dir = new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a));
      wood.push(paint(place(limb(2.4, 0.18, 0.06, 6, 0, seed + i), from, dir), (c) => BARK(c, 0.8)));
      const end = from.clone().addScaledVector(dir.normalize(), 2.4);
      leaves.push(...leafCards(rnd, end.x, end.y, end.z, 1.4, 8, 1.8, center, tint, { span: 4 }));
      // свисающие ветви
      for (let k = 0; k < 6; k++) {
        const len = 2.6 + rnd() * 1.6;
        const g = new THREE.PlaneGeometry(1.1, len, 1, 3);
        g.translate(0, -len / 2, 0);
        g.rotateY(rnd() * Math.PI);
        g.translate(end.x + (rnd() - 0.5) * 1.6, end.y + 0.3, end.z + (rnd() - 0.5) * 1.6);
        const nn = g.attributes.normal;
        for (let q = 0; q < nn.count; q++) nn.setXYZ(q, Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6);
        leaves.push(paint(g, (c, x, y) => { const sh = 0.6 + Math.max(0, (y - H * 0.5)) * 0.08; c.setRGB(tint[0] * sh, tint[1] * sh, tint[2] * sh); }));
      }
    }
    return { trunk: mergeGeometries(wood), leaves: mergeGeometries(leaves), h: H + 3, r: 0.75, bark: 'oak', leaf: 'willow' };
  },
  dead(rnd) {
    const H = 4.5 + rnd() * 3, seed = rnd() * 50;
    const col = (c) => c.setRGB(0.36, 0.33, 0.31);
    const wood = [paint(limb(H, 0.42, 0.08, 8, 0.6, seed), col)];
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      const from = new THREE.Vector3(0, H * (0.4 + rnd() * 0.5), 0);
      const dir = new THREE.Vector3(Math.cos(a), 0.4 + rnd() * 0.8, Math.sin(a));
      const L = 1.4 + rnd() * 1.8;
      wood.push(paint(place(limb(L, 0.13, 0.03, 5, 0, seed + i), from, dir), col));
      const end = from.clone().addScaledVector(dir.clone().normalize(), L * 0.7);
      const d2 = dir.clone().add(new THREE.Vector3(rnd() - 0.5, 0.6, rnd() - 0.5));
      wood.push(paint(place(limb(L * 0.5, 0.05, 0.01, 4, 0, seed + i * 7), end, d2), col));
    }
    return { trunk: mergeGeometries(wood), leaves: null, h: H, r: 0.45, bark: 'oak', leaf: null };
  },
};
TREE_BUILDERS.snowpine = (rnd) => TREE_BUILDERS.pine(rnd, true);

// Камень: шар, обрубленный случайными плоскостями (сколы), с уступами-пластами и шумом.
// kind: small — мелкий валун, big — крупный, crag — высокий утёс с резкими гранями
function rockGeo(rnd, tint, kind = 'small') {
  let g = new THREE.IcosahedronGeometry(1, kind === 'small' ? 2 : 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const crag = kind === 'crag';
  const planes = [];
  const np = crag ? 12 : 8;
  for (let i = 0; i < np; i++) {
    const n = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * (crag ? 0.35 : 0.8), rnd() * 2 - 1).normalize();
    planes.push([n, 0.5 + rnd() * 0.38]);
  }
  if (!crag) planes.push([new THREE.Vector3(0, 1, 0), 0.55 + rnd() * 0.25]); // плоская макушка
  const p = g.attributes.position;
  const off = rnd() * 100;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    for (const [n, d] of planes) { const dd = v.dot(n) - d; if (dd > 0) v.addScaledVector(n, -dd * 0.94); }
    const k = 1 + N.fbm(v.x * 1.7 + off, (v.y * 1.3 + v.z) * 1.7, 3) * 0.16;
    v.multiplyScalar(k);
    // уступы-пласты
    const ly = v.y * (crag ? 4.2 : 3.2) + N.noise(v.x * 1.5 + off, v.z * 1.5) * 0.6;
    const ledge = smoothstep(0.35, 0.5, ly - Math.floor(ly)) - 0.5;
    v.x *= 1 + ledge * 0.07; v.z *= 1 + ledge * 0.07;
    if (crag) { v.y = v.y * 1.3 + 0.45; const tp = 1 - smoothstep(0.2, 1.8, v.y) * 0.38; v.x *= 1.05 * tp; v.z *= 1.05 * tp; }
    else { v.x *= 1.2; v.y *= 0.78; }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  if (crag) g = g.toNonIndexed();
  g.computeVertexNormals();
  return colorize(g, (c, x, y, z, nx, ny) => {
    const vv = 0.82 + N.fbm(x * 2.3 + off, z * 2.3 + y * 1.7, 2) * 0.22;
    c.setRGB(tint[0] * vv, tint[1] * vv, tint[2] * vv);
    const patch = N.noise(x * 3 + off, z * 3) * 0.25;
    if (tint.moss && ny + patch > 0.62) c.lerp(new THREE.Color(0.2, 0.3, 0.11), 0.65);
    if (tint.snow && ny + patch * 0.6 > 0.45) c.setRGB(0.9, 0.93, 0.97);
    if (ny < -0.2) c.multiplyScalar(0.7);
  });
}

// Материал камней: трипланарная фактура скалы и рельеф в мировых координатах
function rockMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  const tex = terrainLayers();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tLayers = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vRN = mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal;
        #else
          vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vRN = mat3(modelMatrix) * objectNormal;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tLayers; varying vec3 vRW; varying vec3 vRN; float gRockH;
        float rockTri(float sc) {
          vec3 an = abs(normalize(vRN)); an = pow(an, vec3(3.0)); an /= (an.x + an.y + an.z);
          return texture2D(tLayers, vRW.zy * sc).g * an.x + texture2D(tLayers, vRW.xz * sc).g * an.y + texture2D(tLayers, vRW.xy * sc).g * an.z;
        }
        vec3 rockPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
          if (dot(sx, sx) < 1e-12 || dot(sy, sy) < 1e-12) return surf_norm;
          vec3 vSigmaX = normalize(sx), vSigmaY = normalize(sy);
          vec3 R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 n = abs(fDet) * surf_norm - sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          float l = length(n);
          return l > 1e-6 ? n / l : surf_norm;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float h1 = rockTri(0.33), h2 = rockTri(0.06);
        gRockH = h1 * 0.7 + h2 * 0.5;
        float st = sin(vRW.y * 5.5 + (h2 - 0.5) * 6.0);
        diffuseColor.rgb *= mix(0.55, 1.32, h1) * mix(0.8, 1.16, h2) * (1.0 + st * 0.06);
        diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.12, 0.42, h1 * 0.6 + h2 * 0.55));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float fd = 1.0 - smoothstep(60.0, 160.0, length(vViewPosition));
          vec2 dH = vec2(dFdx(gRockH), dFdy(gRockH)) * 3.2 * fd;
          if (dot(dH, dH) > 1e-10) normal = rockPerturb(-vViewPosition, normal, dH, faceDirection);
        }`);
  };
  m.customProgramCacheKey = () => 'rockTri';
  return m;
}

function bushGeo(rnd, col) {
  const center = new THREE.Vector3(0, 0.5, 0);
  return mergeGeometries(leafCards(rnd, 0, 0.6, 0, 0.75, 16, 1.0, center, col, { span: 1.8, flat: 0.6 }));
}

function windMaterial(strength = 0.06, base = 1.5, opts = {}) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9, metalness: 0 }, opts.mat || {}));
  const flutter = opts.flutter || 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    // растворение листвы возле камеры (чтобы деревья не закрывали обзор)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dc = distance(vWP, cameraPosition);
        if (dc < 6.0) { float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); if (n > (dc - 2.5) / 3.5) discard; }`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = max(0.0, transformed.y - ${base.toFixed(2)});
        float ph = uTime * 1.3 + ip.x * 0.07 + ip.z * 0.05;
        transformed.x += sin(ph) * sway * ${strength.toFixed(3)};
        transformed.z += cos(ph * 0.8) * sway * ${(strength * 0.6).toFixed(3)};
        float fl = ${flutter.toFixed(3)} * sin(uTime * 5.0 + position.x * 2.1 + position.z * 1.7 + ip.x);
        transformed += vec3(fl, fl * 0.6, -fl * 0.8);`);
  };
  return m;
}

const CH = 160; // размер чанка деревьев
const GCH = 40; // размер чанка травы

export class Vegetation {
  constructor(scene, terrain, collision, extraTrees = []) {
    this.extraTrees = extraTrees;
    this.scene = scene;
    this.terrain = terrain;
    this.collision = collision;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    const bark = barkTex(false), birch = barkTex(true);
    this.barkMats = {
      oak: windMaterial(0.04, 2.5, { mat: { map: bark.map, normalMap: bark.normalMap, roughness: 0.95 } }),
      birch: windMaterial(0.04, 2.5, { mat: { map: birch.map, normalMap: birch.normalMap, roughness: 0.85 } }),
    };
    const leafOpts = (map) => ({ flutter: 0.035, mat: { map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7 } });
    this.leafMats = {
      broad: windMaterial(0.04, 2.5, leafOpts(leafCard('broad'))),
      small: windMaterial(0.04, 2.5, leafOpts(leafCard('small'))),
      willow: windMaterial(0.05, 2.5, leafOpts(leafCard('willow'))),
      pine: windMaterial(0.03, 2.5, leafOpts(pineCard(false))),
      pinesnow: windMaterial(0.03, 2.5, leafOpts(pineCard(true))),
    };
    this.rockMat = rockMaterial();
    this.bushMat = windMaterial(0.06, 0.2, leafOpts(leafCard('broad')));
    this.chunks = [];
    this.grassChunks = new Map();
    this.buildVariants();
    this.placeAll();
    this.grassDist = 110;
    this.buildGrassAssets();
    this.treeDist = 480;
    this.grassDensity = IS_PHONE ? 0.4 : 0.65;
  }

  buildVariants() {
    this.variants = {};
    const rnd = mulberry32(99);
    for (const k of Object.keys(TREE_BUILDERS)) {
      this.variants[k] = [];
      for (let v = 0; v < 3; v++) this.variants[k].push(TREE_BUILDERS[k](rnd));
    }
    const rockSet = (tint) => ({
      small: [rockGeo(rnd, tint, 'small'), rockGeo(rnd, tint, 'small'), rockGeo(rnd, tint, 'small')],
      big: [rockGeo(rnd, tint, 'big'), rockGeo(rnd, tint, 'big')],
      crag: [rockGeo(rnd, tint, 'crag'), rockGeo(rnd, tint, 'crag')],
    });
    this.rockVariants = {
      normal: rockSet(Object.assign([0.58, 0.55, 0.5], { moss: true })),
      grey: rockSet([0.6, 0.58, 0.55]),
      snow: rockSet(Object.assign([0.6, 0.6, 0.6], { snow: true })),
      dark: rockSet([0.2, 0.16, 0.15]),
    };
    this.bushVariants = {
      green: bushGeo(rnd, [0.55, 0.78, 0.4]),
      dark: bushGeo(rnd, [0.42, 0.6, 0.34]),
      swamp: bushGeo(rnd, [0.6, 0.62, 0.36]),
    };
  }

  isBlocked(x, z, extra = 0) {
    for (const c of CITIES) if (Math.hypot(x - c.x, z - c.z) < c.r + 14 + extra) return true;
    for (const s of SECRET_SHOPS) if (Math.hypot(x - s.x, z - s.z) < 14 + extra) return true;
    for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.7 + extra) return true;
    return false;
  }

  placeAll() {
    const T = this.terrain;
    const rnd = mulberry32(1234);
    const nCh = Math.ceil((WORLD_HALF * 2) / CH);
    const buckets = []; // [chunk][key] -> matrices
    for (let i = 0; i < nCh * nCh; i++) buckets.push(new Map());
    const add = (key, geo, mat, x, z, m, cast = true) => {
      const ci = Math.floor((x + WORLD_HALF) / CH), cj = Math.floor((z + WORLD_HALF) / CH);
      const b = buckets[cj * nCh + ci];
      if (!b.has(key)) b.set(key, { geo, mat, list: [], cast });
      b.get(key).list.push(m);
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const clusterN = new Noise(555);
    // Деревья в городах (места выбирает город)
    for (const t of this.extraTrees) {
      const type = rnd() < 0.55 ? 'oak' : 'birch';
      const vi = Math.floor(rnd() * 3);
      const v = this.variants[type][vi];
      const sc = 0.62 + rnd() * 0.22;
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      s.set(sc, sc, sc);
      p.set(t.x, t.y - 0.05, t.z);
      m4.compose(p, q, s);
      add('t_' + type + vi, v.trunk, this.barkMats[v.bark], t.x, t.z, m4.clone());
      if (v.leaves) add('l_' + type + vi, v.leaves, this.leafMats[v.leaf], t.x, t.z, m4.clone());
    }
    // Деревья
    const step = IS_PHONE ? 8.5 : 7;
    for (let z = -WORLD_HALF + 20; z < WORLD_HALF - 20; z += step) {
      for (let x = -WORLD_HALF + 20; x < WORLD_HALF - 20; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
        const B = T.biomeAt(px, pz);
        const cluster = smoothstep(-0.25, 0.45, clusterN.fbm(px * 0.008, pz * 0.008, 3));
        const prob = B.treeDensity * (0.15 + cluster * 0.85) * 0.62;
        const r1 = rnd();
        if (r1 > prob) continue;
        const h = T.getHeight(px, pz);
        if (h < 0.9) continue;
        if (T.roadAt(px, pz) > 0.05) continue;
        if (this.isBlocked(px, pz)) continue;
        const nrm = T.normalAt(px, pz);
        // выбор типа дерева
        let r = rnd(), type = 'pine';
        for (const [k, w] of Object.entries(B.trees)) { if (r < w) { type = k; break; } r -= w; }
        if (nrm.y < 0.78 && type !== 'pine' && type !== 'snowpine') continue;
        if (nrm.y < 0.62) continue;
        const vi = Math.floor(rnd() * 3);
        const v = this.variants[type][vi];
        const sc = 0.8 + rnd() * 0.5;
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        s.set(sc, sc * (0.9 + rnd() * 0.2), sc);
        p.set(px, h - 0.2, pz);
        m4.compose(p, q, s);
        add('t_' + type + vi, v.trunk, this.barkMats[v.bark], px, pz, m4.clone());
        if (v.leaves) add('l_' + type + vi, v.leaves, this.leafMats[v.leaf], px, pz, m4.clone());
        this.collision.addCircle(px, pz, v.r * sc);
      }
    }
    // Утёсы и скальные зубцы на крутых склонах гор
    for (let i = 0; i < 4200; i++) {
      const px = (rnd() * 2 - 1) * (WORLD_HALF - 12), pz = (rnd() * 2 - 1) * (WORLD_HALF - 12);
      const h = T.getHeight(px, pz);
      if (h < 3 || this.isBlocked(px, pz) || T.roadAt(px, pz) > 0.05) continue;
      const B = T.biomeAt(px, pz);
      const mountB = B.id === BIOMES.snow.id || B.id === BIOMES.volcanic.id || B.id === BIOMES.highland.id;
      const edgeM = Math.max(Math.abs(px), Math.abs(pz)) > 640;
      if (!mountB && !edgeM) continue;
      const nrm = T.normalAt(px, pz);
      if (nrm.y > 0.86 && rnd() < 0.8) continue;
      const fam = B.id === BIOMES.snow.id ? 'snow' : B.id === BIOMES.volcanic.id ? 'dark' : 'grey';
      const set = this.rockVariants[fam].crag;
      const vi = Math.floor(rnd() * set.length);
      const sc = 1.8 + rnd() * rnd() * 6.5;
      // наклон по склону
      q.setFromEuler(new THREE.Euler(nrm.z * 0.5 + (rnd() - 0.5) * 0.3, rnd() * 6.28, -nrm.x * 0.5 + (rnd() - 0.5) * 0.3));
      s.set(sc * (0.9 + rnd() * 0.7), sc * (0.55 + rnd() * 0.6), sc * (0.9 + rnd() * 0.7));
      p.set(px, h - sc * 0.55, pz);
      m4.compose(p, q, s);
      add('c_' + fam + vi, set[vi], this.rockMat, px, pz, m4.clone(), true);
      this.collision.addCircle(px, pz, sc * 0.8);
    }
    // Камни и кусты
    for (let i = 0; i < 9000; i++) {
      const px = (rnd() * 2 - 1) * (WORLD_HALF - 15), pz = (rnd() * 2 - 1) * (WORLD_HALF - 15);
      const h = T.getHeight(px, pz);
      if (h < 0.3 || this.isBlocked(px, pz) || T.roadAt(px, pz) > 0.1) continue;
      const B = T.biomeAt(px, pz);
      const nrm = T.normalAt(px, pz);
      const isRock = rnd() < (nrm.y < 0.85 ? 0.85 : 0.35);
      if (isRock) {
        const fam = B.id === BIOMES.snow.id ? 'snow' : B.id === BIOMES.volcanic.id ? 'dark' : (B.id === BIOMES.highland.id ? 'grey' : 'normal');
        const big = rnd() < 0.15;
        const set = this.rockVariants[fam][big ? 'big' : 'small'];
        const vi = Math.floor(rnd() * set.length);
        const sc = big ? 2 + rnd() * 2.5 : 0.35 + rnd() * 0.9;
        q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * 6.28, rnd() * 0.4));
        s.set(sc, sc * (0.7 + rnd() * 0.5), sc);
        p.set(px, h - sc * 0.25, pz);
        m4.compose(p, q, s);
        add('r_' + fam + (big ? 'b' : 's') + vi, set[vi], this.rockMat, px, pz, m4.clone(), big);
        if (sc > 1.2) this.collision.addCircle(px, pz, sc * 0.95);
      } else {
        if (B.id === BIOMES.snow.id || B.id === BIOMES.volcanic.id) continue;
        const key = B.id === BIOMES.swamp.id ? 'swamp' : B.id === BIOMES.forest.id ? 'dark' : 'green';
        const sc = 0.7 + rnd() * 0.8;
        q.setFromAxisAngle(up, rnd() * 6.28);
        s.set(sc, sc * (0.8 + rnd() * 0.4), sc);
        p.set(px, h - 0.15, pz);
        m4.compose(p, q, s);
        add('b_' + key, this.bushVariants[key], this.bushMat, px, pz, m4.clone(), false);
      }
    }
    // Создаём InstancedMesh по чанкам
    for (let cj = 0; cj < nCh; cj++) for (let ci = 0; ci < nCh; ci++) {
      const b = buckets[cj * nCh + ci];
      const g = new THREE.Group();
      g.userData.cx = -WORLD_HALF + (ci + 0.5) * CH;
      g.userData.cz = -WORLD_HALF + (cj + 0.5) * CH;
      for (const [, e] of b) {
        const im = new THREE.InstancedMesh(e.geo, e.mat, e.list.length);
        const col = new THREE.Color();
        for (let k = 0; k < e.list.length; k++) {
          im.setMatrixAt(k, e.list[k]);
          col.setHSL(0.0, 0, 0.85 + rnd() * 0.3);
          im.setColorAt(k, col);
        }
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = e.cast; im.receiveShadow = true;
        im.computeBoundingSphere();
        g.add(im);
      }
      this.group.add(g);
      this.chunks.push(g);
    }
  }

  // Пучок травы: тонкие изогнутые травинки из нескольких сегментов
  makeTuft(rnd, blades, segs, hMin, hMax) {
    const pos = [], col = [], nrm = [], tip = [];
    for (let b = 0; b < blades; b++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.32;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const h = hMin + rnd() * (hMax - hMin);
      const w = 0.018 + rnd() * 0.022;
      const bend = 0.15 + rnd() * 0.45; // насколько клонится
      const dir = a + (rnd() - 0.5) * 1.2; // направление наклона
      const face = rnd() * Math.PI; // поворот плоскости травинки
      const fx = Math.cos(face), fz = Math.sin(face);
      const ring = [];
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const off = bend * t * t * h;
        const cx = bx + Math.cos(dir) * off, cz = bz + Math.sin(dir) * off;
        const y = h * t * (1 - bend * 0.35 * t);
        const ww = w * (1 - t * 0.92);
        ring.push([[cx - fx * ww, y, cz - fz * ww], [cx + fx * ww, y, cz + fz * ww], t]);
      }
      // нормаль — смесь «вверх» и стороны травинки: мягкое освещение
      const nx = -fz * 0.35, nz = fx * 0.35;
      for (let k = 0; k < segs; k++) {
        const [l0, r0, t0] = ring[k], [l1, r1, t1] = ring[k + 1];
        const quads = [[l0, t0], [r0, t0], [r1, t1], [l0, t0], [r1, t1], [l1, t1]];
        for (const [p, t] of quads) {
          pos.push(p[0], p[1], p[2]);
          const sh = Math.pow(0.22 + t * 0.85, 2.2);
          col.push(sh, sh, sh);
          nrm.push(nx, 1, nz);
          tip.push(t);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
    g.computeBoundingSphere();
    return g;
  }

  buildGrassAssets() {
    const rnd = mulberry32(7);
    this.grassGeoNear = this.makeTuft(rnd, IS_PHONE ? 10 : 16, 4, 0.28, 0.75);
    this.grassGeoFar = this.makeTuft(rnd, IS_PHONE ? 6 : 9, 3, 0.3, 0.7);
    this.grassGeo = this.grassGeoNear;
    this.playerUniform = { value: new THREE.Vector3() };
    this.camUniform = { value: new THREE.Vector3() };
    this.grassFade = { value: 110 };
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windUniforms.uTime;
      sh.uniforms.uPlayer = this.playerUniform;
      sh.uniforms.uCam = this.camUniform;
      sh.uniforms.uFade = this.grassFade;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uPlayer; uniform vec3 uCam; uniform float uFade;\nattribute float aTip; varying float vTip;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz;
          vTip = aTip;
          float tt = aTip * aTip;
          // порывы ветра волнами по полю
          float gust = sin(uTime * 0.9 + ip.x * 0.035 + ip.z * 0.02) * 0.5 + 0.5;
          float ph = uTime * 2.4 + ip.x * 0.31 + ip.z * 0.23;
          float sway = (sin(ph) * 0.06 + sin(ph * 2.3 + 1.7) * 0.025 + gust * 0.12) * tt;
          transformed.x += sway * 1.2;
          transformed.z += sway * 0.5 + cos(ph * 0.8) * 0.03 * tt;
          // примятие героем
          vec2 toP = ip.xz - uPlayer.xz;
          float pd = length(toP);
          float push = smoothstep(1.4, 0.2, pd) * tt;
          transformed.xz += normalize(toP + vec2(0.001)) * push * 0.45;
          transformed.y *= 1.0 - push * 0.55;
          // плавное исчезновение вдали
          float cd = length(ip.xz - uCam.xz);
          transformed.y *= smoothstep(uFade, uFade - 25.0, cd);`)
        ;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTip;')
        .replace('#include <opaque_fragment>', `
          // просвечивание кончиков на солнце
          outgoingLight += diffuseColor.rgb * vTip * vTip * 0.22;
          #include <opaque_fragment>`);
    };
    this.grassMat = m;
    // Цветы: стебель + розетка лепестков
    const fg = [];
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.38, 3); stem.translate(0, 0.19, 0);
    fg.push(colorize(stem, (c) => c.setRGB(0.22, 0.45, 0.14)));
    for (let k = 0; k < 5; k++) {
      const p = new THREE.SphereGeometry(0.045, 6, 4); p.scale(1, 0.3, 0.55);
      p.translate(0.05, 0.4, 0); p.rotateY(k / 5 * Math.PI * 2);
      fg.push(colorize(p, (c) => c.setRGB(1, 1, 1)));
    }
    const ctr = new THREE.SphereGeometry(0.025, 6, 4); ctr.translate(0, 0.41, 0);
    fg.push(colorize(ctr, (c) => c.setRGB(1, 0.85, 0.2)));
    this.flowerGeo = mergeGeometries(fg);
    this.flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  makeGrassChunk(ci, cj, near) {
    const T = this.terrain;
    const rnd = mulberry32(ci * 7919 + cj * 104729);
    const x0 = -WORLD_HALF + ci * GCH, z0 = -WORLD_HALF + cj * GCH;
    const g = new THREE.Group();
    const density = this.grassDensity * (near ? 1.35 : 0.55);
    const count = Math.floor(GCH * GCH * density);
    const mats = [], cols = [];
    const fl = [], flc = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color(), tc = new THREE.Color();
    const flowerCols = [[1, 0.85, 0.2], [0.95, 0.3, 0.35], [0.6, 0.45, 1], [1, 1, 1], [0.3, 0.6, 1], [1, 0.55, 0.15]];
    for (let i = 0; i < count; i++) {
      const x = x0 + rnd() * GCH, z = z0 + rnd() * GCH;
      const bb = T.biomeAt(x, z);
      if (rnd() > bb.grassDensity) continue;
      const h = T.getHeight(x, z);
      if (h < 0.15) continue;
      if (T.roadAt(x, z) > 0.4) continue;
      let inCity = false;
      for (const ct of CITIES) if (Math.hypot(x - ct.x, z - ct.z) < ct.r + 4) { inCity = true; break; }
      if (inCity) continue;
      const nrm = T.normalAt(x, z);
      if (nrm.y < 0.8) continue;
      const sc = 0.75 + rnd() * 0.6;
      q.setFromAxisAngle(up, rnd() * 6.28);
      s.set(sc, sc * (0.7 + rnd() * 0.75), sc);
      p.set(x, h - 0.04, z);
      m4.compose(p, q, s);
      mats.push(m4.clone());
      // цвет травы смешан с цветом земли под ней — без резкой границы
      T.colorAt(x, z, tc);
      const gc = bb.grass;
      const v = 0.85 + rnd() * 0.35;
      c.setRGB(gc[0] * v * 1.1, gc[1] * v * 1.08, gc[2] * v * 0.95).convertSRGBToLinear();
      c.lerp(tc, 0.35);
      if (rnd() < 0.08) c.multiplyScalar(1.25).lerp(new THREE.Color(0.55, 0.5, 0.18), 0.3); // сухие пучки
      cols.push(c.clone());
      if (bb.id <= 1 && rnd() < (near ? 0.03 : 0.012)) {
        p.set(x + 0.3, h, z + 0.2); s.setScalar(0.8 + rnd() * 0.6); m4.compose(p, q, s);
        fl.push(m4.clone());
        const fc = flowerCols[Math.floor(rnd() * flowerCols.length)];
        flc.push(new THREE.Color(fc[0], fc[1], fc[2]).convertSRGBToLinear());
      }
    }
    if (mats.length) {
      const im = new THREE.InstancedMesh(near ? this.grassGeoNear : this.grassGeoFar, this.grassMat, mats.length);
      mats.forEach((m, k) => { im.setMatrixAt(k, m); im.setColorAt(k, cols[k]); });
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
    if (fl.length) {
      const im = new THREE.InstancedMesh(this.flowerGeo, this.flowerMat, fl.length);
      fl.forEach((m, k) => { im.setMatrixAt(k, m); im.setColorAt(k, flc[k]); });
      im.computeBoundingSphere();
      g.add(im);
    }
    g.userData.near = near;
    return g;
  }

  update(dt, camPos, playerPos) {
    windUniforms.uTime.value += dt;
    this.playerUniform.value.copy(playerPos);
    this.camUniform.value.copy(playerPos);
    this.grassFade.value = this.grassDist;
    // видимость чанков деревьев
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.userData.cx - camPos.x, ch.userData.cz - camPos.z);
      ch.visible = d < this.treeDist;
    }
    // ленивые чанки травы: рядом — густая, дальше — реже
    const nG = Math.ceil((WORLD_HALF * 2) / GCH);
    const R = this.grassDist;
    const NEAR = 48;
    const pci = Math.floor((playerPos.x + WORLD_HALF) / GCH), pcj = Math.floor((playerPos.z + WORLD_HALF) / GCH);
    const rad = Math.ceil(R / GCH);
    let built = 0;
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const ci = pci + di, cj = pcj + dj;
      if (ci < 0 || cj < 0 || ci >= nG || cj >= nG) continue;
      const cx = -WORLD_HALF + (ci + 0.5) * GCH, cz = -WORLD_HALF + (cj + 0.5) * GCH;
      const d = Math.hypot(cx - playerPos.x, cz - playerPos.z);
      if (d > R) continue;
      const key = ci * 1000 + cj;
      const near = d < NEAR;
      const ex = this.grassChunks.get(key);
      if ((!ex || (near && !ex.userData.near)) && built < 2) {
        if (ex) { this.group.remove(ex); ex.children.forEach(m => m.dispose && m.dispose()); }
        const g = this.makeGrassChunk(ci, cj, near);
        g.userData.cx = cx; g.userData.cz = cz;
        this.group.add(g);
        this.grassChunks.set(key, g);
        built++;
      }
    }
    for (const [key, g] of this.grassChunks) {
      if (Math.hypot(g.userData.cx - playerPos.x, g.userData.cz - playerPos.z) > R + 60) {
        this.group.remove(g);
        g.children.forEach(m => m.dispose && m.dispose());
        this.grassChunks.delete(key);
      }
    }
  }

  prebuildGrass(playerPos) {
    for (let i = 0; i < 40; i++) this.update(0, playerPos, playerPos);
  }
}
