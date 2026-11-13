// Система частиц (аддитивные искры/огонь и обычные — дым/пыль).
import * as THREE from 'three';
import { particleSprite } from '../core/textures.js';

// Атлас форм частиц 4×4: не только «мягкий кружок», а дым, искры, осколки, руны и т.д.
export const PTEX = { glow: 0, smoke: 1, spark: 2, flare: 3, shard: 4, snow: 5, leaf: 6, ring: 7, rune: 8, rune2: 9, feather: 10, skull: 11, drop: 12, flame: 13, bone: 14, sparkle: 15 };
let atlasTex = null;
function particleAtlas() {
  if (atlasTex) return atlasTex;
  const C = 128, c = document.createElement('canvas'); c.width = c.height = C * 4;
  const ctx = c.getContext('2d');
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cell = (i, fn) => { ctx.save(); ctx.translate((i % 4) * C, Math.floor(i / 4) * C); ctx.beginPath(); ctx.rect(0, 0, C, C); ctx.clip(); ctx.translate(C / 2, C / 2); fn(); ctx.restore(); };
  const radial = (r, stops) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); for (const [t, a] of stops) g.addColorStop(t, `rgba(255,255,255,${a})`); return g; };
  // 0 мягкое свечение
  cell(0, () => { ctx.fillStyle = radial(60, [[0, 1], [0.25, 0.8], [0.6, 0.2], [1, 0]]); ctx.fillRect(-64, -64, 128, 128); });
  // 1 клуб дыма
  cell(1, () => { for (let i = 0; i < 26; i++) { const a = rnd() * 6.28, d = rnd() * 30, r = 14 + rnd() * 20; ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.fillStyle = radial(r, [[0, 0.3], [0.6, 0.14], [1, 0]]); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); } });
  // 2 искра-штрих (вдоль X)
  cell(2, () => { const g = ctx.createLinearGradient(-60, 0, 60, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(0.93, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.quadraticCurveTo(24, -4.5, 60, 0); ctx.quadraticCurveTo(24, 4.5, -60, 0); ctx.fill(); ctx.fillStyle = radial(6, [[0, 0.8], [1, 0]]); ctx.translate(50, 0); ctx.fillRect(-6, -6, 12, 12); });
  // 3 звезда-блик
  cell(3, () => { ctx.fillStyle = radial(22, [[0, 1], [0.5, 0.5], [1, 0]]); ctx.fillRect(-22, -22, 44, 44); for (let k = 0; k < 4; k++) { ctx.save(); ctx.rotate(k * Math.PI / 4); const L = k % 2 ? 34 : 62; const g = ctx.createLinearGradient(-L, 0, L, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -3.2); ctx.lineTo(L, 0); ctx.lineTo(0, 3.2); ctx.fill(); ctx.restore(); } });
  // 4 осколок
  cell(4, () => { const g = ctx.createLinearGradient(-30, -40, 30, 40); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0.95)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8, -52); ctx.lineTo(26, -6); ctx.lineTo(10, 50); ctx.lineTo(-24, 14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, -52); ctx.lineTo(4, 10); ctx.lineTo(10, 50); ctx.stroke(); });
  // 5 снежинка
  cell(5, () => { ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate(k * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -52); ctx.moveTo(0, -30); ctx.lineTo(-13, -43); ctx.moveTo(0, -30); ctx.lineTo(13, -43); ctx.moveTo(0, -14); ctx.lineTo(-8, -22); ctx.moveTo(0, -14); ctx.lineTo(8, -22); ctx.stroke(); ctx.restore(); } ctx.fillStyle = radial(40, [[0, 0.5], [1, 0]]); ctx.fillRect(-40, -40, 80, 80); });
  // 6 лист
  cell(6, () => { ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.beginPath(); ctx.moveTo(-50, 8); ctx.bezierCurveTo(-20, -38, 30, -30, 54, -4); ctx.bezierCurveTo(26, 30, -18, 30, -50, 8); ctx.fill(); ctx.strokeStyle = 'rgba(140,140,140,1)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-50, 8); ctx.quadraticCurveTo(0, -4, 54, -4); ctx.stroke(); });
  // 7 кольцо
  cell(7, () => { ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 7; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(0, 0, 44, 0, 6.3); ctx.stroke(); });
  // 8, 9 руны
  const rune = (segs) => { ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.beginPath(); for (const sg of segs) { ctx.moveTo(sg[0], sg[1]); for (let i = 2; i < sg.length; i += 2) ctx.lineTo(sg[i], sg[i + 1]); } ctx.stroke(); };
  cell(8, () => rune([[-18, -46, -18, 46], [-18, -40, 22, -12, -18, 12], [-18, 12, 24, 44]]));
  cell(9, () => rune([[0, -48, 0, 48], [-26, -22, 0, -48, 26, -22], [-26, 20, 26, 20], [-16, 40, 16, 40]]));
  // 10 перо
  cell(10, () => { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.moveTo(-56, 0); ctx.bezierCurveTo(-30, -26, 30, -22, 56, 0); ctx.bezierCurveTo(30, 18, -30, 20, -56, 0); ctx.fill(); ctx.strokeStyle = 'rgba(120,120,120,1)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(56, 0); for (let i = -40; i < 50; i += 9) { ctx.moveTo(i, 0); ctx.lineTo(i + 10, -13); ctx.moveTo(i, 0); ctx.lineTo(i + 10, 11); } ctx.stroke(); });
  // 11 череп
  cell(11, () => { ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.beginPath(); ctx.arc(0, -10, 36, 0, 6.3); ctx.fill(); ctx.fillRect(-22, 14, 44, 30); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(-15, -8, 11, 0, 6.3); ctx.arc(15, -8, 11, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-6, 18); ctx.lineTo(6, 18); ctx.fill(); for (let i = -1; i <= 1; i++) ctx.fillRect(i * 12 - 1.5, 28, 3, 18); ctx.globalCompositeOperation = 'source-over'; });
  // 12 капля (вдоль X)
  cell(12, () => { ctx.fillStyle = radial(50, [[0, 1], [0.7, 0.8], [1, 0]]); ctx.beginPath(); ctx.moveTo(-54, 0); ctx.quadraticCurveTo(10, -22, 40, -12); ctx.arc(40, 0, 12, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(10, 22, -54, 0); ctx.fill(); });
  // 13 язык пламени
  cell(13, () => { const g = ctx.createLinearGradient(0, 56, 0, -56); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 56); ctx.bezierCurveTo(-44, 40, -26, -6, -8, -22); ctx.bezierCurveTo(-12, -40, 4, -52, 6, -58); ctx.bezierCurveTo(10, -30, 40, -4, 28, 30); ctx.bezierCurveTo(22, 46, 10, 54, 0, 56); ctx.fill(); });
  // 14 обломок кости
  cell(14, () => { ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fillRect(-36, -7, 72, 14); for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 38, sy * 9, 11, 0, 6.3); ctx.fill(); } });
  // 15 блёстка (тонкий крест)
  cell(15, () => { for (let k = 0; k < 2; k++) { ctx.save(); ctx.rotate(k * Math.PI / 2); const g = ctx.createLinearGradient(-58, 0, 58, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-58, 0); ctx.lineTo(0, -5); ctx.lineTo(58, 0); ctx.lineTo(0, 5); ctx.fill(); ctx.restore(); } ctx.fillStyle = radial(14, [[0, 1], [1, 0]]); ctx.fillRect(-14, -14, 28, 28); });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.flipY = false;
  atlasTex.generateMipmaps = true;
  return atlasTex;
}
// формы, которые поворачиваются вдоль направления полёта
const ALIGNED = new Set([PTEX.spark, PTEX.drop]);

const VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aFrame; attribute float aRot; attribute vec3 aVel;
varying float vAlpha; varying vec3 vColor; varying float vFrame; varying vec2 vDir;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = aSize;
  if (aRot < -50.0) {
    // вдоль скорости на экране
    vec4 p1 = projectionMatrix * (modelViewMatrix * vec4(position + aVel * 0.03, 1.0));
    vec2 d = p1.xy / p1.w - gl_Position.xy / gl_Position.w;
    d.x *= projectionMatrix[1][1] / projectionMatrix[0][0];
    float l = length(d);
    vDir = l > 1e-6 ? vec2(d.x, -d.y) / l : vec2(1.0, 0.0);
    sz *= 1.8;
  } else vDir = vec2(cos(aRot), sin(aRot));
  gl_PointSize = sz * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha; vColor = aColor; vFrame = aFrame;
}`;
const FS = `
uniform sampler2D uTex; varying float vAlpha; varying vec3 vColor; varying float vFrame; varying vec2 vDir;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  vec2 t = vec2(q.x * vDir.x + q.y * vDir.y, -q.x * vDir.y + q.y * vDir.x) + 0.5;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) discard;
  float f = floor(vFrame + 0.5);
  vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0));
  vec4 tx = texture2D(uTex, (cell + clamp(t, 0.02, 0.98)) / 4.0);
  gl_FragColor = vec4(vColor * tx.rgb, tx.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

class Pool {
  constructor(n, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    this.baseAlpha = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.frame = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFrame', new THREE.BufferAttribute(this.frame, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aVel', new THREE.BufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = { uTex: { value: particleAtlas() }, uScale: { value: 600 } };
    this.additive = additive;
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    this.geo = g;
  }
  emit(o, c) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.baseSize[i] = o.size || 0.5;
    this.baseAlpha[i] = o.alpha == null ? 1 : o.alpha;
    this.grav[i] = o.gravity || 0;
    this.drag[i] = o.drag == null ? 1 : o.drag;
    this.grow[i] = o.grow == null ? 0 : o.grow;
    // форма: задана явно, иначе по смыслу — дым для обычных, штрих для падающих искр
    let f = o.tex != null ? (typeof o.tex === 'string' ? PTEX[o.tex] : o.tex) : (!this.additive ? PTEX.smoke : (o.gravity > 0 ? PTEX.spark : PTEX.glow));
    this.frame[i] = f;
    if (ALIGNED.has(f) && o.rot == null) { this.rot[i] = -100; this.spin[i] = 0; }
    else { this.rot[i] = o.rot != null ? o.rot : (f === PTEX.glow || f === PTEX.ring ? 0 : Math.random() * 6.28); this.spin[i] = o.spin != null ? o.spin : (f === PTEX.smoke ? (Math.random() - 0.5) * 0.8 : f === PTEX.glow || f === PTEX.flame || f === PTEX.rune || f === PTEX.rune2 || f === PTEX.skull ? 0 : (Math.random() - 0.5) * 6); if (f === PTEX.flame || f === PTEX.rune || f === PTEX.rune2 || f === PTEX.skull) this.rot[i] = o.rot || 0; }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const fadeIn = Math.min(1, (1 - k) * 8);
      this.alpha[i] = this.baseAlpha[i] * k * fadeIn;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - k));
      if (this.rot[i] > -50) this.rot[i] += this.spin[i] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aFrame.needsUpdate = true;
    this.geo.attributes.aRot.needsUpdate = true;
    this.geo.attributes.aVel.needsUpdate = true;
  }
}

