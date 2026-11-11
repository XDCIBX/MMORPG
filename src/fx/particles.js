// Система частиц (аддитивные искры/огонь и обычные — дым/пыль).
import * as THREE from 'three';
import { particleSprite } from '../core/textures.js';

const VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha; vColor = aColor;
}`;
const FS = `
uniform sampler2D uTex; varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
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
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = { uTex: { value: particleSprite() }, uScale: { value: 600 } };
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
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
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
      });
    }
  },
  ring(x, y, z, r, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * 0.2;
      const sp = o.speed || 0;
      this.emit({ x: x + Math.cos(a) * r, y, z: z + Math.sin(a) * r, vx: Math.cos(a) * sp, vy: o.vy || 0, vz: Math.sin(a) * sp, life: o.life || 0.8, size: o.size || 0.5, color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color, alpha: o.alpha, gravity: o.gravity, drag: o.drag == null ? 0.96 : o.drag, additive: o.additive, grow: o.grow });
    }
  },
  update(dt) { if (!this.inited) return; this.add.update(dt); this.norm.update(dt); },
};
