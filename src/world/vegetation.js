// Растительность: деревья, кусты, камни (инстансинг по чанкам), трава с ветром (ленивые чанки).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, Noise, smoothstep } from '../core/util.js';
import { WORLD_HALF, CITIES, SECRET_SHOPS, POIS, BIOMES } from '../data/world.js';
import { IS_PHONE } from '../core/device.js';

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
const TREE_BUILDERS = {
  pine(rnd, snow = false) {
    const parts = [];
    const H = 7 + rnd() * 4;
    const t = colorize(trunk(H * 0.45, 0.32, 0.16), (c) => c.setRGB(0.28, 0.18, 0.11));
    parts.push(t);
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const y = H * 0.18 + i * H * 0.16;
      const r = (1 - i / layers) * 2.6 + 0.5;
      const cone = new THREE.ConeGeometry(r, H * 0.3, 9, 2);
      // неровный край
      const p = cone.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const yy = p.getY(k);
        if (yy < 0) { p.setY(k, yy - Math.abs(N.noise(p.getX(k) * 3 + i, p.getZ(k) * 3)) * 0.5); }
      }
      cone.computeVertexNormals();
      cone.rotateY(rnd() * 3);
      cone.translate(0, y + H * 0.15, 0);
      const base = 0.12 + rnd() * 0.03;
      parts.push(colorize(cone, (c, x, yy, z, nx, ny) => {
        const shade = 0.75 + (yy - y) / (H * 0.3) * 0.4;
        if (snow && ny > 0.35) c.setRGB(0.88, 0.92, 0.97);
        else c.setRGB(base * 0.6 * shade, (base + 0.2) * shade, base * 0.55 * shade);
      }));
    }
    return { geo: mergeGeometries(parts), h: H, r: 0.5 };
  },
  oak(rnd) {
    const parts = [];
    const H = 4 + rnd() * 1.5;
    parts.push(colorize(trunk(H, 0.55, 0.32, 8), (c) => c.setRGB(0.3, 0.21, 0.13)));
    // ветви
    for (let i = 0; i < 3; i++) {
      const b = trunk(2.2, 0.2, 0.08, 5);
      b.rotateZ(0.8 + rnd() * 0.3); b.rotateY(i * 2.1 + rnd());
      b.translate(0, H * 0.75, 0);
      parts.push(colorize(b, (c) => c.setRGB(0.3, 0.21, 0.13)));
    }
    const count = 5 + Math.floor(rnd() * 3);
    const hue = rnd();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd();
      const d = i === 0 ? 0 : 1.6 + rnd() * 1.0;
      const r = 1.9 + rnd() * 0.9;
      const g = blob(r, 1, rnd, N, 1, 0.8, 1);
      g.translate(Math.cos(a) * d, H + 1.2 + rnd() * 1.6 - d * 0.25, Math.sin(a) * d);
      parts.push(colorize(g, (c, x, y, z, nx, ny) => {
        const s = 0.6 + Math.max(0, ny) * 0.5;
        c.setRGB((0.16 + hue * 0.08) * s, (0.34 + hue * 0.08) * s, 0.09 * s);
      }));
    }
    return { geo: mergeGeometries(parts), h: H + 4, r: 0.7 };
  },
  birch(rnd) {
    const parts = [];
    const H = 6 + rnd() * 2;
    parts.push(colorize(trunk(H, 0.24, 0.14, 7), (c, x, y) => {
      const mark = N.noise(y * 3, x * 9) > 0.45;
      if (mark) c.setRGB(0.12, 0.11, 0.1); else c.setRGB(0.86, 0.84, 0.8);
    }));
    for (let i = 0; i < 4; i++) {
      const g = blob(1.3 + rnd() * 0.5, 1, rnd, N, 1, 1.2, 1);
      g.translate((rnd() - 0.5) * 1.6, H - 0.5 + i * 0.8, (rnd() - 0.5) * 1.6);
      parts.push(colorize(g, (c, x, y, z, nx, ny) => {
        const s = 0.65 + Math.max(0, ny) * 0.45;
        c.setRGB(0.36 * s, 0.56 * s, 0.16 * s);
      }));
    }
    return { geo: mergeGeometries(parts), h: H + 3, r: 0.4 };
  },
  willow(rnd) {
    const parts = [];
    const H = 3.5 + rnd();
    const t = trunk(H, 0.6, 0.35, 8);
    parts.push(colorize(t, (c) => c.setRGB(0.24, 0.2, 0.14)));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const g = blob(1.8, 1, rnd, N, 1, 1.5, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setY(k, p.getY(k) * 1.8);
      g.computeVertexNormals();
      g.translate(Math.cos(a) * 1.8, H + 1.2, Math.sin(a) * 1.8);
      parts.push(colorize(g, (c, x, y, z, nx, ny) => {
        const s = 0.55 + Math.max(0, ny) * 0.4;
        c.setRGB(0.25 * s, 0.33 * s, 0.13 * s);
      }));
    }
    return { geo: mergeGeometries(parts), h: H + 3, r: 0.7 };
  },
  dead(rnd) {
    const parts = [];
    const H = 4 + rnd() * 3;
    const col = (c) => c.setRGB(0.18, 0.15, 0.14);
    parts.push(colorize(trunk(H, 0.38, 0.12, 6), col));
    for (let i = 0; i < 5; i++) {
      const L = 1.5 + rnd() * 1.8;
      const b = trunk(L, 0.13, 0.03, 4);
      b.rotateZ(0.6 + rnd() * 0.6); b.rotateY(rnd() * 6.28);
      b.translate(0, H * (0.45 + rnd() * 0.5), 0);
      parts.push(colorize(b, col));
    }
    return { geo: mergeGeometries(parts), h: H, r: 0.4 };
  },
};
TREE_BUILDERS.snowpine = (rnd) => TREE_BUILDERS.pine(rnd, true);

