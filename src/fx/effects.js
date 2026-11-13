// Визуальные эффекты умений: снаряды, кольца, столпы света, молнии, вспышки, щиты.
import * as THREE from 'three';
import { FX } from './particles.js';
import { ringTexture, runeCircle } from '../core/textures.js';
import { gemMat, glowMat, boneMat, metalMat, woodMat, basicMat } from '../chars/materials.js';
import { RibbonTrail } from './trails.js';

// ---------- Шейдерные материалы эффектов ----------
export const NOISE_GLSL = `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }`;
const fxTime = { value: 0 };
// Огненный шар: клубящееся пламя с ядром
export function fireMat(c1 = '#ff6a10', c2 = '#ffd060', opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fxTime, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) }, uAlpha: { value: 1 }, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uSeed;
      ${NOISE_GLSL}
      void main(){ vec3 p = position; float d = fbm3(normal * 2.2 + vec3(0.0, -uTime * 2.5, uSeed)) ; p += normal * (d - 0.5) * ${(opts.disp || 0.35).toFixed(2)};
        vec4 w = modelMatrix * vec4(p, 1.0); vP = position * 2.0; vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * w).xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform vec3 uC1; uniform vec3 uC2; uniform float uAlpha; uniform float uSeed;
      ${NOISE_GLSL}
      void main(){ float f = fbm3(vP * 1.6 + vec3(0.0, -uTime * 3.0, uSeed));
        float rim = pow(1.0 - abs(dot(vN, vV)), 1.5);
        vec3 c = mix(uC2 * 2.2, uC1 * 1.4, smoothstep(0.35, 0.75, f + rim * 0.4));
        float a = smoothstep(0.2, 0.55, f + (1.0 - rim) * 0.35) * uAlpha;
        gl_FragColor = vec4(c, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
// Энергетическая оболочка: бегущий шум, яркий край (щиты, вихри, кольца, столпы)
export function energyMat(color, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fxTime, uC: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uSpeed: { value: opts.speed || 1 }, uScale: { value: opts.scale || 3 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * w).xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform vec3 uC; uniform float uAlpha; uniform float uSpeed; uniform float uScale;
      ${NOISE_GLSL}
      void main(){ float f = fbm3(vec3(vUv * vec2(uScale * 2.0, uScale), uTime * 0.6) + vec3(uTime * uSpeed, -uTime * uSpeed * 1.5, 0.0));
        float rim = pow(1.0 - abs(dot(vN, vV)), ${(opts.rim || 2.0).toFixed(1)});
        float band = smoothstep(0.45, 0.8, f);
        float edge = ${opts.fadeV ? 'smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.6, vUv.y)' : '1.0'};
        vec3 c = uC * (0.6 + band * 1.8) + vec3(1.0) * band * band * 0.6;
        gl_FragColor = vec4(c, (band * 0.75 + rim * ${(opts.rimA || 0.6).toFixed(2)}) * uAlpha * edge); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
export function tickFx(dt) { fxTime.value += dt; }

const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 14, 2);
      l.userData.t = 0; l.userData.dur = 0; l.userData.peak = 0;
      scene.add(l);
      this.lights.push(l);
    }
    this.ringTex = ringTexture();
    this.runeTex = runeCircle();
  }

  flash(pos, color, intensity = 30, dur = 0.35, dist = 14) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.t >= l.userData.dur) { best = l; break; } else if (l.userData.dur - l.userData.t < best.userData.dur - best.userData.t) best = l;
    best.position.copy(pos);
    best.color.set(color);
    best.distance = dist;
    best.userData.t = 0; best.userData.dur = dur; best.userData.peak = intensity;
    best.userData.follow = null;
    return best;
  }

  add(obj, dur, update, onEnd) {
    if (obj) this.scene.add(obj);
    const it = { obj, t: 0, dur, update, onEnd };
    this.items.push(it);
    return it;
  }

  update(dt) {
    tickFx(dt);
    for (const l of this.lights) {
      const u = l.userData;
      if (u.t < u.dur) {
        u.t += dt;
        const k = 1 - u.t / u.dur;
        l.intensity = u.peak * Math.max(0, k);
        if (u.follow) l.position.copy(u.follow.position);
      } else l.intensity = 0;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      let done = false;
      if (it.update) done = it.update(dt, k, it) === true;
      if (k >= 1 || done) {
        if (it.obj) { it.obj.removeFromParent(); disposeObj(it.obj); }
        if (it.onEnd) it.onEnd();
        this.items.splice(i, 1);
      }
    }
  }

  // Кольцевая волна по земле
  ringWave(pos, color, maxR = 6, dur = 0.6, y = 0.15) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.ringTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos); m.position.y += y;
    this.add(m, dur, (dt, k) => {
      const r = 0.3 + maxR * (1 - Math.pow(1 - k, 2));
      m.scale.set(r, r, 1);
      m.material.opacity = 1 - k;
    });
  }

  runeDecal(pos, color, r = 4, dur = 1.2, spin = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.runeTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos); m.position.y += 0.12;
    m.scale.set(r, r, 1);
    this.add(m, dur, (dt, k) => {
      m.rotation.z += dt * spin;
      m.material.opacity = Math.min(1, k * 6) * (1 - Math.pow(k, 3));
    });
    return m;
  }

  // Предупреждение об атаке босса
  telegraph(pos, radius, dur, color = '#ff2a10') {
    const g = new THREE.Group();
    g.position.copy(pos); g.position.y += 0.15;
    const outer = new THREE.Mesh(new THREE.RingGeometry(radius * 0.95, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    outer.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    fill.rotation.x = -Math.PI / 2;
    g.add(outer, fill);
    this.add(g, dur, (dt, k) => {
      fill.scale.setScalar(Math.max(0.01, k));
      fill.material.opacity = 0.2 + k * 0.25;
    });
    return g;
  }

  pillar(pos, color, radius = 1.5, height = 14, dur = 0.8) {
    const g = new THREE.CylinderGeometry(radius, radius * 1.2, height, 24, 1, true);
    g.translate(0, height / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.4, radius * 0.4, height, 12, 1, true).translate(0, height / 2, 0), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(core);
    this.add(m, dur, (dt, k) => {
      const w = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      m.scale.set(w, 1, w);
      m.material.opacity = w * 0.7; core.material.opacity = w;
    });
    this.flash(pos.clone().setY(pos.y + 2), color, 60, dur, 20);
  }

  beam(from, to, color, width = 0.4, dur = 0.5) {
    const len = from.distanceTo(to);
    const g = new THREE.CylinderGeometry(width, width, len, 12, 1, true);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.35, width * 0.35, len, 8, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(core);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    this.add(m, dur, (dt, k) => {
      const w = 1 - k;
      m.scale.set(w, w, 1);
      m.material.opacity = w * 0.8; core.material.opacity = w;
    });
    for (let i = 0; i < 40; i++) {
      const p = from.clone().lerp(to, Math.random());
      FX.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5), vy: Math.random() * 1.5, vz: (Math.random() - 0.5), life: 0.6, size: 0.6, color });
    }
  }

  lightning(from, to, color = '#a0d0ff', dur = 0.3) {
    const pts = [];
    const n = Math.max(4, Math.floor(from.distanceTo(to) / 1.2));
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const g = new THREE.TubeGeometry(curve, n * 3, 0.06, 5, false);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const g2 = new THREE.TubeGeometry(curve, n * 3, 0.22, 6, false);
    const glow = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(glow);
    this.add(m, dur, (dt, k) => { m.material.opacity = 1 - k; glow.material.opacity = (1 - k) * 0.5; });
    this.flash(to, color, 25, dur * 1.5);
    FX.burst(to.x, to.y, to.z, 14, { color: [color, '#ffffff'], speed: 5, life: 0.4, size: 0.35 });
  }

  slashArc(pos, yaw, color = '#ffffff', r = 2.0, dur = 0.25, tilt = 0) {
    const g = new THREE.RingGeometry(r * 0.55, r, 32, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const holder = new THREE.Group();
    holder.position.copy(pos);
    holder.rotation.y = yaw;
    m.rotation.x = -Math.PI / 2 + tilt;
    m.rotation.z = Math.PI / 2;
    holder.add(m);
    this.add(holder, dur, (dt, k) => {
      m.rotation.z = Math.PI / 2 + (k - 0.5) * 1.2;
      m.material.opacity = (1 - k) * 0.9;
      holder.scale.setScalar(0.8 + k * 0.4);
    });
  }

  sphere(pos, color, r, dur, follow = null) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    m.scale.setScalar(r);
    return this.add(m, dur, (dt, k) => {
      if (follow) { m.position.copy(follow.position); m.position.y += r * 0.6; }
      m.material.opacity = 0.35 * (k < 0.1 ? k * 10 : k > 0.85 ? (1 - k) / 0.15 : 1) * (0.85 + Math.sin(k * 40) * 0.15);
    });
  }

  explosion(pos, color = '#ff7020', size = 1) {
    FX.burst(pos.x, pos.y, pos.z, 40 * size, { color: [color, '#ffd060', '#ffffff'], speed: 7 * size, life: 0.6, size: 0.8 * size, drag: 0.9 });
    FX.burst(pos.x, pos.y, pos.z, 18 * size, { color: '#3a3030', speed: 3 * size, life: 1.4, size: 1.4 * size, additive: false, alpha: 0.5, up: 1.5, drag: 0.92, grow: 1.5 });
    this.ringWave(pos.clone().setY(pos.y - 0.5), color, 4 * size, 0.5);
    this.flash(pos, color, 50 * size, 0.4, 18);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), fireMat(color, '#ffe8a0', { disp: 0.6 }));
    m.position.copy(pos);
    this.add(m, 0.6, (dt, k) => { m.scale.setScalar((0.5 + Math.sqrt(k) * 2.6) * size); m.material.uniforms.uAlpha.value = 1 - k * k; });
  }

  // Летящий снаряд. target: функция, возвращающая Vector3 (или null)
  projectile(kind, from, targetFn, speed, onHit, opts = {}) {
    const obj = opts.obj || buildProjectile(kind, opts.color);
    obj.position.copy(from);
    const trail = opts.trail || PROJ_TRAIL[kind] || PROJ_TRAIL.magic;
    const last = from.clone();
    // светящаяся лента за снарядом
    const rb = opts.ribbon === false ? null : (opts.ribbon || PROJ_RIBBON[kind]);
    let ribbon = null;
    if (rb && this.camera) {
      ribbon = new RibbonTrail(this.scene, opts.color || rb[0], rb[1], rb[2], rb[3] || '#ffffff');
      ribbon.push(from);
    }
    let tgt = targetFn();
    const it = this.add(obj, 6, (dt) => {
      const t = targetFn() || tgt;
      tgt = t;
      if (!t) return true;
      const dir = t.clone().sub(obj.position);
      const d = dir.length();
      const step = speed * dt;
      if (d <= step + 0.3) { obj.position.copy(t); onHit && onHit(obj.position.clone()); return true; }
      dir.multiplyScalar(1 / d);
      if (opts.arc) dir.y += 0.0;
      obj.position.addScaledVector(dir, step);
      obj.quaternion.setFromUnitVectors(UP, dir);
      if (obj.userData.spin) obj.children[0].rotation.y += dt * 20;
      if (opts.roll) obj.rotateY((it.t || 0) * opts.roll);
      if (opts.onTick) opts.onTick(obj, dt, dir);
      if (ribbon) { ribbon.push(obj.position); ribbon.update(dt, this.camera.position); }
      // шлейф
      const n = trail.rate;
      for (let i = 0; i < n; i++) {
        const p = last.clone().lerp(obj.position, Math.random());
        FX.emit({ x: p.x + (Math.random() - 0.5) * trail.jit, y: p.y + (Math.random() - 0.5) * trail.jit, z: p.z + (Math.random() - 0.5) * trail.jit, vy: trail.vy || 0, life: trail.life, size: trail.size, color: Array.isArray(trail.color) ? trail.color[Math.floor(Math.random() * trail.color.length)] : (opts.color || trail.color), alpha: trail.alpha, additive: trail.additive, grow: trail.grow, tex: trail.tex, spin: trail.spin, gravity: trail.gravity });
      }
      last.copy(obj.position);
    });
    if (ribbon) {
      const end0 = it.onEnd;
      it.onEnd = () => { end0 && end0(); this.add(null, 1, (dt) => !ribbon.update(dt, this.camera.position), () => ribbon.dispose()); };
    }
    const lightC = opts.light || PROJ_LIGHT[kind];
    if (lightC) {
      const l = this.flash(from, lightC, 12, 6, 8);
      l.userData.follow = obj;
      const end = it.onEnd;
      it.onEnd = () => { l.userData.t = l.userData.dur; end && end(); };
    }
    return it;
  }

  // Метеор: падение с неба
  meteor(pos, color = '#ff5020', onImpact) {
    const start = pos.clone().add(new THREE.Vector3(-8, 26, -5));
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: '#3a1a10', emissive: color, emissiveIntensity: 2.5, roughness: 0.8, flatShading: true }));
    const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 3), fireMat('#ff3a00', '#ffc040', { disp: 0.7 }));
    m.add(fire);
    m.position.copy(start);
    const l = this.flash(start, color, 40, 0.9, 25);
    l.userData.follow = m;
    this.add(m, 0.8, (dt, k) => {
      m.position.lerpVectors(start, pos, k * k);
      m.rotation.x += dt * 5; m.rotation.y += dt * 3;
      for (let i = 0; i < 6; i++) FX.emit({ x: m.position.x + (Math.random() - 0.5), y: m.position.y + (Math.random() - 0.5), z: m.position.z + (Math.random() - 0.5), vy: 1, life: 0.6, size: 1.6, color: i % 2 ? color : '#ffd060' });
      FX.emit({ x: m.position.x, y: m.position.y, z: m.position.z, life: 1.5, size: 2.5, color: '#2a2020', additive: false, alpha: 0.5, grow: 1 });
    }, () => { this.explosion(pos.clone().setY(pos.y + 0.8), color, 2.2); onImpact && onImpact(); });
  }

  // Падающий предмет (камень, меч и т.п.)
  dropFromSky(pos, mesh, dur, onImpact, height = 18) {
    const start = pos.clone().setY(pos.y + height);
    mesh.position.copy(start);
    this.add(mesh, dur, (dt, k) => { mesh.position.lerpVectors(start, pos, k * k); }, onImpact);
  }

  attachAura(entityRoot, color, dur, r = 1.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.runeTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return this.add(m, dur, (dt, k) => {
      m.position.copy(entityRoot.position); m.position.y += 0.1;
      m.rotation.z += dt * 1.5;
      m.scale.set(r, r, 1);
      m.material.opacity = 0.8 * (k > 0.9 ? (1 - k) * 10 : Math.min(1, k * 10));
      if (Math.random() < dt * 20) {
        const a = Math.random() * Math.PI * 2;
        FX.emit({ x: m.position.x + Math.cos(a) * r * 0.8, y: m.position.y, z: m.position.z + Math.sin(a) * r * 0.8, vy: 1.5 + Math.random(), life: 0.9, size: 0.4, color });
      }
    });
  }

  // ---------- Эффекты некроманта и общие «зрелищные» приёмы ----------
  // Осколки (кости, камни), разлетающиеся с гравитацией
  shards(pos, n, mat, size = 0.12, speed = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.35, size * (1 + Math.random()), 5), mat);
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 1.5, (Math.random() - 0.5) * speed);
      const rv = new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0);
      this.add(m, 1.1 + Math.random() * 0.4, (dt, k) => {
        v.y -= 14 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += rv.x * dt; m.rotation.y += rv.y * dt;
        if (k > 0.75) m.scale.setScalar((1 - k) * 4);
      });
    }
  }
  // Жгуты похищения жизни от цели к заклинателю
  drainBeam(fromFn, toFn, color, dur = 0.9) {
    const strands = [];
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const group = new THREE.Group();
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); group.add(m); strands.push({ m, ph: i * 2.1 }); }
    let t = 0;
    this.add(group, dur, (dt, k) => {
      t += dt;
      const a = fromFn(), b = toFn();
      if (!a || !b) return true;
      for (const st of strands) {
        const mid = a.clone().lerp(b, 0.5);
        const side = new THREE.Vector3(Math.sin(t * 7 + st.ph), Math.cos(t * 5 + st.ph) * 0.8 + 0.6, Math.cos(t * 7 + st.ph)).multiplyScalar(1.1);
        const curve = new THREE.QuadraticBezierCurve3(a, mid.add(side), b);
        st.m.geometry.dispose();
        st.m.geometry = new THREE.TubeGeometry(curve, 16, 0.045 * (1 - k * 0.5), 5, false);
        const p = curve.getPoint((t * 1.8 + st.ph * 0.2) % 1);
        FX.emit({ x: p.x, y: p.y, z: p.z, life: 0.35, size: 0.35, color });
      }
      mat.opacity = 0.85 * (k > 0.8 ? (1 - k) * 5 : 1);
    });
  }
  // Гигантская призрачная коса: круговой взмах вокруг точки
  spectralScythe(center, color, radius, dur = 0.55, turns = 1.2, follow = null) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(radius * 0.55, radius * 0.25, radius, -radius * 0.05);
    shape.quadraticCurveTo(radius * 0.55, radius * 0.08, 0, -radius * 0.12); shape.closePath();
    const blade = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    blade.rotation.x = -Math.PI / 2;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, radius * 0.9, 6), blade.material);
    handle.rotation.z = Math.PI / 2; handle.position.x = -radius * 0.45;
    g.add(blade, handle);
    const trail = new THREE.Mesh(new THREE.RingGeometry(radius * 0.35, radius, 48, 1, 0, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    trail.rotation.x = -Math.PI / 2;
    g.add(trail);
    g.position.copy(center); g.position.y += 1.0;
    this.add(g, dur, (dt, k) => {
      if (follow) { g.position.copy(follow.position); g.position.y += 1.0; }
      g.rotation.y = -k * Math.PI * 2 * turns;
      trail.rotation.z = 0;
      const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      blade.material.opacity = 0.85 * a; trail.material.opacity = 0.35 * a;
      if (Math.random() < 0.8) { const ang = -g.rotation.y; FX.emit({ x: g.position.x + Math.cos(ang) * radius * 0.9, y: g.position.y, z: g.position.z - Math.sin(ang) * radius * 0.9, life: 0.5, size: 0.5, color }); }
    });
  }
  // Летящее лезвие косы вдоль линии
  flyingScythe(from, to, color, dur = 0.5) {
    const shape = new THREE.Shape();
    const R = 2.4;
    shape.moveTo(0, 0); shape.quadraticCurveTo(R * 0.55, R * 0.3, R, 0); shape.quadraticCurveTo(R * 0.55, R * 0.1, 0, -R * 0.14); shape.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const g = new THREE.Group(); g.add(m); m.position.x = -R / 2;
    g.position.copy(from);
    this.add(g, dur, (dt, k) => {
      g.position.lerpVectors(from, to, k);
      g.rotation.y += dt * 22;
      for (let i = 0; i < 3; i++) FX.emit({ x: g.position.x + (Math.random() - 0.5), y: g.position.y + (Math.random() - 0.5) * 0.4, z: g.position.z + (Math.random() - 0.5), life: 0.6, size: 0.6, color, vy: 0.4 });
      m.material.opacity = 0.9 * (1 - Math.pow(k, 4));
    });
  }
  // Печать проклятия над головой цели
  sigil(targetFn, color, dur) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: this.runeTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const skull = new THREE.Group();
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.12), sk.material); jaw.position.set(0, -0.14, 0.04);
    skull.add(sk, jaw);
    g.add(ring, skull);
    this.add(g, dur, (dt, k) => {
      const p = targetFn();
      if (!p) return true;
      g.position.copy(p);
      ring.rotation.z += dt * 2;
      skull.position.y = 0.35 + Math.sin(k * dur * 3) * 0.08;
      skull.rotation.y += dt * 1.5;
      const a = k > 0.9 ? (1 - k) * 10 : Math.min(1, k * dur * 4);
      ring.material.opacity = a; sk.material.opacity = 0.8 * a;
    });
  }
  // Костяные шипы, вырывающиеся из земли по кругу
  boneSpikes(center, radius, n, mat) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * 0.3;
      const r = radius * (0.5 + Math.random() * 0.5);
      const h = 1.2 + Math.random() * 1.5;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 6), mat);
      m.position.set(center.x + Math.cos(a) * r, center.y - h / 2, center.z + Math.sin(a) * r);
      m.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
      const delay = i * 0.04;
      this.add(m, 1.4 + delay, (dt, k) => {
        const t = k * (1.4 + delay) - delay;
        if (t < 0) return;
        const up = t < 0.15 ? t / 0.15 : t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.3) : 1;
        m.position.y = center.y - h / 2 + up * h * 0.95;
        if (t < 0.05) FX.burst(m.position.x, center.y + 0.1, m.position.z, 4, { color: '#5a4a3a', speed: 3, up: 3, life: 0.6, size: 0.4, additive: false, alpha: 0.8, gravity: 10 });
      });
    }
  }
  // Удар молнии с неба
  skyBolt(pos, color) {
    const top = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 28, (Math.random() - 0.5) * 4));
    this.lightning(top, pos.clone().setY(pos.y + 0.2), color, 0.45);
    this.ringWave(pos, color, 5, 0.6);
    this.flash(pos.clone().setY(pos.y + 3), color, 80, 0.5, 30);
  }
  // Земля трескается: тёмный круг с мерцающими трещинами
  groundCrack(pos, color, r = 2, dur = 2) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: '#0a0806', transparent: true, opacity: 0.75, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.08;
    this.add(m, dur, (dt, k) => { m.material.opacity = 0.75 * (k > 0.7 ? (1 - k) / 0.3 : 1); m.scale.setScalar(Math.min(1, k * 8)); });
    this.runeDecal(pos, color, r * 1.15, dur, 1.5);
    FX.burst(pos.x, pos.y + 0.2, pos.z, 18, { color: '#4a3a2a', speed: 3, up: 3.5, life: 0.9, size: 0.45, additive: false, alpha: 0.85, gravity: 9 });
  }
  // Призрачные крылья на спине (Аватар Смерти)
  wings(chestObj, color, dur) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ws = [];
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(1.3, 0.9); shape.lineTo(1.6, 0.2); shape.lineTo(1.25, -0.2); shape.lineTo(1.1, -0.85); shape.lineTo(0.7, -0.45); shape.lineTo(0.45, -0.95); shape.lineTo(0.2, -0.4); shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      if (sx < 0) geo.scale(-1, 1, 1);
      const w = new THREE.Mesh(geo, mat);
      const piv = new THREE.Group(); piv.add(w); piv.position.set(sx * 0.08, 0.2, -0.16);
      g.add(piv); ws.push({ piv, sx });
    }
    chestObj.add(g);
    let t = 0;
    this.add(null, dur, (dt, k) => {
      t += dt;
      for (const W of ws) W.piv.rotation.y = W.sx * (0.5 + Math.sin(t * 2.5) * 0.25);
      mat.opacity = 0.55 * (k > 0.9 ? (1 - k) * 10 : Math.min(1, k * dur * 3));
      if (Math.random() < 0.5) { const p = new THREE.Vector3(); chestObj.getWorldPosition(p); FX.emit({ x: p.x + (Math.random() - 0.5) * 2.4, y: p.y + Math.random() * 1.2, z: p.z + (Math.random() - 0.5) * 1, vy: -0.5, life: 0.8, size: 0.35, color }); }
    }, () => g.removeFromParent());
  }

  // ======== Зрелищные эффекты умений ========
  // Ударная волна: светящееся кольцо + пыль + разлетающиеся камни
  shockwave(pos, color, radius = 6, dur = 0.6, debris = true) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.9, 48, 1, true), energyMat(color, { scale: 6, speed: 2, fadeV: true }));
    g.position.copy(pos); g.position.y += 0.4;
    this.add(g, dur, (dt, k) => {
      const r = 0.5 + radius * (1 - Math.pow(1 - k, 3));
      g.scale.set(r, 1 - k * 0.6, r);
      g.material.uniforms.uAlpha.value = 1 - k;
    });
    this.ringWave(pos, color, radius * 1.1, dur * 0.9);
    FX.ring(pos.x, pos.y + 0.3, pos.z, radius * 0.3, 36, { color: '#7a6a52', speed: radius * 2.2, vy: 2.5, life: 0.9, size: 1.3, additive: false, alpha: 0.6, gravity: 5, grow: 1.2, drag: 0.92 });
    if (debris) this.rocks(pos, Math.round(radius * 2), radius * 0.6);
  }
  // Камни-обломки, вылетающие из земли
  rocks(pos, n, spread = 3, size = 0.25) {
    const mat = this._rockMat || (this._rockMat = new THREE.MeshStandardMaterial({ color: '#6e655a', roughness: 0.95, flatShading: true }));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size * (0.5 + Math.random()), 0), mat);
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      m.position.set(pos.x + Math.cos(a) * r, pos.y + 0.1, pos.z + Math.sin(a) * r);
      m.castShadow = true;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 4 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 3));
      this.add(m, 1.3, (dt, k) => {
        v.y -= 18 * dt; m.position.addScaledVector(v, dt);
        if (m.position.y < pos.y) { m.position.y = pos.y; v.multiplyScalar(0.4); v.y = Math.abs(v.y) * 0.3; }
        m.rotation.x += dt * 6; m.rotation.z += dt * 4;
        if (k > 0.8) m.scale.setScalar((1 - k) * 5);
      });
    }
  }
  // Летящий серп-волна от клинка
  crescent(pos, yaw, color, radius = 2.4, opts = {}) {
    const shape = new THREE.Shape();
    const R = radius, r = radius * (opts.thin || 0.72);
    shape.absarc(0, 0, R, -Math.PI * 0.42, Math.PI * 0.42, false);
    shape.absarc(-radius * 0.18, 0, r, Math.PI * 0.42, -Math.PI * 0.42, true);
    const geo = new THREE.ShapeGeometry(shape, 24);
    const m = new THREE.Mesh(geo, energyMat(color, { scale: 4, speed: 3, rim: 1, rimA: 0.3 }));
    const g = new THREE.Group(); g.add(m);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 2 + (opts.roll || 0);
    g.position.copy(pos); g.rotation.y = yaw;
    if (opts.tilt) g.rotation.z = opts.tilt;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const travel = opts.travel || 0, dur = opts.dur || 0.35;
    const start = pos.clone();
    this.add(g, dur, (dt, k) => {
      g.position.copy(start).addScaledVector(dir, travel * k);
      g.scale.setScalar(0.7 + k * (opts.grow || 0.6));
      m.material.uniforms.uAlpha.value = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      if (travel && Math.random() < 0.7) FX.emit({ x: g.position.x, y: g.position.y, z: g.position.z, vx: (Math.random() - 0.5), vy: Math.random(), vz: (Math.random() - 0.5), life: 0.4, size: 0.4, color });
    });
    return g;
  }
  // Вихрь (торнадо) из энергии
  tornado(pos, color, radius = 3, height = 4, dur = 1, follow = null) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(radius * (0.25 + t * t * 0.9), t * height)); }
    const g = new THREE.Group();
    const layers = [];
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), energyMat(color, { scale: 3 + k * 2, speed: 2.5 + k, fadeV: true, rim: 1.2, rimA: 0.25 }));
      m.scale.setScalar(1 - k * 0.2);
      g.add(m); layers.push(m);
    }
    g.position.copy(pos);
    this.add(g, dur, (dt, k) => {
      if (follow) { g.position.copy(follow.position); }
      layers[0].rotation.y += dt * 9; layers[1].rotation.y -= dt * 12;
      const a = k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1;
      for (const l of layers) l.material.uniforms.uAlpha.value = a;
      if (Math.random() < 0.8) { const ang = Math.random() * 6.28; FX.emit({ x: g.position.x + Math.cos(ang) * radius, y: g.position.y + Math.random() * height, z: g.position.z + Math.sin(ang) * radius, vx: -Math.sin(ang) * 6, vz: Math.cos(ang) * 6, vy: 2, life: 0.5, size: 0.35, color }); }
    });
  }
  // Разлом земли: каменные шипы вырываются по линии, в трещине светится энергия
  fissure(from, dir, len, color = '#ff8a30', standY = null) {
    const mat = this._spikeMat || (this._spikeMat = new THREE.MeshStandardMaterial({ color: '#5e564c', roughness: 0.9, flatShading: true }));
    const n = Math.floor(len / 1.1);
    for (let i = 1; i <= n; i++) {
      const p = from.clone().addScaledVector(dir, i * 1.1);
      p.x += (Math.random() - 0.5) * 0.8; p.z += (Math.random() - 0.5) * 0.8;
      if (standY) p.y = standY(p.x, p.z);
      const h = 1.0 + Math.random() * 1.4;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.35 + Math.random() * 0.25, h, 5), mat);
      m.castShadow = true;
      m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6);
      const delay = i * 0.035;
      this.add(m, 1.5 + delay, (dt, k) => {
        const t = k * (1.5 + delay) - delay;
        if (t < 0) { m.position.set(p.x, p.y - h, p.z); return; }
        const up = t < 0.12 ? t / 0.12 : t > 1.1 ? Math.max(0, 1 - (t - 1.1) / 0.4) : 1;
        m.position.set(p.x, p.y - h / 2 + up * h * 0.75, p.z);
        if (t < 0.04) { FX.burst(p.x, p.y + 0.2, p.z, 6, { color: '#6a5a44', speed: 4, up: 4, life: 0.8, size: 0.6, additive: false, alpha: 0.85, gravity: 10 }); FX.burst(p.x, p.y + 0.1, p.z, 5, { color, speed: 2, up: 3, life: 0.5, size: 0.4 }); }
      });
    }
    // светящаяся трещина
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len), energyMat(color, { scale: 8, speed: 1.5, rim: 1 }));
    crack.rotation.x = -Math.PI / 2; crack.rotation.z = -Math.atan2(dir.x, dir.z);
    const mid = from.clone().addScaledVector(dir, len / 2);
    crack.position.set(mid.x, (standY ? standY(mid.x, mid.z) : from.y) + 0.06, mid.z);
    this.add(crack, 1.8, (dt, k) => { crack.material.uniforms.uAlpha.value = Math.min(1, k * 8) * (1 - k); crack.scale.y = Math.min(1, k * 6); });
  }
  // Ледяные кристаллы, вырастающие кольцом
  iceSpikes(center, radius, n, standY = null) {
    const mat = this._iceMat || (this._iceMat = new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', roughness: 0.08, metalness: 0.1, transmission: 0.0, clearcoat: 1, emissive: '#2a6a9a', emissiveIntensity: 0.5, transparent: true, opacity: 0.88 }));
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * 0.25, r = radius * (0.35 + Math.random() * 0.65);
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r, y = standY ? standY(x, z) : center.y;
      const h = 0.8 + Math.random() * 1.6;
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), mat);
      m.scale.set(0.6, h * 1.6, 0.6);
      m.rotation.set(Math.cos(a) * 0.4, Math.random(), -Math.sin(a) * 0.4);
      m.castShadow = true;
      const delay = r / radius * 0.18;
      this.add(m, 1.6 + delay, (dt, k) => {
        const t = k * (1.6 + delay) - delay;
        const up = t < 0 ? 0 : t < 0.1 ? t / 0.1 : t > 1.3 ? Math.max(0, 1 - (t - 1.3) / 0.3) : 1;
        m.position.set(x, y - h * 0.5 + up * h * 0.6, z);
        if (t > 1.3 && t - dt < 1.3) FX.burst(x, y + h * 0.4, z, 10, { color: ['#d0f0ff', '#ffffff'], speed: 4, life: 0.5, size: 0.3, gravity: 6 });
      });
    }
  }
  // Купол-щит с переливами, следует за целью
  dome(follow, color, r, dur) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 4), energyMat(color, { scale: 5, speed: 0.6, rim: 2.5, rimA: 0.9 }));
    const hex = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.01, 2), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(hex);
    return this.add(m, dur, (dt, k) => {
      m.position.copy(follow.position); m.position.y += r * 0.55;
      m.rotation.y += dt * 0.4;
      const a = k < 0.06 ? k / 0.06 : k > 0.92 ? (1 - k) / 0.08 : 1;
      m.material.uniforms.uAlpha.value = a * 0.8; hex.material.opacity = 0.25 * a * (0.7 + Math.sin(k * dur * 6) * 0.3);
    });
  }
  // Божественные лучи с неба + падающие искры света
  godRays(pos, color, dur = 1.4, radius = 3) {
    const g = new THREE.Group();
    const mats = [];
    for (let i = 0; i < 9; i++) {
      const w = 0.25 + Math.random() * 0.5, h = 24;
      const mm = energyMat(color, { scale: 2, speed: 0.8, fadeV: true, rim: 1, rimA: 0.2 });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.6, h, 10, 1, true), mm);
      const a = Math.random() * 6.28, r = Math.random() * radius;
      m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      m.rotation.set((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2);
      g.add(m); mats.push(mm);
    }
    g.position.copy(pos);
    this.add(g, dur, (dt, k) => {
      const a = k < 0.2 ? k / 0.2 : (1 - k) / 0.8;
      for (const mm of mats) mm.uniforms.uAlpha.value = a * 0.8;
      for (let i = 0; i < 3; i++) FX.emit({ x: pos.x + (Math.random() - 0.5) * radius * 2, y: pos.y + 6 + Math.random() * 6, z: pos.z + (Math.random() - 0.5) * radius * 2, vy: -6, life: 1, size: 0.3, color: '#fff8d0' });
    });
    this.flash(pos.clone().setY(pos.y + 3), color, 50, dur, 22);
  }
  // Гигантский световой меч падает с неба
  giantSword(pos, color, onImpact) {
    const g = new THREE.Group();
    const em = energyMat(color, { scale: 3, speed: 1.5, rim: 1.5, rimA: 0.7 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9, 0.12), em); blade.position.y = 4.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), em); tip.position.y = -0.7; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.25;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 0.4), em); guard.position.y = 9.1;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2, 8), em); grip.position.y = 10.3;
    g.add(blade, tip, guard, grip);
    const start = pos.clone().setY(pos.y + 30);
    g.position.copy(start);
    this.add(g, 0.55, (dt, k) => { g.position.lerpVectors(start, pos.clone().setY(pos.y + 0.6), k * k); }, () => {
      this.shockwave(pos, color, 7, 0.7);
      this.flash(pos.clone().setY(pos.y + 2), color, 90, 0.6, 30);
      onImpact && onImpact();
      this.add(g, 1.2, (dt, k) => { em.uniforms.uAlpha.value = 1 - k; g.position.y = pos.y + 0.6 - k * 2; });
    });
  }
  // Призрачный двойник модели (предки / аватар)
  ghostClone(model, color, dur = 2, scale = 1.6, offset = -1.2) {
    const clone = model.root.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    clone.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    const base = model.root.scale.x;
    this.add(clone, dur, (dt, k) => {
      clone.position.copy(model.root.position);
      clone.rotation.y = model.root.rotation.y;
      clone.position.x -= Math.sin(clone.rotation.y) * offset; clone.position.z -= Math.cos(clone.rotation.y) * offset;
      clone.scale.setScalar(base * scale * (1 + k * 0.1));
      mat.opacity = 0.35 * (k < 0.15 ? k / 0.15 : (1 - k) / 0.85);
    });
  }
  // Колючие лозы вырастают из земли
  vines(center, radius, n, standY) {
    const mat = this._vineMat || (this._vineMat = new THREE.MeshStandardMaterial({ color: '#3a6a22', roughness: 0.8 }));
    const thorn = this._thornMat || (this._thornMat = new THREE.MeshStandardMaterial({ color: '#d0c890', roughness: 0.6 }));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * radius;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r, y = standY ? standY(x, z) : center.y;
      const pts = [];
      const h = 1.2 + Math.random() * 1.6, tw = Math.random() * 6;
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(Math.cos(tw + t * 5) * 0.35 * t, t * h, Math.sin(tw + t * 5) * 0.35 * t)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 24, 0.07, 6);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      for (let k = 2; k < 8; k++) { const p = curve.getPoint(k / 8); const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), thorn); c.position.copy(p); c.rotation.z = (k % 2 ? 1 : -1) * 1.2; m.add(c); }
      geo.setDrawRange(0, 0);
      const total = geo.index.count;
      this.add(m, 4, (dt, k) => {
        const g = k < 0.1 ? k / 0.1 : 1;
        geo.setDrawRange(0, Math.floor(total * g / 6) * 6);
        if (k > 0.85) m.scale.setScalar((1 - k) / 0.15);
      });
    }
  }
  // Камни, кружащие вокруг цели (каменная кожа)
  orbitRocks(follow, n, r, dur, color = '#8a8274') {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
    const g = new THREE.Group();
    const rs = [];
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.12, 0), mat); g.add(m); rs.push({ m, a: i / n * Math.PI * 2, y: 0.4 + Math.random() * 1.4, s: 1.5 + Math.random() }); }
    this.add(g, dur, (dt, k, it) => {
      g.position.copy(follow.position);
      for (const q of rs) { q.a += dt * q.s; q.m.position.set(Math.cos(q.a) * r, q.y + Math.sin(q.a * 2) * 0.1, Math.sin(q.a) * r); q.m.rotation.x += dt * 3; }
      g.scale.setScalar(k < 0.1 ? k / 0.1 : k > 0.9 ? (1 - k) / 0.1 : 1);
      void it;
    });
  }
  // Оглушение: звёзды кружат над головой
  stunStars(targetFn, dur) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffe060', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat); st.scale.y = 0.4; g.add(st); }
    this.add(g, dur, (dt, k) => {
      const p = targetFn(); if (!p) return true;
      g.position.copy(p);
      g.children.forEach((st, i) => { const a = k * dur * 5 + i * Math.PI / 2; st.position.set(Math.cos(a) * 0.45, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.45); st.rotation.y += dt * 6; });
      mat.opacity = k > 0.85 ? (1 - k) / 0.15 : 1;
    });
  }
}

