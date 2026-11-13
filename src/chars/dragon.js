// Дракон: цельное тело (SDF) с длинной шеей и хвостом, скиннинг, походка на четырёх лапах
// (аллюры лошади), чешуя в шейдере (крупная на спине, мелкая на шее и лапах, поперечные
// пластины на брюхе, рельеф каждой чешуйки), перепончатые крылья с пальцами и фестонами,
// рога, гребень шипов, зубы, огонь в пасти.
import * as THREE from 'three';
import { Creature } from './creature_base.js';
import { Sculpt } from './sdf.js';
import { Horse } from './horse.js';
import { IS_PHONE, IS_TOUCH } from '../core/device.js';
import { clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// позвоночник: шея и хвост — сплайны
const NECK = [[0, 1.3, 0.85], [0, 1.55, 1.2], [0, 1.85, 1.45], [0, 2.1, 1.6], [0, 2.25, 1.72]];
const TAIL = [[0, 1.15, -0.95], [0, 1.05, -1.45], [0, 0.9, -1.95], [0, 0.72, -2.45], [0, 0.55, -2.9], [0, 0.42, -3.3]];

function anatomy() {
  const S = new Sculpt();
  const E = (c, r, o) => S.ell(c, r, o), C = (a, b, r1, r2, o) => S.cone(a, b, r1, r2, o);
  S.bone('torso', [0, 1.1, 0]);
  S.bone('neck0', NECK[0], 'torso');
  S.bone('neck1', NECK[1], 'neck0');
  S.bone('neck2', NECK[2], 'neck1');
  S.bone('neck3', NECK[3], 'neck2');
  S.bone('head', NECK[4], 'neck3');
  S.bone('jaw', [0, 2.2, 1.85], 'head');
  for (const sx of [1, -1]) S.bone('ear' + (sx > 0 ? 'L' : 'R'), [sx * 0.12, 2.35, 1.7], 'head');
  for (let i = 0; i < 6; i++) S.bone('tail' + i, TAIL[i], i ? 'tail' + (i - 1) : 'torso');
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    S.bone('FU' + s, [sx * 0.42, 1.05, 0.62], 'torso');
    S.bone('FF' + s, [sx * 0.5, 0.62, 0.72], 'FU' + s);
    S.bone('FC' + s, [sx * 0.48, 0.2, 0.62], 'FF' + s);
    S.bone('FP' + s, [sx * 0.48, 0.1, 0.66], 'FC' + s);
    S.bone('RU' + s, [sx * 0.45, 1.05, -0.6], 'torso');
    S.bone('RG' + s, [sx * 0.55, 0.68, -0.38], 'RU' + s);
    S.bone('RC' + s, [sx * 0.5, 0.3, -0.72], 'RG' + s);
    S.bone('RP' + s, [sx * 0.5, 0.1, -0.62], 'RC' + s);
  }
  const T = { bone: 'torso' };
  E([0, 1.12, 0.1], [0.5, 0.48, 0.85], { ...T, k: 0.18, tag: 'body' });
  E([0, 0.86, 0.15], [0.4, 0.3, 0.7], { ...T, k: 0.16, tag: 'belly' });
  E([0, 1.2, 0.62], [0.44, 0.44, 0.42], { ...T, k: 0.16, tag: 'body' });           // грудь
  E([0, 1.12, -0.6], [0.42, 0.4, 0.45], { ...T, k: 0.16, tag: 'body' });           // таз
  for (const sx of [1, -1]) {
    E([sx * 0.38, 1.1, 0.62], [0.22, 0.32, 0.3], { ...T, k: 0.12 });                 // плечо
    E([sx * 0.4, 1.05, -0.6], [0.24, 0.36, 0.34], { ...T, k: 0.12 });                // бедро
    E([sx * 0.3, 1.48, 0.45], [0.12, 0.1, 0.18], { ...T, k: 0.1 });                  // мышцы крыла
  }
  // шея: сужающаяся, с подгрудком
  const nb = ['neck0', 'neck1', 'neck2', 'neck3'];
  for (let i = 0; i < 4; i++) {
    const r0 = 0.34 - i * 0.055, r1 = 0.34 - (i + 1) * 0.055;
    C(NECK[i], NECK[i + 1], r0, Math.max(0.13, r1), { bone: nb[i], k: 0.1, sq: 0.85, tag: i < 2 ? 'neck' : 'neckU' });
    C([0, NECK[i][1] - r0 * 0.55, NECK[i][2] + 0.04], [0, NECK[i + 1][1] - r1 * 0.55, NECK[i + 1][2] + 0.04], r0 * 0.55, r1 * 0.55, { bone: nb[i], k: 0.08, tag: 'throat' });
  }
  // голова: длинная клиновидная, надбровные гребни, ноздри
  const H = { bone: 'head' };
  E([0, 2.3, 1.78], [0.17, 0.15, 0.22], { ...H, k: 0.07, tag: 'head' });
  C([0, 2.28, 1.88], [0, 2.18, 2.3], 0.13, 0.075, { ...H, k: 0.06, sq: 0.8, tag: 'snout' });
  for (const sx of [1, -1]) {
    C([sx * 0.11, 2.38, 1.92], [sx * 0.1, 2.3, 1.68], 0.04, 0.03, { ...H, k: 0.04, tag: 'head' });   // надбровье
    E([sx * 0.06, 2.22, 2.27], [0.03, 0.025, 0.03], { ...H, k: 0.02, tag: 'snout' });               // ноздря
    E([sx * 0.06, 2.225, 2.3], [0.012, 0.014, 0.02], { sub: true, k: 0.01 });
    E([sx * 0.12, 2.335, 1.93], [0.03, 0.02, 0.035], { sub: true, k: 0.015 });                     // глазница
  }
  C([0, 2.16, 1.82], [0, 2.1, 2.24], 0.1, 0.055, { bone: 'jaw', k: 0.05, sq: 0.85, tag: 'jaw' });
  // хвост
  for (let i = 0; i < 5; i++) {
    const r0 = 0.34 - i * 0.065, r1 = 0.34 - (i + 1) * 0.065;
    C(TAIL[i], TAIL[i + 1], Math.max(0.05, r0), Math.max(0.03, r1), { bone: 'tail' + i, k: 0.08, sq: 0.85, tag: 'tail' });
  }
  C(TAIL[5], [0, 0.36, -3.55], 0.04, 0.01, { bone: 'tail5', k: 0.04, tag: 'tail' });
  // лапы: мощные, с когтями
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'L' : 'R';
    C([sx * 0.42, 1.05, 0.62], [sx * 0.5, 0.62, 0.72], 0.2, 0.14, { bone: 'FU' + s, k: 0.1, tag: 'leg' });
    C([sx * 0.5, 0.62, 0.72], [sx * 0.48, 0.2, 0.62], 0.13, 0.08, { bone: 'FF' + s, k: 0.06, tag: 'leg' });
    E([sx * 0.48, 0.12, 0.72], [0.12, 0.08, 0.18], { bone: 'FP' + s, k: 0.05, floor: 0, tag: 'foot' });
    C([sx * 0.45, 0.62, -0.42], [sx * 0.55, 0.68, -0.38], 0.24, 0.16, { bone: 'RU' + s, k: 0.12, tag: 'leg' });
    E([sx * 0.47, 0.82, -0.5], [0.2, 0.32, 0.28], { bone: 'RU' + s, k: 0.12, tag: 'leg' });
    C([sx * 0.55, 0.68, -0.38], [sx * 0.5, 0.3, -0.72], 0.14, 0.08, { bone: 'RG' + s, k: 0.06, tag: 'leg' });
    C([sx * 0.5, 0.3, -0.72], [sx * 0.5, 0.12, -0.64], 0.08, 0.07, { bone: 'RC' + s, k: 0.05, tag: 'leg' });
    E([sx * 0.5, 0.1, -0.55], [0.12, 0.08, 0.2], { bone: 'RP' + s, k: 0.05, floor: 0, tag: 'foot' });
  }
  S.prims.sort((a, b) => (a.sub ? 1 : 0) - (b.sub ? 1 : 0));
  S.bounds = [-0.85, -0.01, -3.6, 0.85, 2.55, 2.4];
  return S;
}

