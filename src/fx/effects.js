// Визуальные эффекты умений: снаряды, кольца, столпы света, молнии, вспышки, щиты.
import * as THREE from 'three';
import { FX } from './particles.js';
import { ringTexture, runeCircle } from '../core/textures.js';
import { gemMat, glowMat, boneMat, metalMat, woodMat, basicMat } from '../chars/materials.js';

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
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff4c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    this.add(m, 0.3, (dt, k) => { m.scale.setScalar(0.4 + k * 2.4 * size); m.material.opacity = 1 - k; });
  }

  // Летящий снаряд. target: функция, возвращающая Vector3 (или null)
  projectile(kind, from, targetFn, speed, onHit, opts = {}) {
    const obj = buildProjectile(kind, opts.color);
    obj.position.copy(from);
    const trail = PROJ_TRAIL[kind] || PROJ_TRAIL.magic;
    const last = from.clone();
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
      // шлейф
      const n = trail.rate;
      for (let i = 0; i < n; i++) {
        const p = last.clone().lerp(obj.position, Math.random());
        FX.emit({ x: p.x + (Math.random() - 0.5) * trail.jit, y: p.y + (Math.random() - 0.5) * trail.jit, z: p.z + (Math.random() - 0.5) * trail.jit, vy: trail.vy || 0, life: trail.life, size: trail.size, color: Array.isArray(trail.color) ? trail.color[i % trail.color.length] : (opts.color || trail.color), alpha: trail.alpha, additive: trail.additive, grow: trail.grow });
      }
      last.copy(obj.position);
    });
    if (PROJ_LIGHT[kind]) {
      const l = this.flash(from, PROJ_LIGHT[kind], 12, 6, 8);
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
  bonespear: { rate: 3, jit: 0.1, life: 0.4, size: 0.35, color: ['#80ff90', '#d0ffd0'] },
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
  } else if (kind === 'bonespear' || kind === 'bone') {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 6), boneMat('#e8e0c8'));
    inner.add(sp);
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glowMat('#60ff80', 0.4)));
  } else if (kind === 'frostbolt' || kind === 'frost') {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), gemMat('#a0e8ff', 2.5));
    c.scale.set(0.6, 1.8, 0.6); inner.add(c);
    inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), glowMat('#60c0ff', 0.4)));
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
    }
  });
}
