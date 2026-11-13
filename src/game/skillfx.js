// Постановка умений: у каждого умения своя хореография —
// подготовка (сбор энергии, круги), удар (росчерк, снаряд, луч) и последствия.
// Здесь только зрелище; урон и логика остаются в skills.js.
import * as THREE from 'three';
import { FX } from '../fx/particles.js';
import { fireMat, energyMat } from '../fx/effects.js';
import { bladeGeo } from '../fx/vfx.js';
import { boneMat } from '../chars/materials.js';
import { ACTIONS } from '../chars/humanoid.js';

const R = Math.random;
const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const addMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// Контекст умения: всё, что нужно постановке
export function makeCtx(game, P, skill, target, hand, anim) {
  const act = ACTIONS[anim] || {};
  const c = {
    game, E: game.effects, P, skill, target, hand, anim,
    color: skill.color,
    // момент удара по анимации (сек)
    T: (act.strike != null ? act.strike * act.dur : 0.3) / (P.hasteMul || 1),
    gy: (x, z) => game.world.standY(x, z),
    ground: (v) => { const g = v.clone(); g.y = game.world.standY(g.x, g.z); return g; },
    // точка перед героем
    fwd: (d, h = 0) => V(P.pos.x + Math.sin(P.yaw) * d, P.pos.y + h, P.pos.z + Math.cos(P.yaw) * d),
    dir: () => V(Math.sin(P.yaw), 0, Math.cos(P.yaw)),
    feet: () => P.pos.clone(),
    after: (t, fn) => game.schedule(t, fn),
    head: (t) => V(t.pos.x, t.pos.y + (t.model && t.model.headTop ? t.model.headTop() : 2) + 0.35, t.pos.z),
    tgtFn: (t) => () => (t && t.alive ? t.center() : null),
  };
  return c;
}

// ---------- Общие приёмы ----------
// Звуковые волны крика
function soundRings(c, color, n = 3, r = 9, h = 1.5) {
  for (let i = 0; i < n; i++) c.after(i * 0.11, () => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 48), addMat(color));
    ring.rotation.x = Math.PI / 2; ring.position.copy(c.P.pos).setY(c.P.pos.y + h);
    c.E.add(ring, 0.6, (dt, k) => { const e = easeOut(k), s = 0.5 + e * (r + i * 2); ring.scale.set(s, s, 1 + e * 8); ring.material.opacity = (1 - k) * 0.8; });
  });
}
// Шестигранный щит-вспышка, летит вперёд
function hexShield(c, pos, yaw, color, size = 1.6, dur = 0.42) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = yaw;
  const mat = addMat(color);
  const hex = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 6, 1), mat);
  const hex2 = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.53, 6, 1), mat);
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.84, 6), energyMat(color, { scale: 4, speed: 3 }));
  g.add(hex, hex2, plate);
  const dir = V(Math.sin(yaw), 0, Math.cos(yaw)), p0 = pos.clone();
  c.E.add(g, dur, (dt, k) => { const e = easeOut(k); g.scale.setScalar(size * (0.3 + e)); hex2.rotation.z += dt * 5; mat.opacity = 1 - k; plate.material.uniforms.uAlpha.value = (1 - k) * 0.55; g.position.copy(p0).addScaledVector(dir, e * 0.9); });
}
// Каменные плиты встают кольцом из земли
function slabs(c, center, r, n, dur, glow = '#70a8ff') {
  const mat = new THREE.MeshStandardMaterial({ color: '#7c7468', roughness: 0.95, flatShading: true });
  const gm = addMat(glow, 0.9);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r, y = c.gy(x, z);
    const g = new THREE.Group();
    const h = 2.0 + R() * 0.7;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, h, 5), mat); body.position.y = h / 2; body.scale.z = 0.55; body.castShadow = true;
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.16, h * 0.55), gm); rune.position.set(0, h * 0.55, 0.26);
    const rune2 = rune.clone(); rune2.position.z = -0.26;
    g.add(body, rune, rune2);
    g.rotation.y = -a + Math.PI / 2; g.rotation.z = (R() - 0.5) * 0.16;
    g.position.set(x, y - h - 0.3, z);
    const d0 = i * 0.035;
    c.E.add(g, dur + d0, (dt, k, it) => {
      const t = it.t - d0; if (t < 0) return;
      const up = t < 0.28 ? easeOutBack(t / 0.28) : t > dur - 0.5 ? Math.max(0, (dur - t) / 0.5) : 1;
      g.position.y = y - (h + 0.3) * (1 - up);
      gm.opacity = 0.5 + 0.4 * Math.sin(it.t * 6);
    });
    c.after(d0, () => { FX.burst(x, y + 0.2, z, 5, { color: '#8a7a64', speed: 2.5, life: 0.7, size: 0.9, additive: false, alpha: 0.5, grow: 1.2, tex: 'smoke' }); FX.burst(x, y + 0.3, z, 4, { color: '#8a8070', speed: 4, life: 0.6, size: 0.25, gravity: 12, up: 3, additive: false, tex: 'shard' }); });
  }
}
// Кольцо-нимб, проходящее вдоль тела
function halo(c, follow, color, y0, y1, r = 0.7, dur = 0.9, delay = 0) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 40), addMat(color));
  ring.rotation.x = Math.PI / 2; ring.visible = false;
  c.E.add(ring, dur + delay, (dt, k, it) => {
    const t = (it.t - delay) / dur; if (t < 0) return;
    ring.visible = true;
    ring.position.copy(follow.position); ring.position.y += y0 + (y1 - y0) * easeOut(t);
    ring.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.25);
    ring.material.opacity = Math.sin(Math.min(1, t) * Math.PI);
    if (R() < 0.5) { const a = R() * TAU; FX.emit({ x: ring.position.x + Math.cos(a) * r, y: ring.position.y, z: ring.position.z + Math.sin(a) * r, vy: 0.4, life: 0.5, size: 0.25, color, tex: 'sparkle' }); }
  });
}
// Огонёк, летящий по дуге от точки к цели (души, кровь, искры исцеления)
function wisp(c, from, toFn, color, o = {}) {
  const dur = o.dur || 0.6, mid = V((R() - 0.5) * (o.arc || 2.5), (o.lift == null ? 1.5 : o.lift) + R(), (R() - 0.5) * (o.arc || 2.5));
  const p = V(0, 0, 0), a = from.clone();
  c.E.add(null, dur, (dt, k) => {
    const to = toFn(); if (!to) return true;
    const e = k * k * (3 - 2 * k);
    p.copy(a).lerp(to, e).addScaledVector(mid, Math.sin(e * Math.PI));
    FX.emit({ x: p.x, y: p.y, z: p.z, life: 0.045, size: o.size || 0.55, color, tex: o.tex || 'glow', rot: 0, spin: 0 });
    FX.emit({ x: p.x, y: p.y, z: p.z, life: 0.4, size: (o.size || 0.55) * 0.5, color: o.color2 || color, tex: 'glow', grow: -0.6 });
  }, o.onEnd);
}
// Клубы дыма/тумана
function cloud(c, pos, r, colors, n, life = 2.4, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * r;
    FX.emit({ x: pos.x + Math.cos(a) * d, y: pos.y + (o.h || 0.5) + R() * (o.hv == null ? 0.8 : o.hv), z: pos.z + Math.sin(a) * d, vx: Math.cos(a) * (o.out || 0.5), vy: o.vy == null ? 0.25 : o.vy, vz: Math.sin(a) * (o.out || 0.5), life: life * (0.7 + R() * 0.5), size: (o.size || 2.2) * (0.7 + R() * 0.6), color: colors[Math.floor(R() * colors.length)], additive: false, alpha: o.alpha || 0.38, grow: o.grow == null ? 0.8 : o.grow, drag: 0.97, tex: 'smoke' });
  }
}
// Прицельная метка, сжимающаяся на цели
function crosshair(c, tgtFn, color, dur) {
  const g = new THREE.Group(), mat = addMat(color);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 4, 40), mat), new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 4, 28), mat));
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.5), mat); t.position.set(Math.cos(i * Math.PI / 2) * 1.05, Math.sin(i * Math.PI / 2) * 1.05, 0); t.rotation.z = i * Math.PI / 2 + Math.PI / 2; g.add(t); }
  c.E.add(g, dur, (dt, k) => {
    const p = tgtFn(); if (!p) return true;
    g.position.copy(p); g.lookAt(c.game.camera.position); g.rotateZ(k * 2.5);
    g.scale.setScalar(2.4 - 1.7 * easeOut(k));
    mat.opacity = Math.min(1, k * 5) * (k > 0.9 ? (1 - k) * 10 : 1);
  });
}
// Призрачные клинки: появляются кольцом над точкой и по очереди вонзаются
function phantomBlades(c, p, r, n, color, t0 = 0.3) {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = p.x + Math.cos(a) * r * 0.62, z = p.z + Math.sin(a) * r * 0.62, y = c.gy(x, z);
    const g = new THREE.Group(), mat = addMat(color, 0);
    const b1 = new THREE.Mesh(bladeGeo(), mat), b2 = new THREE.Mesh(bladeGeo(), mat); b2.rotation.y = Math.PI / 2;
    g.add(b1, b2); g.scale.setScalar(2.3);
    const hover = V(p.x + Math.cos(a) * r * 0.9, y + 6.2, p.z + Math.sin(a) * r * 0.9), land = V(x, y + 2.0, z);
    const tilt = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), land.clone().sub(hover).normalize());
    const tStab = t0 + i * 0.055; let hit = false;
    g.position.copy(hover); g.quaternion.copy(tilt);
    c.E.add(g, tStab + 0.95, (dt, k, it) => {
      const t = it.t;
      if (t < tStab) { mat.opacity = Math.min(0.95, t / 0.18); g.position.copy(hover).setY(hover.y + Math.sin(t * 9 + i) * 0.12); g.scale.setScalar(2.3 * Math.min(1, easeOutBack(Math.min(1, t / 0.2)))); }
      else if (t < tStab + 0.09) { g.position.lerpVectors(hover, land, (t - tStab) / 0.09); FX.emit({ x: g.position.x, y: g.position.y, z: g.position.z, life: 0.2, size: 0.8, color, tex: 'glow' }); }
      else {
        if (!hit) { hit = true; g.position.copy(land); c.E.spark(V(x, y + 0.3, z), color, { n: 8, flare: 1.8, ringR: 1.2, light: false }); FX.burst(x, y + 0.2, z, 4, { color: '#8a8a9a', speed: 2, life: 0.6, size: 0.8, additive: false, alpha: 0.4, grow: 1, tex: 'smoke' }); }
        mat.opacity = 0.95 * Math.max(0, 1 - (t - tStab - 0.35) / 0.6);
      }
    });
  }
}
// Камни вырываются из земли вокруг точки
function eruptRocks(c, pos, n, r, color = '#7a6e5c') {
  FX.burst(pos.x, pos.y + 0.3, pos.z, n, { color: [color, '#5a5044'], speed: r * 2.2, life: 0.9, size: 0.34, gravity: 16, up: 6, additive: false, tex: 'shard', spread: r * 0.6 });
}
// Метка-череп над целью
function skullPop(c, pos, color, size = 1.2) {
  FX.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 1.1, life: 1.1, size, color, tex: 'skull', drag: 0.97, grow: 0.25 });
  FX.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 1.1, life: 0.9, size: size * 1.8, color, tex: 'glow', alpha: 0.35, drag: 0.97 });
}
const stun = (c, o) => { if (o && o.target && o.stun) c.E.stunStars(() => (o.target.alive ? c.head(o.target) : null), o.stun); };
const SKY = (p, h = 22) => V(p.x + (R() - 0.5) * 3, p.y + h, p.z + (R() - 0.5) * 3);

