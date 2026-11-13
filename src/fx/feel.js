// «Ощущение удара»: стоп-кадр, толчок камеры, рывок приближения, ударная волна искажения
// на экране, реакция врага (вздрагивание, отбрасывание), опалины на земле, звук по стихии.
import * as THREE from 'three';

// Стихия умения — по нему выбираются звук и мелкие детали
const SCHOOL = {
  fire: ['m_fireball', 'm_meteor', 'a_explosive', 'd_ancestral', 'd_runespin'],
  frost: ['m_frost', 'm_nova'],
  storm: ['m_chain', 'a_storm', 'd_runehammer'],
  holy: ['w_holyblade', 'w_divine', 'w_judgement', 'm_lance', 'm_bless', 'm_solar'],
  shadow: ['m_shadow', 'm_drain', 'm_void', 'a_volley', 'm_blink'],
  death: ['n_bone', 'n_raise', 'n_curse', 'n_tap', 'n_plague', 'n_army', 'n_golem', 'n_frenzy', 'n_knight', 'n_harvest', 'n_deathscythe', 'n_avatar'],
  nature: ['a_vines', 'a_wolf', 'a_poison'],
  bow: ['a_aimed', 'a_multi', 'a_rain', 'a_pierce', 'a_heart', 'a_leap'],
};
const SCHOOL_OF = {};
for (const k in SCHOOL) for (const id of SCHOOL[k]) SCHOOL_OF[id] = k;
export const schoolOf = (skill) => SCHOOL_OF[skill.id] || 'steel';
// сила удара умения: 0..1 (по множителю урона и типу)
export function skillWeight(skill) {
  const w = (skill.dmg || 1) / 4;
  return Math.min(1, Math.max(0.25, w + (skill.type === 'aoeTarget' || skill.type === 'charge' ? 0.15 : 0)));
}

export class Feel {
  constructor(game) {
    this.game = game;
    this.stopT = 0;
    this.kick = new THREE.Vector3();
    this.fov = 0;
    this.shock = null;     // ссылка на проход искажения (из main.js)
    this.shockT = 1;
    this.decals = [];
  }
  // стоп-кадр: на долю секунды почти всё замирает (кроме камеры)
  hitStop(dur) { this.stopT = Math.max(this.stopT, Math.min(0.14, dur)); }
  timeScale(rawDt) {
    if (this.stopT <= 0) return 1;
    this.stopT -= rawDt;
    return 0.07;
  }
  // толчок камеры в сторону удара
  camKick(dir, amt) { this.kick.addScaledVector(dir, amt); if (this.kick.length() > 0.6) this.kick.setLength(0.6); }
  fovPunch(a) { this.fov = Math.max(this.fov, a); }
  applyCamera(cam, dt) {
    cam.position.add(this.kick);
    this.kick.multiplyScalar(Math.max(0, 1 - dt * 14));
    const base = cam.userData.baseFov || (cam.userData.baseFov = cam.fov);
    const want = base - this.fov * 6;
    if (Math.abs(cam.fov - want) > 0.01) { cam.fov = want; cam.updateProjectionMatrix(); }
    this.fov = Math.max(0, this.fov - dt * 4.5);
  }
  // ударная волна искажения из точки мира
  screenShock(pos, strength = 1) {
    if (!this.shock) return;
    const cam = this.game.camera;
    const p = pos.clone().project(cam);
    if (p.z > 1 || Math.abs(p.x) > 1.4 || Math.abs(p.y) > 1.4) return;
    const dist = cam.position.distanceTo(pos);
    this.shock.uniforms.uC.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    this.shock.uniforms.uS.value = Math.min(1.4, strength * 14 / Math.max(6, dist));
    this.shockT = 0;
  }
  update(rawDt) {
    if (this.shock) {
      this.shockT = Math.min(1, this.shockT + rawDt / 0.55);
      this.shock.uniforms.uT.value = this.shockT;
      this.shock.enabled = this.shockT < 1;
    }
  }
  // реакция врага на попадание
  react(tgt, src, power) {
    if (!tgt || !tgt.model || !tgt.alive && tgt.hp > 0) return;
    const m = tgt.model;
    m.hitJolt = Math.max(m.hitJolt || 0, Math.min(1, power));
    if (src && src.pos && !tgt.isBoss && tgt.canMove !== false && power > 0.45) {
      const dx = tgt.pos.x - src.pos.x, dz = tgt.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1;
      tgt.knock = { x: dx / d * power * 2.2, z: dz / d * power * 2.2, t: 0.18 };
    }
  }
  // вздрагивание модели: короткий наклон назад и сжатие
  static applyJolt(model, dt) {
    const j = model.hitJolt || 0;
    if (j <= 0.001) { if (model._joltOn) { model.body.rotation.x = 0; model.body.scale.set(1, 1, 1); model._joltOn = false; } return; }
    model._joltOn = true;
    model.hitJolt = Math.max(0, j - dt * 6);
    const k = Math.sin(j * Math.PI) * j;
    model.body.rotation.x = -k * 0.18;
    model.body.scale.set(1 + k * 0.05, 1 - k * 0.06, 1 + k * 0.05);
  }
  // опалина / пятно на земле, медленно гаснет
  scorch(pos, r, color = '#120804', dur = 7, glow = null) {
    const E = this.game.effects;
    const tex = scorchTex();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6;
    m.position.copy(pos); m.position.y += 0.06; m.scale.setScalar(r);
    m.renderOrder = 2;
    let g = null;
    if (glow) {
      g = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.rotation.copy(m.rotation); g.position.copy(m.position); g.position.y += 0.01; g.scale.setScalar(r * 0.7);
      E.add(g, Math.min(dur, 2.5), (dt, k) => { g.material.opacity = (1 - k) * (0.8 + Math.sin(k * 30) * 0.1); });
    }
    E.add(m, dur, (dt, k) => { m.material.opacity = 0.85 * (1 - Math.pow(k, 3)); });
  }
}

let _scorch = null;
function scorchTex() {
  if (_scorch) return _scorch;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.45, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  // рваный край и брызги
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, r = S * (0.3 + Math.random() * 0.25); x.beginPath(); x.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 6 + Math.random() * 18, 0, 6.28); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = S * (0.15 + Math.random() * 0.32); x.fillStyle = 'rgba(255,255,255,' + (0.4 + Math.random() * 0.5) + ')'; x.beginPath(); x.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 2 + Math.random() * 5, 0, 6.28); x.fill(); }
  _scorch = new THREE.CanvasTexture(c);
  return _scorch;
}

// Проход искажения: кольцо «преломления» расходится от центра удара
export function shockPassDef() {
  return {
    uniforms: { tDiffuse: { value: null }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uT: { value: 1 }, uS: { value: 1 }, uAsp: { value: 1.7 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uC; uniform float uT; uniform float uS; uniform float uAsp; varying vec2 vUv;
      void main(){
        vec2 d = vUv - uC; d.x *= uAsp;
        float r = length(d);
        float front = uT * 0.55;
        float w = 0.06 + uT * 0.05;
        float k = smoothstep(w, 0.0, abs(r - front)) * (1.0 - uT) * uS;
        vec2 dir = r > 0.0001 ? d / r : vec2(0.0);
        dir.x /= uAsp;
        vec2 off = dir * k * 0.035;
        vec3 c;
        c.r = texture2D(tDiffuse, vUv - off * 1.15).r;
        c.g = texture2D(tDiffuse, vUv - off).g;
        c.b = texture2D(tDiffuse, vUv - off * 0.85).b;
        c += vec3(1.0, 0.9, 0.7) * k * 0.12;
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
}
