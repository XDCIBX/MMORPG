// Городские фонтаны: у каждого города свой, вода — шейдерная (рябь от струй,
// отражение неба, блики, падающие струи и водяные завесы).
import * as THREE from 'three';
import { boxUV, M4 } from './builders.js';
import { waterNormal } from '../core/textures.js';

// общие параметры освещения воды (обновляет мир каждый кадр)
export const fountainUniforms = {
  uTime: { value: 0 }, uLight: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) }, uSunColor: { value: new THREE.Color('#fff2dc') },
  uZenith: { value: new THREE.Color('#3a78c8') }, uHorizon: { value: new THREE.Color('#b9cbe0') },
  uNormal: { value: null },
};

// тело вращения по профилю [[r, y], ...] с повторением текстуры
function lathe(profile, seg = 32, uTile = 6, vTile = 2) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uTile, uv.getY(i) * vTile);
  g.computeVertexNormals();
  return g;
}

// Поверхность воды в чаше
function poolMaterial(center, splashes, ringR, tint) {
  const spl = [];
  for (let i = 0; i < 8; i++) spl.push(splashes[i] ? new THREE.Vector3(splashes[i].x, splashes[i].z, splashes[i].s || 1) : new THREE.Vector3(0, 0, 0));
  const m = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uCenter: { value: new THREE.Vector2(center.x, center.z) }, uSpl: { value: spl }, uRing: { value: new THREE.Vector2(ringR[0] || 0, ringR[1] || 0) },
      uTint: { value: new THREE.Color(tint) },
    }, fountainUniforms, THREE.UniformsLib.fog),
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uLight; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon;
      uniform sampler2D uNormal; uniform vec2 uCenter; uniform vec3 uSpl[8]; uniform vec2 uRing; uniform vec3 uTint;
      varying vec3 vW;
      #include <fog_pars_fragment>
      // высота воды: кольца от центра, от мест падения струй и от водяной завесы
      float H(vec2 p) {
        float r = length(p - uCenter);
        float h = sin(r * 7.0 - uTime * 4.0) * 0.012 * exp(-r * 0.25);
        if (uRing.x > 0.0) { float d = abs(r - uRing.x); h += sin(d * 16.0 - uTime * 8.0) * 0.02 * exp(-d * 1.4) * uRing.y; }
        for (int i = 0; i < 8; i++) {
          if (uSpl[i].z <= 0.0) continue;
          float d = length(p - uSpl[i].xy);
          h += sin(d * 15.0 - uTime * 9.0) * 0.022 * exp(-d * 1.5) * uSpl[i].z;
        }
        return h;
      }
      void main(){
        vec2 p = vW.xz;
        float e = 0.03;
        float h0 = H(p), hx = H(p + vec2(e, 0.0)), hz = H(p + vec2(0.0, e));
        vec2 n1 = texture2D(uNormal, p * 0.35 + vec2(uTime * 0.03, uTime * 0.021)).xy * 2.0 - 1.0;
        vec2 n2 = texture2D(uNormal, p * 0.9 - vec2(uTime * 0.05, -uTime * 0.04)).xy * 2.0 - 1.0;
        vec3 N = normalize(vec3(-(hx - h0) / e - (n1.x * 0.12 + n2.x * 0.08), 1.0, -(hz - h0) / e - (n1.y * 0.12 + n2.y * 0.08)));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.4, 0.0, 1.0));
        float sd = max(dot(R, normalize(uSunDir)), 0.0);
        vec3 spec = min(uSunColor * (pow(sd, 300.0) * 1.2 + pow(sd, 40.0) * 0.18), vec3(1.4));
        // толща воды: дно просвечивает, по дну бегут световые блики (каустика)
        float c1 = texture2D(uNormal, p * 0.6 + N.xz * 0.5 + vec2(uTime * 0.04)).r;
        float c2 = texture2D(uNormal, p * 0.83 - N.xz * 0.4 - vec2(uTime * 0.05, 0.0)).g;
        float caust = pow(clamp(1.0 - abs(c1 - c2) * 3.2, 0.0, 1.0), 6.0);
        vec3 body = uTint * (0.55 + caust * 0.9) * uLight;
        vec3 col = mix(body, sky, fres) + spec;
        // пена там, где падает вода
        float foam = 0.0;
        for (int i = 0; i < 8; i++) { if (uSpl[i].z > 0.0) foam += (1.0 - smoothstep(0.1, 0.5, length(p - uSpl[i].xy))) * uSpl[i].z; }
        if (uRing.x > 0.0) foam += (1.0 - smoothstep(0.02, 0.3, abs(length(p - uCenter) - uRing.x))) * uRing.y;
        foam *= 0.55 + 0.45 * texture2D(uNormal, p * 2.2 + vec2(uTime * 0.3, 0.0)).r;
        col = mix(col, vec3(0.92, 0.96, 1.0) * (0.3 + 0.7 * uLight), clamp(foam, 0.0, 0.85));
        gl_FragColor = vec4(col, mix(0.8, 0.96, max(fres, clamp(foam, 0.0, 1.0))));
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  return m;
}

