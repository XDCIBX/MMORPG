// Материалы детальных героев: трипланарный рельеф по позе покоя (не нужны UV),
// запечённое фоновое затенение (атрибут aAO), волосы с прядями.
import * as THREE from 'three';
import { plateTex, chainmailTex, stitchedLeatherTex, cloth as clothTex, furTex } from '../../core/textures.js';

const cache = new Map();

// Карта высот для пор кожи и волос
let poreTex = null, strandTex = null;
function pores() {
  if (poreTex) return poreTex;
  const w = 256, c = document.createElement('canvas'); c.width = c.height = w;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, w);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 9000; i++) {
    const v = 90 + rnd() * 80 | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.beginPath(); ctx.arc(rnd() * w, rnd() * w, 0.6 + rnd() * 1.4, 0, Math.PI * 2); ctx.fill();
  }
  poreTex = new THREE.CanvasTexture(c);
  poreTex.wrapS = poreTex.wrapT = THREE.RepeatWrapping;
  return poreTex;
}
function strands() {
  if (strandTex) return strandTex;
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#707070'; ctx.fillRect(0, 0, W, H);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * W, l = 60 + rnd() * 160 | 0;
    ctx.strokeStyle = `rgba(${l},${l},${l},0.8)`; ctx.lineWidth = 0.6 + rnd() * 1.4;
    const sw = (rnd() - 0.5) * 8;
    for (const ox of [0, W, -W]) { ctx.beginPath(); ctx.moveTo(x + ox, -2); ctx.bezierCurveTo(x + ox + sw, H * 0.3, x + ox - sw, H * 0.7, x + ox + sw * 0.5, H + 2); ctx.stroke(); }
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
  strandTex.colorSpace = THREE.SRGBColorSpace;
  return strandTex;
}

// Роспись лица по координатам головы (как в генераторе): губы, брови, тени, румянец,
// тень у линии волос и бороды, щетина.
const FACE_GLSL = `
uniform vec3 uFaceC; uniform float uFaceK; uniform vec3 uLip; uniform vec3 uBrow; uniform vec4 uFF;
float hairlineY(float th, float shortCut) {
  float a = abs(th);
  float y0 = shortCut > 0.5 ? 0.06 : 0.058;
  float y1 = shortCut > 0.5 ? 0.034 : 0.03;
  float y2 = shortCut > 0.5 ? 0.02 : 0.012;
  float y3 = shortCut > 0.5 ? 0.022 : 0.0;
  float y4 = shortCut > 0.5 ? -0.035 : -0.06;
  float y5 = shortCut > 0.5 ? -0.07 : -0.09;
  float y6 = shortCut > 0.5 ? -0.08 : -0.1;
  if (a < 0.55) return mix(y0, y1, smoothstep(0.0, 0.55, a));
  if (a < 1.15) return mix(y1, y2, smoothstep(0.55, 1.15, a));
  if (a < 1.45) return mix(y2, y3, smoothstep(1.15, 1.45, a));
  if (a < 1.9) return mix(y3, y4, smoothstep(1.45, 1.9, a));
  if (a < 2.5) return mix(y4, y5, smoothstep(1.9, 2.5, a));
  return mix(y5, y6, smoothstep(2.5, 3.1416, a));
}
float beardMaskF(vec3 q) {
  float ax = abs(q.x);
  float line = mix(-0.068, -0.012, smoothstep(0.024, 0.068, ax));
  float md = max(max(q.y - line, 0.004 - q.z), -0.136 - q.y);
  float mouth = length(vec2(q.x / 0.022, (q.y + 0.075) / 0.0105)) - 1.0;
  return max(md, -mouth * 0.012);
}
vec3 facePaint(vec3 c) {
  vec3 q = (vRest - uFaceC) / uFaceK;
  if (length(q * vec3(1.0, 0.8, 1.0)) > 0.17 || q.y < -0.16) return c;
  float F = uFF.x;
  // губы и линия рта
  float dl = length(vec2(q.x / 0.021, (q.y + 0.074) / 0.0155));
  if (q.z > 0.08) c = mix(c, uLip, (1.0 - smoothstep(0.85, 1.05, dl)) * mix(0.55, 0.85, F));
  if (q.z > 0.09) c = mix(c, vec3(0.12, 0.05, 0.05), (1.0 - smoothstep(0.0011, 0.0022, abs(q.y + 0.074))) * (1.0 - smoothstep(0.017, 0.021, abs(q.x))) * 0.6);
  vec3 hc = uBrow * 0.75;
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? 1.0 : -1.0;
    float dx = q.x - sx * 0.03;
    // брови: дуга
    float by = (q.y - 0.022 + dx * dx * 6.0) / mix(0.0048, 0.0032, F);
    float db = length(vec2(dx / 0.022, by));
    float brow = (1.0 - smoothstep(0.65, 1.05, db)) * step(0.07, q.z);
    brow *= 0.9 + 0.1 * sin(q.x * 2600.0 + q.y * 1400.0);
    c = mix(c, hc * 0.9, brow * 0.92);
    // тени у глаз
    float de = length(vec2((q.x - sx * 0.031) / 0.02, (q.y + 0.002) / 0.015));
    if (q.z > 0.06) c = mix(c, c * vec3(0.72, 0.62, 0.62), (1.0 - smoothstep(0.6, 1.25, de)) * 0.4);
    // румянец
    float dc = length(vec2((q.x - sx * 0.042) / 0.025, (q.y + 0.04) / 0.02));
    if (q.z > 0.04) c = mix(c, c * vec3(1.08, 0.86, 0.84), (1.0 - smoothstep(0.3, 1.0, dc)) * mix(0.18, 0.35, F));
  }
  // тень у линии роста волос
  if (uFF.w > 0.5) {
    float md = hairlineY(atan(q.x, q.z), uFF.w > 1.5 ? 1.0 : 0.0) - q.y;
    c = mix(c, hc, (1.0 - smoothstep(-0.004, 0.024, md)) * 0.8);
  }
  if (uFF.y > 0.5) c = mix(c, hc, (1.0 - smoothstep(-0.004, 0.022, beardMaskF(q))) * 0.75);
  // щетина
  if (uFF.z > 0.5) {
    float jaw = smoothstep(-0.03, -0.06, q.y) * smoothstep(0.02, 0.05, q.z) * smoothstep(0.7, 1.0, dl);
    c = mix(c, hc + 0.05, jaw * 0.3);
  }
  return c;
}`;

