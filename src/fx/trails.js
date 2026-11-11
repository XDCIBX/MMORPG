// Шлейфы: светящийся след за клинком и ленты за снарядами.
import * as THREE from 'three';

const VS = `attribute float aAlpha; attribute float aEdge; varying float vA; varying float vE;
void main(){ vA = aAlpha; vE = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform vec3 uColor; uniform vec3 uCore; varying float vA; varying float vE;
void main(){
  float a = vA * vA;
  vec3 c = mix(uColor, uCore, smoothstep(0.55, 1.0, vE) * vA);
  gl_FragColor = vec4(c * (0.6 + vE), a * (0.25 + vE * 0.75));
}`;

function trailMat(color, core = '#ffffff') {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) } },
    vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Где у оружия основание и кончик (в локальных координатах модели оружия)
const WEAPON_EDGE = {
  sword: [0.2, 0.97], greatsword: [0.35, 1.55], axe: [0.42, 0.78], hammer: [0.45, 0.78],
  scythe: null, staff: [0.9, 1.25], bonestaff: [0.85, 1.15], wand: [0.15, 0.45],
};

export class WeaponTrail {
  constructor(scene, color = '#c8dcff') {
    this.scene = scene;
    this.max = 22;
    this.pts = []; // {a: Vector3, b: Vector3, t}
    this.life = 0.2;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    this.edge = new Float32Array(this.max * 2);
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aEdge', new THREE.BufferAttribute(this.edge, 1));
    this.mesh = new THREE.Mesh(this.geo, trailMat(color));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.va = new THREE.Vector3(); this.vb = new THREE.Vector3();
  }
  setColor(c, core = '#ffffff') { this.mesh.material.uniforms.uColor.value.set(c); this.mesh.material.uniforms.uCore.value.set(core); }
  // model — Humanoid, emitting — идёт ли удар
  update(dt, model, emitting) {
    for (const p of this.pts) p.t += dt;
    while (this.pts.length && this.pts[0].t > this.life) this.pts.shift();
    const w = model && model.weaponObj;
    const type = model && model.weaponType;
    if (emitting && w && type) {
      let a, b;
      if (type === 'scythe') { a = [0, 1.18, 0.1]; b = [0, 1.18, 0.78]; }
      else { const e = WEAPON_EDGE[type]; if (e) { a = [0, e[0], 0]; b = [0, e[1], 0]; } }
      if (a) {
        w.localToWorld(this.va.set(...a));
        w.localToWorld(this.vb.set(...b));
        this.pts.push({ a: this.va.clone(), b: this.vb.clone(), t: 0 });
        if (this.pts.length > this.max) this.pts.shift();
      }
    }
    const n = this.pts.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    for (let i = 0; i < this.max; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      const k = 1 - p.t / this.life;
      this.pos.set([p.a.x, p.a.y, p.a.z], i * 6);
      this.pos.set([p.b.x, p.b.y, p.b.z], i * 6 + 3);
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = i < n ? Math.max(0, k) * (i / (n - 1)) : 0;
      this.edge[i * 2] = 0; this.edge[i * 2 + 1] = 1;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aEdge.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); }
}

// Лента за летящим снарядом (ширина развёрнута к камере)
export class RibbonTrail {
  constructor(scene, color, width = 0.2, life = 0.35, core = '#ffffff') {
    this.max = 24; this.width = width; this.life = life;
    this.pts = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 6);
    this.alpha = new Float32Array(this.max * 2);
    this.edge = new Float32Array(this.max * 2);
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aEdge', new THREE.BufferAttribute(this.edge, 1));
    const m = trailMat(color, core);
    m.fragmentShader = `uniform vec3 uColor; uniform vec3 uCore; varying float vA; varying float vE;
      void main(){ float c = 1.0 - abs(vE * 2.0 - 1.0); gl_FragColor = vec4(mix(uColor, uCore, c * c * vA) * (0.6 + c), vA * c); }`;
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
    this.cam = new THREE.Vector3();
  }
  push(p) { this.pts.push({ p: p.clone(), t: 0 }); if (this.pts.length > this.max) this.pts.shift(); }
  update(dt, camPos) {
    for (const q of this.pts) q.t += dt;
    while (this.pts.length && this.pts[0].t > this.life) this.pts.shift();
    const n = this.pts.length;
    this.mesh.visible = n > 1;
    if (n < 2) return n > 0;
    const side = new THREE.Vector3(), dir = new THREE.Vector3(), view = new THREE.Vector3();
    for (let i = 0; i < this.max; i++) {
      const j = Math.min(i, n - 1);
      const p = this.pts[j].p;
      const q = this.pts[Math.min(n - 1, j + 1)].p, o = this.pts[Math.max(0, j - 1)].p;
      dir.subVectors(q, o).normalize();
      view.subVectors(camPos, p).normalize();
      side.crossVectors(dir, view).normalize();
      const k = Math.max(0, 1 - this.pts[j].t / this.life) * (j / (n - 1));
      const w = this.width * (0.3 + 0.7 * k);
      this.pos.set([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w], i * 6);
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = i < n ? k : 0;
      this.edge[i * 2] = 0; this.edge[i * 2 + 1] = 1;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aEdge.needsUpdate = true;
    return true;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}