// Падающая вода: струи (вдоль u) и завесы (вдоль v)
function fallMaterial(axis, rep, speed, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uRep: { value: new THREE.Vector2(rep[0], rep[1]) }, uSpeed: { value: speed }, uAlpha: { value: alpha } }, fountainUniforms, THREE.UniformsLib.fog),
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uLight; uniform sampler2D uNormal; uniform vec2 uRep; uniform float uSpeed; uniform float uAlpha; uniform vec3 uHorizon;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_fragment>
      void main(){
        float t = uTime * uSpeed;
        ${axis === 'u'
    ? 'vec2 q = vec2(vUv.y * uRep.x, vUv.x * uRep.y - t); float along = vUv.x;'
    : 'vec2 q = vec2(vUv.x * uRep.x, vUv.y * uRep.y + t); float along = 1.0 - vUv.y;'}
        float n1 = texture2D(uNormal, q).r;
        float n2 = texture2D(uNormal, q * vec2(2.3, 0.55) + vec2(0.37, t * 0.6)).g;
        float streak = smoothstep(0.38, 0.72, n1 * 0.6 + n2 * 0.55);
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float a = (0.28 + 0.6 * streak + rim * 0.25) * uAlpha;
        a *= smoothstep(0.0, 0.06, along) * (1.0 - smoothstep(0.93, 1.0, along) * 0.4);
        vec3 col = mix(mix(vec3(0.45, 0.66, 0.78), uHorizon, 0.4), vec3(1.0), streak * 0.75 + along * 0.2) * (0.22 + 0.78 * uLight);
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
}

// дуга струи: из точки a со скоростью v до высоты воды
function jetPath(a, v, waterY, g = 9.8) {
  const pts = [];
  // время падения до уровня воды
  const disc = v.y * v.y + 2 * g * (a.y - waterY);
  const T = (v.y + Math.sqrt(Math.max(0, disc))) / g;
  for (let i = 0; i <= 14; i++) { const t = T * i / 14; pts.push(new THREE.Vector3(a.x + v.x * t, a.y + v.y * t - 0.5 * g * t * t, a.z + v.z * t)); }
  return pts;
}

const fmats = new Map();
function fountainMats(style, M0) {
  if (fmats.has(style)) return fmats.get(style);
  const dbl = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const r = {
    M: { stone: dbl(M0.stone), wall: dbl(M0.wall), wall2: dbl(M0.wall2), trim: dbl(M0.trim), darkWood: M0.darkWood },
    mats: {
      bronze: std({ color: '#8a6a3a', roughness: 0.4, metalness: 0.85, side: THREE.DoubleSide }),
      gold: std({ color: '#e0b040', roughness: 0.25, metalness: 0.95, side: THREE.DoubleSide }),
      iron: std({ color: '#3a3a40', roughness: 0.45, metalness: 0.85 }),
      clay: std({ color: '#a8603a', roughness: 0.85, side: THREE.DoubleSide }),
      leaf: std({ color: '#3a6a2a', roughness: 0.9 }),
      flowerA: std({ color: '#e04a5a', roughness: 0.7 }), flowerB: std({ color: '#f0d040', roughness: 0.7 }),
      rune: std({ color: '#80d8ff', emissive: '#40b8ff', emissiveIntensity: 2.2, roughness: 0.4 }),
    },
  };
  fmats.set(style, r);
  return r;
}

