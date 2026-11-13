// Набор выразительных эффектов для умений: росчерки клинка, магические круги по
// школам, ветвящиеся молнии, воронки, столбы пламени, град стрел, сбор энергии.
// Методы добавляются к классу Effects.
import * as THREE from 'three';
import { Effects, NOISE_GLSL, energyMat } from './effects.js';
import { FX } from './particles.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = Math.random;
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const easeOut = (k) => 1 - Math.pow(1 - k, 3);

// ---------- Магические круги: у каждой школы свой рисунок ----------
const circleCache = new Map();
function circleTex(school, layer) {
  const key = school + layer;
  if (circleCache.has(key)) return circleCache.get(key);
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.translate(S / 2, S / 2);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  x.shadowColor = '#fff'; x.shadowBlur = 8;
  const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); };
  const star = (n, step, r, w, rot = 0) => { x.lineWidth = w; x.beginPath(); for (let i = 0; i <= n; i++) { const a = rot + i * step * Math.PI * 2 / n - Math.PI / 2; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); };
  let seed = school.length * 977 + layer * 131 + school.charCodeAt(0) * 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const glyphs = (r, n, sz) => { x.lineWidth = 4; for (let i = 0; i < n; i++) { x.save(); x.rotate(i / n * Math.PI * 2); x.translate(0, -r); x.beginPath(); let px = (rnd() - 0.5) * sz, py = -sz / 2; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px = (rnd() - 0.5) * sz; py += sz / 3.2; x.lineTo(px, py); } x.stroke(); x.restore(); } };
  if (layer === 0) {
    // внешний слой: двойное кольцо, насечки, знаки
    ring(244, 6); ring(214, 2.5); ring(176, 2);
    x.lineWidth = 2.5;
    const nt = school === 'earth' ? 16 : school === 'frost' ? 24 : school === 'storm' ? 18 : 36;
    for (let i = 0; i < nt; i++) { x.save(); x.rotate(i / nt * Math.PI * 2); x.beginPath(); x.moveTo(0, -214); x.lineTo(0, -(i % 3 ? 226 : 240)); x.stroke(); x.restore(); }
    glyphs(195, school === 'earth' ? 8 : school === 'death' ? 13 : 12, 26);
  } else {
    ring(150, 3);
    if (school === 'fire') { star(4, 1, 150, 4); star(4, 1, 150, 4, Math.PI / 4); for (let i = 0; i < 8; i++) { x.save(); x.rotate(i * Math.PI / 4); x.beginPath(); x.moveTo(-14, -100); x.quadraticCurveTo(-2, -128, 0, -148); x.quadraticCurveTo(4, -124, 14, -100); x.fill(); x.restore(); } ring(60, 3); }
    else if (school === 'frost') { star(6, 2, 150, 3.5); star(6, 2, 150, 3.5, Math.PI / 6); x.lineWidth = 4; for (let i = 0; i < 6; i++) { x.save(); x.rotate(i * Math.PI / 3); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -120); x.moveTo(0, -70); x.lineTo(-22, -92); x.moveTo(0, -70); x.lineTo(22, -92); x.moveTo(0, -36); x.lineTo(-14, -50); x.moveTo(0, -36); x.lineTo(14, -50); x.stroke(); x.restore(); } }
    else if (school === 'holy') { x.lineWidth = 3; for (let i = 0; i < 16; i++) { x.save(); x.rotate(i * Math.PI / 8); x.beginPath(); x.moveTo(0, -62); x.lineTo(i % 2 ? -5 : -9, -100); x.lineTo(0, i % 2 ? -124 : -148); x.lineTo(i % 2 ? 5 : 9, -100); x.closePath(); x.fill(); x.restore(); } ring(56, 5); x.lineWidth = 9; x.beginPath(); x.moveTo(0, -36); x.lineTo(0, 36); x.moveTo(-26, -8); x.lineTo(26, -8); x.stroke(); }
    else if (school === 'shadow') { star(5, 2, 150, 4, Math.PI); ring(96, 2); for (let i = 0; i < 5; i++) { x.save(); x.rotate(i * Math.PI * 2 / 5); x.lineWidth = 4; x.beginPath(); x.arc(0, -118, 20, 0.3, Math.PI * 2 - 0.9); x.stroke(); x.restore(); } x.beginPath(); x.arc(0, 0, 26, 0, 6.3); x.fill(); }
    else if (school === 'death') { star(7, 3, 150, 3.5); star(7, 2, 150, 2); ring(52, 3); x.beginPath(); x.arc(0, -6, 26, 0, 6.3); x.fill(); x.fillRect(-15, 12, 30, 20); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(-10, -6, 7, 0, 6.3); x.arc(10, -6, 7, 0, 6.3); x.fill(); x.globalCompositeOperation = 'source-over'; }
    else if (school === 'nature') { x.lineWidth = 5; for (let i = 0; i < 3; i++) { x.save(); x.rotate(i * Math.PI * 2 / 3); x.beginPath(); for (let t = 0; t < 60; t++) { const a = t * 0.12, r = 8 + t * 2.3; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (t) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); x.restore(); } for (let i = 0; i < 6; i++) { x.save(); x.rotate(i * Math.PI / 3 + 0.3); x.beginPath(); x.moveTo(0, -150); x.quadraticCurveTo(-16, -128, 0, -108); x.quadraticCurveTo(16, -128, 0, -150); x.fill(); x.restore(); } }
    else if (school === 'earth') { star(4, 1, 150, 7, Math.PI / 4); star(4, 1, 106, 5); x.lineWidth = 6; for (let i = 0; i < 4; i++) { x.save(); x.rotate(i * Math.PI / 2); x.strokeRect(-14, -150, 28, 28); x.restore(); } ring(40, 6); }
    else if (school === 'storm') { star(3, 1, 150, 4); star(3, 1, 150, 4, Math.PI); x.lineWidth = 5; for (let i = 0; i < 3; i++) { x.save(); x.rotate(i * Math.PI * 2 / 3); x.beginPath(); x.moveTo(-6, -140); x.lineTo(10, -100); x.lineTo(-8, -92); x.lineTo(8, -50); x.stroke(); x.restore(); } ring(38, 3); }
    else { for (let i = 0; i < 6; i++) { x.save(); x.rotate(i * Math.PI / 3); x.lineWidth = 3; x.beginPath(); x.arc(0, -75, 75, 0, Math.PI * 2); x.stroke(); x.restore(); } ring(30, 4); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  circleCache.set(key, t);
  return t;
}

