// Модели существ: четвероногие, пауки, големы, призраки, элементали, драконы и гуманоидные монстры.
import * as THREE from 'three';
import { Humanoid, limbGeo, ellipsoid } from './humanoid.js';
import { equipVisual, animateGear } from './gear.js';
import { basicMat, gemMat, glowMat, boneMat, clothMat, metalMat } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { FX } from '../fx/particles.js';
import { scaleTex, furTex, stoneWall, terrainLayers } from '../core/textures.js';
import { fireMat, NOISE_GLSL } from '../fx/effects.js';
import { rockGeo } from '../world/vegetation.js';
import { Creature } from './creature_base.js';
import { horseFromDef } from './horse.js';
import { mergeToJoints } from './optimize.js';
import { Beast } from './beasts.js';
import { Quad } from './quad.js';
import { Spider as SpiderModel } from './spider.js';
import { DragonQ, scaleMaterial } from './dragon.js';
import { MOB_HEADS, attachMobHead } from './mobheads.js';
import { HeroModel, loadHero, heroReady, getHero } from './hero/model.js';
import { heroMat } from './hero/materials.js';
import { furShellSolid } from './quad.js';
import { IS_TOUCH } from '../core/device.js';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const cmats = new Map();
function furMat(color, rough = 0.92) {
  const k = 'f' + color + rough;
  if (!cmats.has(k)) { const f = furTex(); cmats.set(k, new THREE.MeshStandardMaterial({ color, map: f.map, normalMap: f.normalMap, roughness: rough })); }
  return cmats.get(k);
}
function scaleMat(color, extra = {}) {
  const k = 's' + color + JSON.stringify(extra);
  if (!cmats.has(k)) { const t = scaleTex(); cmats.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.45, metalness: 0.15 }, extra))); }
  return cmats.get(k);
}

// ---------- Паук ----------
class Spider extends Creature {
  constructor(def) {
    super();
    const c1 = furMat(def.fur, 0.6), c2 = furMat(def.fur2, 0.6);
    this.height = 0.9;
    const bodyP = this.pivot(this.body, 0, 0.5, 0);
    this.torso = bodyP;
    this.m(ellipsoid(0.25, 0.17, 0.28), c1, bodyP, 0, 0, 0.1);
    const ab = this.m(ellipsoid(0.38, 0.32, 0.45), c1, bodyP, 0, 0.12, -0.5);
    this.abdomen = ab;
    for (let i = 0; i < 4; i++) {
      const st = this.m(ellipsoid(0.12 - i * 0.02, 0.04, 0.06), c2, bodyP, 0, 0.42 - i * 0.04, -0.3 - i * 0.16);
      st.rotation.x = -0.2 - i * 0.2;
    }
    const eye = gemMat(def.eye || '#ff2020', 3);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) this.m(ellipsoid(0.025, 0.025, 0.02), eye, bodyP, sx * (0.04 + i * 0.03), 0.06 + (i % 2) * 0.03, 0.36 - i * 0.02);
    for (const sx of [-1, 1]) {
      const f = this.m(new THREE.ConeGeometry(0.03, 0.14, 6), basicMat('#1a1010', 0.4), bodyP, sx * 0.06, -0.08, 0.38);
      f.rotation.x = Math.PI * 0.85;
    }
    this.legs = [];
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      const a = (i - 1.5) * 0.45;
      const hip = this.pivot(bodyP, sx * 0.2, 0, 0.15 - i * 0.12);
      hip.rotation.y = sx > 0 ? -Math.PI / 2 + a : Math.PI / 2 - a;
      const up = this.pivot(hip);
      up.rotation.x = -0.9;
      this.m(limbGeo(0.45, 0.04, 0.03, 0.2, 0.3, 6), c1, up).rotation.x = Math.PI;
      const kn = this.pivot(up, 0, 0, 0);
      kn.position.set(0, 0.45, 0);
      kn.rotation.x = -1.8;
      this.m(limbGeo(0.85, 0.03, 0.012, 0.1, 0.3, 6), c1, kn).rotation.x = Math.PI;
      this.legs.push({ hip, up, kn, i, sx });
    }
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 6, 0, 1.3);
    this.phase += dt * speed * 2.6;
    for (const L of this.legs) {
      const off = L.i * Math.PI / 2 + (L.sx > 0 ? 0 : Math.PI);
      L.up.rotation.x = -0.9 + Math.max(0, Math.sin(this.phase + off)) * 0.4 * blend;
      L.hip.rotation.z = Math.cos(this.phase + off) * 0.25 * blend * L.sx;
    }
    this.torso.position.y = 0.5 + Math.sin(this.time * 3) * 0.01;
    this.abdomen.scale.setScalar(1 + Math.sin(this.time * 2) * 0.02);
    if (this.action) {
      const s = this.strike();
      this.torso.rotation.x = s * 0.35;
      this.torso.position.z = s * 0.2;
    } else { this.torso.rotation.x = 0; this.torso.position.z = 0; }
  }
}

