// Просмотрщик запечённых моделей героев (для разработки): tools/viewer/index.html?key=warrior_m
window.__HERO_BASE = '../../';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HeroModel, loadHero } from '../../src/chars/hero/model.js';
import { equipVisual } from '../../src/chars/gear.js';
import { CLASSES } from '../../src/data/classes.js';
import { showcaseKit } from '../../src/data/items.js';

const q = new URLSearchParams(location.search);
const key = q.get('key') || 'warrior_m';
const W = Number(q.get('w') || 900), Hh = Number(q.get('h') || 900);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, Hh);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#5a6470');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const sun = new THREE.DirectionalLight('#fff4e6', 2.6);
sun.position.set(2, 4, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -2; sun.shadow.camera.right = sun.shadow.camera.top = 2; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun);
const rim = new THREE.DirectionalLight('#9ab8ff', 1.2); rim.position.set(-3, 2, -3); scene.add(rim);
scene.add(new THREE.HemisphereLight('#c8d8ff', '#4a3a2a', 0.5));
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') || 30), W / Hh, 0.01, 50);
window.__view = { scene, cam, renderer };
window.__ready = false;
loadHero(key).then(data => {
  const [cls, sx] = key.split('_');
  const C = CLASSES[cls];
  const look = JSON.parse(JSON.stringify(sx === 'f' ? C.look.female : C.look.male));
  look.base = { shirt: '#6a5a48', pants: '#4a3a2a', boots: '#3a2a1a' };
  const h = new HeroModel(look, data);
  if (q.get('gear') !== '0') {
    const kit = showcaseKit(cls, Number(q.get('lvl') || 34), Number(q.get('rar') || 3));
    for (const s of ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'weapon', 'offhand']) if (kit[s] && q.get('no' + s) !== '1') equipVisual(h, s, kit[s]);
  }
  h.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(h.root);
  window.__hero = h;
  if (q.get('nohair')) for (const m of h.hairMeshes) m.visible = false;
  const anim = q.get('anim');
  for (let i = 0; i < 40; i++) h.update(0.03, { speed: Number(q.get('speed') || 0) });
  if (anim) { h.playAction(anim); for (let i = 0; i < Number(q.get('at') || 10); i++) h.update(0.03, {}); }
  const yaw = Number(q.get('yaw') || 0), ty = Number(q.get('ty') || 1.0), dist = Number(q.get('dist') || 4), pitch = Number(q.get('pitch') || 0.05);
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(0, ty, 0);
  renderer.render(scene, cam);
  window.__ready = true;
}).catch(e => { document.body.textContent = 'ERR ' + e.message; window.__ready = 'err'; });