const PROJ_TRAIL = {
  arrow: { rate: 1, jit: 0.02, life: 0.25, size: 0.12, color: '#ffffff', alpha: 0.4 },
  poisonarrow: { rate: 3, jit: 0.1, life: 0.5, size: 0.3, color: '#70ff40' },
  firearrow: { rate: 4, jit: 0.1, life: 0.4, size: 0.4, color: ['#ff8020', '#ffd040'] },
  stormarrow: { rate: 4, jit: 0.2, life: 0.3, size: 0.3, color: ['#a0d0ff', '#ffffff'] },
  bigarrow: { rate: 4, jit: 0.05, life: 0.5, size: 0.35, color: '#ff4040' },
  fireball: { rate: 8, jit: 0.25, life: 0.45, size: 0.8, color: ['#ff6010', '#ffb030', '#ffe080'], vy: 0.5 },
  frostbolt: { rate: 5, jit: 0.2, life: 0.5, size: 0.45, color: ['#80d0ff', '#ffffff'] },
  magic: { rate: 4, jit: 0.15, life: 0.4, size: 0.4, color: ['#8080ff', '#c0a0ff'] },
  bonespear: { rate: 7, jit: 0.25, life: 0.55, size: 0.45, color: ['#60ff90', '#d0ffd0', '#205030'] },
  bone: { rate: 3, jit: 0.1, life: 0.4, size: 0.3, color: '#90ffa0' },
  shadowbolt: { rate: 6, jit: 0.25, life: 0.6, size: 0.6, color: ['#7020c0', '#200830'], },
  shadow: { rate: 5, jit: 0.2, life: 0.5, size: 0.5, color: ['#6040c0', '#a080ff'] },
  drain: { rate: 6, jit: 0.2, life: 0.5, size: 0.45, color: ['#ff2050', '#a00020'] },
  curse: { rate: 5, jit: 0.2, life: 0.6, size: 0.5, color: ['#80ff40', '#305010'] },
  hammer: { rate: 5, jit: 0.3, life: 0.3, size: 0.35, color: ['#a0d8ff', '#ffffff'] },
  fire: { rate: 7, jit: 0.25, life: 0.45, size: 0.7, color: ['#ff6010', '#ffb030'] },
  spear: { rate: 1, jit: 0.02, life: 0.3, size: 0.15, color: '#ffffff', alpha: 0.4 },
  frost: { rate: 6, jit: 0.25, life: 0.5, size: 0.6, color: ['#80e0ff', '#ffffff'] },
};
// лента: [цвет, ширина, время жизни, цвет ядра]
const PROJ_RIBBON = {
  arrow: ['#c8d8ff', 0.05, 0.22], poisonarrow: ['#60ff40', 0.12, 0.4], firearrow: ['#ff7020', 0.16, 0.4, '#ffe080'], stormarrow: ['#80c0ff', 0.16, 0.4],
  bigarrow: ['#ff3030', 0.3, 0.6, '#ffe0e0'], fireball: ['#ff5a10', 0.45, 0.45, '#ffd070'], frostbolt: ['#60c8ff', 0.25, 0.4], frost: ['#60c8ff', 0.25, 0.4],
  magic: ['#8a80ff', 0.18, 0.3], shadowbolt: ['#7020c0', 0.35, 0.5, '#d0a0ff'], shadow: ['#6040c0', 0.2, 0.35], bonespear: ['#40ff80', 0.22, 0.4],
  bone: ['#60ff90', 0.1, 0.25], hammer: ['#80c8ff', 0.3, 0.35], curse: ['#80ff40', 0.25, 0.45], fire: ['#ff6010', 0.3, 0.4, '#ffd070'], spear: ['#ffffff', 0.05, 0.2],
};
const PROJ_LIGHT = { fireball: '#ff7020', fire: '#ff7020', frostbolt: '#60c0ff', shadowbolt: '#8030ff' };