// ---------- Голем ----------
// Камень голема: трипланарная фактура в координатах глыбы (не «плывёт» при движении),
// раскалённые прожилки в трещинах, пульс света
const golemMats = new Map();
function golemRockMat(glow, magma) {
  const k = glow + (magma ? 'm' : '');
  if (golemMats.has(k)) return golemMats.get(k);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const tex = terrainLayers();
  const gc = new THREE.Color(glow);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tLayers = { value: tex };
    sh.uniforms.uGlow = { value: gc };
    sh.uniforms.uTime = golemTime;
    sh.uniforms.uMagma = { value: magma ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tLayers; uniform vec3 uGlow; uniform float uTime; uniform float uMagma; varying vec3 vOP; varying vec3 vON; float gCrack;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // зернистость и пятна породы
        float g1 = fbm3(vOP * 3.1);
        float g2 = fbm3(vOP * 9.0 + 4.0);
        diffuseColor.rgb *= mix(0.6, 1.2, g1) * mix(0.82, 1.12, g2);
        // трещины: тонкие ветвящиеся линии по изолиниям шума
        float cn = fbm3(vOP * 0.9 + vec3(3.1, 0.0, 1.7));
        float cn2 = fbm3(vOP * 2.0 - vec3(1.3, 2.0, 0.4));
        gCrack = max(smoothstep(0.012, 0.0, abs(cn - 0.5)), smoothstep(0.007, 0.0, abs(cn2 - 0.5)) * 0.6 * step(0.5, cn));
        diffuseColor.rgb *= 1.0 - gCrack * 0.75;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float pulse = 0.7 + 0.3 * sin(uTime * 2.4 + vOP.y * 3.0 + vOP.x * 2.0);
        totalEmissiveRadiance += uGlow * gCrack * (2.2 + uMagma) * pulse;`);
  };
  m.customProgramCacheKey = () => 'golemrock';
  golemMats.set(k, m);
  return m;
}
export const golemTime = { value: 0 };
const golemGeoCache = new Map();
function golemGeos(tint) {
  const k = tint.join(',');
  if (golemGeoCache.has(k)) return golemGeoCache.get(k);
  let sd = 4242;
  const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const list = [0, 1, 2, 3, 4].map(() => { const g = rockGeo(r, tint, 'big'); g.computeBoundingSphere(); return g; });
  golemGeoCache.set(k, list);
  return list;
}

class Golem extends Creature {
  constructor(def) {
    super();
    const tintC = new THREE.Color(def.fur);
    const tint = [tintC.r ** (1 / 2.2), tintC.g ** (1 / 2.2), tintC.b ** (1 / 2.2)];
    const glowC = def.fur2 || '#ffaa40';
    const rock = golemRockMat(glowC, false);
    const glow = gemMat(glowC, 3);
    const core = fireMat ? fireMat(glowC, '#fff0b0', { disp: 0.25 }) : glowMat(glowC, 0.6);
    this.height = 2.6;
    const torso = this.pivot(this.body, 0, 1.45, 0);
    this.torso = torso;
    let seed = Math.floor(Math.random() * 1e6);
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const geos = golemGeos(tint);
    const rk = (r, parent, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const g = geos[Math.floor(rnd() * geos.length)];
      const mm = this.m(g, rock, parent, x, y, z);
      mm.scale.set(sx * r * 0.95, sy * r * 1.15, sz * r * 0.95);
      mm.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      return mm;
    };
    // магмовое ядро светится в щелях между глыбами
    const coreM = (r, parent, x, y, z, sx = 1, sy = 1, sz = 1) => { const c = this.m(new THREE.IcosahedronGeometry(r, 2), core, parent, x, y, z); c.scale.set(sx, sy, sz); c.castShadow = false; return c; };
    const coreBody = coreM(0.34, torso, 0, 0.08, -0.02, 1.25, 1.3, 0.85);
    coreBody.material = core; core.uniforms.uAlpha.value = 0.75;
    // грудь: несколько плит, а не один ком
    rk(0.44, torso, 0, 0.34, 0.16, 1.35, 0.95, 0.75);
    rk(0.3, torso, -0.18, 0.02, 0.2, 0.9, 0.9, 0.7);
    rk(0.3, torso, 0.18, 0.02, 0.2, 0.9, 0.9, 0.7);
    rk(0.4, torso, -0.32, 0.25, -0.06, 0.9, 1.0, 0.9);
    rk(0.4, torso, 0.32, 0.25, -0.06, 0.9, 1.0, 0.9);
    rk(0.36, torso, 0, -0.2, 0.05, 1.1, 0.85, 0.85);
    rk(0.3, torso, -0.2, -0.38, -0.05, 0.9, 0.8, 0.9);
    rk(0.3, torso, 0.2, -0.38, -0.05, 0.9, 0.8, 0.9);
    rk(0.38, torso, 0, 0.42, -0.25, 1.4, 0.9, 0.8);
    this.m(new THREE.OctahedronGeometry(0.1), glow, torso, 0, 0.3, 0.55);
    const head = this.pivot(torso, 0, 0.82, 0.12);
    this.head = head;
    rk(0.25, head, 0, 0, 0, 1.05, 0.8, 0.95);
    rk(0.14, head, 0, 0.16, -0.05, 1.4, 0.5, 1.0);
    for (const sx of [-1, 1]) this.m(ellipsoid(0.05, 0.026, 0.03), glow, head, sx * 0.1, 0.02, 0.21);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = this.pivot(torso, sx * 0.74, 0.45, 0);
      rk(0.34, sh, 0, 0.05, 0, 1.15, 0.95, 1.05);
      coreM(0.16, sh, 0, -0.35, 0, 1, 2.0, 1);
      rk(0.24, sh, 0, -0.42, 0, 0.9, 1.3, 0.9);
      const el = this.pivot(sh, 0, -0.7, 0);
      coreM(0.15, el, 0, -0.3, 0.04, 1, 2.0, 1);
      rk(0.25, el, 0, -0.2, 0.05, 1, 1.3, 1);
      rk(0.34, el, 0, -0.66, 0.06, 1.1, 1.0, 1.1);   // кулак
      this.arms.push({ sh, el, sx });
    }
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = this.pivot(this.body, sx * 0.36, 1.0, 0);
      coreM(0.16, hp, 0, -0.35, 0, 1, 2.2, 1);
      rk(0.3, hp, 0, -0.22, 0, 1, 1.3, 1);
      const kn = this.pivot(hp, 0, -0.55, 0);
      rk(0.29, kn, 0, -0.18, 0, 1, 1.2, 1);
      rk(0.26, kn, 0, -0.42, 0.08, 1.25, 0.6, 1.45);
      this.legs.push({ hp, kn, sx });
    }
  }
  update(dt, st = {}) {
    golemTime.value = performance.now() * 0.001;
    this.baseUpdate(dt);
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 5, 0, 1.2);
    this.phase += dt * speed * 1.2;
    const s = Math.sin(this.phase);
    this.legs[0].hp.rotation.x = s * 0.4 * blend; this.legs[1].hp.rotation.x = -s * 0.4 * blend;
    this.legs[0].kn.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.6 * blend;
    this.legs[1].kn.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.6 * blend;
    let a0 = -s * 0.3 * blend, a1 = s * 0.3 * blend;
    this.torso.rotation.y = s * 0.08 * blend;
    this.torso.position.y = 1.45 + Math.abs(Math.cos(this.phase)) * 0.05 * blend;
    if (this.action) {
      const k = this.strike();
      a0 = a1 = -k * 2.4 + (k < 0 ? 0 : 0);
      if (k < 0) { a0 = a1 = k * 5; }
      this.torso.rotation.x = Math.max(0, k) * 0.3;
    } else this.torso.rotation.x = 0;
    this.arms[0].sh.rotation.x = a0; this.arms[1].sh.rotation.x = a1;
    this.arms[0].el.rotation.x = -0.3; this.arms[1].el.rotation.x = -0.3;
    this.arms[0].sh.rotation.z = 0.15; this.arms[1].sh.rotation.z = -0.15;
  }
}

// ---------- Призрак ----------
// Саван: рваный подол (дыры по шуму, к низу больше), колыхание ткани, внутреннее свечение по краям
const wraithMats = new Map();
function wraithRobeMat(c1, c2) {
  const k = c1 + c2;
  if (wraithMats.has(k)) return wraithMats.get(k);
  const m = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.95, transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: c2, emissiveIntensity: 0.05, depthWrite: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = golemTime;
    sh.uniforms.uEdge = { value: new THREE.Color(c2) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vOP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position;
        float low = clamp(-position.y * 0.9, 0.0, 1.0);
        transformed.x += sin(uTime * 2.3 + position.y * 5.0 + position.z * 3.0) * 0.05 * low;
        transformed.z += cos(uTime * 1.9 + position.y * 4.0 + position.x * 3.0) * 0.06 * low;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uEdge; varying vec3 vOP; float gTear;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float low = clamp(-vOP.y * 1.1 - 0.1, 0.0, 1.0);
        float n = fbm3(vec3(vOP.x * 5.0, vOP.y * 2.5 - uTime * 0.25, vOP.z * 5.0));
        float cut = n - low * 0.75 + 0.18;
        if (cut < 0.0) discard;
        gTear = smoothstep(0.12, 0.0, cut) * low;
        diffuseColor.rgb *= 0.75 + 0.3 * fbm3(vOP * 8.0);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n        totalEmissiveRadiance += uEdge * gTear * 1.4;');
  };
  m.customProgramCacheKey = () => 'wraithrobe';
  wraithMats.set(k, m);
  return m;
}
class Wraith extends Creature {
  constructor(def) {
    super();
    const robe = wraithRobeMat(def.fur, def.fur2);
    this.height = 2.1;
    const torso = this.pivot(this.body, 0, 0.9, 0);
    this.torso = torso;
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.45 * (1 - t) + 0.12 + Math.sin(t * 9) * 0.02, -0.9 + t * 1.75)); }
    const lg = new THREE.LatheGeometry(pts, 18);
    const p = lg.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.7) p.setY(i, p.getY(i) + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 6) * 0.08);
    lg.computeVertexNormals();
    this.robe = this.m(lg, robe, torso, 0, 0, 0);
    const hood = this.m(new THREE.SphereGeometry(0.24, 16, 12, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.75), robe, torso, 0, 0.95, 0);
    hood.scale.set(1, 1.2, 1.1);
    this.m(ellipsoid(0.17, 0.2, 0.08), basicMat('#000', 1), torso, 0, 0.9, 0.12);
    for (const sx of [-1, 1]) this.m(ellipsoid(0.03, 0.02, 0.02), gemMat(def.fur2, 4), torso, sx * 0.06, 0.93, 0.18);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = this.pivot(torso, sx * 0.25, 0.65, 0);
      this.m(limbGeo(0.55, 0.09, 0.13, -0.2, 0.5, 10), robe, sh);
      const hand = this.m(ellipsoid(0.04, 0.08, 0.03), boneMat('#c8c8d8'), sh, 0, -0.62, 0);
      void hand;
      this.arms.push(sh);
    }
    this.def = def;
  }
  update(dt, st = {}) {
    golemTime.value = performance.now() * 0.001;
    this.baseUpdate(dt);
    const t = this.time;
    this.torso.position.y = 0.9 + Math.sin(t * 2) * 0.12;
    this.robe.rotation.y = Math.sin(t) * 0.1;
    let a = -0.8 + Math.sin(t * 1.5) * 0.1;
    if (this.action) a = -0.8 - Math.max(0, this.strike()) * 0.9;
    this.arms[0].rotation.x = a; this.arms[1].rotation.x = a;
    this.arms[0].rotation.z = 0.3; this.arms[1].rotation.z = -0.3;
    this.torso.rotation.x = 0.15 + (st.speed || 0) * 0.03;
    if (Math.random() < dt * 8 && this.deadT < 0) {
      const wp = this.root.position;
      FX.emit({ x: wp.x + (Math.random() - 0.5) * 0.6, y: wp.y + 0.3 * this.root.scale.y, z: wp.z + (Math.random() - 0.5) * 0.6, vy: 0.4, life: 1.2, size: 0.5 * this.root.scale.x, color: this.def.fur2, alpha: 0.35 });
    }
  }
}

// ---------- Огненный элементаль ----------
class Elemental extends Creature {
  constructor(def) {
    super();
    this.def = def;
    this.height = 2.3;
    const core = this.pivot(this.body, 0, 1.3, 0);
    this.torso = core;
    const c1 = def.fur || '#ff6020', c2 = def.fur2 || '#ffd040';
    // каркас из обсидиана с раскалёнными трещинами
    const tintC = new THREE.Color('#2a1c16');
    const geos = golemGeos([tintC.r ** (1 / 2.2), tintC.g ** (1 / 2.2), tintC.b ** (1 / 2.2)]);
    const rockM = golemRockMat(c2, true);
    let sd = 991;
    const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const rk = (r, parent, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = this.m(geos[Math.floor(rnd() * geos.length)], rockM, parent, x, y, z); m.scale.set(sx * r, sy * r, sz * r); m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); return m; };
    // пламя: несколько слоёв огненной оболочки
    this.flames = [];
    const flame = (r, parent, x, y, z, sx, sy, sz, a = 0.9, disp = 0.5) => {
      const m = this.m(new THREE.IcosahedronGeometry(r, 3), fireMat(c1, c2, { disp }), parent, x, y, z);
      m.scale.set(sx, sy, sz); m.castShadow = false; m.material.uniforms.uAlpha.value = a;
      this.flames.push(m); return m;
    };
    flame(0.42, core, 0, 0.05, 0, 1.0, 1.45, 0.8, 0.85, 0.6);           // торс
    flame(0.3, core, 0, -0.75, 0, 0.8, 1.7, 0.8, 0.8, 0.8);             // огненный вихрь вместо ног
    rk(0.24, core, 0, 0.18, 0.12, 1.3, 1.1, 0.7);                        // грудная плита
    rk(0.18, core, -0.17, -0.12, 0.1, 1, 1, 0.8);
    rk(0.18, core, 0.17, -0.12, 0.1, 1, 1, 0.8);
    rk(0.16, core, 0, -0.32, 0.06, 1.1, 0.8, 0.8);
    const head = this.pivot(core, 0, 0.72, 0.05);
    this.head = head;
    rk(0.17, head, 0, 0, 0, 1, 1.1, 1);
    flame(0.2, head, 0, 0.16, -0.02, 1, 1.9, 1, 0.85, 0.7);              // огненная «грива»
    for (const sx of [-1, 1]) this.m(ellipsoid(0.04, 0.022, 0.02), gemMat('#fff4c0', 5), head, sx * 0.065, 0.02, 0.15);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = this.pivot(core, sx * 0.48, 0.38, 0);
      rk(0.17, sh, 0, 0, 0, 1.2, 1, 1);
      flame(0.13, sh, 0, -0.3, 0, 1, 2.6, 1, 0.8, 0.5);
      const el = this.pivot(sh, 0, -0.55, 0);
      flame(0.12, el, 0, -0.25, 0.05, 1, 2.4, 1, 0.8, 0.5);
      rk(0.15, el, 0, -0.5, 0.05, 1.1, 1, 1.1);                          // кулак
      this.arms.push({ sh, el, sx });
    }
    // вокруг кружат угли
    this.shards = [];
    for (let i = 0; i < 7; i++) {
      const sh = rk(0.07 + rnd() * 0.06, core, 0, 0, 0);
      sh.userData.a = i / 7 * Math.PI * 2; sh.userData.r = 0.75 + rnd() * 0.3; sh.userData.h = (rnd() - 0.5) * 1.1;
      this.shards.push(sh);
    }
    this.light = { intensity: 0 };
  }
  update(dt) {
    this.baseUpdate(dt);
    const t = this.time;
    this.torso.position.y = 1.3 + Math.sin(t * 2.5) * 0.12;
    this.torso.rotation.y = Math.sin(t * 0.7) * 0.25;
    let aa = -0.25 + Math.sin(t * 1.6) * 0.1;
    if (this.action) aa = -0.25 - Math.max(0, this.strike()) * 1.6;
    for (const A of this.arms) { A.sh.rotation.x = aa; A.sh.rotation.z = A.sx * 0.35; A.el.rotation.x = -0.5; }
    for (const f of this.flames) f.rotation.y += dt * 1.5;
    for (const s of this.shards) {
      const a = s.userData.a + t * 1.2;
      s.position.set(Math.cos(a) * s.userData.r, s.userData.h + Math.sin(t * 2 + s.userData.a) * 0.1, Math.sin(a) * s.userData.r);
      s.rotation.x += dt; s.rotation.y += dt * 0.7;
    }
    if (this.deadT < 0 && Math.random() < dt * 30) {
      const wp = this.root.position, sc = this.root.scale.x;
      FX.emit({ x: wp.x + (Math.random() - 0.5) * 0.7 * sc, y: wp.y + (1.0 + Math.random() * 0.6) * sc, z: wp.z + (Math.random() - 0.5) * 0.7 * sc, vy: 1.5 + Math.random(), life: 0.7, size: 0.7 * sc, color: Math.random() < 0.5 ? this.def.fur : this.def.fur2, alpha: 0.9 });
    }
    this.light.intensity = this.deadT >= 0 ? 0 : 5 + Math.sin(t * 13) * 1.5;
  }
}

// ---------- Дракон ----------
class Dragon extends Creature {
  constructor(def) {
    super();
    this.def = def;
    const scale = scaleMat(def.fur);
    const belly = scaleMat(def.fur2, { emissive: def.fur2, emissiveIntensity: 0.12, roughness: 0.6 });
    const horn = boneMat('#2a2220');
    this.height = 2.2;
    const torso = this.pivot(this.body, 0, 1.0, 0);
    this.torso = torso;
    this.m(ellipsoid(0.55, 0.48, 1.0, 20, 14), scale, torso);
    this.m(ellipsoid(0.42, 0.35, 0.85, 16, 10), belly, torso, 0, -0.2, 0.05);
    for (let i = 0; i < 7; i++) this.m(new THREE.ConeGeometry(0.06, 0.25, 5), horn, torso, 0, 0.48 - Math.abs(i - 2) * 0.02, 0.6 - i * 0.22).rotation.x = -0.4;
    // шея
    this.neckSeg = [];
    let parent = torso, pz = 0.85, py = 0.2;
    for (let i = 0; i < 5; i++) {
      const s = this.pivot(parent, 0, py, pz);
      this.m(ellipsoid(0.24 - i * 0.02, 0.24 - i * 0.02, 0.26), scale, s, 0, 0, 0.12);
      this.m(new THREE.ConeGeometry(0.04, 0.16, 5), horn, s, 0, 0.22, 0.05).rotation.x = -0.4;
      this.neckSeg.push(s);
      parent = s; pz = 0.26; py = 0.1;
    }
    const head = this.pivot(parent, 0, 0.05, 0.3);
    this.head = head;
    this.m(ellipsoid(0.25, 0.2, 0.32), scale, head, 0, 0, 0.1);
    this.m(ellipsoid(0.17, 0.12, 0.3), scale, head, 0, -0.03, 0.42);
    const jaw = this.pivot(head, 0, -0.1, 0.1);
    this.jaw = jaw;
    this.m(ellipsoid(0.15, 0.06, 0.38), belly, jaw, 0, -0.03, 0.3);
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) this.m(new THREE.ConeGeometry(0.015, 0.06, 4), boneMat('#fff'), jaw, sx * 0.1, 0.03, 0.15 + i * 0.09);
    for (const sx of [-1, 1]) {
      this.m(ellipsoid(0.045, 0.03, 0.03), gemMat(def.eye || '#ffd040', 4), head, sx * 0.15, 0.08, 0.28);
      const hh = this.m(new THREE.ConeGeometry(0.06, 0.55, 6), horn, head, sx * 0.14, 0.18, -0.12);
      hh.rotation.x = -2.2; hh.rotation.z = sx * 0.3;
    }
    this.mouthLight = { intensity: 0 };
    // хвост
    this.tailSeg = [];
    parent = torso; pz = -0.9;
    for (let i = 0; i < 7; i++) {
      const s = this.pivot(parent, 0, 0, pz);
      this.m(ellipsoid(0.22 - i * 0.028, 0.2 - i * 0.025, 0.3), scale, s, 0, 0, -0.15);
      if (i < 6) this.m(new THREE.ConeGeometry(0.035, 0.14, 4), horn, s, 0, 0.17 - i * 0.02, -0.1).rotation.x = -0.6;
      this.tailSeg.push(s);
      parent = s; pz = -0.32;
    }
    this.m(new THREE.ConeGeometry(0.12, 0.3, 4), horn, parent, 0, 0, -0.35).rotation.x = -Math.PI / 2;
    // крылья
    this.wings = [];
    const memb = new THREE.MeshStandardMaterial({ color: def.fur, roughness: 0.7, side: THREE.DoubleSide, emissive: def.fur2, emissiveIntensity: 0.06 });
    for (const sx of [-1, 1]) {
      const w = this.pivot(torso, sx * 0.4, 0.35, 0.35);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(2.4, 0.5); shape.lineTo(2.2, -0.2); shape.lineTo(1.6, -0.6); shape.lineTo(1.4, -1.2); shape.lineTo(0.9, -0.9); shape.lineTo(0.6, -1.5); shape.lineTo(0.2, -1.0); shape.lineTo(0, -0.6); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(Math.PI / 2);
      if (sx < 0) g.scale(-1, 1, 1);
      this.m(g, memb, w);
      for (const [x, z] of [[2.4, 0.5], [1.4, -1.2], [0.6, -1.5]]) {
        const len = Math.hypot(x, z);
        const bone = this.m(new THREE.CylinderGeometry(0.025, 0.05, len, 5), scale, w, sx * x / 2, 0, z / 2);
        bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx * x, 0, z).normalize());
      }
      this.wings.push({ w, sx });
    }
    // лапы
    this.legs = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const hp = this.pivot(torso, sx * 0.46, -0.12, sz * 0.58);
      // мощное бедро/плечо
      this.m(ellipsoid(0.2, 0.3, 0.26), scale, hp, 0, -0.08, sz < 0 ? -0.04 : 0.02);
      this.m(limbGeo(0.5, 0.15, 0.1, 0.25, 0.3, 10), scale, hp);
      const kn = this.pivot(hp, 0, -0.5, 0);
      this.m(limbGeo(0.48, 0.095, 0.065, 0.1, 0.3, 8), scale, kn);
      const foot = this.pivot(kn, 0, -0.48, 0);
      this.m(ellipsoid(0.1, 0.05, 0.16), scale, foot, 0, -0.02, 0.06);
      for (let c = -1; c <= 1; c++) this.m(new THREE.ConeGeometry(0.025, 0.12, 4), horn, foot, c * 0.05, -0.03, 0.2).rotation.x = Math.PI / 2;
      this.legs.push({ hp, kn, foot, sx, sz, baseH: sz > 0 ? -0.35 : 0.45, baseK: sz > 0 ? 0.55 : -0.85 });
    }
  }
  update(dt, st = {}) {
    this.baseUpdate(dt);
    const t = this.time;
    const speed = st.speed || 0;
    const blend = clamp(Math.abs(speed) / 6, 0, 1.2);
    this.phase += dt * speed * 1.4;
    for (const L of this.legs) {
      const off = (L.sz > 0 ? 0 : Math.PI) + (L.sx > 0 ? 0 : Math.PI);
      L.hp.rotation.x = L.baseH + Math.sin(this.phase + off) * 0.4 * blend;
      L.kn.rotation.x = L.baseK + (L.sz > 0 ? 1 : -1) * Math.max(0, Math.cos(this.phase + off)) * 0.45 * blend;
      L.foot.rotation.x = -(L.hp.rotation.x + L.kn.rotation.x);
    }
    this.torso.position.y = 1.0 + Math.sin(t * 1.5) * 0.03;
    this.neckSeg.forEach((s, i) => { s.rotation.x = (i === 0 ? -0.35 : -0.08) + Math.sin(t * 1.2 + i * 0.5) * 0.03; s.rotation.y = Math.sin(t * 0.7 + i * 0.3) * 0.06; });
    this.head.rotation.x = 0.55;
    this.tailSeg.forEach((s, i) => { s.rotation.y = Math.sin(t * 1.6 - i * 0.6) * 0.15; s.rotation.x = 0.06; });
    const flap = st.flying ? Math.sin(t * 6) * 0.8 : Math.sin(t * 1.2) * 0.12 + 0.3;
    for (const W of this.wings) { W.w.rotation.z = W.sx * flap; W.w.rotation.y = W.sx * -0.3; }
    let jaw = Math.max(0, Math.sin(t * 0.9)) * 0.1;
    let headX = 0;
    if (this.action) {
      const s = this.strike();
      headX = s * 0.5; jaw = Math.max(0, s) * 0.7;
      if (this.action === 'breath' || this.action === 'cast2') { headX = 0.35; jaw = 0.8; }
    }
    if (st.breathing) { headX = 0.35; jaw = 0.85; }
    this.neckSeg[4].rotation.x += headX;
    this.jaw.rotation.x = jaw;
    this.mouthLight.intensity = st.breathing ? 25 : 0;
  }
}

// ---------- Гуманоидные монстры ----------
// детальные тела для гуманоидных монстров (те же, что у горожан); на телефонах — облегчённые
const MOB_BODY = 'npc_m';
let mobBodyAsked = false;
export function prepareMobBodies() { if (!IS_TOUCH && !mobBodyAsked) { mobBodyAsked = true; loadHero(MOB_BODY).catch(() => {}); } }
function humanoidMob(def, extra = {}) {
  const spec = Object.assign({}, def.spec || {});
  const ht = spec.headType || 'human';
  // скелет без доспехов остаётся костяным; черепа в латах и балахонах — на детальных телах
  const canHero = !IS_TOUCH && (ht === 'human' || MOB_HEADS.has(ht)) && !(ht === 'skull' && !(def.armor && !def.armor.partial));
  prepareMobBodies();
  let h;
  if (canHero && heroReady(MOB_BODY)) {
    // тело без рубахи у тех, кто по описанию без неё
    const look = Object.assign({}, spec, { base: Object.assign({ shirt: null, pants: null, boots: null }, spec.base || {}) });
    h = new HeroModel(look, getHero(MOB_BODY));
    if (MOB_HEADS.has(ht)) attachMobHead(h, spec, ht === 'lizard' ? scaleMaterial(null, spec.skin) : null);
    if (ht === 'yeti') {
      // йети целиком в шерсти
      const geo = h.bodyMesh.geometry;
      if (!geo.attributes.aFur) geo.setAttribute('aFur', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(0.04), 1));
      const n = 6;
      for (let s = 1; s <= n; s++) { const sm = new THREE.SkinnedMesh(geo, furShellSolid(s / n, spec.skin)); sm.frustumCulled = false; sm.userData.shell = true; h.body.add(sm); sm.bind(h.skeleton); }
    }
    if (spec.tail) {
      // хвост ящера / демона
      const tm = ht === 'lizard' ? scaleMaterial(null, spec.skin) : heroMat('skin', spec.skin || '#8a2a1a');
      const pts = [V3(0, 0, -0.08), V3(0, -0.12, -0.32), V3(0, -0.38, -0.55), V3(0, -0.72, -0.62)];
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 18, 0.07, 10);
      const pa = tg.attributes.position;
      for (let i = 0; i < pa.count; i++) { const t = Math.floor(i / 11) / 18, c = curve.getPoint(Math.min(1, t)), kk = 1 - t * 0.85; pa.setXYZ(i, c.x + (pa.getX(i) - c.x) * kk, c.y + (pa.getY(i) - c.y) * kk, c.z + (pa.getZ(i) - c.z) * kk); }
      tg.computeVertexNormals();
      const n = tg.attributes.position.count;
      tg.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(n).fill(220), 1, true));
      tg.setAttribute('aScale', new THREE.BufferAttribute(new Float32Array(n).fill(0.012), 1));
      tg.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(n).fill(0), 1));
      const tail = new THREE.Mesh(tg, tm); tail.castShadow = true;
      const piv = new THREE.Group(); piv.position.set(0, 0, -0.06); piv.add(tail);
      h.j.hips.add(piv);
      h.tailPiv = piv;
    }
    h.isMobHero = true;
  } else { h = new Humanoid(spec); if (canHero) h.needsUpgrade = true; }
  if (def.armor) {
    const a = def.armor;
    const v = { kind: a.kind, c1: a.c1, c2: a.c2, trim: a.trim || '#8a7a5a', tier: a.tier || 1, style: a.style || 0, gem: a.gem || null };
    const slots = a.partial ? ['chest', 'shoulders'] : (a.robe ? ['chest', 'shoulders', 'head'] : ['chest', 'shoulders', 'legs', 'feet', 'head', 'hands']);
    for (const sl of slots) equipVisual(h, sl, { vis: v });
  }
  if (def.weapon) {
    const t = def.weapon.tier || 0;
    equipVisual(h, 'weapon', { wtype: def.weapon.wtype, vis: { tier: t, c1: ['#8a8a88', '#a0a4a8', '#9aa0a8', '#c0d0e0', '#808898', '#606878', '#5a1010', '#d0e0f0'][t], trim: '#6a5a3a', gem: def.weapon.gem || (t >= 4 ? (extra.gem || '#ff4020') : null) } });
  }
  if (def.offhand === 'shield') equipVisual(h, 'offhand', { otype: 'shield', vis: { kind: 'heavy', tier: 1, c1: '#5a5450', c2: '#3a2020', trim: '#6a5a3a', style: 0 } });
  if (def.wings) {
    const memb = new THREE.MeshStandardMaterial({ color: '#3a0a0a', roughness: 0.7, side: THREE.DoubleSide });
    h.wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * 0.1, 0.22, -0.12);
      h.j.chest.add(w);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.9, 0.5); shape.lineTo(0.85, -0.1); shape.lineTo(0.6, -0.3); shape.lineTo(0.45, -0.7); shape.lineTo(0.2, -0.4); shape.lineTo(0, -0.3); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      if (sx < 0) g.scale(-1, 1, 1);
      const m = new THREE.Mesh(g, memb); m.castShadow = true;
      m.rotation.y = sx * 0.5;
      w.add(m);
      h.wings.push({ w, sx });
    }
    h.updateExtra = (dt, t) => { for (const W of h.wings) W.w.rotation.y = W.sx * (0.4 + Math.sin(t * 2) * 0.25); };
  }
  if (spec.headType === 'yeti' && !h.isMobHero) {
    const fur = basicMat(spec.skin, 0.95);
    const tuft = (parent, x, y, z, r) => { const m = new THREE.Mesh(ellipsoid(r, r * 1.3, r), fur); m.position.set(x, y, z); m.castShadow = true; parent.add(m); };
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; tuft(h.j.chest, Math.cos(a) * 0.17, 0.08 + (i % 3) * 0.08, Math.sin(a) * 0.12, 0.08); }
    for (const sd of ['L', 'R']) { tuft(h.j['shoulder' + sd], 0, -0.05, 0, 0.1); tuft(h.j['elbow' + sd], 0, -0.05, 0, 0.075); tuft(h.j['hip' + sd], 0, -0.15, 0, 0.11); tuft(h.j['knee' + sd], 0, -0.1, 0, 0.08); }
  }
  if (extra.crown) {
    const crown = new THREE.Group();
    const gm = metalMat('#c8e8ff', 0.2);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14 + (i % 2) * 0.08, 5), gm);
      sp.position.set(Math.cos(a) * 0.09, 0.1, Math.sin(a) * 0.09);
      crown.add(sp);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.015, 6, 20), gm);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
    crown.add(ring);
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), gemMat(extra.gem || '#60e0ff', 4));
    g.position.set(0, 0.08, 0.1);
    crown.add(g);
    h.headC.add(crown);
  }
  h.root.traverse(o => { if (o.isMesh && !o.userData.shell) o.castShadow = true; });
  const orig = h.update.bind(h);
  h.update = (dt, st) => { orig(dt, st); animateGear(h, h.time); if (h.tailPiv) { h.tailPiv.rotation.y = Math.sin(h.time * 1.7) * 0.35; h.tailPiv.rotation.x = Math.sin(h.time * 1.1) * 0.08; } };
  h.height = h.headTop() * (1 / Math.max(0.01, spec.scale || 1));
  return h;
}

export function buildCreature(def, opts = {}) {
  let c;
  switch (def.model) {
    case 'wolf': c = new Quad(def, 'wolf'); break;
    case 'boar': c = new Quad(def, 'boar'); break;
    case 'bear': c = new Quad(def, 'bear'); break;
    case 'horse': c = horseFromDef(def); break;
    case 'spider': c = new SpiderModel(def); break;
    case 'golem': c = new Golem(def); break;
    case 'wraith': c = new Wraith(def); break;
    case 'elemental': c = new Elemental(def); break;
    case 'dragon': c = new DragonQ(def); break;
    case 'lich': {
      const lichDef = {
        spec: { headType: 'skull', skin: '#b8b4a6', limb: 0.65, eyes: { color: def.eye || '#60e0ff', glow: true }, hair: { style: 'none' }, base: { shirt: null, pants: null, boots: null } },
        armor: { kind: 'cloth', c1: '#1a2a3a', c2: '#80c8ff', tier: 7, style: 2, robe: true, gem: '#60e0ff' },
        weapon: { wtype: 'bonestaff', tier: 7, gem: '#60e0ff' },
      };
      c = humanoidMob(lichDef, { crown: true, gem: def.eye });
      break;
    }
    default: c = humanoidMob(def, opts);
  }
  optimizeModel(c);
  return c;
}

export { humanoidMob };
void clothMat; void Beast; void Spider; void Dragon;

// Склеить неподвижные детали модели (гуманоиды и звери), не трогая анимируемые части
export function optimizeModel(c) {
  if (!c || !c.root || c.isHero || c.isQuad) return c;
  const isHum = !!(c.j && c.joint);
  const isBeast = c.kind === 'wolf' || c.kind === 'bear' || c.kind === 'boar';
  if (!isHum && !isBeast) return c;
  const skip = new Set();
  if (c.lids) for (const l of c.lids) skip.add(l);
  if (c.attachments) for (const sl of ['weapon', 'offhand']) for (const o of c.attachments[sl] || []) skip.add(o);
  if (c.robe) skip.add(c.robe);
  const anim = new Set([c.root, c.body]);
  if (isHum) {
    for (const k in c.j) anim.add(c.j[k]);
    if (c.cape) anim.add(c.cape);
  } else {
    for (const o of [c.torso, c.head, c.jaw, ...(c.neckSeg || []), ...(c.tailSeg || [])]) if (o) anim.add(o);
    for (const L of c.legs || []) for (const o of [L.top, L.mid, L.low, L.foot]) if (o) anim.add(o);
  }
  // всё, что вращается само (кольца, кристаллы, плащ и т.п.), имеет имя и не трогается
  mergeToJoints(c.root, anim, skip);
  if (isBeast && c.shells) {
    c.shells = [];
    c.root.traverse(o => { if (o.isMesh && o.userData.shell) c.shells.push(o); });
    for (const sm of c.shells) sm.visible = c.furOn !== false;
  }
  return c;
}