const PERTURB = `
vec3 heroPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`;

// mode: 0 — трипланар, 1 — цилиндр вокруг головы (волосы)
function patch(m, { tex, scale = 4, bump = 0.6, colorMod = 0.25, mode = 0, center = [0, 0, 0], key, face = null }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDet = { value: tex };
    sh.uniforms.uScale = { value: scale };
    sh.uniforms.uBump = { value: bump };
    sh.uniforms.uCM = { value: colorMod };
    sh.uniforms.uCen = { value: new THREE.Vector3(...center) };
    if (face) {
      sh.uniforms.uFaceC = { value: new THREE.Vector3(...face.center) };
      sh.uniforms.uFaceK = { value: face.hk };
      sh.uniforms.uLip = { value: new THREE.Color(face.lip) };
      sh.uniforms.uBrow = { value: new THREE.Color(face.hair) };
      sh.uniforms.uFF = { value: new THREE.Vector4(face.female ? 1 : 0, face.beard ? 1 : 0, face.stubble ? 1 : 0, face.style) };
    }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; varying float vAO; varying vec3 vRest; varying vec3 vRestN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = aAO; vRest = position; vRestN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDet; uniform float uScale; uniform float uBump; uniform float uCM; uniform vec3 uCen;
        varying float vAO; varying vec3 vRest; varying vec3 vRestN;
        float detH;
        float sampleDet() {
          ${mode === 1 ? `
          vec3 q = vRest - uCen;
          float a = atan(q.x, q.z) / 6.2831853;
          return texture2D(tDet, vec2(a * uScale * 2.0, q.y * uScale * 0.35)).r;` : `
          vec3 bw = pow(abs(vRestN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 tp = vRest * uScale;
          return texture2D(tDet, tp.zy).r * bw.x + texture2D(tDet, tp.xz).r * bw.y + texture2D(tDet, tp.xy).r * bw.z;`}
        }
        ${PERTURB}
        ${face ? FACE_GLSL : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        detH = sampleDet();
        ${face ? 'diffuseColor.rgb = facePaint(diffuseColor.rgb);' : ''}
        diffuseColor.rgb *= mix(1.0 - uCM, 1.0 + uCM * 0.6, detH) * vAO;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = heroPerturb(-vViewPosition, normal, vec2(dFdx(detH), dFdy(detH)) * uBump, faceDirection);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectSpecular *= mix(0.35, 1.0, vAO);`);
  };
  m.customProgramCacheKey = () => 'hero_' + key + mode;
  return m;
}

export function heroMat(kind, color, opts = {}) {
  const k = [kind, color, opts.rough, opts.glow, opts.glowI, opts.center && opts.center.map(v => v.toFixed(3)), opts.face && JSON.stringify(opts.face)].join('|');
  if (cache.has(k)) return cache.get(k);
  let m;
  switch (kind) {
    case 'skin':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, sheen: 0.4, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ff9a80') });
      patch(m, { tex: pores(), scale: 22, bump: 0.25, colorMod: 0.06, key: 'skin' + (opts.face ? 'f' : ''), face: opts.face || null });
      break;
    case 'metal': {
      const pt = plateTex();
      m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.32, metalness: 0.9, envMapIntensity: 1.15 });
      if (opts.glow) { m.emissive = new THREE.Color(opts.glow); m.emissiveIntensity = opts.glowI || 0.15; }
      patch(m, { tex: pt.map, scale: 2.2, bump: 0.35, colorMod: 0.08, key: 'metal' });
      break;
    }
    case 'chain':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.85, envMapIntensity: 1.2 });
      patch(m, { tex: chainmailTex().map, scale: 16, bump: 1.6, colorMod: 0.5, key: 'chain' });
      break;
    case 'leather':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.04 });
      patch(m, { tex: stitchedLeatherTex().map, scale: 4.5, bump: 0.8, colorMod: 0.3, key: 'leather' });
      break;
    case 'cloth':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
      patch(m, { tex: clothTex('#ffffff', 2), scale: 3.5, bump: 0.5, colorMod: 0.22, key: 'cloth' });
      break;
    case 'fur':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      patch(m, { tex: furTex().map, scale: 6, bump: 1.4, colorMod: 0.4, key: 'fur' });
      break;
    case 'hair':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0, sheen: 0.6, sheenRoughness: 0.3, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4) });
      patch(m, { tex: strands(), scale: 9, bump: 0.55, colorMod: 0.35, mode: 1, center: opts.center || [0, 1.7, 0], key: 'hair' });
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 });
      patch(m, { tex: furTex().map, scale: 3.2, bump: 0.6, colorMod: 0.35, key: 'wood' });
      break;
    case 'bone':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
      patch(m, { tex: pores(), scale: 8, bump: 0.5, colorMod: 0.15, key: 'bone' });
      break;
    case 'gem':
      m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.2 });
      patch(m, { tex: pores(), scale: 1, bump: 0, colorMod: 0, key: 'gem' });
      break;
    case 'dark':
      m = new THREE.MeshBasicMaterial({ color });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color });
  }
  cache.set(k, m);
  return m;
}

// Глаз: склера, радужка с прожилками, зрачок, влажный блик
export function eyeMaterial(iris, glow) {
  const k = 'eye|' + iris + glow;
  if (cache.has(k)) return cache.get(k);
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ece6e0'; ctx.fillRect(0, 0, S, S);
  // сфера развёрнута: +Z у SphereGeometry — в точке u = 0.25
  const cx = S * 0.25, cy = S * 0.5, R = S * 0.085;
  const ic = new THREE.Color(iris);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, '#000'); g.addColorStop(0.34, '#000');
  g.addColorStop(0.38, '#' + ic.clone().multiplyScalar(0.55).getHexString());
  g.addColorStop(0.8, '#' + ic.getHexString());
  g.addColorStop(0.94, '#' + ic.clone().multiplyScalar(0.35).getHexString());
  g.addColorStop(1, 'rgba(236,230,224,1)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4); ctx.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); ctx.stroke(); }
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = glow
    ? new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, color: '#ffffff', emissive: iris, emissiveIntensity: 1.6, roughness: 0.1 })
    : new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  cache.set(k, m);
  return m;
}