function buildProjectile(kind, color) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const arrowLike = ['arrow', 'poisonarrow', 'firearrow', 'stormarrow', 'bigarrow', 'spear'].includes(kind);
  if (arrowLike) {
    const big = kind === 'bigarrow' || kind === 'spear' ? 1.4 : 1;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * big, 0.012 * big, 0.8 * big, 5), woodMat('#8a6a40'));
    inner.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03 * big, 0.1 * big, 6), metalMat('#c0c4c8', 0.3));
    tip.position.y = 0.45 * big; inner.add(tip);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.12, 0.04), basicMat('#e8e0d0', 0.7));
      f.position.y = -0.34 * big; f.rotation.y = i / 3 * Math.PI * 2;
      f.position.x = Math.cos(i / 3 * Math.PI * 2) * 0.02; f.position.z = Math.sin(i / 3 * Math.PI * 2) * 0.02;
      inner.add(f);
    }
    const glowC = { poisonarrow: '#70ff40', firearrow: '#ff8020', stormarrow: '#a0d0ff', bigarrow: '#ff4040' }[kind];
    if (glowC) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMat(glowC, 0.7)); s.position.y = 0.4; inner.add(s); }
  } else if (kind === 'hammer') {
    const h = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.22), metalMat('#b0b8c8', 0.25, '#60b0ff', 0.6));
    head.position.y = 0.3; h.add(head);
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), woodMat());
    h.add(haft);
    h.rotation.z = Math.PI / 2;
    inner.add(h);
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), glowMat('#80c8ff', 0.25)));
    g.userData.spin = true;
  } else if (kind === 'bonespear') {
    // зазубренное костяное копьё с вращающимися осколками
    const bm = boneMat('#ece4cc');
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.3, 7), bm); sp.position.y = 0.1; inner.add(sp);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.28, 5), bm);
      b.position.set(Math.cos(i * 1.57) * 0.07, -0.15 + i * 0.12, Math.sin(i * 1.57) * 0.07);
      b.rotation.set(Math.sin(i * 1.57) * -0.9, 0, Math.cos(i * 1.57) * 0.9);
      inner.add(b);
    }
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glowMat('#50ff80', 0.28)));
    g.userData.spin = true;
  } else if (kind === 'bone') {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), boneMat('#e8e0c8'));
    inner.add(sp);
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), glowMat('#60ff80', 0.35)));
  } else if (kind === 'curse') {
    // светящийся череп
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), new THREE.MeshBasicMaterial({ color: '#b0ff70' }));
    sk.scale.set(0.9, 1, 1);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.14), sk.material); jaw.position.set(0, -0.17, 0.05);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#102008' })); e.position.set(sx * 0.07, 0.02, 0.16); inner.add(e); }
    inner.add(sk, jaw);
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), glowMat('#80ff40', 0.3)));
    inner.rotation.x = -Math.PI / 2;
  } else if (kind === 'frostbolt' || kind === 'frost') {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), gemMat('#a0e8ff', 2.5));
    c.scale.set(0.6, 1.8, 0.6); inner.add(c);
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), glowMat('#60c0ff', 0.4)));
  } else if (kind === 'fireball' || kind === 'fire') {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), fireMat('#ff4a08', '#ffd060'));
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), fireMat('#ff2a00', '#ff9030', { disp: 0.5 }));
    halo.material.uniforms.uAlpha.value = 0.55;
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff4d0' })));
    inner.add(core, halo);
  } else if (kind === 'shadowbolt') {
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: '#000000' })));
    inner.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 3), fireMat('#5010a0', '#c070ff')));
  } else {
    const col = color || { fireball: '#ff7020', fire: '#ff6020', magic: '#8080ff', shadowbolt: '#8030ff', shadow: '#8060ff', drain: '#ff2050', curse: '#80ff40' }[kind] || '#ffffff';
    const size = kind === 'fireball' ? 0.32 : 0.22;
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.8, 14, 10), glowMat(col, 0.6)));
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(size * 3, 12, 8), glowMat(col, 0.2)));
  }
  return g;
}

function disposeObj(o) {
  o.traverse(c => {
    if (c.isMesh) {
      if (c.geometry && !c.geometry.userData.keep) c.geometry.dispose();
      if (c.material && c.material.isShaderMaterial && c.material.uniforms && c.material.uniforms.uTime === fxTime) c.material.dispose();
    }
  });
}
