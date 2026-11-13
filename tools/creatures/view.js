// Просмотр существ: tools/creatures/index.html?list=wolf,bear&boss=b1&yaw=0.6&dist=4&ty=0.6
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCreature } from '../../src/chars/creatures.js';
import { furLOD } from '../../src/chars/beasts.js';
import { MOB_TYPES, BOSSES } from '../../src/data/mobs.js';
import { loadHero } from '../../src/chars/hero/model.js';
window.__HERO_BASE = '../../';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') || 960), H = Number(q.get('h') || 540);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7f8b96');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const sun = new THREE.DirectionalLight('#fff4e6', 2.6);
sun.position.set(3, 6, 4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun);
const rim = new THREE.DirectionalLight('#9ab8ff', 1.0); rim.position.set(-4, 3, -4); scene.add(rim);
scene.add(new THREE.HemisphereLight('#c8d8ff', '#4a3a2a', 0.4));
const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: '#4c5a3c', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') || 32), W / H, 0.05, 200);
window.__ready = false;
(async () => {
if (q.get('hero') !== '0') await loadHero('npc_m').catch(e => console.error(e));
const t0 = performance.now();
const list = (q.get('list') || 'wolf').split(',');
const models = [];
const sp = Number(q.get('sp') || 2.2);
list.forEach((name, i) => {
  let def;
  const [key, bossId] = name.split(':');
  if (bossId) { const B = BOSSES.find(b => b.id === bossId); def = Object.assign({}, MOB_TYPES[B.type], { model: B.model, fur: B.fur, fur2: B.fur2, eye: B.eye, belly: B.fur }); }
  else def = Object.assign({}, MOB_TYPES[key]);
  const m = buildCreature(def);
  const sc = bossId ? BOSSES.find(b => b.id === bossId).scale : (m.spec ? m.spec.scale || 1 : 1);
  m.root.scale.setScalar(sc * Number(q.get('scale') || 1));
  m.root.position.x = (i - (list.length - 1) / 2) * sp;
  m.root.rotation.y = Number(q.get('ry') || 0.9);
  scene.add(m.root);
  models.push(m);
});
window.__buildMs = performance.now() - t0;
const speed = Number(q.get('speed') || 0);
for (let i = 0; i < Number(q.get('frames') || 40); i++) for (const m of models) m.update(0.03, { speed });
if (q.get('act')) for (const m of models) { m.playAction(q.get('act')); for (let i = 0; i < Number(q.get('at') || 6); i++) m.update(0.03, { speed }); }
const yaw = Number(q.get('yaw') || 0), ty = Number(q.get('ty') || 0.6), dist = Number(q.get('dist') || 5), pitch = Number(q.get('pitch') || 0.15);
cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
cam.lookAt(0, ty, 0);
furLOD.cam.copy(cam.position);
for (const m of models) m.update(0.001, { speed });
renderer.render(scene, cam);
window.__ready = true;
})();