let SHAPE = null;
function buildShape() {
  if (SHAPE) return SHAPE;
  const S = anatomy();
  const h = IS_PHONE ? 0.042 : IS_TOUCH ? 0.034 : 0.026;
  const M = S.mesh(h, S.bounds);
  const position = Float32Array.from(M.position), normal = Float32Array.from(M.normal), index = Uint32Array.from(M.index);
  const nv = position.length / 3;
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4), ao = new Float32Array(nv), tags = [];
  const p = V(0, 0, 0), n = V(0, 0, 0);
  for (let i = 0; i < nv; i++) {
    p.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    n.set(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    S.focus(p.x, p.y, p.z, 0.25);
    const w = S.weightsAt(p.x, p.y, p.z, 0.05);
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = w.idx[k]; skinWeight[i * 4 + k] = w.wt[k]; }
    let best = 1e9, tag = null;
    for (const pr of S._list || S.prims) { if (pr.sub) continue; const d = Sculpt.dist(pr, p.x, p.y, p.z); if (d < best) { best = d; tag = pr.tag; } }
    tags.push(tag);
    S.focus(p.x, p.y, p.z, 0.5);
    ao[i] = S.ao(p, n);
    S.unfocus();
  }
  SHAPE = { S, position, normal, index, skinIndex, skinWeight, ao, tags, nv };
  return SHAPE;
}