// ---------- Материалы ----------
function slashMat(color, color2) {
  return new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(color) }, uC2: { value: new THREE.Color(color2 || '#ffffff') }, uSeed: { value: R() * 10 } },
    vertexShader: 'attribute vec2 aUV; varying vec2 vU; void main(){ vU = aUV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK; uniform vec3 uC; uniform vec3 uC2; uniform float uSeed; varying vec2 vU;
      ${NOISE_GLSL}
      void main(){
        float head = uK * 1.7;
        float reveal = step(vU.x, head) * smoothstep(head - 1.0, head - 0.12, vU.x);
        float n = fbm3(vec3(vU.x * 16.0 - uK * 4.0, vU.y * 3.5, uSeed));
        float streak = smoothstep(0.25, 0.7, n);
        float core = pow(vU.y, 5.0);
        float body = pow(vU.y, 1.4) * (0.35 + 0.65 * streak);
        float tip = smoothstep(0.0, 0.08, vU.x) * smoothstep(1.0, 0.9, vU.x);
        float a = (body * 0.8 + core * 1.3) * reveal * tip * (1.0 - smoothstep(0.75, 1.0, uK));
        vec3 col = mix(uC * 1.3, uC2 * 1.6, core * 0.85 + streak * vU.y * 0.25);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
function vortexMat(c1, c2, arms) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uArms: { value: arms }, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform float uA; uniform float uArms; uniform vec3 uC1; uniform vec3 uC2; varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float sw = a * uArms + (1.0 / (r + 0.12)) * 2.4 - uT * 4.0;
        float n = fbm3(vec3(cos(a) * r * 3.0, sin(a) * r * 3.0, uT * 0.7));
        float band = smoothstep(0.1, 0.9, sin(sw + n * 3.0) * 0.5 + 0.5);
        float edge = smoothstep(1.0, 0.72, r);
        float hole = smoothstep(0.06, 0.3, r);
        vec3 col = mix(uC2, uC1, band) * (0.35 + band * 0.7) + vec3(1.0) * pow(band, 8.0) * 0.2 * (1.0 - r);
        float al = edge * (0.2 + band * 0.6) * mix(1.0, hole, 0.9) * uA;
        gl_FragColor = vec4(col, al);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
function novaMat(color, color2) {
  return new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uC: { value: new THREE.Color(color) }, uC2: { value: new THREE.Color(color2 || '#ffffff') }, uSeed: { value: R() * 10 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK; uniform vec3 uC; uniform vec3 uC2; uniform float uSeed; varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float n = fbm3(vec3(cos(a) * 3.0, sin(a) * 3.0, r * 4.0 - uK * 3.0 + uSeed));
        float front = uK * 0.96 + (n - 0.5) * 0.08;
        float ring = smoothstep(front - 0.22, front, r) * (1.0 - smoothstep(front, front + 0.03, r));
        float inner = (1.0 - smoothstep(0.0, front, r)) * 0.18 * n;
        float al = (ring * (0.5 + n) + inner) * (1.0 - uK * uK);
        vec3 col = mix(uC, uC2, pow(ring, 3.0));
        gl_FragColor = vec4(col * 1.4, clamp(al, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

let arrowGeo = null, bladeGeoC = null;
const WEAPON_SPAN = { sword: [0.2, 0.97], greatsword: [0.35, 1.55], axe: [0.15, 0.82], hammer: [0.15, 0.85], scythe: [0.3, 1.7], staff: [0.5, 1.25], bonestaff: [0.5, 1.15], wand: [0.1, 0.45], bow: null };
function getArrowGeo() {
  if (arrowGeo) return arrowGeo;
  const parts = [new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), new THREE.ConeGeometry(0.035, 0.12, 5).translate(0, -0.5, 0)];
  for (let i = 0; i < 3; i++) parts.push(new THREE.PlaneGeometry(0.07, 0.2).translate(0.035, 0.36, 0).rotateY(i * Math.PI * 2 / 3));
  const pos = [], idx = []; let base = 0;
  for (const g of parts) { const p = g.attributes.position, ix = g.index; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base); base += p.count; }
  arrowGeo = new THREE.BufferGeometry(); arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); arrowGeo.setIndex(idx); arrowGeo.computeVertexNormals(); arrowGeo.userData.keep = true;
  return arrowGeo;
}
// энергетический клинок (остриём вниз по -Y)
export function bladeGeo() {
  if (bladeGeoC) return bladeGeoC;
  const s = new THREE.Shape();
  s.moveTo(0, -1.0); s.lineTo(0.09, -0.75); s.lineTo(0.075, 0.25); s.lineTo(0.22, 0.3); s.lineTo(0.22, 0.36); s.lineTo(0.03, 0.36); s.lineTo(0.03, 0.62); s.lineTo(0.06, 0.7); s.lineTo(-0.06, 0.7); s.lineTo(-0.03, 0.62); s.lineTo(-0.03, 0.36); s.lineTo(-0.22, 0.36); s.lineTo(-0.22, 0.3); s.lineTo(-0.075, 0.25); s.lineTo(-0.09, -0.75); s.closePath();
  bladeGeoC = new THREE.ShapeGeometry(s); bladeGeoC.userData.keep = true;
  return bladeGeoC;
}

Object.assign(Effects.prototype, {
  // Магический круг школы: два слоя вращаются навстречу, появляется с «пружинкой»
  magicCircle(pos, school, r = 4, dur = 1.6, opts = {}) {
    const color = opts.color || { fire: '#ff7a20', frost: '#80d8ff', holy: '#ffe08a', shadow: '#a050ff', death: '#50ff90', nature: '#70e050', earth: '#d0a060', storm: '#a0c8ff', arcane: '#b090ff' }[school] || '#ffffff';
    const g = new THREE.Group();
    const layers = [0, 1].map(l => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: circleTex(school, l), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.06 + l * 0.03; m.renderOrder = 3;
      g.add(m); return m;
    });
    let col = null;
    if (opts.column) { col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, opts.column, 28, 1, true), energyMat(color, { scale: 3, speed: 1.2, fadeV: true, rimA: 0.15 })); col.position.y = opts.column / 2; g.add(col); }
    g.position.copy(pos);
    const spin = opts.spin == null ? 1 : opts.spin;
    const follow = opts.follow || null;
    this.add(g, dur, (dt, k) => {
      if (follow) g.position.copy(follow.position);
      const sIn = k < 0.18 ? easeOutBack(k / 0.18) : 1, fade = k > 0.75 ? (1 - k) / 0.25 : 1;
      layers[0].scale.setScalar(r * sIn); layers[1].scale.setScalar(r * Math.min(1, sIn * 1.05));
      layers[0].rotation.z += dt * 0.7 * spin; layers[1].rotation.z -= dt * 1.3 * spin;
      layers[0].material.opacity = fade * Math.min(1, k * 8); layers[1].material.opacity = fade * Math.min(1, k * 5) * (0.75 + 0.25 * Math.sin(k * 40));
      if (col) col.material.uniforms.uAlpha.value = fade * Math.min(1, k * 4) * 0.5;
    });
    return g;
  },

  // Росчерк клинка: дуга, которая «прорисовывается» вслед за лезвием и тает
  slash(pos, yaw, color, opts = {}) {
    const r = opts.r || 2.3, span = opts.span || 2.6, width = opts.width || 0.42, N = 40;
    const P = [], U = [], I = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = (u - 0.5) * span * (opts.dir || 1);
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7);
      const ro = r * (1 + 0.04 * Math.sin(u * Math.PI)), ri = r * (1 - w);
      P.push(Math.sin(a) * ri, 0, Math.cos(a) * ri, Math.sin(a) * ro, 0, Math.cos(a) * ro);
      U.push(u, 0, u, 1);
      if (i < N) { const b = i * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('aUV', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I);
    const m = new THREE.Mesh(geo, slashMat(color, opts.color2));
    m.rotation.z = opts.roll || 0; m.rotation.x = opts.pitch || 0;
    const g = new THREE.Group(); g.add(m);
    g.position.copy(pos); g.rotation.y = yaw;
    const dir = V(Math.sin(yaw), 0, Math.cos(yaw)), start = pos.clone(), travel = opts.travel || 0, dur = opts.dur || 0.32, follow = opts.follow || null;
    this.add(g, dur, (dt, k) => {
      m.material.uniforms.uK.value = k;
      if (follow) start.copy(follow.position).setY(pos.y);
      g.position.copy(start).addScaledVector(dir, travel * easeOut(k));
      g.scale.setScalar(1 + k * (opts.grow || 0.12));
    });
    return g;
  },

  // Вспышка попадания: блик-звезда, искры нужной формы, кольцо
  spark(pos, color, opts = {}) {
    const n = opts.n == null ? 14 : opts.n, sp = opts.speed || 7, c2 = opts.color2 || '#ffffff';
    FX.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.2, size: (opts.flare || 2.4), color: c2, tex: 'flare', rot: R() * 3, spin: 2, grow: 0.5, alpha: 0.8 });
    FX.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.28, size: (opts.flare || 2.4) * 0.7, color, tex: 'glow', grow: 0.6, alpha: 0.55 });
    FX.burst(pos.x, pos.y, pos.z, n, { color: [color, c2], speed: sp, life: opts.life || 0.45, size: opts.size || 0.34, gravity: opts.gravity == null ? 9 : opts.gravity, tex: opts.tex || 'spark', drag: 0.93, up: opts.up || 1 });
    if (opts.ring !== false) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 5, 28), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.copy(pos); if (this.camera) ring.lookAt(this.camera.position);
      const rr = opts.ringR || 1.6;
      this.add(ring, 0.28, (dt, k) => { ring.scale.setScalar(0.3 + easeOut(k) * rr); ring.material.opacity = 1 - k; });
    }
    if (opts.light !== false) this.flash(pos, color, opts.light || 14, 0.25, 9);
  },

  // Кольцо пыли по земле (настоящие клубы)
  dustRing(pos, r = 3, color = '#9a8a70', n = 22) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + R() * 0.3, sp = r * (1.2 + R() * 0.8);
      FX.emit({ x: pos.x + Math.cos(a) * 0.4, y: pos.y + 0.25, z: pos.z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: 0.5 + R() * 0.8, vz: Math.sin(a) * sp, life: 0.9 + R() * 0.5, size: 1.2 + R() * 0.8, color, additive: false, alpha: 0.5, grow: 1.6, drag: 0.9, tex: 'smoke' });
    }
  },

  // Волна по земле с рваным фронтом
  nova(pos, color, r = 6, dur = 0.6, color2 = null) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), novaMat(color, color2));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.12; m.scale.setScalar(r); m.renderOrder = 3;
    this.add(m, dur, (dt, k) => { m.material.uniforms.uK.value = easeOut(k); });
  },

  // Молния: изломанная, с ответвлениями, мерцает
  bolt(from, to, color = '#a0d0ff', opts = {}) {
    const dur = opts.dur || 0.32, width = opts.width || 0.13, jag = opts.jag || 0.5;
    const g = new THREE.Group();
    const mk = (w, col, op) => { const geo = new THREE.BufferGeometry(); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.userData.w = w; m.frustumCulled = false; g.add(m); return m; };
    const strips = [mk(width * 2.4, color, 0.3), mk(width * 0.8, '#ffffff', 1)];
    const branches = [];
    for (let b = 0; b < (opts.branches == null ? 3 : opts.branches); b++) branches.push([mk(width * 1.6, color, 0.3), mk(width * 0.5, '#ffffff', 0.9), 0.2 + R() * 0.6]);
    const cam = this.camera;
    const path = (a, b, j, n) => { const pts = [a.clone()]; const d = b.clone().sub(a); const len = d.length(); const s1 = V(d.z, 0, -d.x).normalize(); if (s1.lengthSq() < 0.01) s1.set(1, 0, 0); const s2 = d.clone().cross(s1).normalize(); for (let i = 1; i < n; i++) { const t = i / n; pts.push(a.clone().lerp(b, t).addScaledVector(s1, (R() - 0.5) * j * Math.min(1, len * 0.12) * Math.sin(t * Math.PI + 0.3)).addScaledVector(s2, (R() - 0.5) * j * Math.min(1, len * 0.12))); } pts.push(b.clone()); return pts; };
    const fill = (m, pts) => { const pos = [], idx = []; const view = V(0, 0, 1), t = V(0, 0, 0), side = V(0, 0, 0); for (let i = 0; i < pts.length; i++) { t.copy(pts[Math.min(pts.length - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize(); if (cam) view.copy(cam.position).sub(pts[i]).normalize(); side.crossVectors(t, view).normalize().multiplyScalar(m.userData.w * (i === pts.length - 1 ? 0.3 : 1)); pos.push(pts[i].x - side.x, pts[i].y - side.y, pts[i].z - side.z, pts[i].x + side.x, pts[i].y + side.y, pts[i].z + side.z); if (i < pts.length - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } } m.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.geometry.setIndex(idx); };
    let acc = 1;
    const regen = () => {
      const segs = Math.max(8, Math.min(30, Math.round(from.distanceTo(to) * 1.7)));
      const main = path(from, to, jag * 1.8, segs);
      for (const s of strips) fill(s, main);
      for (const [b1, b2, t] of branches) { const st = main[Math.max(1, Math.floor(t * (segs - 1)))]; const end = st.clone().add(V((R() - 0.5) * 3, (R() - 0.3) * 2, (R() - 0.5) * 3)); const bp = path(st, end, jag, 5); fill(b1, bp); fill(b2, bp); }
    };
    this.add(g, dur, (dt, k) => {
      acc += dt; if (acc > 0.045) { acc = 0; regen(); }
      const f = (1 - k) * (0.7 + 0.3 * Math.sin(k * 70));
      strips[0].material.opacity = 0.4 * f; strips[1].material.opacity = f;
      for (const [b1, b2] of branches) { b1.material.opacity = 0.3 * f; b2.material.opacity = 0.8 * f; }
    });
    const small = width < 0.08;       // мелкие разряды — без вспышки на конце
    if (!small) FX.emit({ x: to.x, y: to.y, z: to.z, life: 0.22, size: 2.4, color: '#ffffff', tex: 'flare', spin: 3, alpha: 0.8 });
    FX.burst(to.x, to.y, to.z, opts.sparks == null ? (small ? 2 : 10) : opts.sparks, { color: [color, '#ffffff'], speed: 6, life: 0.35, size: 0.3, gravity: 8, tex: 'spark' });
    if (!small) this.flash(to, color, 18, 0.2, 10);
  },

  // Луч: плотное ядро, вихрящаяся оболочка, вспышки на концах
  beam2(from, to, color, opts = {}) {
    const dur = opts.dur || 0.7, w = opts.width || 0.35, len = from.distanceTo(to);
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.35, len, 10, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(w, w, len, 20, 1, true).rotateX(Math.PI / 2), energyMat(color, { scale: 7, speed: 6 }));
    const sh2 = new THREE.Mesh(new THREE.CylinderGeometry(w * 1.9, w * 1.9, len, 20, 1, true).rotateX(Math.PI / 2), energyMat(color, { scale: 4, speed: 3, rimA: 0.2 }));
    g.add(core, sh, sh2); g.position.copy(from).lerp(to, 0.5); g.lookAt(to);
    const dir = to.clone().sub(from).normalize();
    this.add(g, dur, (dt, k) => {
      const s = k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 2);
      core.scale.set(s, s, 1); sh.scale.set(0.5 + s * 0.5, 0.5 + s * 0.5, 1); sh2.scale.set(s, s, 1);
      core.material.opacity = s; sh.material.uniforms.uAlpha.value = s; sh2.material.uniforms.uAlpha.value = s * 0.5; sh.rotation.z += dt * 6; sh2.rotation.z -= dt * 3;
      for (let i = 0; i < 3; i++) { const t = R(); FX.emit({ x: from.x + dir.x * len * t, y: from.y + dir.y * len * t, z: from.z + dir.z * len * t, vx: (R() - 0.5) * 2, vy: (R() - 0.5) * 2, vz: (R() - 0.5) * 2, life: 0.4, size: 0.3, color, tex: opts.tex || 'sparkle' }); }
      if (R() < 0.6) FX.emit({ x: to.x, y: to.y, z: to.z, life: 0.2, size: 3.2 * s, color: '#ffffff', tex: 'flare', rot: R() * 3 });
    });
    FX.emit({ x: from.x, y: from.y, z: from.z, life: 0.35, size: 2.5, color, tex: 'flare' });
    this.flash(to, color, 22, dur, 12);
  },

  // Столб пламени: языки огня, угли, дым
  fireColumn(pos, r = 1.2, h = 5, dur = 1.2, colors = ['#ff5a10', '#ffb030', '#ffe890'], smoke = true) {
    this.add(null, dur, (dt, k) => {
      const pw = k < 0.15 ? k / 0.15 : 1 - Math.pow(Math.max(0, k - 0.6) / 0.4, 2);
      for (let i = 0; i < 5 * pw; i++) {
        const a = R() * 6.28, d = Math.sqrt(R()) * r;
        FX.emit({ x: pos.x + Math.cos(a) * d, y: pos.y + R() * 0.5, z: pos.z + Math.sin(a) * d, vx: -Math.cos(a) * d * 0.5, vy: h * (0.9 + R() * 0.8), vz: -Math.sin(a) * d * 0.5, life: 0.5 + R() * 0.3, size: Math.min(1.5, r * (0.8 + R() * 0.8)), color: colors[Math.floor(R() * colors.length)], tex: 'flame', grow: -0.5, drag: 0.97, alpha: 0.8 });
      }
      if (R() < 0.8 * pw) FX.emit({ x: pos.x + (R() - 0.5) * r, y: pos.y + 0.3, z: pos.z + (R() - 0.5) * r, vx: (R() - 0.5) * 3, vy: h * 0.9 + R() * 3, vz: (R() - 0.5) * 3, life: 1.0, size: 0.16, color: colors[1], gravity: 2, tex: 'spark' });
      if (smoke && R() < 0.35 * pw) FX.emit({ x: pos.x + (R() - 0.5) * r, y: pos.y + h * 0.5, z: pos.z + (R() - 0.5) * r, vy: 2.5, life: 1.6, size: r * 1.6, color: '#2a2420', additive: false, alpha: 0.4, grow: 1.5, tex: 'smoke' });
    });
    this.flash(pos.clone().setY(pos.y + 1.5), colors[0], 20, dur, 12);
  },

  // Воронка-вихрь на земле
  vortex(pos, c1, c2, r = 5, dur = 2, arms = 3) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vortexMat(c1, c2, arms));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.14; m.renderOrder = 3;
    this.add(m, dur, (dt, k) => {
      m.material.uniforms.uT.value += dt;
      m.material.uniforms.uA.value = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      m.scale.setScalar(r * (k < 0.15 ? easeOutBack(k / 0.15) : 1));
    });
    return m;
  },

  // Сбор энергии: частицы слетаются в точку, свечение растёт
  chargeUp(posFn, color, dur = 0.4, opts = {}) {
    const r = opts.r || 1.4, tex = opts.tex || 'sparkle';
    this.add(null, dur, (dt, k) => {
      const p = posFn(); if (!p) return true;
      for (let i = 0; i < (opts.rate || 3); i++) {
        const th = R() * 6.28, ph = Math.acos(2 * R() - 1), life = 0.22 + R() * 0.12;
        const dx = Math.sin(ph) * Math.cos(th) * r, dy = Math.cos(ph) * r, dz = Math.sin(ph) * Math.sin(th) * r;
        FX.emit({ x: p.x + dx, y: p.y + dy, z: p.z + dz, vx: -dx / life, vy: -dy / life, vz: -dz / life, life, size: opts.size || 0.28, color: R() < 0.3 ? '#ffffff' : color, tex, drag: 1 });
      }
      FX.emit({ x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.6 + k * (opts.glow || 1.6), color, tex: 'glow' });
      if (k > 0.7 && R() < 0.5) FX.emit({ x: p.x, y: p.y, z: p.z, life: 0.12, size: 1.4 + k * 1.2, color: '#ffffff', tex: 'flare', rot: R() * 3 });
    });
  },

  // Руны, поднимающиеся спиралью
  risingRunes(pos, color, r = 1.2, dur = 1.5, opts = {}) {
    let ang = R() * 6;
    const follow = opts.follow || null, tex = opts.tex || ['rune', 'rune2'];
    this.add(null, dur, (dt) => {
      ang += dt * (opts.speed || 5);
      const c = follow ? follow.position : pos;
      for (let i = 0; i < (opts.n || 2); i++) {
        const a = ang + i * Math.PI * 2 / (opts.n || 2);
        if (R() < (opts.rate || 0.5)) FX.emit({ x: c.x + Math.cos(a) * r, y: c.y + 0.1, z: c.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.2, vy: (opts.vy || 2.2) + R(), vz: Math.cos(a) * 1.2, life: opts.life || 1.1, size: opts.size || 0.42, color, tex: Array.isArray(tex) ? tex[Math.floor(R() * tex.length)] : tex, drag: 0.98 });
      }
    });
  },

  // Объекты, кружащие вокруг цели
  orbit(follow, n, r, dur, meshFn, opts = {}) {
    const g = new THREE.Group();
    const items = [];
    for (let i = 0; i < n; i++) { const m = meshFn(i); g.add(m); items.push(m); }
    let a0 = R() * 6;
    this.add(g, dur, (dt, k) => {
      a0 += dt * (opts.speed || 3);
      g.position.copy(follow.position);
      const s = k < 0.1 ? k / 0.1 : k > 0.88 ? (1 - k) / 0.12 : 1;
      items.forEach((m, i) => {
        const a = a0 + i * Math.PI * 2 / n;
        m.position.set(Math.cos(a) * r, (opts.y || 1.1) + Math.sin(a0 * 1.7 + i) * (opts.bob || 0.15), Math.sin(a) * r);
        m.rotation.y = -a + (opts.face || 0);
        m.scale.setScalar(Math.max(0.001, s) * (opts.scale || 1));
        if (opts.tick) opts.tick(m, dt, k, i);
      });
    });
    return g;
  },

  // Кратковременная цветная вспышка всего экрана
  screenFlash(color, alpha = 0.25, dur = 0.35) {
    let el = document.getElementById('skillflash');
    if (!el) { el = document.createElement('div'); el.id = 'skillflash'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;mix-blend-mode:screen'; document.body.appendChild(el); }
    el.style.transition = 'none'; el.style.background = `radial-gradient(ellipse at center, ${color}55 0%, ${color} 100%)`; el.style.opacity = String(alpha);
    requestAnimationFrame(() => { el.style.transition = `opacity ${dur}s ease-out`; el.style.opacity = '0'; });
  },

  // Град стрел: стрелы падают под углом, втыкаются и остаются на пару секунд
  arrowVolley(center, r, n, color, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ color: opts.shaft || '#d8c8a0' });
    const glow = opts.glow || color;
    const lean = V(opts.leanX == null ? 0.35 : opts.leanX, -1, opts.leanZ == null ? 0.15 : opts.leanZ).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), lean);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * r;
      const gx = center.x + Math.cos(a) * d, gz = center.z + Math.sin(a) * d;
      const gy = opts.standY ? opts.standY(gx, gz) : center.y;
      const m = new THREE.Mesh(getArrowGeo(), mat);
      m.quaternion.copy(q); m.rotateY(R() * 6);
      const land = V(gx, gy + 0.32, gz), H = 16, delay = R() * (opts.spread || 0.5), fall = 0.22;
      m.visible = false;
      let landed = false;
      this.add(m, delay + fall + 1.6, (dt, k, it) => {
        const t = it.t - delay;
        if (t < 0) return;
        m.visible = true;
        if (t < fall) {
          const f = 1 - t / fall;
          m.position.copy(land).addScaledVector(lean, -H * f);
          if (R() < 0.8) FX.emit({ x: m.position.x, y: m.position.y, z: m.position.z, vx: lean.x * 30, vy: lean.y * 30, vz: lean.z * 30, life: 0.12, size: 0.5, color: glow, tex: 'spark' });
        } else if (!landed) {
          landed = true; m.position.copy(land);
          FX.burst(gx, gy + 0.1, gz, 4, { color: [glow, '#ffffff'], speed: 3, life: 0.3, size: 0.22, gravity: 8, tex: 'spark' });
          FX.emit({ x: gx, y: gy + 0.15, z: gz, vy: 0.6, life: 0.6, size: 0.8, color: opts.dust || '#9a8a70', additive: false, alpha: 0.4, grow: 1.2, tex: 'smoke' });
        } else if (t > fall + 1.2) m.scale.setScalar(Math.max(0.01, 1 - (t - fall - 1.2) / 0.4));
      });
    }
  },

  // Оружие окутывается энергией на время умения
  weaponGlow(model, color, dur = 0.8, opts = {}) {
    const w = model.weaponObj;
    if (!w) return;
    const edge = WEAPON_SPAN[model.weaponType];
    if (edge === null) return;
    const y0 = opts.y0 != null ? opts.y0 : edge ? edge[0] : 0.18, len = opts.len || (edge ? edge[1] - edge[0] : 1.0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(opts.r || 0.075, (opts.r || 0.075) * 0.8, len, 10, 1, true), energyMat(color, { scale: 5, speed: 5, rimA: 0.5 }));
    m.position.y = y0 + len / 2;
    w.add(m);
    const tip = V(0, 0, 0);
    this.add(null, dur, (dt, k) => {
      m.material.uniforms.uAlpha.value = k < 0.15 ? k / 0.15 : 1 - Math.pow(Math.max(0, k - 0.5) / 0.5, 2);
      if (R() < (opts.rate == null ? 0.6 : opts.rate)) { w.localToWorld(tip.set(0, y0 + R() * len, 0)); FX.emit({ x: tip.x, y: tip.y, z: tip.z, vy: 0.6, vx: (R() - 0.5), vz: (R() - 0.5), life: 0.4, size: 0.3, color, tex: opts.tex || 'sparkle' }); }
    }, () => { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); });
  },

  // Призрачный двойник: копия модели (со своим скелетом), светится и тает.
  // follow=true — повторяет позу оригинала, иначе застывает в текущей.
  spirit(model, color, dur = 1, opts = {}) {
    if (this.lowFx && !opts.always) return null;
    let clone;
    try { clone = skeletonClone(model.root); } catch (e) { return null; }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const src = [], dst = [];
    model.root.traverse(o => src.push(o)); clone.traverse(o => dst.push(o));
    clone.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.frustumCulled = false; if (o.geometry) o.userData.sharedGeo = true; } else if (o.isLight) o.visible = false; });
    const base = model.root.scale.x, scale = opts.scale || 1, off = opts.offset || 0, rise = opts.rise || 0, op = opts.opacity || 0.4;
    const yaw0 = model.root.rotation.y, p0 = model.root.position.clone();
    const sync = () => { if (src.length !== dst.length) return; for (let i = 1; i < src.length; i++) { dst[i].position.copy(src[i].position); dst[i].quaternion.copy(src[i].quaternion); } };
    const it = this.add(null, dur, (dt, k) => {
      if (opts.follow) { sync(); p0.copy(model.root.position); }
      const yaw = opts.follow ? model.root.rotation.y : yaw0;
      clone.position.copy(p0); clone.rotation.y = yaw;
      clone.position.x -= Math.sin(yaw) * off; clone.position.z -= Math.cos(yaw) * off; clone.position.y += rise * k;
      clone.scale.setScalar(base * scale * (1 + k * (opts.grow || 0)));
      mat.opacity = op * (k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, opts.pow || 1));
    }, () => { clone.removeFromParent(); clone.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); }); mat.dispose(); });
    this.scene.add(clone);
    it.update(0, 0, it);
    return clone;
  },

  // Прогрев шейдеров эффектов, чтобы первое применение умения не давало рывка
  warmup(pos) {
    const g = new THREE.Group(); g.position.copy(pos); g.scale.setScalar(0.0005);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); tri.setAttribute('aUV', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const mats = [slashMat('#fff'), novaMat('#fff'), vortexMat('#fff', '#000', 3),
      energyMat('#fff', { scale: 3, speed: 4 }), energyMat('#fff', { scale: 7, speed: 6 }), energyMat('#fff', { scale: 4, speed: 3, rimA: 0.2 }), energyMat('#fff', { scale: 5, speed: 5, rimA: 0.5 }), energyMat('#fff', { scale: 3, speed: 1.2, fadeV: true, rimA: 0.15 }), energyMat('#fff', { scale: 3, speed: 3, rimA: 0.9 }),
      new THREE.MeshBasicMaterial({ map: circleTex('fire', 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })];
    for (const m of mats) { const mesh = new THREE.Mesh(tri, m); mesh.frustumCulled = false; g.add(mesh); }
    this.add(g, 0.6);
  },

  // Следы стремительного рывка
  dashStreaks(pos, dir, color, n = 4) {
    for (let i = 0; i < n; i++) FX.emit({ x: pos.x + (R() - 0.5) * 0.8, y: pos.y + 0.3 + R() * 1.5, z: pos.z + (R() - 0.5) * 0.8, vx: -dir.x * 14, vy: 0, vz: -dir.z * 14, life: 0.22, size: 0.9, color: R() < 0.3 ? '#ffffff' : color, tex: 'spark', drag: 0.9 });
  },
});
