// Просмотр ландшафта без игры: tools/terrain/index.html?cx=..&cz=..&ch=..&tx=..&tz=..&th=..
import * as THREE from 'three';
import { Terrain } from '../../src/world/terrain.js';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') || 960), H = Number(q.get('h') || 540);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sky = new THREE.Color('#a9c4dc');
scene.background = sky;
scene.fog = new THREE.Fog(sky, 300, 1400);
const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
sun.position.set(-0.55, 0.62, -0.45).multiplyScalar(100);
scene.add(sun);
scene.add(new THREE.HemisphereLight('#c4d6f0', '#4a4436', 0.9));
if (q.get('opts')) window.__terrOpts = JSON.parse(q.get('opts'));
const t0 = performance.now();
const T = new Terrain();
window.__genMs = performance.now() - t0;
window.__timing = Object.assign({ baked: T.baked }, T.genTiming);
scene.add(T.mesh);
if (T.water) scene.add(T.water);
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') || 55), W / H, 0.5, 3000);
const views = JSON.parse(q.get('views') || '[[300,150,30,560,-100,10]]');
window.__render = (i) => {
  const [cx, cz, ch, tx, tz, th] = views[i];
  cam.position.set(cx, T.getHeight(cx, cz) + ch, cz);
  cam.lookAt(tx, T.getHeight(tx, tz) + th, tz);
  renderer.render(scene, cam);
};
window.__n = views.length;
window.__ready = true;