// Чешуя: ячейки Вороного на поверхности (в координатах позы привязки), каждая — выпуклая
// пластинка с тёмным швом; размер ячеек задаёт атрибут aScale; на брюхе — поперечные щитки
const SCALE_GLSL = `
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec3 voro(vec2 x){
  vec2 n = floor(x), f = fract(x); float md = 8.0, md2 = 8.0; vec2 mr;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)); vec2 o = hash2(n + g);
    vec2 r = g + o * 0.85 - f; float d = dot(r, r);
    if (d < md) { md2 = md; md = d; mr = r; } else if (d < md2) md2 = d;
  }
  return vec3(sqrt(md), sqrt(md2) - sqrt(md), hash2(n + floor(mr + f + 0.5)).x);
}`;
const matCache = new Map();
export function scaleMaterial(glow, solid = null) {
  const key = 'scale' + glow + (solid || '');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(solid ? { color: solid, roughness: 0.5, metalness: 0.05 } : { vertexColors: true, roughness: 0.45, metalness: 0.1 });
  const gc = new THREE.Color(glow || '#000000');
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { value: gc };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aScale; attribute float aBelly; varying vec3 vBP; varying vec3 vBN; varying float vSc; varying float vBelly;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP = position; vBN = normal; vSc = aScale; vBelly = aBelly;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlow; varying vec3 vBP; varying vec3 vBN; varying float vSc; varying float vBelly; float gScH; float gSeam;\n' + SCALE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 an = abs(normalize(vBN)); an = pow(an, vec3(4.0)); an /= (an.x + an.y + an.z);
        float sc = 1.0 / max(0.01, vSc);
        vec3 vx = voro(vBP.zy * sc), vy = voro(vBP.xz * sc), vz = voro(vBP.xy * sc);
        float d1 = vx.x * an.x + vy.x * an.y + vz.x * an.z;
        float edge = vx.y * an.x + vy.y * an.y + vz.y * an.z;
        float rid = vx.z * an.x + vy.z * an.y + vz.z * an.z;
        // щитки брюха: поперечные полосы вдоль тела
        float plate = fract(vBP.z * 7.0 + vBP.y * 2.0);
        float plateEdge = smoothstep(0.0, 0.12, plate) * smoothstep(1.0, 0.85, plate);
        gSeam = mix(smoothstep(0.08, 0.0, edge), 1.0 - plateEdge, vBelly);
        gScH = mix((1.0 - d1) * smoothstep(0.0, 0.12, edge), plateEdge * (1.0 - plate * 0.4), vBelly);
        diffuseColor.rgb *= mix(0.93, 1.06, rid) * (1.0 - gSeam * 0.32) * mix(0.88, 1.04, gScH);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // рельеф чешуек (перенос градиента высоты на нормаль)
          vec2 dH = vec2(dFdx(gScH), dFdy(gScH)) * 0.9;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlow * gSeam * vBelly * 0.6;`);
  };
  m.customProgramCacheKey = () => 'dragonscale';
  matCache.set(key, m);
  return m;
}

// Перепонка крыла: «пальцы» веером, между ними провисающие лоскуты с фестонами
function wingGeometry() {
  const fingers = [[2.9, 0.75], [2.7, -0.15], [2.1, -0.95], [1.2, -1.45]];
  const pos = [], uv = [], idx = [];
  const root = [0, 0], elbow = [1.0, 0.2];
  const pts = [root, elbow, ...fingers.map(f => f)];
  void pts;
  // веер треугольников от «запястья» (elbow) между соседними пальцами + переход к телу
  const ring = [[0.15, 0.0], ...fingers, [0.0, -1.2]];
  const C = elbow;
  let base = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    const N = 10;
    // дуга кромки между пальцами провисает к запястью (фестон)
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const ex = a[0] + (b[0] - a[0]) * t, ez = a[1] + (b[1] - a[1]) * t;
      const sag = Math.sin(Math.PI * t) * (i === 0 ? 0.0 : 0.32);
      const dx = C[0] - ex, dz = C[1] - ez, dl = Math.hypot(dx, dz) || 1;
      pos.push(ex + dx / dl * sag, 0, ez + dz / dl * sag);
      uv.push(t, 1);
    }
    pos.push(C[0], 0, C[1]); uv.push(0.5, 0);
    const cIdx = base + N + 1;
    for (let k = 0; k < N; k++) idx.push(base + k, base + k + 1, cIdx);
    base += N + 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { g, fingers, elbow };
}
function membraneMat(color, glow) {
  const k = 'memb' + color + glow;
  if (matCache.has(k)) return matCache.get(k);
  // прожилки на перепонке
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(60,30,25,0.55)';
  for (let i = 0; i < 40; i++) {
    x.lineWidth = 0.6 + Math.random() * 1.2;
    x.beginPath(); let px = Math.random() * 256, py = 256;
    x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (Math.random() - 0.5) * 30; py -= 32; x.lineTo(px, py); }
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.7, side: THREE.DoubleSide, emissive: glow || '#000000', emissiveIntensity: 0.12, transparent: true, opacity: 0.94 });
  matCache.set(k, m);
  return m;
}

export class DragonQ extends Creature {
  constructor(def) {
    super();
    this.kind = 'dragon';
    this.def = def;
    const shape = buildShape();
    const S = shape.S;
    const bones = S.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
    S.bones.forEach((b, i) => {
      const parent = b.parent ? S.bones[S.boneIdx.get(b.parent)] : null;
      bones[i].position.copy(b.pos).sub(parent ? parent.pos : V(0, 0, 0));
      if (parent) bones[S.boneIdx.get(b.parent)].add(bones[i]); else this.body.add(bones[i]);
    });
    const B = (n) => bones[S.boneIdx.get(n)];
    const skeleton = new THREE.Skeleton(bones);
    this.root.updateMatrixWorld(true);
    // окраска: тёмная спина, светлое брюхо, тёмные концы
    const c1 = new THREE.Color(def.fur || '#8a2010'), c2 = new THREE.Color(def.fur2 || '#ffa030');
    const belly = c1.clone().lerp(c2, 0.55);
    const dark = c1.clone().multiplyScalar(0.35);
    const nv = shape.nv, col = new Float32Array(nv * 3), aScale = new Float32Array(nv), aBelly = new Float32Array(nv);
    const c = new THREE.Color();
    for (let i = 0; i < nv; i++) {
      const y = shape.position[i * 3 + 1], ny = shape.normal[i * 3 + 1], tag = shape.tags[i];
      c.copy(c1);
      const under = sst(-0.1, -0.6, ny) * (tag === 'leg' || tag === 'foot' ? 0.3 : 1);
      c.lerp(belly, under);
      c.lerp(dark, sst(0.5, 0.95, ny) * 0.5);
      if (tag === 'foot') c.lerp(dark, 0.6);
      if (tag === 'snout' || tag === 'head') c.lerp(dark, sst(0.3, 0.9, ny) * 0.3);
      const a = 0.45 + 0.55 * shape.ao[i];
      col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a;
      aScale[i] = tag === 'body' ? 0.11 : tag === 'neck' || tag === 'tail' ? 0.085 : tag === 'leg' ? 0.065 : 0.045;
      aBelly[i] = (tag === 'belly' || tag === 'throat') ? sst(-0.2, -0.6, ny) : sst(-0.45, -0.8, ny) * (tag === 'tail' ? 1 : 0);
      void y;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(shape.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(shape.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aScale', new THREE.BufferAttribute(aScale, 1));
    g.setAttribute('aBelly', new THREE.BufferAttribute(aBelly, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(shape.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(shape.skinWeight, 4));
    g.setIndex(new THREE.BufferAttribute(shape.index, 1));
    g.computeBoundingSphere();
    const body = new THREE.SkinnedMesh(g, scaleMaterial(def.fur2));
    body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
    this.body.add(body); body.bind(skeleton);
    this.meshes.push(body);
    const hornM = new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 0.5 });
    const toothM = new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.35 });
    const at = (bn, p) => V(...p).sub(S.bones[S.boneIdx.get(bn)].pos);
    // рога: изогнутые назад
    for (const sx of [1, -1]) {
      for (const [len, off, rr] of [[0.75, 0, 0.065], [0.42, 0.12, 0.04]]) {
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(sx * 0.06, 0.12, -0.2 * len), V(sx * 0.12, 0.18, -0.55 * len), V(sx * 0.1, 0.12 - len * 0.1, -0.95 * len)]);
        const tg = new THREE.TubeGeometry(curve, 16, rr, 8);
        const pa = tg.attributes.position;
        // сужение к кончику
        for (let i = 0; i < pa.count; i++) { const t = Math.floor(i / 9) / 16; const cc = curve.getPoint(t); const k = 1 - t * 0.9; pa.setXYZ(i, cc.x + (pa.getX(i) - cc.x) * k, cc.y + (pa.getY(i) - cc.y) * k, cc.z + (pa.getZ(i) - cc.z) * k); }
        tg.computeVertexNormals();
        const hm = new THREE.Mesh(tg, hornM);
        hm.position.copy(at('head', [sx * (0.1 + off * 0.3), 2.42 - off, 1.72 - off * 0.3]));
        B('head').add(hm); hm.castShadow = true;
      }
    }
    // гребень шипов: шея, спина, хвост
    const spines = [];
    const addSpine = (bn, p, h, tilt) => { const sp = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h, 5), hornM); sp.position.copy(at(bn, p)); sp.rotation.x = -tilt; sp.scale.z = 0.4; B(bn).add(sp); spines.push(sp); };
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const t = k / 3, a = NECK[i], b = NECK[i + 1];
      const r = 0.34 - (i + t) * 0.055;
      addSpine('neck' + i, [0, a[1] + (b[1] - a[1]) * t + r * 0.95, a[2] + (b[2] - a[2]) * t - 0.03], 0.16 - i * 0.02, 0.9);
    }
    for (let k = 0; k < 7; k++) addSpine('torso', [0, 1.62 - Math.abs(k - 2) * 0.03, 0.75 - k * 0.24], 0.24, 0.7);
    for (let i = 0; i < 5; i++) for (let k = 0; k < 2; k++) {
      const t = k / 2, a = TAIL[i], b = TAIL[i + 1];
      const r = 0.34 - (i + t) * 0.065;
      addSpine('tail' + i, [0, a[1] + (b[1] - a[1]) * t + Math.max(0.05, r) * 0.95, a[2] + (b[2] - a[2]) * t], 0.2 - i * 0.03, 1.1);
    }
    // зубы и когти
    for (const sx of [1, -1]) for (let k = 0; k < 6; k++) {
      const z = 1.9 + k * 0.065;
      const up = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06 - k * 0.004, 5), toothM);
      up.position.copy(at('head', [sx * (0.085 - k * 0.006), 2.17, z])); up.rotation.x = Math.PI; B('head').add(up);
      const lo = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05 - k * 0.004, 5), toothM);
      lo.position.copy(at('jaw', [sx * (0.075 - k * 0.006), 2.13, z - 0.02])); B('jaw').add(lo);
    }
    for (const [bn, p] of [['FPL', [0.48, 0.05, 0.86]], ['FPR', [-0.48, 0.05, 0.86]], ['RPL', [0.5, 0.05, -0.36]], ['RPR', [-0.5, 0.05, -0.36]]]) {
      for (let t = -1; t <= 1; t++) {
        const cl = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.13, 5), hornM);
        cl.position.copy(at(bn, [p[0] + t * 0.07, p[1], p[2]])); cl.rotation.x = Math.PI / 2 + 0.4; B(bn).add(cl);
      }
    }
    // глаза
    const ec = def.eye || '#ffd040';
    for (const sx of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshStandardMaterial({ color: ec, emissive: ec, emissiveIntensity: 2.5 }));
      e.position.copy(at('head', [sx * 0.118, 2.335, 1.935])); e.scale.set(0.7, 0.8, 1.1); B('head').add(e);
    }
    // крылья
    const W = wingGeometry();
    const memb = membraneMat(c1.clone().multiplyScalar(0.7), def.fur2);
    this.wings = [];
    for (const sx of [1, -1]) {
      const shoulder = new THREE.Object3D();
      shoulder.position.copy(at('torso', [sx * 0.32, 1.52, 0.5]));
      B('torso').add(shoulder);
      const wg = W.g.clone();
      if (sx < 0) { wg.scale(-1, 1, 1); wg.index.array.reverse(); wg.computeVertexNormals(); }
      const mesh = new THREE.Mesh(wg, memb);
      mesh.castShadow = true;
      shoulder.add(mesh);
      // кости крыла: плечо → «запястье» → пальцы
      const boneMesh = (a, b, r0, r1) => {
        const d = V(b[0] - a[0], 0, b[1] - a[1]); const L = d.length();
        const cg = new THREE.CylinderGeometry(r1, r0, L, 7); cg.translate(0, L / 2, 0);
        const m = new THREE.Mesh(cg, body.material === null ? hornM : new THREE.MeshStandardMaterial({ color: c1.clone().multiplyScalar(0.6), roughness: 0.5 }));
        m.position.set(sx * a[0], 0.02, a[1]);
        m.quaternion.setFromUnitVectors(V(0, 1, 0), V(sx * d.x, 0, d.z).normalize());
        shoulder.add(m); m.castShadow = true;
      };
      boneMesh([0, 0], W.elbow, 0.07, 0.05);
      for (const f of W.fingers) boneMesh(W.elbow, f, 0.04, 0.012);
      this.wings.push({ w: shoulder, sx });
    }
    // привязки для походки
    this.torso = B('torso');
    this.restTorsoY = this.torso.position.y;
    this.bodyH = this.restTorsoY;
    this.head = B('head');
    this.jaw = B('jaw');
    this.neck4 = [B('neck0'), B('neck1'), B('neck2'), B('neck3')];
    this.neckSeg = [B('neck0'), B('neck1')];
    this.tail6 = [0, 1, 2, 3, 4, 5].map(i => B('tail' + i));
    this.tailSeg = this.tail6.slice(0, 4);
    this.ears = [B('earL'), B('earR')];
    this.legs = [];
    for (const [nm, front, sx] of [['L', true, 1], ['R', true, -1], ['L', false, 1], ['R', false, -1]]) {
      const pre = front ? 'F' : 'R';
      const L = { front, sx, up: B(pre + 'U' + nm), mid: B(pre + (front ? 'F' : 'G') + nm), can: B(pre + 'C' + nm), pas: B(pre + 'P' + nm) };
      L.top = L.up; L.low = L.can; L.foot = L.pas;
      L.id = (sx > 0 ? 'L' : 'R') + (front ? 'F' : 'H');
      const pb = S.bones[S.boneIdx.get(L.pas.name)].pos;
      L.sole = V(0, -pb.y, 0.1); L.toe = V(0, -pb.y, 0.18);
      this.legs.push(L);
    }
    this.gaitScale = 1.2;
    this.freqMul = 0.85;
    this.height = 2.45;
    this.gaitW = [1, 0, 0, 0];
    this.groundOff = 0;
    this.idle = { tail: 0, tailT: 99, earT: [99, 99], ear: [0, 0], shake: 0, shakeT: 99, rest: 0 };
    this._hoof = V(0, 0, 0);
    this._inv = new THREE.Matrix4();
    this.mouthLight = { intensity: 0 };
    this.isQuad = true;
  }

  legPose(L, ph, duty, A, G, out) { return Horse.prototype.legPose.call(this, L, ph, duty, A, G, out); }

  update(dt, st = {}) {
    const act = this.action, at = this.actionT;
    this.action = null;
    Horse.prototype.update.call(this, dt, st);
    this.action = act;
    if (this.action) { this.actionT = at + dt / this.actionDur; if (this.actionT >= 1) this.action = null; }
    const t = this.time;
    // шея — изгиб лебедя, мягкое покачивание
    const moving = 1 - this.gaitW[0];
    this.neck4.forEach((s, i) => {
      s.rotation.x = [0.05, 0.08, -0.05, -0.12][i] + Math.sin(t * 1.1 + i * 0.6) * 0.03;
      s.rotation.y = Math.sin(t * 0.6 + i * 0.4) * 0.05 * (1 - moving * 0.5);
    });
    // хвост волной
    this.tail6.forEach((s, i) => { s.rotation.y = Math.sin(t * (1.5 + moving * 2) - i * 0.7) * (0.08 + i * 0.02); s.rotation.x = 0.04; });
    // крылья: сложены, при беге приподняты, при атаке — раскрыты
    let open = 0.15 + moving * 0.15;
    let jaw = Math.max(0, Math.sin(t * 0.9)) * 0.06, headX = 0;
    if (this.action) {
      const s = this.strike();
      headX = s * 0.35; jaw = Math.max(0, s) * 0.6;
      open = Math.max(open, Math.abs(s) * 0.9);
      if (this.action === 'cast2' || this.action === 'breath') { headX = 0.25; jaw = 0.75; open = 0.9; }
    }
    if (st.breathing) { headX = 0.3; jaw = 0.8; open = 1; }
    const flap = st.flying ? Math.sin(t * 6) * 0.9 : Math.sin(t * 1.4) * 0.05 * (1 - open);
    // сложенное крыло лежит вдоль тела концом назад и чуть вверх, размах «складывается»
    for (const Wg of this.wings) {
      Wg.w.rotation.set(0, 0, 0);
      Wg.w.rotation.y = Wg.sx * (1.3 - open * 1.15);
      Wg.w.rotation.z = Wg.sx * (0.55 - open * 0.25 + flap);
      Wg.w.scale.set(0.5 + 0.5 * open, 1, 0.75 + 0.25 * open);
    }
    this.neck4[3].rotation.x += headX;
    this.jaw.rotation.x = jaw;
    this.mouthLight.intensity = st.breathing ? 25 : 0;
  }
}
