// Сборка мира: свет, небо, туман, ландшафт, вода, растительность, города, локации; цикл дня и ночи.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Terrain } from './terrain.js';
import { Vegetation } from './vegetation.js';
import { Collision } from './collision.js';
import { buildCity, windowMat, flameMat } from './city.js';
import { fountainUniforms } from './fountain.js';
import { buildPOI, buildShop, platformHeight } from './pois.js';
import { webTime } from './spiderweb.js';
import { CITIES, SECRET_SHOPS, POIS, BIOMES } from '../data/world.js';
import { FX } from '../fx/particles.js';
import { clamp, lerp, smoothstep } from '../core/util.js';

export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.collision = new Collision();
    this.time = 0;
    this.dayTime = 0.38; // ~9:00 утра
    this.dayLength = 1800; // сек на сутки
  }

  async build(onProgress = () => {}) {
    const tick = () => new Promise(r => setTimeout(r, 16));
    const scene = this.scene;
    onProgress('Формирование ландшафта…', 0.1); await tick();
    this.terrain = new Terrain();
    scene.add(this.terrain.mesh, this.terrain.water, this.terrain.lava);
    this.setupLights();
    this.setupSky();
    onProgress('Возведение городов…', 0.35); await tick();
    this.cities = [];
    this.cityTrees = [];
    this.animated = [];
    const root = new THREE.Group();
    root.name = 'static';
    scene.add(root);
    this.staticRoot = root;
    for (const c of CITIES) {
      const built = buildCity(c, this.terrain, this.collision, root);
      this.cities.push(Object.assign({ def: c }, built));
      this.cityTrees.push(...built.treeSpots);
      this.animated.push(...built.animated);
      await tick();
    }
    onProgress('Руины, логова и тайные лавки…', 0.55); await tick();
    for (const p of POIS) buildPOI(p, this.terrain, this.collision, root, this.animated);
    this.shops = SECRET_SHOPS.map(s => Object.assign({ def: s }, { npcPos: buildShop(s, this.terrain, this.collision, root, this.animated) }));
    onProgress('Выращивание лесов…', 0.65); await tick();
    this.veg = new Vegetation(scene, this.terrain, this.collision, this.cityTrees);
    this.applyQuality(this.quality);
    // кольца телепортов
    this.tpRings = [];
    for (const a of this.animated) {
      if (a.type === 'teleport') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 8, 40), new THREE.MeshBasicMaterial({ color: '#80e0ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
        ring.position.set(a.x, a.y, a.z);
        scene.add(ring);
        const ring2 = ring.clone(); ring2.scale.setScalar(0.75); scene.add(ring2);
        this.tpRings.push([ring, ring2]);
      }
    }
  }

  // Настройки качества: дальность травы/деревьев, туман, тени
  applyQuality(q) {
    this.quality = q;
    this.fogMul = q >= 1 ? 1 : q >= 0.6 ? 0.85 : 0.7;
    if (this.veg) {
      this.veg.grassDist = q >= 1 ? 110 : q >= 0.6 ? 75 : 50;
      this.veg.treeDist = q >= 1 ? 680 : q >= 0.6 ? 460 : 330;
    }
    if (this.sun) {
      const sm = q >= 1 ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== sm) {
        this.sun.shadow.mapSize.set(sm, sm);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
      const S = q >= 0.6 ? 55 : 40;
      Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
      this.sun.shadow.camera.updateProjectionMatrix();
    }
  }

  setupLights() {
    const sun = new THREE.DirectionalLight('#fff1d8', 3.2);
    sun.castShadow = true;
    const sm = this.quality >= 1 ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    const S = 55;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight('#bcd8ff', '#5a4a30', 1.1);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.15);
    this.scene.add(this.ambient);
  }

  setupSky() {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.86;
    this.sky = sky;
    this.scene.add(sky);
    this.sunDir = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    Object.assign(this.envSky.material.uniforms, {});
    this.envScene.add(this.envSky);
    this.lastEnv = -999;
    this.scene.fog = new THREE.Fog('#b8c8d8', 190, 760);
    // звёзды
    const starG = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 1800; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      sp.push(Math.sin(ph) * Math.cos(th) * 1800, Math.cos(ph) * 1800, Math.sin(ph) * Math.sin(th) * 1800);
    }
    starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    // луна
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(40, 20, 14), new THREE.MeshBasicMaterial({ color: '#e8eeff', fog: false }));
    this.scene.add(this.moon);
  }

  get hours() { return (this.dayTime * 24) % 24; }

  updateSky(playerPos, dt) {
    this.dayTime = (this.dayTime + dt / this.dayLength) % 1;
    const h = this.hours;
    const ang = (h - 6) / 24 * Math.PI * 2; // 6:00 восход, 18:00 закат
    const elev = Math.sin(ang);
    const az = Math.cos(ang);
    this.sunDir.set(az * 0.75, elev, 0.45).normalize();
    const day = smoothstep(-0.12, 0.25, elev);
    const dusk = smoothstep(0.35, 0.0, Math.abs(elev)) * smoothstep(-0.2, 0.0, elev);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.position.copy(playerPos);
    this.stars.position.copy(playerPos);
    this.stars.material.opacity = 1 - smoothstep(-0.2, 0.05, elev);
    this.moon.position.copy(playerPos).addScaledVector(this.sunDir, -1700);
    this.moon.visible = elev < 0.1;
    // солнце / луна как основной направленный свет
    const lightDir = elev > -0.05 ? this.sunDir.clone() : this.sunDir.clone().negate();
    if (lightDir.y < 0.15) lightDir.y = 0.15;
    lightDir.normalize();
    this.sun.position.copy(playerPos).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(playerPos);
    const sunCol = new THREE.Color('#fff2dc').lerp(new THREE.Color('#ff9a5a'), dusk);
    const moonCol = new THREE.Color('#8aa4ff');
    this.sun.color.copy(day > 0.02 ? sunCol : moonCol);
    this.sun.intensity = lerp(0.6, 3.0, day);
    this.hemi.intensity = lerp(0.35, 0.75, day);
    this.hemi.color.set(day > 0.3 ? '#bcd8ff' : '#5a70b0');
    this.hemi.groundColor.set(day > 0.3 ? '#5a4a30' : '#202030');
    this.ambient.intensity = lerp(0.3, 0.08, day);
    // туман по времени суток и биому
    const B = this.terrain.biomeAt(playerPos.x, playerPos.z);
    const dayFog = new THREE.Color('#b9cbe0').lerp(new THREE.Color('#e8a878'), dusk * 0.7);
    const nightFog = new THREE.Color('#121a2e');
    const fog = nightFog.clone().lerp(dayFog, day);
    let tint = null, fogNear = 190, fogFar = 760;
    if (B.id === BIOMES.volcanic.id) { tint = new THREE.Color('#7a3a20'); fogNear = 100; fogFar = 480; }
    else if (B.id === BIOMES.snow.id) { tint = new THREE.Color('#dce8f4'); fogNear = 140; fogFar = 620; }
    else if (B.id === BIOMES.swamp.id) { tint = new THREE.Color('#6a7a5a'); fogNear = 90; fogFar = 460; }
    else if (B.id === BIOMES.cursed.id) { tint = new THREE.Color('#4a3a5a'); fogNear = 100; fogFar = 480; }
    if (tint) fog.lerp(tint.multiplyScalar(lerp(0.25, 1, day)), 0.45);
    this.fogTarget = this.fogTarget || fog.clone();
    this.fogTarget.lerp(fog, Math.min(1, dt * 0.8));
    this.scene.fog.color.copy(this.fogTarget);
    const fm = this.fogMul || 1;
    this.scene.fog.near = lerp(this.scene.fog.near, fogNear * fm, Math.min(1, dt * 0.5));
    this.scene.fog.far = lerp(this.scene.fog.far, fogFar * fm, Math.min(1, dt * 0.5));
    this.renderer.toneMappingExposure = lerp(0.62, 0.95, day);
    // освещение воды
    const wu = this.terrain.waterUniforms;
    wu.uSunDir.value.copy(lightDir);
    wu.uSunColor.value.copy(this.sun.color).multiplyScalar(day > 0.02 ? 1.0 : 0.25);
    wu.uHorizon.value.copy(this.scene.fog.color);
    wu.uZenith.value.set(day > 0.3 ? '#3a78c8' : '#0a1430').lerp(new THREE.Color('#e89a6a'), dusk * 0.4);
    wu.uLight.value = lerp(0.25, 1.0, day);
    windowMat.emissiveIntensity = lerp(2.4, 0.25, day);
    // освещение воды фонтанов
    fountainUniforms.uTime.value = this.time;
    fountainUniforms.uLight.value = wu.uLight.value;
    fountainUniforms.uSunDir.value.copy(lightDir);
    fountainUniforms.uSunColor.value.copy(wu.uSunColor.value);
    fountainUniforms.uZenith.value.copy(wu.uZenith.value);
    fountainUniforms.uHorizon.value.copy(wu.uHorizon.value);
    // карта окружения для отражений
    // карта отражений неба: только при заметном сдвиге солнца (днём), не чаще раза в 45 с
    const envDue = this.lastEnv < -100 || (this.time - this.lastEnv > 45 && elev > -0.12 && (!this.lastEnvSun || this.lastEnvSun.angleTo(this.sunDir) > 0.06));
    if (envDue) {
      this.lastEnvSun = this.sunDir.clone();
      this.lastEnv = this.time;
      const u = this.envSky.material.uniforms, su = this.sky.material.uniforms;
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = su[k].value;
      u.sunPosition.value.copy(this.sunDir);
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
    }
    this.scene.environmentIntensity = lerp(0.12, 0.35, day);
    this.isNight = day < 0.3;
  }

  update(dt, playerPos, camPos) {
    this.time += dt;
    webTime.value = this.time;
    this.updateSky(playerPos, dt);
    this.terrain.update(dt, this.time);
    this.veg.update(dt, camPos, playerPos);
    flameMat.emissiveIntensity = 2.6 + Math.sin(this.time * 17) * 0.4 + Math.sin(this.time * 7.3) * 0.3;
    // анимированные объекты рядом с игроком
    for (const a of this.animated) {
      const d = Math.hypot(a.x - playerPos.x, a.z - playerPos.z);
      if (d > 110) continue;
      const r = Math.random;
      switch (a.type) {
        case 'fire': {
          const n = a.big ? 3 : a.small ? 1 : 2;
          for (let i = 0; i < n; i++) if (r() < 0.8) FX.emit({ x: a.x + (r() - 0.5) * (a.big ? 0.6 : 0.3), y: a.y, z: a.z + (r() - 0.5) * (a.big ? 0.6 : 0.3), vy: 1.6 + r() * 1.2, vx: (r() - 0.5) * 0.3, vz: (r() - 0.5) * 0.3, life: 0.5 + r() * 0.3, size: a.big ? 0.9 : a.small ? 0.35 : 0.6, color: r() < 0.5 ? '#ff7a20' : '#ffc040', alpha: 0.9 });
          if (r() < 0.1) FX.emit({ x: a.x, y: a.y + 0.8, z: a.z, vy: 1.2, life: 2.2, size: 1.2, color: '#3a3430', additive: false, alpha: 0.25, grow: 2 });
          if (r() < 0.05) FX.emit({ x: a.x, y: a.y + 0.2, z: a.z, vy: 3, vx: (r() - 0.5) * 2, vz: (r() - 0.5) * 2, life: 1.2, size: 0.12, color: '#ffd080', gravity: 1 });
          break;
        }
        case 'fountain':
          // брызги и водяная пыль там, где струи падают в воду
          if (d < 60) for (const e of a.emit) {
            if (r() > e.p * 0.7) continue;
            const ang = r() * Math.PI * 2, sp = e.up ? 0.5 : 0.9;
            FX.emit({ x: e.x, y: e.y, z: e.z, vx: Math.cos(ang) * sp * r(), vz: Math.sin(ang) * sp * r(), vy: (e.up || 1.3) + r() * 0.9, gravity: 9, life: 0.45 + r() * 0.25, size: 0.1 + r() * 0.08, color: '#e4f2ff', alpha: 0.75, drag: 1 });
            if (r() < 0.12) FX.emit({ x: e.x, y: e.y + 0.1, z: e.z, vy: 0.35, life: 1.1, size: 0.9, color: '#d8ecff', additive: false, alpha: 0.12, grow: 1.2 });
          }
          break;
        case 'smoke':
          if (r() < 0.07) FX.emit({ x: a.x + (r() - 0.5) * 0.2, y: a.y, z: a.z + (r() - 0.5) * 0.2, vy: 0.9 + r() * 0.5, vx: 0.25 + (r() - 0.5) * 0.2, vz: (r() - 0.5) * 0.2, life: 3.2, size: 0.9, color: '#8a8580', additive: false, alpha: 0.22, grow: 1.6 });
          break;
        case 'teleport':
          if (r() < 0.6) { const ang = r() * Math.PI * 2; FX.emit({ x: a.x + Math.cos(ang) * 1.5, y: a.y - 2, z: a.z + Math.sin(ang) * 1.5, vy: 1.5 + r(), life: 1.6, size: 0.3, color: r() < 0.5 ? '#80e0ff' : '#ffffff' }); }
          break;
        case 'lamp':
          if (this.isNight && r() < 0.05) FX.emit({ x: a.x, y: a.y, z: a.z, life: 0.5, size: 2.2, color: '#ffb060', alpha: 0.25 });
          break;
        case 'forge':
          if (r() < 0.3) FX.emit({ x: a.x + (r() - 0.5), y: a.y, z: a.z + (r() - 0.5), vy: 2 + r() * 2, vx: (r() - 0.5) * 2, vz: (r() - 0.5) * 2, gravity: 3, life: 1, size: 0.1, color: '#ffc060' });
          break;
        case 'holy':
          if (r() < 0.4) { const ang = r() * Math.PI * 2; FX.emit({ x: a.x + Math.cos(ang) * 0.6, y: a.y + (r() - 0.5), z: a.z + Math.sin(ang) * 0.6, vy: 0.6, life: 2, size: 0.35, color: a.color || '#ffe8a0' }); }
          break;
        case 'dark':
          if (r() < 0.5) FX.emit({ x: a.x + (r() - 0.5) * 3, y: a.y - 1, z: a.z + (r() - 0.5) * 3, vy: 0.8, life: 2.5, size: 1.4, color: r() < 0.5 ? '#6020a0' : '#200830', alpha: 0.5, grow: 1 });
          break;
        case 'cauldron':
          if (r() < 0.4) FX.emit({ x: a.x + (r() - 0.5) * 1.2, y: a.y, z: a.z + (r() - 0.5) * 1.2, vy: 1.2, life: 1.2, size: 0.5, color: '#70ff40', alpha: 0.7 });
          break;
      }
    }
    for (const [r1, r2] of this.tpRings) {
      r1.rotation.x = this.time * 0.9; r1.rotation.y = this.time * 0.6;
      r2.rotation.x = -this.time * 1.2; r2.rotation.z = this.time * 0.8;
    }
  }

  groundY(x, z) { return this.terrain.getHeight(x, z); }
  // Высота опоры: учитывает мостовые городов
  standY(x, z) {
    const h = Math.max(this.terrain.getHeight(x, z), platformHeight(x, z));
    for (const c of this.cities) {
      if (Math.hypot(x - c.def.x, z - c.def.z) < c.def.r + 3) return Math.max(h, c.cy + 0.06);
    }
    return h;
  }
  zoneName(x, z) {
    for (const c of CITIES) if (Math.hypot(x - c.x, z - c.z) < c.r + 5) return c.name;
    for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r + 8) return p.name;
    for (const s of SECRET_SHOPS) if (Math.hypot(x - s.x, z - s.z) < 14) return s.name;
    return this.terrain.biomeAt(x, z).name;
  }
}

void clamp;