// =====================================================================
export const SK = {
  // ============================ ГНОМ ============================
  // Удар молота: раскалённый молот обрушивается сверху, земля трескается
  d_strike: {
    anim: 'slam',
    cast(c) { c.E.weaponGlow(c.P.model, '#ff9a30', 0.7, { tex: 'spark' }); },
    swing(c, pos, yaw) { c.E.slash(c.fwd(0.2, 1.3), yaw, '#ff9a30', { r: 2.2, span: 2.4, roll: -Math.PI / 2, width: 0.5, dur: 0.3, color2: '#fff0c0' }); },
    hit(c, p) {
      const g = c.ground(p);
      c.E.nova(g, '#ff9a40', 3.6, 0.5, '#fff0c0'); c.E.groundCrack(g, '#ff8030', 1.8, 1.6);
      c.E.spark(p, '#ffb040', { n: 18, speed: 9, tex: 'spark', flare: 3 });
      eruptRocks(c, g, 10, 1.6); c.E.dustRing(g, 2.6, '#9a8468', 14);
      c.E.feel.scorch(g, 1.5, '#2a2218', 6);
      c.game.shake(0.32);
    },
  },
  // Удар щитом: шестигранная волна от щита, цель отбрасывает искрами
  d_bash: {
    anim: 'bash',
    swing(c, pos, yaw) { hexShield(c, c.fwd(0.9, 1.15), yaw, '#a8c8ff', 1.5); },
    hit(c, p, o) {
      const d = c.dir();
      c.E.spark(p, '#b0d0ff', { n: 0, flare: 3.2, ringR: 2.2 });
      for (let i = 0; i < 16; i++) FX.emit({ x: p.x, y: p.y, z: p.z, vx: d.x * (6 + R() * 6) + (R() - 0.5) * 5, vy: (R() - 0.3) * 5, vz: d.z * (6 + R() * 6) + (R() - 0.5) * 5, life: 0.4, size: 0.34, color: R() < 0.4 ? '#ffffff' : '#a0c8ff', gravity: 8, tex: 'spark' });
      hexShield(c, p.clone().addScaledVector(d, -0.3), c.P.yaw, '#ffffff', 0.9, 0.3);
      c.game.shake(0.28); stun(c, o);
    },
  },
  // Боевой клич: топот, волны звука, над врагами вспыхивают метки
  d_cry: {
    anim: 'stomp',
    self(c) {
      const g = c.feet();
      soundRings(c, '#ff9a40', 4, 10, 1.45);
      c.E.nova(g, '#ff7030', 6, 0.6, '#ffd080'); c.E.dustRing(g, 4, '#9a8468', 20);
      c.E.groundCrack(g, '#ff7030', 1.6, 1.4);
      c.E.attachAura(c.P.model.root, '#ff8a40', 8, 1.4);
      for (const e of c.game.combat.enemiesInRadius('player', g.x, g.z, c.skill.taunt || 14)) c.after(0.15 + R() * 0.2, () => { if (!e.alive) return; const h = c.head(e); FX.emit({ x: h.x, y: h.y, z: h.z, life: 0.5, size: 2.2, color: '#ff5030', tex: 'flare', spin: 4 }); FX.emit({ x: h.x, y: h.y + 0.1, z: h.z, vy: 0.6, life: 0.9, size: 0.9, color: '#ff4020', tex: 'skull' }); });
      c.game.shake(0.45);
    },
  },
  // Землетрясение: прыжок и удар — трещины расходятся звездой, камни взлетают
  d_quake: {
    anim: 'leapslam',
    cast(c) { c.E.weaponGlow(c.P.model, '#ffb060', 0.9, { tex: 'spark' }); c.E.dustRing(c.feet(), 1.6, '#9a8468', 10); },
    area(c, p, r) {
      const sy = c.gy;
      c.E.nova(p, '#d8a050', r * 1.05, 0.7, '#ffe0a0');
      c.E.shockwave(p, '#d09a50', r, 0.6, true);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + R() * 0.3; c.after(i * 0.02, () => c.E.fissure(p.clone(), V(Math.cos(a), 0, Math.sin(a)), r, '#ff9a40', sy)); }
      for (let k = 1; k <= 3; k++) c.after(k * 0.09, () => { for (let i = 0; i < 6; i++) { const a = R() * TAU, d = r * k / 3 * (0.7 + R() * 0.3); const q = V(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d); q.y = sy(q.x, q.z); eruptRocks(c, q, 5, 0.8); FX.emit({ x: q.x, y: q.y + 0.3, z: q.z, vy: 1.5, life: 1.1, size: 1.8, color: '#8a7860', additive: false, alpha: 0.45, grow: 1.4, tex: 'smoke' }); } });
      c.E.dustRing(p, r * 0.9, '#9a8468', 28);
      c.E.feel.scorch(p, r * 0.6, '#2a2218', 8);
      c.game.shake(0.85);
    },
    each(c, e) { const g = c.ground(e.pos); eruptRocks(c, g, 6, 0.7); c.E.spark(e.center(), '#ffb060', { n: 6, ring: false, light: false, flare: 1.6 }); },
  },
  // Каменная кожа: обломки слетаются к телу и смыкаются в панцирь
  d_skin: {
    anim: 'flex',
    cast(c) {
      c.E.magicCircle(c.feet(), 'earth', 2.4, 1.6, { color: '#c8b890', follow: c.P.model.root });
      c.E.chargeUp(() => c.P.center(), '#b8b0a0', c.T, { r: 2.6, tex: 'shard', size: 0.4, rate: 5, glow: 0.6 });
    },
    self(c) {
      const p = c.P.center();
      c.E.orbitRocks(c.P.model.root, 12, 1.05, 8); c.E.dome(c.P.model.root, '#b0a890', 1.3, 8);
      c.E.spark(p, '#d8d0c0', { n: 14, tex: 'shard', flare: 2.4, speed: 5, ringR: 2.4 });
      cloud(c, c.feet(), 1.4, ['#8a8478', '#a09888'], 8, 1.0, { size: 1.2, alpha: 0.45 });
      c.game.shake(0.15);
    },
  },
  // Натиск: бросок со щитом, за спиной остаются силуэты
  d_charge: {
    anim: 'bash',
    cast(c) { hexShield(c, c.fwd(0.8, 1.1), c.P.yaw, '#ffd070', 1.2, 0.35); },
    dash(c, k, dir) {
      c.E.dashStreaks(c.P.pos, dir, '#ffc860', 3);
      FX.emit({ x: c.P.pos.x, y: c.P.pos.y + 0.25, z: c.P.pos.z, vy: 0.6, life: 0.7, size: 1.2, color: '#9a8a70', additive: false, alpha: 0.4, grow: 1.2, tex: 'smoke' });
      if (!c._g) c._g = 0; if (k * 3 > c._g) { c._g++; c.E.spirit(c.P.model, '#ffb040', 0.4, { opacity: 0.5 }); }
    },
    dashEnd(c, t, o) {
      const p = t.center(), g = c.feet();
      hexShield(c, p, c.P.yaw, '#ffe0a0', 2.2); c.E.spark(p, '#ffd070', { n: 20, speed: 10, flare: 3.4 });
      c.E.nova(g, '#e0b050', 4, 0.5); c.E.dustRing(g, 3.4, '#9a8468', 18); eruptRocks(c, g, 8, 1.2);
      c.game.shake(0.45); stun(c, o);
    },
  },
  // Гранитный бастион: вокруг гнома встаёт кольцо рунных плит
  d_bastion: {
    anim: 'guard',
    cast(c) { c.E.magicCircle(c.feet(), 'earth', 3.2, 1.8, { color: '#8fb8ff' }); },
    self(c) {
      const g = c.feet();
      slabs(c, g, 2.3, 7, 2.2);
      c.E.dome(c.P.model.root, '#80b8ff', 1.6, c.skill.dur || 12);
      c.E.nova(g, '#80b0ff', 4, 0.5); hexShield(c, c.fwd(0.7, 1.2), c.P.yaw, '#a8c8ff', 1.6, 0.5);
      c.game.shake(0.3);
    },
  },
  // Обвал: над целью сгущается пыль, сыплются валуны
  d_rockfall: {
    anim: 'cast3', delay: 0.75,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.magicCircle(p, 'earth', r, 1.5, { color: '#d0a060' });
      cloud(c, p.clone().setY(p.y + 13), r * 0.8, ['#6a6258', '#857a6c'], 14, 1.6, { size: 3.4, alpha: 0.5, hv: 1.5 });
      const mat = new THREE.MeshStandardMaterial({ color: '#6a6058', roughness: 0.9, flatShading: true });
      for (let i = 0; i < 9; i++) {
        const a = R() * TAU, rr = Math.sqrt(R()) * r * 0.85, tp = c.ground(V(p.x + Math.cos(a) * rr, 0, p.z + Math.sin(a) * rr));
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + R() * 0.7, 0), mat); m.castShadow = true; m.rotation.set(R() * 3, R() * 3, 0);
        const d = 0.4 + i * 0.07;
        c.after(d - 0.4, () => c.E.telegraph(tp, 1.1, 0.4, '#ffb060'));
        c.E.dropFromSky(tp, m, d, () => { eruptRocks(c, tp, 7, 1.0); c.E.dustRing(tp, 1.8, '#8a7a64', 8); c.E.spark(tp.clone().setY(tp.y + 0.3), '#ffc080', { n: 6, flare: 1.6, ringR: 1.6, light: false }); c.game.shake(0.18); });
      }
    },
    impact(c, p) { c.E.nova(p, '#c09060', c.skill.radius, 0.6); c.game.shake(0.45); },
    each(c, e, o) { c.E.spark(e.center(), '#e0b080', { n: 8, tex: 'shard', flare: 1.8, light: false }); stun(c, { target: e, stun: c.skill.stun }); },
  },
  // Сердце Горы: в груди бьётся раскалённое сердце, жар расходится ударами пульса
  d_heart: {
    anim: 'pray',
    cast(c) { c.E.magicCircle(c.feet(), 'earth', 3, 2.0, { color: '#ff8040', follow: c.P.model.root }); c.E.chargeUp(() => c.P.center(), '#ff7030', c.T, { r: 2, tex: 'spark', rate: 3 }); },
    self(c) {
      const root = c.P.model.root;
      const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 2), fireMat('#ff3a10', '#ffd070', { disp: 0.25 }));
      c.E.add(heart, 1.5, (dt, k) => { const beat = Math.pow(Math.abs(Math.sin(k * Math.PI * 3)), 6); heart.position.copy(root.position); heart.position.y += 1.25 * root.scale.y; heart.scale.setScalar(0.8 + beat * 0.9); heart.material.uniforms.uAlpha.value = k > 0.8 ? (1 - k) * 5 : 1; });
      for (let i = 0; i < 3; i++) c.after(i * 0.5, () => { const g = c.feet(); c.E.nova(g, '#ff7a30', 3 + i * 1.5, 0.55, '#ffe0a0'); c.E.flash(c.P.center(), '#ff7030', 22, 0.3, 10); FX.burst(g.x, g.y + 1.2, g.z, 12, { color: ['#ff9040', '#ffe0a0'], speed: 3, up: 2.5, life: 1.0, size: 0.3, tex: 'sparkle' }); });
      c.E.groundCrack(c.feet(), '#ff7020', 2.4, 2.2);
      c.E.risingRunes(c.feet(), '#a0ff90', 0.9, 1.6, { follow: root, tex: 'sparkle', n: 3, rate: 0.6, size: 0.36 });
      c.E.fireColumn(c.feet(), 0.45, 2.0, 1.0, ['#ff5a10', '#ffb030'], false);
    },
  },
  // Рунный вихрь: гном вертится волчком, огненные кольца и руны разлетаются
  d_runespin: {
    anim: 'spin2',
    cast(c) { c.E.weaponGlow(c.P.model, '#ff7a20', 1.2, { tex: 'spark' }); c.E.magicCircle(c.feet(), 'fire', c.skill.radius * 0.9, 1.3, { follow: c.P.model.root, spin: 4 }); },
    area(c, p, r) {
      const root = c.P.model.root;
      for (let i = 0; i < 4; i++) c.after(i * 0.16, () => c.E.slash(c.P.pos.clone().setY(c.P.pos.y + 0.7 + i * 0.25), R() * TAU, i % 2 ? '#ffb040' : '#ff6a18', { r: r * (0.6 + i * 0.11), span: TAU * 0.92, width: 0.3, roll: (i % 2 ? 1 : -1) * 0.14, dur: 0.4, follow: root, color2: '#fff0c0' }));
      c.E.risingRunes(p, '#ff9a30', r * 0.7, 0.8, { follow: root, n: 4, rate: 0.9, speed: 9, size: 0.5 });
      c.E.fireColumn(p, 0.6, 2.4, 0.7, ['#ff5a10', '#ffb030'], false);
      c.E.dustRing(p, r * 0.8, '#9a7a58', 16);
      c.after(0.6, () => c.E.nova(c.feet(), '#ff7a20', r, 0.5, '#ffe0a0'));
    },
    each(c, e) { c.E.spark(e.center(), '#ff9030', { n: 8, flare: 2, ringR: 1.2, light: false }); },
  },
  // Громовой молот: молот летит кувырком в молниях, бьёт громом и возвращается в руку
  d_runehammer: {
    anim: 'throw',
    cast(c) { c.E.weaponGlow(c.P.model, '#80c8ff', c.T + 0.05, { tex: 'spark', rate: 1 }); c.E.chargeUp(() => c.hand(), '#a0d8ff', c.T, { r: 1.2, tex: 'spark', rate: 2 }); },
    proj: { speed: 34, trail: { rate: 4, jit: 0.4, life: 0.28, size: 0.5, color: ['#a0d8ff', '#ffffff', '#60a0ff'], tex: 'spark' } },
    launch(c, from) {
      const w = c.P.model.weaponObj;
      if (w) { w.visible = false; c._w = w; c.after(2.2, () => { w.visible = true; }); }
      c.E.spark(from, '#a0d8ff', { n: 8, flare: 2, ringR: 1 });
    },
    hit(c, p, o) {
      const g = c.ground(p);
      c.E.bolt(SKY(g, 24), g, '#a0d0ff', { width: 0.22, branches: 5, jag: 0.8, dur: 0.4 });
      c.E.nova(g, '#80c0ff', 4.2, 0.5, '#ffffff'); c.E.spark(p, '#a0d8ff', { n: 20, speed: 11, flare: 4 });
      for (let i = 0; i < 4; i++) { const a = R() * TAU; c.E.bolt(p.clone(), g.clone().add(V(Math.cos(a) * 2.6, 0.1, Math.sin(a) * 2.6)), '#a0d0ff', { width: 0.06, branches: 0, dur: 0.25, sparks: 3 }); }
      c.E.screenFlash('#a0c8ff', 0.14, 0.3); c.game.shake(0.4);
      // молот возвращается
      const back = new THREE.Group(); const hm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: '#b0b8c8', metalness: 0.8, roughness: 0.3, emissive: '#60b0ff', emissiveIntensity: 0.8 })); hm.position.y = 0.3; const hf = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#5b3b22' })); const inner = new THREE.Group(); inner.add(hm, hf); inner.rotation.z = Math.PI / 2; back.add(inner); back.userData.spin = true;
      c.E.projectile('hammer', p.clone(), () => c.hand(), 30, () => { if (c._w) c._w.visible = true; FX.emit({ x: c.P.pos.x, y: c.P.pos.y + 1.2, z: c.P.pos.z, life: 0.2, size: 1.6, color: '#a0d8ff', tex: 'flare' }); }, { obj: back, trail: { rate: 2, jit: 0.3, life: 0.25, size: 0.4, color: ['#a0d8ff', '#ffffff'], tex: 'spark' } });
    },
  },
  // Ярость предков: за спиной встаёт исполинский дух предка, пламя охватывает гнома
  d_ancestral: {
    anim: 'roar',
    cast(c) { c.E.magicCircle(c.feet(), 'fire', 3.4, 2.2, { color: '#ff5020', follow: c.P.model.root }); c.E.chargeUp(() => c.P.center(), '#ff5020', c.T, { r: 2.4, tex: 'flame', size: 0.5, rate: 4 }); },
    self(c) {
      const g = c.feet(), root = c.P.model.root;
      c.E.spirit(c.P.model, '#ff7a30', 2.8, { scale: 2.6, offset: 1.6, follow: true, opacity: 0.45, grow: 0.08 });
      c.E.fireColumn(g, 1.1, 5, 1.2, ['#ff3a10', '#ff8020', '#ffd060']);
      c.E.nova(g, '#ff4020', 7, 0.7, '#ffd080'); soundRings(c, '#ff5a30', 3, 8, 1.4);
      c.E.attachAura(root, c.color, c.skill.buff.dur, 1.6);
      c.E.weaponGlow(c.P.model, '#ff5020', 3, { tex: 'flame' });
      c.E.risingRunes(g, '#ff8a30', 1.1, 2.4, { follow: root, n: 3 });
      c.E.screenFlash('#ff4020', 0.2, 0.5); c.game.shake(0.55);
    },
  },

  // ============================ ВОИН ============================
  // Рассекающий удар: широкий серебряный росчерк
  w_cleave: {
    anim: 'slash',
    swing(c, pos, yaw) { c.E.slash(c.fwd(0.1, 1.25), yaw, '#dfe8ff', { r: 2.5, span: 2.9, roll: 0.42, width: 0.44, travel: 0.9, dur: 0.3 }); },
    hit(c, p) {
      c.E.spark(p, '#e8f0ff', { n: 12, speed: 8, flare: 2.4, ringR: 1.3 });
      const d = c.dir();
      for (let i = 0; i < 8; i++) FX.emit({ x: p.x, y: p.y, z: p.z, vx: d.z * (5 + R() * 5) + d.x * 2, vy: 2 + R() * 3, vz: -d.x * (5 + R() * 5) + d.z * 2, life: 0.35, size: 0.3, color: '#ffffff', gravity: 8, tex: 'spark' });
      c.game.shake(0.18);
    },
  },
  // Рывок: молниеносный выпад, за воином тянется цепочка силуэтов
  w_charge: {
    anim: 'thrust',
    cast(c) { c.E.dustRing(c.feet(), 2, '#9a8a70', 10); c.E.weaponGlow(c.P.model, '#ffd070', 0.6); },
    dash(c, k, dir) {
      c.E.dashStreaks(c.P.pos, dir, '#ffe0a0', 4);
      if (!c._g) c._g = 0; if (k * 4 > c._g) { c._g++; c.E.spirit(c.P.model, '#ffc050', 0.45, { opacity: 0.55 }); }
    },
    dashEnd(c, t, o) {
      const p = t.center(), d = c.dir(), yaw = c.P.yaw;
      c.E.beam2(c.P.center().addScaledVector(d, -4), p.clone().addScaledVector(d, 2.5), '#ffe0a0', { width: 0.16, dur: 0.3 });
      c.E.slash(p, yaw, '#ffe0a0', { r: 1.6, span: 1.2, roll: -Math.PI / 2, width: 0.7, dur: 0.25 });
      c.E.spark(p, '#ffd070', { n: 16, speed: 10, flare: 3 }); c.E.dustRing(c.feet(), 2.6, '#9a8a70', 12);
      c.game.shake(0.35); stun(c, o);
    },
  },
  // Вихрь клинков: два встречных кольца стали и воздушная воронка
  w_whirl: {
    anim: 'sweep',
    area(c, p, r) {
      const root = c.P.model.root;
      c.E.slash(c.P.pos.clone().setY(c.P.pos.y + 1.2), c.P.yaw, '#c8d8ff', { r: r * 0.92, span: TAU * 0.95, width: 0.34, roll: 0.12, dur: 0.42, follow: root });
      c.after(0.1, () => c.E.slash(c.P.pos.clone().setY(c.P.pos.y + 0.8), c.P.yaw + 2, '#ffffff', { r: r * 0.7, span: TAU * 0.95, width: 0.3, roll: -0.16, dur: 0.4, follow: root, dir: -1 }));
      for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; FX.emit({ x: p.x + Math.cos(a) * 1.2, y: p.y + 0.4 + R() * 1.4, z: p.z + Math.sin(a) * 1.2, vx: -Math.sin(a) * 9 + Math.cos(a) * 3, vy: 0.5, vz: Math.cos(a) * 9 + Math.sin(a) * 3, life: 0.45, size: 0.5, color: '#dfe8ff', tex: 'spark', drag: 0.92 }); }
      c.E.dustRing(p, r * 0.8, '#a09a88', 16);
    },
    each(c, e) { c.E.spark(e.center(), '#e8f0ff', { n: 8, flare: 1.8, ringR: 1.1, light: false }); },
  },
  // Боевой рёв: багровая волна, клинок разгорается
  w_roar: {
    anim: 'roar',
    cast(c) { c.E.chargeUp(() => c.P.center(), '#ff5030', c.T, { r: 2.2, tex: 'spark', rate: 4 }); },
    self(c) {
      const g = c.feet();
      soundRings(c, '#ff4a28', 4, 9, 1.55);
      c.E.nova(g, '#ff3a20', 6.5, 0.6, '#ffc080'); c.E.dustRing(g, 4.5, '#9a8a70', 22);
      c.E.weaponGlow(c.P.model, '#ff3a20', 2.5, { tex: 'flame' });
      c.E.attachAura(c.P.model.root, '#ff3a20', c.skill.buff.dur, 1.5);
      c.E.spirit(c.P.model, '#ff4020', 0.7, { follow: true, grow: 0.35, opacity: 0.5 });
      c.E.screenFlash('#ff3020', 0.12, 0.4); c.game.shake(0.4);
    },
  },
  // Раскол земли: удар в землю, вдоль трещины один за другим вырываются каменные клыки
  w_shock: {
    anim: 'slam',
    cast(c) { c.E.weaponGlow(c.P.model, '#ffb060', 0.7, { tex: 'spark' }); },
    line(c, from, to, dir, len) {
      const p0 = c.feet(), sy = c.gy;
      c.E.slash(c.fwd(0.2, 1.3), c.P.yaw, '#ffb060', { r: 2.2, span: 2.4, roll: -Math.PI / 2, width: 0.5, dur: 0.28 });
      c.E.fissure(p0.clone(), dir, len, '#ff8a30', sy); c.E.nova(c.fwd(1.2), '#d09a50', 3, 0.45);
      const mat = new THREE.MeshStandardMaterial({ color: '#6e6456', roughness: 0.95, flatShading: true });
      const side = V(dir.z, 0, -dir.x);
      for (let i = 0; i < 9; i++) c.after(i * 0.045, () => {
        const q = p0.clone().addScaledVector(dir, 1.6 + i * (len - 1.6) / 9).addScaledVector(side, (R() - 0.5) * 1.2); q.y = sy(q.x, q.z);
        const h = 1.2 + i * 0.16 + R() * 0.5;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.42 + R() * 0.2, h, 5), mat); sp.castShadow = true;
        sp.rotation.set((R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5);
        sp.position.copy(q).setY(q.y - h);
        c.E.add(sp, 1.5, (dt, k) => { const up = k < 0.1 ? easeOutBack(k / 0.1) : k > 0.75 ? (1 - k) / 0.25 : 1; sp.position.y = q.y - h / 2 + (up - 1) * h; });
        eruptRocks(c, q, 4, 0.7); FX.emit({ x: q.x, y: q.y + 0.4, z: q.z, vy: 1.6, life: 1.0, size: 1.6, color: '#8a7860', additive: false, alpha: 0.45, grow: 1.3, tex: 'smoke' });
        FX.emit({ x: q.x, y: q.y + 0.3, z: q.z, life: 0.25, size: 1.8, color: '#ffa040', tex: 'flare' });
      });
      c.game.shake(0.5);
    },
    each(c, e) { c.E.spark(e.center(), '#ffb060', { n: 8, tex: 'shard', flare: 1.8, light: false }); },
  },
  // Казнь: прыжок, над целью череп, багровый удар раскалывает землю
  w_execute: {
    anim: 'leapslam',
    cast(c) {
      c.E.weaponGlow(c.P.model, '#ff2020', 0.9, { tex: 'flame' });
      if (c.target) { skullPop(c, c.head(c.target), '#ff3030', 1.5); crosshair(c, c.tgtFn(c.target), '#ff3030', c.T); }
    },
    swing(c, pos, yaw) { c.E.slash(c.fwd(0.2, 1.4), yaw, '#ff2a20', { r: 3.2, span: 2.7, roll: -Math.PI / 2, width: 0.6, dur: 0.34, color2: '#ffd0c0' }); },
    hit(c, p) {
      const g = c.ground(p);
      c.E.nova(g, '#ff2a20', 5, 0.55, '#ffc0a0'); c.E.groundCrack(g, '#ff2010', 2.6, 2.0);
      c.E.spark(p, '#ff4030', { n: 24, speed: 11, flare: 4.2, ringR: 2.4 });
      FX.burst(p.x, p.y, p.z, 16, { color: ['#c01020', '#700810'], speed: 6, life: 0.8, size: 0.3, gravity: 14, up: 2, additive: false, tex: 'drop' });
      c.E.pillar(g, '#ff3020', 0.7, 9, 0.45);
      eruptRocks(c, g, 8, 1.3); c.E.dustRing(g, 3, '#8a6a60', 14);
      c.E.feel.scorch(g, 1.8, '#200404', 7, '#ff2010');
      c.E.screenFlash('#ff2010', 0.16, 0.35); c.game.shake(0.6);
    },
  },
  // Святой клинок: меч воздет к небу и наливается светом, удар — столп сияния и перья
  w_holyblade: {
    anim: 'smite',
    cast(c) {
      c.E.weaponGlow(c.P.model, '#ffe080', c.T + 0.25, { tex: 'sparkle', rate: 1, r: 0.1 });
      c.after(0.12, () => { const tip = c.hand(); tip.y += 0.9; c.E.beam2(SKY(tip, 16), tip, '#ffe8a0', { width: 0.14, dur: 0.45 }); });
      c.E.chargeUp(() => c.hand().setY(c.hand().y + 0.7), '#ffe080', c.T, { r: 1.5, rate: 2 });
    },
    swing(c, pos, yaw) { c.E.slash(c.fwd(0.2, 1.3), yaw, '#ffd860', { r: 2.7, span: 2.6, roll: -1.15, width: 0.5, dur: 0.34, color2: '#ffffff', travel: 0.8 }); },
    hit(c, p) {
      const g = c.ground(p);
      c.E.magicCircle(g, 'holy', 2.2, 0.9); c.E.pillar(g, '#ffe8a0', 0.45, 10, 0.5);
      c.E.spark(p, '#ffe080', { n: 16, tex: 'sparkle', flare: 2.4, gravity: 2 });
      FX.burst(p.x, p.y + 0.3, p.z, 9, { color: ['#ffffff', '#fff0c0'], speed: 3, up: 2, life: 1.4, size: 0.5, gravity: 2.5, drag: 0.95, tex: 'feather' });
      for (let i = 0; i < 5; i++) c.after(0.08 + i * 0.05, () => wisp(c, p, () => c.P.center(), '#a0ff90', { tex: 'sparkle', dur: 0.5, arc: 1.6, lift: 0.8 }));
      c.game.shake(0.25);
    },
  },
  // Свет небес: воин преклоняет колено, с неба нисходит луч, за спиной раскрываются крылья
  w_divine: {
    anim: 'pray',
    cast(c) { c.E.magicCircle(c.feet(), 'holy', 3, 2.2, { follow: c.P.model.root }); },
    self(c) {
      const g = c.feet(), root = c.P.model.root;
      c.E.godRays(g, '#fff0a0', 1.8, 1.6); c.E.beam2(SKY(g, 20), g.clone().setY(g.y + 0.2), '#fff0b0', { width: 0.22, dur: 1.0 });
      c.E.wings(c.P.model.j.chest, '#ffe8a0', 2.2);
      halo(c, root, '#ffe8a0', 2.6, 0.2, 0.75, 1.0);
      c.E.add(null, 1.6, () => { if (R() < 0.35) { const a = R() * TAU, d = R() * 1.8; FX.emit({ x: root.position.x + Math.cos(a) * d, y: root.position.y + 3.4 + R(), z: root.position.z + Math.sin(a) * d, vx: (R() - 0.5), vy: -1.1, vz: (R() - 0.5), life: 1.8, size: 0.5, color: '#ffffff', tex: 'feather', drag: 0.99, spin: (R() - 0.5) * 3 }); } });
      c.E.risingRunes(g, '#a0ff90', 0.8, 1.5, { follow: root, tex: 'sparkle', n: 3, rate: 0.7, size: 0.34 });
      c.E.nova(g, '#ffe8a0', 4, 0.7);
    },
  },
  // Божий суд: в небе загорается печать, исполинский меч света пронзает землю
  w_judgement: {
    anim: 'smite', delay: 0.72,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.magicCircle(p, 'holy', r, 2.0); c.E.magicCircle(p.clone().setY(p.y + 13), 'holy', r * 0.7, 1.2, { spin: -2 });
      c.E.weaponGlow(c.P.model, '#ffe080', 0.9);
      c.after(0.17, () => c.E.giantSword(p, '#ffe070', () => {
        c.E.godRays(p, '#fff0a0', 1.2, r * 0.5); c.E.nova(p, '#ffd040', r * 1.1, 0.7, '#ffffff');
        c.E.spark(p.clone().setY(p.y + 1), '#ffe080', { n: 30, speed: 12, tex: 'sparkle', flare: 6, ringR: 4, gravity: 3 });
        FX.burst(p.x, p.y + 1.5, p.z, 16, { color: ['#ffffff', '#fff0c0'], speed: 6, up: 4, life: 1.8, size: 0.55, gravity: 3, drag: 0.95, tex: 'feather' });
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.E.pillar(c.ground(V(p.x + Math.cos(a) * r * 0.6, 0, p.z + Math.sin(a) * r * 0.6)), '#ffe8a0', 0.35, 8, 0.5); }
        c.E.screenFlash('#ffe8a0', 0.22, 0.5); c.game.shake(0.7);
      }));
    },
    each(c, e) { c.E.spark(e.center(), '#ffe080', { n: 8, tex: 'sparkle', flare: 2.2, light: false }); },
  },
  // Буря клинков: воин кружится, вокруг него несётся хоровод призрачных мечей
  w_bladestorm: {
    anim: 'spin2',
    cast(c) {
      const root = c.P.model.root, r = c.skill.radius, dur = 0.35 + (c.skill.waves || 3) * 0.45 + 0.2;
      c.E.weaponGlow(c.P.model, '#ff5060', dur, { tex: 'spark' });
      c.E.orbit(root, 6, r * 0.62, dur, () => { const g = new THREE.Group(), m = addMat('#ff6a78', 0.9); const b = new THREE.Mesh(bladeGeo(), m); b.rotation.z = Math.PI / 2; b.scale.setScalar(0.95); g.add(b); return g; }, { speed: 11, y: 1.1, bob: 0.35, face: Math.PI / 2, tick: (m) => { const w = m.getWorldPosition(V(0, 0, 0)); if (R() < 0.5) FX.emit({ x: w.x, y: w.y, z: w.z, life: 0.22, size: 0.6, color: '#ff5060', tex: 'glow' }); } });
      c.E.tornado(c.feet(), '#ff4050', r * 0.5, 3.4, dur, root);
    },
    area(c, p, r, w) {
      const root = c.P.model.root;
      c.E.slash(c.P.pos.clone().setY(c.P.pos.y + 0.8 + (w % 3) * 0.35), R() * TAU, w % 2 ? '#ff8090' : '#ff3a4a', { r: r * 0.95, span: TAU * 0.95, width: 0.3, roll: (R() - 0.5) * 0.5, dur: 0.4, follow: root, color2: '#ffe0e0', dir: w % 2 ? 1 : -1 });
      c.E.nova(p, '#ff4050', r, 0.45); c.E.dustRing(p, r * 0.7, '#9a8080', 12);
      c.game.shake(0.2);
    },
    each(c, e) { const p = e.center(); c.E.slash(p, R() * TAU, '#ff6070', { r: 0.9, span: 2.2, roll: (R() - 0.5) * 2, width: 0.6, dur: 0.22 }); c.E.spark(p, '#ff8090', { n: 5, ring: false, light: false, flare: 1.6 }); },
  },
  // Глубокая рана: два росчерка крест-накрест, из раны брызжет кровь
  w_rend: {
    anim: 'double',
    cast(c) { c.E.weaponGlow(c.P.model, '#d02030', 0.7, { tex: 'drop' }); },
    swing(c, pos, yaw) {
      c.E.slash(c.fwd(0.1, 1.25), yaw, '#e02030', { r: 2.4, span: 2.6, roll: 0.75, width: 0.4, dur: 0.26, color2: '#ffc0c0' });
      c.after(0.2 / c.P.hasteMul, () => { c.E.slash(c.fwd(0.1, 1.25), c.P.yaw, '#e02030', { r: 2.4, span: 2.6, roll: -0.75, width: 0.4, dur: 0.26, dir: -1, color2: '#ffc0c0' }); if (c.target && c.target.alive) SK.w_rend.cut(c, c.target.center(), -1); });
    },
    cut(c, p, s) {
      const d = c.dir(), side = V(d.z, 0, -d.x);
      for (let i = -1; i <= 1; i++) c.E.slash(p.clone().addScaledVector(side, i * 0.28).addScaledVector(d, -0.9), c.P.yaw, '#ff3040', { r: 1.0, span: 1.5, roll: s * 0.9, width: 0.22, dur: 0.3, color2: '#ffffff' });
      FX.burst(p.x, p.y, p.z, 14, { color: ['#c01020', '#800a14'], speed: 5, life: 0.9, size: 0.3, gravity: 13, up: 2, additive: false, tex: 'drop' });
      FX.emit({ x: p.x, y: p.y, z: p.z, life: 0.2, size: 2, color: '#ff4050', tex: 'flare', rot: s * 0.8 });
    },
    hit(c, p, o) {
      SK.w_rend.cut(c, p, 1);
      const t = o && o.target;
      if (t) c.E.add(null, 2.4, () => { if (!t.alive) return true; if (R() < 0.25) { const q = t.center(); FX.emit({ x: q.x + (R() - 0.5) * 0.5, y: q.y + (R() - 0.5) * 0.5, z: q.z + (R() - 0.5) * 0.5, vy: 0.5, life: 0.7, size: 0.24, color: '#b01020', gravity: 9, additive: false, tex: 'drop' }); } });
      c.game.shake(0.2);
    },
  },
  // Призрачные клинки: над целью кольцом возникают мечи и по очереди вонзаются в землю
  w_phantom: {
    anim: 'cast3', delay: 0.72,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.magicCircle(p, 'arcane', r, 1.6, { color: '#90b0ff' });
      phantomBlades(c, p, r, 8, '#a8c4ff', 0.34);
      c.E.weaponGlow(c.P.model, '#a0c0ff', 0.8);
    },
    impact(c, p) { c.E.nova(p, '#a0c0ff', c.skill.radius, 0.5, '#ffffff'); c.game.shake(0.4); },
    each(c, e) { const p = e.center(); c.E.slash(p, R() * TAU, '#c0d4ff', { r: 1, span: 2.4, roll: (R() - 0.5) * 2.4, width: 0.5, dur: 0.24 }); c.E.spark(p, '#a8c4ff', { n: 6, flare: 1.8, light: false }); },
  },
};