function rockGeo(rnd, tint) {
  const g = blob(1, 1, rnd, N, 1.2, 0.75, 1);
  return colorize(g, (c, x, y, z, nx, ny) => {
    const v = 0.85 + N.noise(x * 2, z * 2 + y) * 0.15;
    c.setRGB(tint[0] * v, tint[1] * v, tint[2] * v);
    if (ny > 0.6 && tint.moss) c.lerp(new THREE.Color(0.22, 0.32, 0.12), 0.6);
    if (ny > 0.5 && tint.snow) c.setRGB(0.9, 0.93, 0.97);
  });
}

function bushGeo(rnd, col) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = blob(0.7 + rnd() * 0.3, 1, rnd, N);
    g.translate((rnd() - 0.5) * 0.9, 0.5, (rnd() - 0.5) * 0.9);
    parts.push(colorize(g, (c, x, y, z, nx, ny) => {
      const s = 0.6 + Math.max(0, ny) * 0.45;
      c.setRGB(col[0] * s, col[1] * s, col[2] * s);
    }));
  }
  return mergeGeometries(parts);
}

function windMaterial(strength = 0.06, base = 1.5) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
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
        transformed.z += cos(ph * 0.8) * sway * ${(strength * 0.6).toFixed(3)};`);
  };
  return m;
}

const CH = 160; // размер чанка деревьев
const GCH = 40; // размер чанка травы

export class Vegetation {
  constructor(scene, terrain, collision) {
    this.scene = scene;
    this.terrain = terrain;
    this.collision = collision;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    this.treeMat = windMaterial(0.045, 2.5);
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
    this.bushMat = windMaterial(0.08, 0.3);
    this.chunks = [];
    this.grassChunks = new Map();
    this.buildVariants();
    this.placeAll();
    this.buildGrassAssets();
    this.grassDist = 110;
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
    this.rockVariants = {
      normal: [rockGeo(rnd, Object.assign([0.48, 0.46, 0.43], { moss: true })), rockGeo(rnd, Object.assign([0.5, 0.48, 0.45], { moss: true }))],
      grey: [rockGeo(rnd, [0.52, 0.52, 0.54]), rockGeo(rnd, [0.46, 0.47, 0.5])],
      snow: [rockGeo(rnd, Object.assign([0.5, 0.52, 0.56], { snow: true }))],
      dark: [rockGeo(rnd, [0.17, 0.14, 0.13]), rockGeo(rnd, [0.22, 0.17, 0.15])],
    };
    this.bushVariants = {
      green: bushGeo(rnd, [0.2, 0.42, 0.12]),
      dark: bushGeo(rnd, [0.15, 0.3, 0.1]),
      swamp: bushGeo(rnd, [0.26, 0.3, 0.12]),
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
        add('t_' + type + vi, v.geo, this.treeMat, px, pz, m4.clone());
        this.collision.addCircle(px, pz, v.r * sc);
      }
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
        const set = B.id === BIOMES.snow.id ? this.rockVariants.snow : B.id === BIOMES.volcanic.id ? this.rockVariants.dark : (B.id === BIOMES.highland.id ? this.rockVariants.grey : this.rockVariants.normal);
        const vi = Math.floor(rnd() * set.length);
        const big = rnd() < 0.15;
        const sc = big ? 2 + rnd() * 2.5 : 0.35 + rnd() * 0.9;
        q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * 6.28, rnd() * 0.4));
        s.set(sc, sc * (0.7 + rnd() * 0.5), sc);
        p.set(px, h - sc * 0.25, pz);
        m4.compose(p, q, s);
        add('r_' + B.id + vi, set[vi], this.rockMat, px, pz, m4.clone(), big);
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

  buildGrassAssets() {
    // Пучок травинок
    const blades = 9;
    const pos = [], col = [], nrm = [];
    const rnd = mulberry32(7);
    for (let b = 0; b < blades; b++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.35;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const h = 0.35 + rnd() * 0.45;
      const w = 0.045 + rnd() * 0.03;
      const lean = (rnd() - 0.5) * 0.4;
      const dir = rnd() * Math.PI;
      const dx = Math.cos(dir) * w, dz = Math.sin(dir) * w;
      const tipx = bx + Math.cos(a) * lean, tipz = bz + Math.sin(a) * lean;
      const midx = bx + Math.cos(a) * lean * 0.35, midz = bz + Math.sin(a) * lean * 0.35;
      const v = [
        [bx - dx, 0, bz - dz], [bx + dx, 0, bz + dz], [midx + dx * 0.7, h * 0.55, midz + dz * 0.7], [midx - dx * 0.7, h * 0.55, midz - dz * 0.7], [tipx, h, tipz],
      ];
      const tris = [[0, 1, 2], [0, 2, 3], [3, 2, 4]];
      const shadeOf = (y) => Math.pow(0.3 + (y / h) * 0.75, 2.2);
      for (const t of tris) for (const k of t) {
        pos.push(...v[k]);
        const s = shadeOf(v[k][1]);
        col.push(s, s, s);
        nrm.push(0, 1, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.grassGeo = g;
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windUniforms.uTime;
      sh.uniforms.uPlayer = this.playerUniform = { value: new THREE.Vector3() };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uPlayer;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz;
          float hgt = transformed.y;
          float ph = uTime * 2.2 + ip.x * 0.25 + ip.z * 0.18;
          float gust = sin(uTime * 0.6 + ip.x * 0.02) * 0.5 + 0.5;
          transformed.x += sin(ph) * hgt * (0.12 + gust * 0.18);
          transformed.z += cos(ph * 0.7) * hgt * 0.08;
          vec2 toP = ip.xz - uPlayer.xz;
          float pd = length(toP);
          float push = smoothstep(1.6, 0.2, pd) * hgt;
          transformed.xz += normalize(toP + vec2(0.001)) * push * 0.8;
          transformed.y -= push * 0.4;`);
    };
    this.grassMat = m;
    // Цветы
    const fg = [];
    const petal = new THREE.IcosahedronGeometry(0.08, 0); petal.translate(0, 0.42, 0);
    const stem = new THREE.CylinderGeometry(0.01, 0.01, 0.42, 3); stem.translate(0, 0.21, 0);
    fg.push(colorize(stem, (c) => c.setRGB(0.2, 0.45, 0.12)));
    fg.push(colorize(petal, (c) => c.setRGB(1, 1, 1)));
    this.flowerGeo = mergeGeometries(fg);
    this.flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  makeGrassChunk(ci, cj) {
    const T = this.terrain;
    const rnd = mulberry32(ci * 7919 + cj * 104729);
    const x0 = -WORLD_HALF + ci * GCH, z0 = -WORLD_HALF + cj * GCH;
    const cx = x0 + GCH / 2, cz = z0 + GCH / 2;
    const B = T.biomeAt(cx, cz);
    const g = new THREE.Group();
    const density = this.grassDensity;
    const count = Math.floor(GCH * GCH * density);
    const mats = [], cols = [];
    const fl = [], flc = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const flowerCols = [[1, 0.85, 0.2], [0.95, 0.3, 0.35], [0.6, 0.45, 1], [1, 1, 1], [0.3, 0.6, 1]];
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
      const sc = 0.7 + rnd() * 0.7;
      q.setFromAxisAngle(up, rnd() * 6.28);
      s.set(sc, sc * (0.8 + rnd() * 0.6), sc);
      p.set(x, h - 0.03, z);
      m4.compose(p, q, s);
      mats.push(m4.clone());
      const gc = bb.grass;
      const v = 0.95 + rnd() * 0.35;
      c.setRGB(gc[0] * v * 1.15, gc[1] * v * 1.1, gc[2] * v).convertSRGBToLinear();
      cols.push(c.clone());
      if (bb.id <= 1 && rnd() < 0.035) {
        p.set(x + 0.3, h, z + 0.2); s.setScalar(0.8 + rnd() * 0.6); m4.compose(p, q, s);
        fl.push(m4.clone());
        const fc = flowerCols[Math.floor(rnd() * flowerCols.length)];
        flc.push(new THREE.Color(fc[0], fc[1], fc[2]).convertSRGBToLinear());
      }
    }
    if (mats.length) {
      const im = new THREE.InstancedMesh(this.grassGeo, this.grassMat, mats.length);
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
    void B;
    return g;
  }

  update(dt, camPos, playerPos) {
    windUniforms.uTime.value += dt;
    if (this.playerUniform) this.playerUniform.value.copy(playerPos);
    // видимость чанков деревьев
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.userData.cx - camPos.x, ch.userData.cz - camPos.z);
      ch.visible = d < this.treeDist;
    }
    // ленивые чанки травы
    const nG = Math.ceil((WORLD_HALF * 2) / GCH);
    const R = this.grassDist;
    const pci = Math.floor((playerPos.x + WORLD_HALF) / GCH), pcj = Math.floor((playerPos.z + WORLD_HALF) / GCH);
    const rad = Math.ceil(R / GCH);
    let built = 0;
    for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const ci = pci + di, cj = pcj + dj;
      if (ci < 0 || cj < 0 || ci >= nG || cj >= nG) continue;
      const cx = -WORLD_HALF + (ci + 0.5) * GCH, cz = -WORLD_HALF + (cj + 0.5) * GCH;
      if (Math.hypot(cx - playerPos.x, cz - playerPos.z) > R) continue;
      const key = ci * 1000 + cj;
      if (!this.grassChunks.has(key) && built < 2) {
        const g = this.makeGrassChunk(ci, cj);
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