const tmpC = new THREE.Color();

export const FX = {
  inited: false,
  init(scene, quality = 1) {
    this.add = new Pool(Math.round(7000 * quality), true);
    this.norm = new Pool(Math.round(2500 * quality), false);
    scene.add(this.add.points);
    scene.add(this.norm.points);
    this.inited = true;
  },
  setScale(s) { if (!this.inited) return; this.add.uniforms.uScale.value = s; this.norm.uniforms.uScale.value = s; },
  emit(o) {
    if (!this.inited) return;
    tmpC.set(o.color || '#ffffff');
    if (o.additive === false) this.norm.emit(o, tmpC);
    else this.add.emit(o, tmpC);
  },
  burst(x, y, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const sp = o.speed || 4;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const up = o.up || 0;
      this.emit({
        x: x + (Math.random() - 0.5) * (o.spread || 0), y: y + (Math.random() - 0.5) * (o.spread || 0) * 0.5, z: z + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.sin(ph) * Math.cos(th) * sp * (0.3 + Math.random() * 0.7),
        vy: Math.cos(ph) * sp * (0.3 + Math.random() * 0.7) * (o.flat ? 0.2 : 1) + up,
        vz: Math.sin(ph) * Math.sin(th) * sp * (0.3 + Math.random() * 0.7),
        life: (o.life || 0.8) * (0.6 + Math.random() * 0.6), size: (o.size || 0.5) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color,
        alpha: o.alpha, gravity: o.gravity, drag: o.drag == null ? 0.94 : o.drag, additive: o.additive, grow: o.grow,
        tex: Array.isArray(o.tex) ? o.tex[Math.floor(Math.random() * o.tex.length)] : o.tex, spin: o.spin,
      });
    }
  },
  ring(x, y, z, r, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * 0.2;
      const sp = o.speed || 0;
      this.emit({ x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r, vx: Math.cos(a) * sp, vy: o.vy || 0, vz: Math.sin(a) * sp, life: o.life || 0.8, size: o.size || 0.5, color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color, alpha: o.alpha, gravity: o.gravity, drag: o.drag == null ? 0.96 : o.drag, additive: o.additive, grow: o.grow, tex: o.tex, spin: o.spin });
    }
  },
  update(dt) { if (!this.inited) return; this.add.update(dt); this.norm.update(dt); },
};