// Вспышка у оружия при выстреле/запуске: кольцо поперёк направления
function muzzle(c, from, dir, color, size = 1, flare = 2) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 5, 28), addMat(color));
  ring.position.copy(from); ring.lookAt(from.clone().add(dir));
  const p0 = from.clone();
  c.E.add(ring, 0.3, (dt, k) => { ring.scale.setScalar(size * (0.3 + easeOut(k) * 1.6)); ring.position.copy(p0).addScaledVector(dir, k * 0.8); ring.material.opacity = 1 - k; });
  FX.emit({ x: from.x, y: from.y, z: from.z, life: 0.18, size: flare, color: '#ffffff', tex: 'flare', rot: R() * 3 });
  for (let i = 0; i < 6; i++) FX.emit({ x: from.x, y: from.y, z: from.z, vx: dir.x * (8 + R() * 8) + (R() - 0.5) * 3, vy: dir.y * 8 + (R() - 0.5) * 3, vz: dir.z * (8 + R() * 8) + (R() - 0.5) * 3, life: 0.2, size: 0.4, color, tex: 'spark' });
}
const aimDir = (c) => (c.target ? c.target.center().sub(c.hand()).normalize() : c.dir());
// Стрелы, уходящие в небо
function skyShots(c, color, n = 5) {
  for (let i = 0; i < n; i++) c.after(i * 0.04, () => { const h = c.hand(), d = c.dir(); FX.emit({ x: h.x, y: h.y, z: h.z, vx: d.x * 9 + (R() - 0.5) * 4, vy: 46 + R() * 10, vz: d.z * 9 + (R() - 0.5) * 4, life: 0.5, size: 1.5, color, tex: 'spark' }); });
  muzzle(c, c.hand(), V(c.dir().x * 0.3, 1, c.dir().z * 0.3).normalize(), color, 1.2);
}
// Кольца вдоль луча
function beamRings(c, from, dir, len, color, n = 4, size = 0.6) {
  for (let i = 0; i < n; i++) c.after(i * 0.05, () => {
    const rp = from.clone().addScaledVector(dir, 1 + (len - 1) * i / n);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size, 0.045, 6, 32), energyMat(color, { scale: 3, speed: 4 }));
    ring.position.copy(rp); ring.lookAt(rp.clone().add(dir));
    c.E.add(ring, 0.45, (dt, k) => { ring.scale.setScalar(1 + easeOut(k) * 2.2); ring.material.uniforms.uAlpha.value = 1 - k; });
  });
}
const GREEN_FIRE = ['#30ff70', '#90ffb0', '#108040'];
// Могила разверзается: земля, зелёное пламя, череп
function graveRise(c, pos, r = 1.6) {
  c.E.magicCircle(pos, 'death', r, 1.5);
  c.E.groundCrack(pos, '#50ff80', r, 1.8);
  cloud(c, pos, r * 0.6, ['#4a4034', '#5a5040'], 6, 1.1, { size: 1.3, alpha: 0.55, h: 0.2, vy: 0.8 });
  eruptRocks(c, pos, 8, 0.9, '#5a4c3c');
  c.E.fireColumn(pos, r * 0.35, 2.6, 0.8, GREEN_FIRE, false);
  skullPop(c, pos.clone().setY(pos.y + 1.2), '#70ffa0', 1.0);
}