export function buildFountain(city, B, M0, group, cx, cy, cz, animated, collision) {
  if (!fountainUniforms.uNormal.value) fountainUniforms.uNormal.value = waterNormal();
  const style = city.style;
  const { M, mats } = fountainMats(style, M0);
  const put = (g, m, x, y, z, ry = 0, o) => B.add(g, m, M4(cx + x, cy + y, cz + z, ry), o);
  const splashes = [];
  const emit = [];
  const waters = [];
  const addWater = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(cx + x, cy + y, cz + z); m.renderOrder = 2; group.add(m); waters.push(m); return m; };
  const jetMat = fallMaterial('u', [1.5, 3.0], 2.6, 1.0);
  const sheetMat = fallMaterial('v', [9, 1.6], 1.9, 0.8);
  const jet = (ax, ay, az, vx, vy, vz, wy, r = 0.045, s = 1) => {
    const pts = jetPath(new THREE.Vector3(ax, ay, az), new THREE.Vector3(vx, vy, vz), wy);
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, r, 7);
    // струя расширяется к концу
    const p = tube.attributes.position, c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const seg = Math.floor(i / 8), t = seg / 18;
      const cp = pts[Math.min(14, Math.round(t * 14))];
      c.set(p.getX(i), p.getY(i), p.getZ(i)).sub(cp).multiplyScalar(0.7 + t * 0.9).add(cp);
      p.setXYZ(i, c.x, c.y, c.z);
    }
    addWater(tube, jetMat, 0, 0, 0);
    const e = pts[pts.length - 1];
    splashes.push({ x: cx + e.x, z: cz + e.z, s });
    emit.push({ x: cx + e.x, y: cy + wy + 0.05, z: cz + e.z, p: 1 });
  };
  const sheet = (r, yTop, yBot, flare = 0.08) => {
    const g = new THREE.CylinderGeometry(r, r + flare, yTop - yBot, 40, 4, true);
    addWater(g, sheetMat, 0, (yTop + yBot) / 2, 0);
  };
  let R, waterY, tint, ring = [0, 0];

  if (style === 'timber') {
    // Светлолесье: круглая каменная чаша, две чаши на колонне, дуги струй
    R = 4.2; waterY = 0.74; tint = '#2c6f7c';
    put(lathe([[0, 0.22], [3.75, 0.22], [3.8, 0.8], [3.92, 0.9], [4.25, 0.9], [4.34, 0.8], [4.36, 0.12], [4.55, 0.0]], 40, 8, 2), M.stone, 0, 0, 0);
    put(lathe([[0.55, 0.2], [0.62, 0.5], [0.34, 0.75], [0.3, 1.9], [0.42, 2.02], [0.2, 2.1]], 16, 2, 3), M.wall, 0, 0, 0);
    // нижняя чаша
    put(lathe([[0.2, 1.95], [1.2, 2.05], [1.7, 2.32], [1.78, 2.34], [1.74, 2.22], [1.2, 1.92], [0.3, 1.8]], 28, 4, 1), M.stone, 0, 0, 0);
    put(lathe([[0.26, 2.05], [0.2, 2.9], [0.3, 3.0], [0.16, 3.06]], 12, 1, 2), M.wall, 0, 0, 0);
    // верхняя чаша
    put(lathe([[0.14, 3.0], [0.6, 3.06], [0.86, 3.24], [0.92, 3.25], [0.88, 3.16], [0.6, 2.98], [0.2, 2.9]], 22, 3, 1), M.stone, 0, 0, 0);
    put(lathe([[0.12, 3.1], [0.1, 3.5], [0.2, 3.62], [0.06, 3.78], [0.001, 3.8]], 10, 1, 1), mats.bronze, 0, 0, 0);
    addWater(new THREE.CircleGeometry(1.66, 28).rotateX(-Math.PI / 2), poolMaterial({ x: cx, z: cz }, [], [0.86, 0.9], tint), 0, 2.27, 0);
    addWater(new THREE.CircleGeometry(0.84, 20).rotateX(-Math.PI / 2), poolMaterial({ x: cx, z: cz }, [], [0, 0], tint), 0, 3.2, 0);
    sheet(0.9, 3.22, 2.28, 0.03);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3;
      put(boxUV(0.14, 0.12, 0.3, 1), mats.bronze, Math.cos(a) * 1.78, 2.3, Math.sin(a) * 1.78, -a + Math.PI / 2);
      jet(Math.cos(a) * 1.9, 2.3, Math.sin(a) * 1.9, Math.cos(a) * 1.25, 1.4, Math.sin(a) * 1.25, waterY, 0.04, 1);
    }
    emit.push({ x: cx, y: cy + 3.85, z: cz, p: 0.6, up: 1.6 });
    // цветочные горшки на бортике
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.8;
      put(lathe([[0.16, 0], [0.24, 0.3], [0.27, 0.32], [0.001, 0.3]], 10, 1, 1), mats.clay, Math.cos(a) * 4.08, 0.9, Math.sin(a) * 4.08);
      for (let k = 0; k < 5; k++) put(new THREE.SphereGeometry(0.09, 6, 5), k % 2 ? mats.flowerA : mats.flowerB, Math.cos(a) * 4.08 + Math.cos(k * 1.3) * 0.13, 1.3 + (k % 2) * 0.05, Math.sin(a) * 4.08 + Math.sin(k * 1.3) * 0.13, 0, { noShadow: true });
      put(new THREE.SphereGeometry(0.22, 8, 6), mats.leaf, Math.cos(a) * 4.08, 1.2, Math.sin(a) * 4.08, 0, { noShadow: true });
    }
  } else if (style === 'stone') {
    // Каменград: восьмигранная чаша, рунный столп с наковальней, четыре мощные струи из ликов
    R = 4.6; waterY = 0.92; tint = '#235a66';
    put(lathe([[0, 0.3], [4.0, 0.3], [4.05, 1.0], [4.2, 1.12], [4.7, 1.12], [4.8, 1.0], [4.85, 0.16], [5.1, 0.0]], 8, 8, 2), M.stone, 0, 0, 0, Math.PI / 8);
    for (let i = 0; i < 8; i++) { // угловые тумбы
      const a = i / 8 * Math.PI * 2;
      put(boxUV(0.7, 1.5, 0.7, 1), M.trim, Math.cos(a) * 4.5, 0.75, Math.sin(a) * 4.5, -a);
      put(new THREE.OctahedronGeometry(0.2), mats.rune, Math.cos(a) * 4.5, 1.72, Math.sin(a) * 4.5, 0, { noShadow: true });
    }
    put(boxUV(2.0, 0.9, 2.0, 1.5), M.stone, 0, 0.65, 0);
    put(boxUV(1.5, 2.6, 1.5, 1.5), M.wall, 0, 2.3, 0);
    put(boxUV(1.9, 0.3, 1.9, 1.5), M.trim, 0, 3.7, 0);
    // руны на гранях столпа
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      put(new THREE.BoxGeometry(0.1, 1.0, 0.04), mats.rune, Math.cos(a) * 0.77, 3.0, Math.sin(a) * 0.77, -a + Math.PI / 2, { noShadow: true });
      put(new THREE.BoxGeometry(0.34, 0.08, 0.04), mats.rune, Math.cos(a) * 0.77, 3.3, Math.sin(a) * 0.77, -a + Math.PI / 2, { noShadow: true });
      // каменный лик с жёлобом
      put(boxUV(0.7, 0.6, 0.4, 1), M.stone, Math.cos(a) * 0.9, 1.95, Math.sin(a) * 0.9, -a + Math.PI / 2);
      put(boxUV(0.3, 0.14, 0.5, 1), mats.bronze, Math.cos(a) * 1.2, 1.82, Math.sin(a) * 1.2, -a + Math.PI / 2);
      jet(Math.cos(a) * 1.42, 1.86, Math.sin(a) * 1.42, Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5, waterY, 0.085, 1.5);
    }
    // наковальня и молот наверху
    put(boxUV(0.7, 0.5, 0.5, 1), mats.iron, 0, 4.1, 0);
    put(boxUV(1.4, 0.32, 0.6, 1), mats.iron, 0, 4.5, 0);
    put(new THREE.ConeGeometry(0.2, 0.6, 6).rotateZ(-Math.PI / 2), mats.iron, 1.0, 4.5, 0);
    put(boxUV(0.12, 1.3, 0.12, 1), M.darkWood, -0.2, 5.2, 0.05, 0);
    put(boxUV(0.6, 0.36, 0.36, 1), mats.iron, -0.2, 5.8, 0.05);
  } else {
    // Аврелион: парадный трёхъярусный фонтан из мрамора с золотым солнцем и завесами воды
    R = 5.4; waterY = 0.86; tint = '#2f8a9a'; ring = [2.5, 1.0];
    put(lathe([[0, 0.25], [4.85, 0.25], [4.9, 0.9], [5.05, 1.02], [5.45, 1.02], [5.56, 0.9], [5.6, 0.14], [5.85, 0.0]], 48, 10, 2), M.wall, 0, 0, 0);
    put(new THREE.TorusGeometry(5.25, 0.07, 6, 48).rotateX(Math.PI / 2), mats.gold, 0, 1.06, 0);
    put(lathe([[0.9, 0.2], [0.95, 0.5], [0.5, 0.8], [0.42, 1.7], [0.6, 1.85], [0.3, 1.95]], 20, 2, 3), M.wall2, 0, 0, 0);
    put(lathe([[0.3, 1.8], [1.6, 1.86], [2.4, 2.12], [2.5, 2.14], [2.46, 2.0], [1.6, 1.7], [0.4, 1.6]], 40, 5, 1), M.wall, 0, 0, 0);
    put(new THREE.TorusGeometry(2.47, 0.045, 6, 40).rotateX(Math.PI / 2), mats.gold, 0, 2.15, 0);
    put(lathe([[0.36, 1.9], [0.3, 3.0], [0.42, 3.1], [0.22, 3.18]], 14, 1, 2), M.wall2, 0, 0, 0);
    put(lathe([[0.2, 3.06], [1.0, 3.12], [1.44, 3.3], [1.52, 3.31], [1.48, 3.2], [1.0, 3.02], [0.3, 2.94]], 32, 4, 1), M.wall, 0, 0, 0);
    put(lathe([[0.24, 3.14], [0.2, 4.1], [0.3, 4.2], [0.14, 4.26]], 12, 1, 2), M.wall2, 0, 0, 0);
    put(lathe([[0.12, 4.16], [0.5, 4.2], [0.74, 4.34], [0.8, 4.35], [0.76, 4.26], [0.5, 4.12], [0.2, 4.04]], 24, 3, 1), M.wall, 0, 0, 0);
    // золотое солнце
    put(lathe([[0.1, 4.2], [0.08, 4.75]], 8, 1, 1), mats.gold, 0, 0, 0);
    put(new THREE.SphereGeometry(0.3, 16, 12), mats.gold, 0, 5.0, 0);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const ray = new THREE.ConeGeometry(0.06, i % 2 ? 0.34 : 0.5, 5);
      ray.translate(0, 0.5, 0); ray.rotateZ(a);
      put(ray, mats.gold, 0, 5.0, 0);
    }
    addWater(new THREE.CircleGeometry(2.4, 40).rotateX(-Math.PI / 2), poolMaterial({ x: cx, z: cz }, [], [1.5, 0.9], tint), 0, 2.08, 0);
    addWater(new THREE.CircleGeometry(1.44, 32).rotateX(-Math.PI / 2), poolMaterial({ x: cx, z: cz }, [], [0.78, 0.8], tint), 0, 3.26, 0);
    addWater(new THREE.CircleGeometry(0.74, 20).rotateX(-Math.PI / 2), poolMaterial({ x: cx, z: cz }, [], [0, 0], tint), 0, 4.31, 0);
    sheet(0.79, 4.33, 3.27, 0.02);
    sheet(1.51, 3.29, 2.09, 0.03);
    sheet(2.49, 2.12, waterY, 0.06);
    // золотые львиные маски на бортике — дуги струй к центру
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.2;
      put(boxUV(0.34, 0.34, 0.3, 1), mats.gold, Math.cos(a) * 5.0, 1.2, Math.sin(a) * 5.0, -a + Math.PI / 2);
      jet(Math.cos(a) * 4.82, 1.25, Math.sin(a) * 4.82, -Math.cos(a) * 1.55, 2.3, -Math.sin(a) * 1.55, waterY, 0.035, 0.9);
    }
    emit.push({ x: cx, y: cy + 5.4, z: cz, p: 0.5, up: 1.2 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; emit.push({ x: cx + Math.cos(a) * 2.55, y: cy + waterY + 0.05, z: cz + Math.sin(a) * 2.55, p: 0.8 }); }
  }
  // вода в основной чаше
  const pool = addWater(new THREE.CircleGeometry(R - 0.42, style === 'stone' ? 8 : 48).rotateX(-Math.PI / 2), poolMaterial({ x: cx, z: cz }, splashes, ring, tint), 0, waterY, 0);
  if (style === 'stone') pool.rotation.y = Math.PI / 8;
  pool.renderOrder = 1;
  animated.push({ type: 'fountain', x: cx, y: cy + 1, z: cz, emit });
  collision.addCircle(cx, cz, R + 0.25);
  return { R };
}