Object.assign(SK, {
  // ============================ ЛУЧНИК ============================
  // Прицельный выстрел: чистый быстрый выстрел, щепки при попадании
  a_aimed: {
    anim: 'bow',
    proj: { speed: 52 },
    launch(c, from) { muzzle(c, from, aimDir(c), '#fff0c0', 0.9); },
    hit(c, p) {
      c.E.spark(p, '#fff0c0', { n: 10, speed: 7, flare: 2.2, ringR: 1.2 });
      FX.burst(p.x, p.y, p.z, 6, { color: ['#a08050', '#d0b080'], speed: 4, life: 0.6, size: 0.22, gravity: 11, up: 1.5, additive: false, tex: 'shard' });
    },
  },
  // Мультивыстрел: веер стрел срывается с тетивы
  a_multi: {
    anim: 'bow',
    proj: { speed: 46 },
    launch(c, from) {
      c.E.slash(c.P.pos.clone().setY(from.y), c.P.yaw, '#fff0c0', { r: 1.7, span: 1.5, width: 0.3, dur: 0.24, travel: 1.6, grow: 0.5 });
      muzzle(c, from, c.dir(), '#fff0c0', 1.3);
    },
    hit(c, p) { c.E.spark(p, '#fff0c0', { n: 6, speed: 6, flare: 1.7, ringR: 0.9, light: false }); },
  },
  // Отравленная стрела: за стрелой капает яд, цель окутывает едкое облако
  a_poison: {
    anim: 'bow',
    cast(c) { c.E.chargeUp(() => c.hand(), '#70ff40', c.T, { r: 0.9, tex: 'drop', rate: 2, size: 0.22 }); },
    proj: { speed: 46, trail: { rate: 3, jit: 0.1, life: 0.6, size: 0.24, color: ['#70ff40', '#b0ff60', '#308010'], tex: 'drop', gravity: 5 } },
    launch(c, from) { muzzle(c, from, aimDir(c), '#80ff50', 0.9); },
    hit(c, p, o) {
      c.E.spark(p, '#80ff50', { n: 8, tex: 'drop', flare: 2, gravity: 10 });
      cloud(c, p, 1.2, ['#3a7a10', '#5a9a20', '#2a5a10'], 10, 2.2, { size: 1.5, h: -0.4 });
      skullPop(c, p.clone().setY(p.y + 0.9), '#90ff50', 1.0);
      const t = o && o.target;
      if (t) c.E.add(null, 3, () => { if (!t.alive) return true; if (R() < 0.3) { const q = t.center(); FX.emit({ x: q.x + (R() - 0.5) * 0.8, y: q.y - 0.3 + R() * 0.8, z: q.z + (R() - 0.5) * 0.8, vy: 1 + R(), life: 0.8, size: 0.2 + R() * 0.2, color: '#a0ff50', tex: 'ring' }); } });
    },
  },
  // Отскок: кувырок назад в облаке пыли, на месте остаётся силуэт
  a_leap: {
    anim: 'leapback',
    leapStart(c) {
      const g = c.feet();
      c.E.spirit(c.P.model, '#a0e0ff', 0.5, { opacity: 0.55 });
      c.E.dustRing(g, 2.6, '#9a8a70', 16); c.E.nova(g, '#c8f0ff', 2.6, 0.35);
      c.E.slash(g.clone().setY(g.y + 1), c.P.yaw, '#c8f0ff', { r: 1.8, span: 2.6, width: 0.4, dur: 0.3, travel: -1.5 });
    },
    leapTick(c) { const p = c.P.pos, d = c.dir(); for (let i = 0; i < 2; i++) FX.emit({ x: p.x + (R() - 0.5) * 0.8, y: p.y + (c.P.jumpOffset || 0) + R() * 1.6, z: p.z + (R() - 0.5) * 0.8, vx: d.x * 12, vz: d.z * 12, life: 0.2, size: 0.8, color: '#c8f0ff', tex: 'spark' }); },
    leapEnd(c) { const g = c.feet(); c.E.dustRing(g, 2, '#9a8a70', 12); FX.burst(g.x, g.y + 0.2, g.z, 5, { color: ['#70a040', '#a0c060'], speed: 3, up: 2, life: 1.0, size: 0.3, gravity: 4, additive: false, tex: 'leaf' }); },
  },
  // Град стрел: залп в небо — и стрелы волнами осыпают область, оставаясь торчать в земле
  a_rain: {
    anim: 'bowhigh', waveStart: 0.85,
    cast(c) {
      const p = c.ground(c.point);
      c.after(c.T, () => skyShots(c, '#fff0c0', 6));
      c.E.telegraph(p, c.skill.radius, 0.85 + (c.skill.waves || 4) * 0.45, '#e8d8a0');
    },
    area(c, p, r, w) {
      c.E.arrowVolley(p, r, 16, '#fff0c0', { standY: c.gy, leanX: 0.3 + (w % 2) * 0.1, leanZ: w % 2 ? -0.2 : 0.2 });
      c.after(0.3, () => { c.E.dustRing(p, r * 0.5, '#9a8a70', 8); c.game.shake(0.12); });
    },
    each(c, e) { c.after(0.25, () => e.alive && c.E.spark(e.center(), '#fff0c0', { n: 5, flare: 1.5, ring: false, light: false })); },
  },
  // Пронзающая стрела: долгое натяжение, стрела проходит насквозь, оставляя воздушные кольца
  a_pierce: {
    anim: 'powershot',
    cast(c) { c.E.chargeUp(() => c.hand(), '#e0f0ff', c.T, { r: 1.6, tex: 'spark', rate: 3, glow: 1.2 }); },
    line(c, from, to, dir, len) {
      muzzle(c, from, dir, '#ffffff', 2, 3.4);
      c.E.projectile('bigarrow', from.clone(), () => to, 90, () => {}, { trail: { rate: 4, jit: 0.05, life: 0.4, size: 0.5, color: ['#ffffff', '#c0e0ff'], tex: 'spark' }, ribbon: ['#e0f0ff', 0.3, 0.6] });
      c.E.beam2(from, to, '#e0f0ff', { width: 0.1, dur: 0.4, tex: 'spark' });
      beamRings(c, from, dir, len, '#d8e8ff', 5, 0.55);
      for (let i = 0; i < 8; i++) c.after(i * 0.03, () => { const q = c.ground(from.clone().addScaledVector(dir, len * (i + 0.5) / 8)); FX.emit({ x: q.x, y: q.y + 0.3, z: q.z, vx: (R() - 0.5) * 2, vy: 1.2, vz: (R() - 0.5) * 2, life: 0.9, size: 1.4, color: '#9a8a70', additive: false, alpha: 0.4, grow: 1.2, tex: 'smoke' }); });
      c.E.dustRing(c.feet(), 2, '#9a8a70', 10); c.game.shake(0.25);
    },
    each(c, e) { c.E.spark(e.center(), '#e0f0ff', { n: 10, speed: 9, flare: 2.4, ringR: 1.5 }); },
  },
  // Зов зверя: клич разносится по лесу, из вихря листьев выходит дух волка
  a_wolf: {
    anim: 'call',
    self(c) { soundRings(c, '#80d0ff', 3, 7, 1.6); },
    appear(c, pos) {
      c.E.magicCircle(pos, 'nature', 2.4, 1.8, { color: '#80d0ff' });
      c.E.vortex(pos, '#80d0ff', '#205080', 2.2, 1.2, 3);
      c.E.risingRunes(pos, '#a0e0ff', 1.2, 1.0, { tex: 'leaf', n: 4, rate: 0.9, speed: 8, size: 0.36 });
      c.E.pillar(pos, '#80d0ff', 0.8, 7, 0.7);
      c.after(0.15, () => { c.E.spark(pos.clone().setY(pos.y + 0.8), '#a0e0ff', { n: 14, tex: 'sparkle', flare: 3, gravity: 1, speed: 4 }); c.E.nova(pos, '#80d0ff', 3, 0.5); });
    },
  },
  // Шипастые лозы: ладонь к земле — из печати вырываются колючие побеги
  a_vines: {
    anim: 'summon', delay: 0.62,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.magicCircle(p, 'nature', r, 4, { spin: 0.4 });
      FX.burst(c.feet().x, c.feet().y + 0.2, c.feet().z, 8, { color: ['#50c040', '#a0ff60'], speed: 3, up: 2, life: 0.9, size: 0.3, gravity: 3, additive: false, tex: 'leaf' });
      c.after(0.5, () => {
        c.E.vines(p, r, 26, c.gy); c.E.nova(p, '#60d040', r, 0.6);
        for (let i = 0; i < 30; i++) { const a = R() * TAU, d = Math.sqrt(R()) * r; FX.emit({ x: p.x + Math.cos(a) * d, y: p.y + 0.2, z: p.z + Math.sin(a) * d, vx: (R() - 0.5) * 3, vy: 3 + R() * 3, vz: (R() - 0.5) * 3, life: 1.4, size: 0.34, color: R() < 0.5 ? '#50c040' : '#a0e060', gravity: 5, additive: false, tex: 'leaf' }); }
        c.E.dustRing(p, r * 0.6, '#7a7050', 10);
      });
    },
    each(c, e) { const g = c.ground(e.pos); c.E.spark(e.center(), '#80e050', { n: 6, tex: 'leaf', flare: 1.5, light: false, gravity: 4 }); c.E.magicCircle(g, 'nature', 1.3, c.skill.root || 3); },
  },
  // Стрела бури: над целью сгущается туча, молния скачет от врага к врагу
  a_storm: {
    anim: 'powershot',
    cast(c) {
      c.E.chargeUp(() => c.hand(), '#a0d0ff', c.T, { r: 1.5, tex: 'spark', rate: 3 });
      c.E.add(null, c.T, () => { if (R() < 0.3) { const h = c.hand(); c.E.bolt(h, h.clone().add(V((R() - 0.5) * 2, (R() - 0.2) * 2, (R() - 0.5) * 2)), '#a0d0ff', { width: 0.04, branches: 0, dur: 0.14, sparks: 0 }); } });
      if (c.target) { const top = c.target.pos.clone(); top.y += 11; cloud(c, top, 3, ['#30384a', '#485468', '#202838'], 16, 1.8, { size: 3.6, alpha: 0.6, hv: 1.2, out: 0.3, vy: 0 }); }
    },
    chainStart(c, list) {
      const t = list[0], g = c.ground(t.pos), top = g.clone().setY(g.y + 11);
      c.E.bolt(top, g, '#b0d8ff', { width: 0.24, branches: 5, jag: 0.9, dur: 0.45 });
      c.E.nova(g, '#90c8ff', 4, 0.5, '#ffffff'); c.E.screenFlash('#a0c8ff', 0.14, 0.3); c.game.shake(0.4);
      muzzle(c, c.hand(), aimDir(c), '#a0d0ff', 1.6, 3);
    },
    hop(c, f, e, i) {
      const p = e.center();
      c.E.bolt(f, p, '#a0d0ff', { width: i ? 0.12 : 0.08, branches: i ? 3 : 1, dur: 0.3 });
      c.E.spark(p, '#a0d8ff', { n: 10, speed: 9, flare: 2.6, ringR: 1.6 });
      const g = c.ground(e.pos); for (let k = 0; k < 3; k++) { const a = R() * TAU; c.E.bolt(p.clone(), g.clone().add(V(Math.cos(a) * 1.6, 0.05, Math.sin(a) * 1.6)), '#a0d0ff', { width: 0.04, branches: 0, dur: 0.2, sparks: 2 }); }
    },
  },
  // Выстрел в сердце: алая метка сжимается на цели, выстрел — как удар грома
  a_heart: {
    anim: 'powershot',
    precast(c, dur) {
      if (!c.target) return;
      crosshair(c, c.tgtFn(c.target), '#ff4040', dur + 0.7);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true).rotateX(Math.PI / 2), addMat('#ff3030', 0.7));
      c.E.add(line, dur + 0.6, (dt, k) => { const a = c.P.model.worldPos('gripL', V(0, 0, 0)), b = c.target.alive ? c.target.center() : null; if (!b) return true; line.position.copy(a).lerp(b, 0.5); line.lookAt(b); line.scale.set(1, 1, a.distanceTo(b)); line.material.opacity = 0.25 + 0.5 * k; });
    },
    cast(c) { c.E.chargeUp(() => c.hand(), '#ff4040', c.T, { r: 1.8, tex: 'spark', rate: 4, glow: 2 }); },
    proj: { speed: 95, trail: { rate: 5, jit: 0.06, life: 0.45, size: 0.6, color: ['#ff4040', '#ffc0a0', '#ffffff'], tex: 'spark' } },
    launch(c, from) {
      const d = aimDir(c);
      muzzle(c, from, d, '#ff5050', 2.4, 4); beamRings(c, from, d, 6, '#ff6060', 3, 0.5);
      c.E.dustRing(c.feet(), 2.6, '#9a8a70', 14); c.game.shake(0.3);
    },
    hit(c, p) {
      const g = c.ground(p);
      c.E.spark(p, '#ff4040', { n: 26, speed: 13, flare: 5, ringR: 3 });
      c.E.slash(p, c.P.yaw, '#ff5050', { r: 1.6, span: 2.6, roll: 0.8, width: 0.5, dur: 0.3 }); c.E.slash(p, c.P.yaw, '#ff5050', { r: 1.6, span: 2.6, roll: -0.8, width: 0.5, dur: 0.3 });
      c.E.nova(g, '#ff3030', 4, 0.5, '#ffd0c0');
      FX.burst(p.x, p.y, p.z, 10, { color: ['#c01020', '#800a14'], speed: 6, life: 0.8, size: 0.28, gravity: 13, additive: false, tex: 'drop' });
      c.E.screenFlash('#ff3030', 0.12, 0.3); c.game.shake(0.5);
    },
  },
  // Взрывная стрела: горящая стрела, огненный гриб и разлетающиеся угли
  a_explosive: {
    anim: 'bow',
    cast(c) { c.E.chargeUp(() => c.hand(), '#ff8020', c.T, { r: 0.9, tex: 'flame', rate: 2, size: 0.4 }); },
    proj: { speed: 44, trail: { rate: 5, jit: 0.12, life: 0.4, size: 0.6, color: ['#ff6010', '#ffb030', '#ffe080'], tex: 'flame', vy: 0.8 } },
    launch(c, from) { muzzle(c, from, aimDir(c), '#ff9030', 1.1); },
    hit(c, p) {
      const g = c.ground(p);
      c.E.explosion(p, '#ff7020', 1.5); c.E.fireColumn(g, 1.3, 4.5, 0.7, ['#ff5a10', '#ffb030', '#ffe890']);
      c.E.nova(g, '#ff8030', (c.skill.splash || 5), 0.5, '#ffe0a0'); c.E.groundCrack(g, '#ff6010', 2.2, 2.4);
      FX.burst(p.x, p.y, p.z, 22, { color: ['#ffb030', '#ff6010'], speed: 11, life: 1.1, size: 0.2, gravity: 9, up: 4, tex: 'spark' });
      eruptRocks(c, g, 8, 1.4); c.E.dustRing(g, 4, '#6a5a50', 16);
      c.E.feel.scorch(g, 2.8, '#120804', 8, '#ff6010');
      c.game.shake(0.5);
    },
  },
  // Теневой залп: под целью раскрывается воронка тьмы, с неба бьют теневые стрелы и молнии
  a_volley: {
    anim: 'bowhigh', waveStart: 0.85,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius, dur = 0.85 + (c.skill.waves || 5) * 0.45 + 0.3;
      c.E.magicCircle(p, 'shadow', r, dur, { color: '#b080ff' }); c.E.vortex(p, '#9060e0', '#180830', r * 0.92, dur, 4);
      c.after(c.T, () => skyShots(c, '#b080ff', 7));
      cloud(c, p.clone().setY(p.y + 14), r * 0.7, ['#201030', '#302048'], 14, dur, { size: 4, alpha: 0.55, hv: 1.5, out: 0.2, vy: 0 });
    },
    area(c, p, r, w) {
      c.E.arrowVolley(p, r, 18, '#b080ff', { standY: c.gy, shaft: '#40305a', dust: '#3a2a50', leanX: (w % 2 ? -0.3 : 0.3), leanZ: 0.2 });
      const a = R() * TAU, q = c.ground(V(p.x + Math.cos(a) * r * 0.5, 0, p.z + Math.sin(a) * r * 0.5));
      c.after(0.2, () => { c.E.bolt(q.clone().setY(q.y + 14), q, '#b080ff', { width: 0.14, branches: 3, dur: 0.3 }); c.game.shake(0.18); });
      if (w === (c.skill.waves || 5) - 1) c.after(0.35, () => { c.E.nova(p, '#a060ff', r * 1.1, 0.6, '#ffffff'); c.E.screenFlash('#8040e0', 0.14, 0.4); c.game.shake(0.4); });
    },
    each(c, e) { c.after(0.25, () => e.alive && c.E.spark(e.center(), '#b080ff', { n: 6, flare: 1.8, ring: false, light: false })); },
  },

  // ============================ МАГ ============================
  // Огненный шар: пламя собирается в ладони, шар летит с рёвом и взрывается
  m_fireball: {
    anim: 'hurl',
    cast(c) { c.E.chargeUp(() => c.hand(), '#ff7020', c.T, { r: 1.1, tex: 'flame', size: 0.4, rate: 3 }); },
    proj: { speed: 28, trail: { rate: 7, jit: 0.25, life: 0.42, size: 0.95, color: ['#ff6010', '#ffb030', '#ffe080'], tex: 'flame', vy: 0.6 } },
    launch(c, from) { muzzle(c, from, aimDir(c), '#ff8030', 1.4, 2.6); FX.burst(from.x, from.y, from.z, 8, { color: ['#ff6010', '#ffb030'], speed: 3, life: 0.4, size: 0.7, tex: 'flame' }); },
    hit(c, p, o) {
      const g = c.ground(p);
      c.E.explosion(p, '#ff7020', 1); c.E.nova(g, '#ff7a20', 3.4, 0.45, '#ffe0a0');
      c.E.fireColumn(g, 0.8, 3, 0.5, ['#ff5a10', '#ffb030', '#ffe890'], false);
      FX.burst(p.x, p.y, p.z, 14, { color: ['#ffb030', '#ff6010'], speed: 9, life: 0.9, size: 0.18, gravity: 9, up: 3, tex: 'spark' });
      c.E.groundCrack(g, '#ff6010', 1.4, 1.6); c.game.shake(0.22);
      c.E.feel.scorch(g, 1.7, '#140804', 7, '#ff5a10');
    },
  },
  // Ледяная стрела: за осколком льда вьётся снег, цель обрастает ледяными шипами
  m_frost: {
    anim: 'cast',
    cast(c) { c.E.chargeUp(() => c.hand(), '#a0e0ff', c.T, { r: 1.0, tex: 'snow', size: 0.3, rate: 2 }); },
    proj: { speed: 40, trail: { rate: 4, jit: 0.25, life: 0.7, size: 0.34, color: ['#a0e0ff', '#ffffff'], tex: 'snow', gravity: 1.5 } },
    launch(c, from) { muzzle(c, from, aimDir(c), '#a0e0ff', 1.1); },
    hit(c, p) {
      const g = c.ground(p);
      c.E.iceSpikes(g, 1.5, 7, c.gy); c.E.nova(g, '#a0e8ff', 3, 0.5, '#ffffff');
      c.E.spark(p, '#c0f0ff', { n: 14, tex: 'shard', speed: 8, flare: 2.8 });
      FX.burst(p.x, p.y, p.z, 12, { color: ['#ffffff', '#c0f0ff'], speed: 3, life: 1.2, size: 0.3, gravity: 1.5, tex: 'snow' });
      cloud(c, g, 1.4, ['#c8e8f8', '#e8f4ff'], 6, 1.4, { size: 1.6, alpha: 0.3, h: 0.2 });
    },
  },
  // Кольцо мороза: посох бьёт в землю — стена инея расходится кругом, всё сковывает лёд
  m_nova: {
    anim: 'cast2',
    cast(c) { c.E.magicCircle(c.feet(), 'frost', c.skill.radius, 1.8); c.E.chargeUp(() => c.hand(), '#a0e8ff', c.T, { r: 1.6, tex: 'snow', rate: 3, size: 0.3 }); },
    area(c, p, r) {
      c.E.iceSpikes(p, r, 24, c.gy); c.E.nova(p, '#a0e8ff', r * 1.05, 0.6, '#ffffff'); c.E.shockwave(p, '#a0e8ff', r, 0.6, false);
      for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; FX.emit({ x: p.x + Math.cos(a) * 0.6, y: p.y + 0.4 + R() * 0.5, z: p.z + Math.sin(a) * 0.6, vx: Math.cos(a) * r * 2.4, vy: 0.4, vz: Math.sin(a) * r * 2.4, life: 0.7, size: 0.4, color: i % 3 ? '#c0f0ff' : '#ffffff', tex: i % 2 ? 'snow' : 'shard', drag: 0.92 }); }
      cloud(c, p, r * 0.9, ['#c8e8f8', '#e8f4ff'], 18, 2.0, { size: 2.4, alpha: 0.3, h: 0.2 });
      c.E.flash(p, '#80d0ff', 40, 0.5, 20); c.game.shake(0.3);
    },
    each(c, e) { const g = c.ground(e.pos); c.E.iceSpikes(g, 0.8, 4, c.gy); c.E.spark(e.center(), '#c0f0ff', { n: 6, tex: 'snow', flare: 1.6, light: false, gravity: 2 }); },
  },
  // Скачок: маг рассыпается искрами, оставляя тающий силуэт, и возникает из печати
  m_blink: {
    anim: 'cast',
    blinkOut(c) {
      const p = c.P.center();
      c.E.spirit(c.P.model, '#b090ff', 0.7, { opacity: 0.6, grow: 0.15 });
      c.E.spark(p, '#c0a0ff', { n: 18, tex: 'sparkle', speed: 5, gravity: -2, flare: 2.6 });
      c.E.nova(c.feet(), '#b090ff', 2.4, 0.4);
    },
    blinkIn(c, from) {
      const g = c.feet(), p = c.P.center();
      c.E.beam2(from, p, '#c0a0ff', { width: 0.12, dur: 0.35 });
      c.E.magicCircle(g, 'arcane', 1.8, 0.9); c.E.nova(g, '#c0a0ff', 3, 0.45, '#ffffff');
      c.E.chargeUp(() => c.P.center(), '#c0a0ff', 0.25, { r: 2, rate: 5 });
      halo(c, c.P.model.root, '#c0a0ff', 0.1, 2.2, 0.8, 0.45);
    },
  },
  // Цепная молния: маг указывает в небо, разряд бьёт в посох и ветвится по врагам
  m_chain: {
    anim: 'cast3',
    cast(c) {
      c.E.chargeUp(() => c.hand(), '#a0c8ff', c.T, { r: 1.4, tex: 'spark', rate: 3 });
      c.after(c.T * 0.5, () => { const h = c.hand(); c.E.bolt(SKY(h, 18), h, '#a0c8ff', { width: 0.1, branches: 2, dur: 0.25, sparks: 4 }); });
    },
    chainStart(c) { muzzle(c, c.hand(), aimDir(c), '#a0c8ff', 1.4, 3); c.game.shake(0.2); },
    hop(c, f, e, i) {
      const p = e.center(), g = c.ground(e.pos);
      c.E.bolt(f, p, '#a0d0ff', { width: 0.14 - i * 0.015, branches: 3, dur: 0.32 });
      c.E.spark(p, '#a0d8ff', { n: 10, speed: 9, flare: 2.8, ringR: 1.5 }); c.E.nova(g, '#80b8ff', 1.8, 0.35);
      for (let k = 0; k < 2; k++) { const a = R() * TAU; c.E.bolt(p.clone(), g.clone().add(V(Math.cos(a) * 1.5, 0.05, Math.sin(a) * 1.5)), '#a0d0ff', { width: 0.04, branches: 0, dur: 0.2, sparks: 2 }); }
    },
  },
  // Метеор: огненная печать на земле, с неба падает пылающая глыба
  m_meteor: {
    anim: 'invoke', delay: 1.0,
    precast(c, dur) {
      const p = c.ground(c.point);
      c.E.magicCircle(p, 'fire', c.skill.radius, dur + 1.4, { column: 2 }); c.E.magicCircle(c.feet(), 'fire', 2, dur + 0.6, { follow: c.P.model.root });
      c.E.chargeUp(() => c.hand(), '#ff6020', dur, { r: 1.6, tex: 'flame', size: 0.4, rate: 2 });
    },
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.beam2(SKY(p, 30), p, '#ff7030', { width: 0.12, dur: 0.5 });
      c.after(0.2, () => c.E.meteor(p, '#ff5020', () => {
        c.E.fireColumn(p, r * 0.35, 8, 1.0, ['#ff4a10', '#ffa030', '#ffe890']); c.E.nova(p, '#ff6020', r * 1.15, 0.7, '#ffe0a0');
        c.E.groundCrack(p, '#ff5010', r * 0.6, 3); eruptRocks(c, p, 18, r * 0.5); c.E.dustRing(p, r, '#5a4a40', 26);
        c.E.feel.scorch(p, r * 0.75, '#100604', 10, '#ff4a10');
        FX.burst(p.x, p.y + 0.5, p.z, 30, { color: ['#ffb030', '#ff6010'], speed: 14, life: 1.3, size: 0.2, gravity: 9, up: 6, tex: 'spark' });
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + R(); c.after(0.05 + R() * 0.15, () => c.E.fireColumn(c.ground(V(p.x + Math.cos(a) * r * 0.6, 0, p.z + Math.sin(a) * r * 0.6)), 0.6, 2.6, 0.9, ['#ff5a10', '#ffb030'], false)); }
        c.E.screenFlash('#ff6020', 0.22, 0.5); c.game.shake(0.7);
      }));
    },
    each(c, e) { c.E.spark(e.center(), '#ff8030', { n: 8, tex: 'flame', flare: 2, light: false, gravity: -2 }); },
  },
  // Копьё света: слепящий луч пробивает строй, вдоль него расходятся кольца
  m_lance: {
    anim: 'channel',
    cast(c) { c.E.chargeUp(() => c.hand(), '#fff0a0', c.T, { r: 1.6, rate: 4, glow: 2.2 }); c.E.magicCircle(c.feet(), 'holy', 1.8, 1.2, { follow: c.P.model.root }); },
    line(c, from, to, dir, len) {
      const h = c.hand(); from = V(h.x, from.y, h.z);
      c.E.beam2(from, to, '#fff0a0', { width: 0.5, dur: 0.75 });
      beamRings(c, from, dir, Math.min(len, 9), '#ffe890', 4, 0.9);
      c.E.godRays(c.ground(to), '#fff0a0', 0.9, 1.5); c.E.spark(to, '#fff0a0', { n: 16, tex: 'sparkle', flare: 4, gravity: 1 });
      c.E.screenFlash('#fff0c0', 0.1, 0.3); c.game.shake(0.25);
    },
    each(c, e) { const g = c.ground(e.pos); c.E.pillar(g, '#fff0a0', 0.35, 7, 0.45); c.E.spark(e.center(), '#fff0a0', { n: 8, tex: 'sparkle', flare: 2.4, gravity: 1 }); },
  },
  // Благословение: кольца света поднимаются вдоль тела, над головой вспыхивает знак
  m_bless: {
    anim: 'pray',
    cast(c) { c.E.magicCircle(c.feet(), 'holy', 2.6, 2.2, { follow: c.P.model.root }); },
    self(c) {
      const root = c.P.model.root, g = c.feet();
      for (let i = 0; i < 3; i++) halo(c, root, '#ffe8a0', 0.15, 2.5, 0.85 - i * 0.12, 0.8, i * 0.22);
      c.E.pillar(g, '#fff0a0', 0.5, 12, 0.9); c.E.nova(g, '#ffe080', 3.5, 0.6, '#ffffff');
      const h = c.head(c.P); h.y += 0.5;
      FX.emit({ x: h.x, y: h.y, z: h.z, life: 0.9, size: 2.6, color: '#fff0c0', tex: 'sparkle', rot: 0, spin: 0 });
      FX.emit({ x: h.x, y: h.y, z: h.z, life: 0.5, size: 3.4, color: '#ffe080', tex: 'flare', rot: 0, spin: 1.5 });
      c.E.risingRunes(g, '#a0ff90', 0.9, 1.6, { follow: root, tex: 'sparkle', n: 4, rate: 0.7, size: 0.34 });
      c.E.risingRunes(g, '#ffe080', 1.3, 1.6, { follow: root, n: 2, rate: 0.5, speed: -4 });
    },
  },
  // Солнечный гнев: над целью разгорается солнце и обрушивается вниз
  m_solar: {
    anim: 'invoke', delay: 1.05,
    precast(c, dur) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.magicCircle(p, 'holy', r, dur + 1.6, { color: '#ffc040' }); c.E.magicCircle(c.feet(), 'holy', 2, dur + 0.6, { follow: c.P.model.root, color: '#ffc040' });
      const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), fireMat('#ff8a10', '#fff0a0', { disp: 0.5 }));
      seed.position.copy(p).setY(p.y + 16);
      c.E.add(seed, dur + 0.15, (dt, k) => { seed.scale.setScalar(0.2 + k * 1.8); seed.rotation.y += dt * 2; });
      c.E.chargeUp(() => seed.position, '#ffc040', dur, { r: 5, tex: 'flame', size: 0.7, rate: 3, glow: 4 });
      c.E.godRays(p, '#ffd870', dur + 1, r * 0.4);
    },
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.after(0.15, () => c.old.area('solar', p, r));
    },
    impact(c, p) {
      const r = c.skill.radius;
      c.E.beam2(p.clone().setY(p.y + 26), p, '#ffe080', { width: 0.5, dur: 0.6 });
      c.E.nova(p, '#ffb030', r * 1.15, 0.8, '#ffffff'); c.after(0.15, () => c.E.nova(p, '#ff7020', r * 0.8, 0.6));
      c.E.fireColumn(p, r * 0.22, 8, 1.0, ['#ff9a20', '#ffd060', '#ffe890']); c.E.groundCrack(p, '#ffa020', r * 0.6, 3);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.E.pillar(c.ground(V(p.x + Math.cos(a) * r * 0.7, 0, p.z + Math.sin(a) * r * 0.7)), '#ffe080', 0.4, 10, 0.6); }
      c.E.dustRing(p, r, '#7a6a50', 26); c.E.screenFlash('#ffe0a0', 0.16, 0.5);
      c.E.feel.scorch(p, r * 0.7, '#1a1008', 10, '#ffb020');
    },
    each(c, e) { c.E.spark(e.center(), '#ffd060', { n: 8, tex: 'flame', flare: 2.4, light: false, gravity: -2 }); },
  },
  // Теневая стрела: сгусток тьмы с черепами в шлейфе, попадание схлопывается воронкой
  m_shadow: {
    anim: 'push',
    cast(c) { c.E.chargeUp(() => c.hand(), '#a050ff', c.T, { r: 1.2, rate: 3 }); cloud(c, c.hand(), 0.3, ['#180828', '#281040'], 3, 0.6, { size: 0.8, alpha: 0.5, h: 0, hv: 0.2 }); },
    proj: { speed: 36, trail: { rate: 5, jit: 0.25, life: 0.6, size: 0.6, color: ['#7020c0', '#a050ff', '#300860'] }, onTick(obj) { if (R() < 0.5) FX.emit({ x: obj.position.x, y: obj.position.y, z: obj.position.z, life: 0.8, size: 1.0, color: '#140620', additive: false, alpha: 0.5, grow: 0.8, tex: 'smoke' }); if (R() < 0.12) FX.emit({ x: obj.position.x, y: obj.position.y, z: obj.position.z, vy: 0.5, life: 0.6, size: 0.5, color: '#c090ff', tex: 'skull' }); } },
    launch(c, from) { muzzle(c, from, aimDir(c), '#a050ff', 1.3); },
    hit(c, p) {
      c.old.hit('shadowhit', p);
      for (let i = 0; i < 6; i++) { const th = R() * TAU, ph = (R() - 0.3) * 1.6; c.E.bolt(p.clone(), p.clone().add(V(Math.cos(th) * Math.cos(ph) * 2.2, Math.sin(ph) * 2.2, Math.sin(th) * Math.cos(ph) * 2.2)), '#a050ff', { width: 0.05, branches: 0, dur: 0.28, sparks: 0 }); }
      for (let i = 0; i < 14; i++) { const th = R() * TAU, d = 2 + R(); FX.emit({ x: p.x + Math.cos(th) * d, y: p.y + (R() - 0.5) * 2, z: p.z + Math.sin(th) * d, vx: -Math.cos(th) * d * 3, vz: -Math.sin(th) * d * 3, life: 0.33, size: 0.5, color: '#c090ff', tex: 'spark', drag: 1 }); }
      skullPop(c, p.clone().setY(p.y + 0.8), '#b070ff', 1.1);
    },
  },
  // Похищение жизни (маг): кровавые нити тянутся от жертвы, капли жизни летят к магу
  m_drain: {
    anim: 'channel',
    drain(c, t) {
      const g = c.ground(t.pos);
      c.E.magicCircle(g, 'shadow', 1.8, 1.4, { color: '#e02060' });
      for (let i = 0; i < 10; i++) c.after(0.1 + i * 0.07, () => { if (t.alive) wisp(c, t.center(), () => c.hand(), '#ff2050', { tex: 'drop', dur: 0.45, arc: 1.8, lift: 0.6, size: 0.5, color2: '#a00020' }); });
      c.after(0.7, () => { halo(c, c.P.model.root, '#ff4070', 0.2, 2.2, 0.7, 0.6); c.E.risingRunes(c.feet(), '#ff6080', 0.7, 0.8, { follow: c.P.model.root, tex: 'sparkle', n: 3, rate: 0.8, size: 0.3 }); });
    },
    hit(c, p) { c.E.spark(p, '#ff3060', { n: 10, tex: 'drop', flare: 2.2, gravity: 8 }); },
  },
  // Разлом Бездны: ладонь рвёт землю — воронка затягивает врагов и схлопывается
  m_void: {
    anim: 'summon', waveStart: 0.6,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius, dur = 0.6 + (c.skill.waves || 4) * 0.45 + 0.25;
      c.E.magicCircle(p, 'shadow', r, dur, { spin: -2 }); c.E.vortex(p, '#a050ff', '#1a0630', r, dur, 5);
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#000000' }));
      const rim = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), energyMat('#a050ff', { scale: 3, speed: 3, rimA: 0.9 }));
      const g = new THREE.Group(); g.add(core, rim); g.position.copy(p).setY(p.y + 1.6);
      c.E.add(g, dur, (dt, k) => {
        const s = k < 0.2 ? easeOutBack(k / 0.2) : k > 0.9 ? (1 - k) * 10 : 1; g.scale.setScalar(Math.max(0.01, s * (1.1 + 0.12 * Math.sin(k * 50))));
        for (let i = 0; i < 3; i++) { const a = R() * TAU, d = r * (0.5 + R() * 0.5), h = R() * 3; FX.emit({ x: p.x + Math.cos(a) * d, y: p.y + h, z: p.z + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.2 - Math.sin(a) * 4, vy: (1.6 - h) * 2, vz: -Math.sin(a) * d * 2.2 + Math.cos(a) * 4, life: 0.42, size: 0.5, color: R() < 0.3 ? '#ffffff' : '#a050ff', tex: 'spark', drag: 1 }); }
      });
      cloud(c, c.feet(), 0.8, ['#180828', '#281040'], 5, 0.9, { size: 1.1, alpha: 0.5 });
    },
    area(c, p, r, w) {
      const top = p.clone().setY(p.y + 1.6);
      for (let i = 0; i < 3; i++) { const a = R() * TAU; c.E.bolt(V(p.x + Math.cos(a) * r, p.y + R() * 3, p.z + Math.sin(a) * r), top, '#b070ff', { width: 0.07, branches: 1, dur: 0.3, sparks: 0 }); }
      c.E.flash(top, '#7020ff', 20, 0.4);
      if (w === (c.skill.waves || 4) - 1) c.after(0.3, () => { c.E.nova(p, '#a050ff', r * 1.15, 0.6, '#ffffff'); c.E.spark(top, '#c090ff', { n: 30, speed: 14, flare: 6, ringR: 4 }); c.E.screenFlash('#7020c0', 0.2, 0.5); c.game.shake(0.6); });
    },
    each(c, e) { const p = e.center(); for (let i = 0; i < 3; i++) FX.emit({ x: p.x, y: p.y, z: p.z, vx: (c.point.x - p.x) * 2, vy: 1, vz: (c.point.z - p.z) * 2, life: 0.4, size: 0.5, color: '#c090ff', tex: 'spark' }); },
  },

  // ============================ НЕКРОМАНТ ============================
  // Костяная стрела: осколки костей слетаются в копьё, оно разлетается в щепки
  n_bone: {
    anim: 'hurl',
    cast(c) { c.E.chargeUp(() => c.hand(), '#e8e0c8', c.T, { r: 1.2, tex: 'bone', size: 0.34, rate: 3, glow: 0.8 }); },
    proj: { speed: 40, trail: { rate: 3, jit: 0.25, life: 0.5, size: 0.34, color: ['#e8e0c8', '#60ff90', '#d0ffd0'], tex: 'bone', gravity: 3 } },
    launch(c, from) { muzzle(c, from, aimDir(c), '#90ffb0', 1.1); },
    hit(c, p) {
      c.E.shards(p, 9, boneMat('#ece4cc'), 0.16, 7);
      c.E.spark(p, '#90ffb0', { n: 12, tex: 'bone', speed: 7, flare: 2.4, gravity: 10 });
      FX.emit({ x: p.x, y: p.y, z: p.z, vy: 1.6, life: 0.9, size: 0.8, color: '#70ffa0', tex: 'skull', drag: 0.96 });
    },
  },
  // Поднять скелета: ладонь к земле — могила разверзается зелёным пламенем
  n_raise: {
    anim: 'summon',
    cast(c) { c.E.chargeUp(() => c.P.model.worldPos('gripL', V(0, 0, 0)), '#60ff90', c.T, { r: 1.2, tex: 'skull', size: 0.3, rate: 1 }); },
    appear(c, pos) { graveRise(c, pos, 1.7); },
  },
  // Проклятие тлена: череп летит к жертве, под ней загорается печать смерти
  n_curse: {
    anim: 'cast',
    cast(c) { skullPop(c, c.hand(), '#80ff40', 0.9); },
    proj: { speed: 30, trail: { rate: 2, jit: 0.2, life: 0.6, size: 0.5, color: ['#80ff40', '#c0ff80'], tex: 'skull', vy: 0.4 }, onTick(obj) { if (R() < 0.5) FX.emit({ x: obj.position.x, y: obj.position.y, z: obj.position.z, life: 0.9, size: 0.9, color: '#203808', additive: false, alpha: 0.5, grow: 0.8, tex: 'smoke' }); } },
    hit(c, p, o) {
      const t = o && o.target;
      cloud(c, p, 1.0, ['#203808', '#3a5a10'], 8, 1.8, { size: 1.5, alpha: 0.45, h: -0.3 });
      skullPop(c, p.clone().setY(p.y + 0.6), '#a0ff50', 1.6);
      c.E.spark(p, '#80ff40', { n: 8, tex: 'skull', size: 0.4, speed: 3, gravity: -1, flare: 2 });
      if (t && t.model) c.E.magicCircle(c.ground(t.pos), 'death', 1.7, 3, { color: '#80ff40', follow: t.model.root });
    },
  },
  // Похищение жизни (некромант): из жертвы вырываются призрачные черепа-души
  n_tap: {
    anim: 'channel',
    drain(c, t) {
      const g = c.ground(t.pos);
      c.E.magicCircle(g, 'death', 1.8, 1.4, { color: '#e03050' });
      for (let i = 0; i < 5; i++) c.after(0.12 + i * 0.13, () => { if (t.alive) wisp(c, c.head(t), () => c.hand(), '#ff5070', { tex: 'skull', dur: 0.55, arc: 3, lift: 1.4, size: 0.8, color2: '#60ffa0' }); });
      c.after(0.8, () => c.E.spark(c.hand(), '#ff5070', { n: 8, tex: 'sparkle', flare: 2.2, gravity: -1, speed: 3, ring: false }));
    },
    hit(c, p) { c.E.spark(p, '#ff4060', { n: 8, flare: 2, gravity: 4 }); skullPop(c, p.clone().setY(p.y + 0.7), '#ff6080', 0.9); },
  },
  // Чумной взрыв: гнилостный сгусток падает в печать и лопается ядовитым облаком
  n_plague: {
    anim: 'cast3', delay: 0.62,
    cast(c) {
      const p = c.ground(c.point), r = c.skill.radius;
      c.E.magicCircle(p, 'death', r, 3.4, { color: '#90ff50' });
      c.after(c.T * 0.6, () => wisp(c, SKY(p, 12), () => p, '#90ff50', { tex: 'skull', dur: 0.3, arc: 0.5, lift: 0, size: 1.4, color2: '#306010' }));
    },
    impact(c, p) {
      const r = c.skill.radius;
      c.old.area('plague', p, r); c.E.nova(p, '#80ff40', r, 0.6, '#e0ffb0');
      c.E.feel.scorch(p, r * 0.8, '#0e1a04', 9, '#60ff30');
      FX.burst(p.x, p.y + 0.4, p.z, 24, { color: ['#70ff40', '#b0ff60', '#308010'], speed: 9, life: 0.9, size: 0.3, gravity: 12, up: 5, tex: 'drop' });
      for (let i = 0; i < 5; i++) c.after(0.2 + i * 0.25, () => { const a = R() * TAU, d = R() * r * 0.7; skullPop(c, V(p.x + Math.cos(a) * d, p.y + 0.8, p.z + Math.sin(a) * d), '#a0ff50', 1.0 + R() * 0.6); });
      c.E.add(null, 2.6, () => { if (R() < 0.5) { const a = R() * TAU, d = R() * r; FX.emit({ x: p.x + Math.cos(a) * d, y: p.y + 0.15, z: p.z + Math.sin(a) * d, vy: 0.9 + R(), life: 0.9, size: 0.2 + R() * 0.3, color: '#b0ff60', tex: 'ring' }); } });
      c.game.shake(0.3);
    },
    each(c, e) { c.E.spark(e.center(), '#90ff50', { n: 6, tex: 'drop', flare: 1.6, light: false, gravity: 10 }); },
  },
  // Армия мёртвых: огромная печать под некромантом, мертвецы встают один за другим
  n_army: {
    anim: 'invoke',
    cast(c) { c.E.magicCircle(c.feet(), 'death', 6.5, 2.4, { column: 1.5 }); c.E.chargeUp(() => c.hand(), '#60ff90', c.T, { r: 2, tex: 'skull', size: 0.34, rate: 2 }); },
    self(c) {
      const g = c.feet();
      c.E.nova(g, '#50ff80', 8, 0.8, '#d0ffd0'); soundRings(c, '#50ff80', 2, 8, 0.4);
      cloud(c, g, 5, ['#182818', '#243a24'], 16, 2.2, { size: 2.6, alpha: 0.4, h: 0.1 });
      c.E.screenFlash('#30c060', 0.16, 0.5); c.game.shake(0.4);
    },
    appear(c, pos, kind, i) { c.after(i * 0.12, () => { graveRise(c, pos, 1.5); c.E.bolt(SKY(pos, 14), pos, '#60ff90', { width: 0.08, branches: 1, dur: 0.25 }); }); },
  },
  // Костяной голем: кости слетаются со всей округи и срастаются в великана
  n_golem: {
    anim: 'summon',
    cast(c) { c.E.chargeUp(() => c.P.model.worldPos('gripL', V(0, 0, 0)), '#e8e0c8', c.T, { r: 1.4, tex: 'bone', size: 0.3, rate: 2 }); },
    appear(c, pos) {
      const top = pos.clone().setY(pos.y + 2);
      c.E.magicCircle(pos, 'death', 3.6, 2.2); c.E.groundCrack(pos, '#60ff80', 3, 2.2);
      c.E.chargeUp(() => top, '#e8e0c8', 0.5, { r: 4.5, tex: 'bone', size: 0.5, rate: 8, glow: 2.5 });
      c.E.vortex(pos, '#60ff90', '#103018', 3.2, 1.0, 3);
      c.after(0.45, () => { c.E.boneSpikes(pos, 3.2, 14, boneMat('#e4dcc4')); c.E.nova(pos, '#70ff90', 5, 0.6, '#ffffff'); c.E.spark(top, '#e8e0c8', { n: 20, tex: 'bone', speed: 8, flare: 4, gravity: 10 }); c.E.dustRing(pos, 3.4, '#5a5040', 16); c.game.shake(0.5); });
    },
  },
  // Нечестивое неистовство: зелёные разряды бьют в каждого слугу, над ними вспыхивают черепа
  n_frenzy: {
    anim: 'roar',
    cast(c) { c.E.chargeUp(() => c.P.center(), '#40ff60', c.T, { r: 2.2, tex: 'skull', size: 0.3, rate: 2 }); },
    self(c) {
      const g = c.feet();
      soundRings(c, '#40ff60', 3, 9, 1.5); c.E.nova(g, '#40ff60', 6, 0.6, '#ff6040');
      c.E.attachAura(c.P.model.root, '#40ff60', 3, 1.4); c.game.shake(0.3);
    },
    minion(c, a) {
      const p = a.center(), g = c.ground(a.pos);
      c.E.bolt(c.hand(), p, '#40ff60', { width: 0.1, branches: 2, dur: 0.4 });
      c.E.fireColumn(g, 0.5, 2.6, 0.8, GREEN_FIRE, false); c.E.nova(g, '#40ff60', 2, 0.4);
      skullPop(c, c.head(a), '#ff5040', 1.2);
    },
  },
  // Рыцарь Смерти: тьма сгущается, молнии бьют в печать, из столпа пламени выходит рыцарь
  n_knight: {
    anim: 'summon',
    cast(c) { c.E.chargeUp(() => c.P.model.worldPos('gripL', V(0, 0, 0)), '#60ffb0', c.T, { r: 1.6, tex: 'skull', size: 0.34, rate: 2 }); },
    appear(c, pos) {
      c.E.magicCircle(pos, 'death', 3.8, 2.6, { color: '#60ffb0', column: 2 }); c.E.magicCircle(pos.clone().setY(pos.y + 9), 'shadow', 2.6, 1.4, { color: '#40c080', spin: -2 });
      cloud(c, pos, 2.6, ['#0a1410', '#14241c'], 14, 2.2, { size: 2.6, alpha: 0.55, h: 0.2 });
      for (let i = 0; i < 4; i++) c.after(i * 0.09, () => { const a = R() * TAU; c.E.bolt(SKY(pos, 20), V(pos.x + Math.cos(a) * 1.5, pos.y, pos.z + Math.sin(a) * 1.5), '#60ffb0', { width: 0.14, branches: 3, dur: 0.3 }); });
      c.E.groundCrack(pos, '#40ff80', 2.8, 2.6); c.E.pillar(pos, '#30c070', 0.8, 14, 1.0);
      c.E.fireColumn(pos, 1.0, 5, 1.1, GREEN_FIRE, true);
      c.after(0.15, () => { c.E.nova(pos, '#50ffa0', 6, 0.7, '#ffffff'); c.E.screenFlash('#30c080', 0.2, 0.5); eruptRocks(c, pos, 12, 1.6, '#3a4a40'); });
      c.game.shake(0.7);
    },
  },
  // Жатва душ: призрачная коса описывает круг, души срываются с врагов и летят к некроманту
  n_harvest: {
    anim: 'sweep',
    cast(c) { c.E.weaponGlow(c.P.model, '#40e0d0', 0.8, { tex: 'sparkle' }); },
    area(c, p, r) {
      const root = c.P.model.root;
      c.E.spectralScythe(p, '#40e0d0', r, 0.55, 1.15);
      c.E.slash(c.P.pos.clone().setY(c.P.pos.y + 1.0), c.P.yaw, '#40e0d0', { r: r * 0.95, span: TAU * 0.95, width: 0.36, roll: 0.1, dur: 0.5, follow: root, color2: '#d0fff8' });
      c.E.vortex(p, '#40e0d0', '#062a28', r * 0.9, 0.9, 2); c.E.nova(p, '#40e0d0', r, 0.5);
      cloud(c, p, r * 0.7, ['#0a2422', '#103432'], 10, 1.4, { size: 2, alpha: 0.4, h: 0.1 });
    },
    each(c, e) {
      const p = e.center();
      c.E.slash(p, R() * TAU, '#70f0e0', { r: 0.9, span: 2.2, roll: (R() - 0.5) * 2, width: 0.5, dur: 0.24 });
      c.after(0.15, () => wisp(c, c.head(e), () => c.P.center(), '#7af8ff', { tex: 'skull', dur: 0.6, arc: 2.6, lift: 1.6, size: 0.8, onEnd: () => FX.emit({ x: c.P.pos.x, y: c.P.pos.y + 1.2, z: c.P.pos.z, life: 0.25, size: 1.4, color: '#7af8ff', tex: 'flare' }) }));
    },
  },
  // Коса Смерти: исполинская призрачная коса летит вперёд, выкашивая всё на пути
  n_deathscythe: {
    anim: 'reap',
    cast(c) { c.E.weaponGlow(c.P.model, '#30d0c0', 0.9, { tex: 'sparkle' }); c.E.chargeUp(() => c.hand(), '#30d0c0', c.T, { r: 1.4, rate: 2 }); },
    line(c, from, to, dir, len) {
      const yaw = Math.atan2(dir.x, dir.z);
      c.E.slash(c.P.pos.clone().setY(c.P.pos.y + 1.1), yaw, '#30e0c8', { r: 2.8, span: 3.2, width: 0.5, roll: 0.1, dur: 0.3, color2: '#e0fffa' });
      c.E.flyingScythe(from.clone(), to.clone(), '#30e0c8', 0.55);
      for (let i = 0; i < 6; i++) c.after(i * 0.08, () => {
        const q = from.clone().addScaledVector(dir, 2.5 + i * (len - 3) / 6);
        c.E.slash(q, yaw, i % 2 ? '#30d0c0' : '#80fff0', { r: 2.2, span: 2.8, width: 0.45, roll: i % 2 ? 0.5 : -0.5, dur: 0.3, travel: 2, dir: i % 2 ? 1 : -1 });
        const g = c.ground(q); FX.emit({ x: g.x, y: g.y + 0.3, z: g.z, vy: 0.6, life: 1.2, size: 2, color: '#0a2422', additive: false, alpha: 0.5, grow: 1, tex: 'smoke' });
        if (i % 2) FX.emit({ x: q.x, y: q.y + 0.4, z: q.z, vy: 1, life: 0.8, size: 0.7, color: '#70f0e0', tex: 'skull' });
      });
      c.game.shake(0.3);
    },
    each(c, e) { const p = e.center(); c.E.spark(p, '#50f0e0', { n: 10, speed: 8, flare: 2.6, ringR: 1.5 }); skullPop(c, c.head(e), '#70f0e0', 0.9); },
  },
  // Аватар Смерти: за спиной встаёт исполинский жнец, некромант вырастает в крылатую тень
  n_avatar: {
    anim: 'invoke',
    cast(c) { c.E.magicCircle(c.feet(), 'death', 4, 3.5, { color: '#20ffe0', follow: c.P.model.root, column: 2 }); c.E.chargeUp(() => c.P.center(), '#20ffe0', c.T, { r: 3, tex: 'skull', size: 0.36, rate: 3, glow: 2 }); },
    self(c) {
      const g = c.feet(), root = c.P.model.root;
      c.E.spirit(c.P.model, '#30ffe0', 3.2, { scale: 2.5, offset: 1.5, follow: true, opacity: 0.4, grow: 0.1 });
      c.E.fireColumn(g, 1.2, 6, 1.3, ['#10c0a0', '#60ffe0', '#d0fff8']);
      c.E.nova(g, '#20ffe0', 8, 0.8, '#ffffff'); c.E.vortex(g, '#20c0b0', '#041818', 4.5, 2.4, 4);
      cloud(c, g, 3, ['#061414', '#0a2020'], 14, 2.4, { size: 2.6, alpha: 0.5, h: 0.1 });
      c.E.add(null, 3, () => { if (R() < 0.2) { const a = R() * TAU, d = 1 + R() * 2; FX.emit({ x: root.position.x + Math.cos(a) * d, y: root.position.y + 0.3, z: root.position.z + Math.sin(a) * d, vy: 1.6 + R(), life: 1.3, size: 0.6, color: '#60ffe0', tex: 'skull', drag: 0.98 }); } });
      c.E.screenFlash('#10c0a0', 0.22, 0.6);
    },
  },
});
