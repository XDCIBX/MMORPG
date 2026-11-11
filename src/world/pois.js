// Достопримечательности мира и тайные лавки.
import * as THREE from 'three';
import { Batcher, boxUV, cylUV, gableRoof, gableWall, M4 } from './builders.js';
import { styleMats, flameMat, windowMat } from './city.js';
import { mulberry32 } from '../core/util.js';

const mats = {};
function mat(key, opts) { if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(opts); return mats[key]; }
const rockM = () => mat('rock', { color: '#6a665e', roughness: 0.95, flatShading: true });
const darkRockM = () => mat('drock', { color: '#2a2422', roughness: 0.95, flatShading: true });
const boneM = () => mat('bone', { color: '#d8cfb4', roughness: 0.6 });
const webM = () => mat('web', { color: '#e8e8e8', transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 1, depthWrite: false });
const iceM = () => mat('ice', { color: '#a8d8f0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: '#204060', emissiveIntensity: 0.3 });
const goldM = () => mat('gold', { color: '#e0b040', roughness: 0.3, metalness: 0.95 });
const tentM = (c) => mat('tent' + c, { color: c, roughness: 0.9, side: THREE.DoubleSide });
const glowM = (c) => mat('glow' + c, { color: c, emissive: c, emissiveIntensity: 2.5, roughness: 0.3 });
const logM = () => mat('log', { color: '#5a3a22', roughness: 0.9 });

function rock(B, x, y, z, s, rnd, m = rockM()) {
  B.add(new THREE.DodecahedronGeometry(1, 0), m, M4(x, y, z, rnd() * 6, s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.5), s * (0.8 + rnd() * 0.5), rnd(), rnd()));
}

function campfire(B, x, y, z, animated) {
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    B.add(new THREE.DodecahedronGeometry(0.25, 0), rockM(), M4(x + Math.cos(a) * 0.7, y + 0.1, z + Math.sin(a) * 0.7));
  }
  for (let i = 0; i < 3; i++) B.add(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), logM(), M4(x, y + 0.15, z, i * 1.05, 1, 1, 1, Math.PI / 2));
  animated.push({ type: 'fire', x, y: y + 0.4, z, big: true });
}

export function buildPOI(p, terrain, collision, root, animated) {
  const B = new Batcher();
  const rnd = mulberry32(Math.abs(Math.round(p.x * 13 + p.z * 7)));
  const x = p.x, z = p.z, y = terrain.getHeight(x, z);
  const M = styleMats('timber');
  const S = styleMats('stone');
  switch (p.id) {
    case 'ruins1': case 'tower1': {
      const n = p.id === 'ruins1' ? 9 : 1;
      if (p.id === 'tower1') {
        B.add(cylUV(4, 4.5, 14, 16, 3), S.wallStone, M4(x, y + 6, z));
        for (let k = 0; k < 9; k++) { const a = k / 12 * Math.PI * 2; B.add(boxUV(1, 1.6 + rnd() * 2, 0.8, 1), S.wallStone, M4(x + Math.cos(a) * 3.7, y + 13.5, z + Math.sin(a) * 3.7, -a)); }
        collision.addCircle(x, z, 4.6);
        for (let i = 0; i < 12; i++) rock(B, x + (rnd() - 0.5) * 18, y, z + (rnd() - 0.5) * 18, 0.5 + rnd() * 0.6, rnd, rockM());
      } else {
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, r = 14 + rnd() * 6;
          const wx = x + Math.cos(a) * r, wz = z + Math.sin(a) * r;
          const h = 2 + rnd() * 5;
          B.add(boxUV(6 + rnd() * 3, h, 1.4, 3), S.wallStone, M4(wx, y + h / 2 - 0.3, wz, -a + Math.PI / 2));
          collision.addBox(wx, wz, 3.5, 0.8, -a + Math.PI / 2);
        }
        for (let i = 0; i < 8; i++) {
          const a = rnd() * 6.28, r = rnd() * 10;
          const h = 2 + rnd() * 5;
          B.add(cylUV(0.5, 0.6, h, 10, 2), S.wall2, M4(x + Math.cos(a) * r, y + h / 2, z + Math.sin(a) * r, 0, 1, 1, 1, (rnd() - 0.5) * 0.2));
          collision.addCircle(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.7);
        }
      }
      break;
    }
    case 'goblincamp': case 'orcfort': {
      const orc = p.id === 'orcfort';
      const R = orc ? 26 : 22;
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * Math.PI * 2;
        if (Math.abs(Math.sin((a - 0.6) / 2)) < 0.08) continue;
        const h = 4 + rnd();
        const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R;
        B.add(new THREE.CylinderGeometry(0.28, 0.3, h, 7), logM(), M4(px, y + h / 2 - 0.3, pz));
        B.add(new THREE.ConeGeometry(0.3, 0.7, 7), logM(), M4(px, y + h, pz));
        collision.addCircle(px, pz, 0.45);
      }
      for (let i = 0; i < 5; i++) {
        const a = rnd() * 6.28, r = 7 + rnd() * 10;
        const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        B.add(new THREE.ConeGeometry(2.6, 3.6, 6, 1, true), tentM(orc ? '#5a2a1a' : '#6a5a3a'), M4(tx, y + 1.8, tz, rnd() * 3));
        B.add(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 5), logM(), M4(tx, y + 2.1, tz));
        collision.addCircle(tx, tz, 2.2);
      }
      campfire(B, x, y, z, animated);
      // тотем
      B.add(new THREE.CylinderGeometry(0.35, 0.4, 5, 8), logM(), M4(x + 5, y + 2.5, z + 3));
      B.add(new THREE.SphereGeometry(0.5, 10, 8), boneM(), M4(x + 5, y + 5.2, z + 3));
      for (const s of [-1, 1]) B.add(new THREE.ConeGeometry(0.15, 1.0, 6), boneM(), M4(x + 5 + s * 0.6, y + 5.5, z + 3, 0, 1, 1, 1, 0, -s * 0.9));
      collision.addCircle(x + 5, z + 3, 0.6);
      break;
    }
    case 'wolfden': case 'dragonpeak': {
      const dragon = p.id === 'dragonpeak';
      const R = dragon ? 32 : 26;
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2;
        if (Math.abs(Math.sin((a - (dragon ? 2.2 : 5.4)) / 2)) < 0.12) continue;
        const s = 2 + rnd() * (dragon ? 4 : 2.5);
        const rx = x + Math.cos(a) * R, rz = z + Math.sin(a) * R;
        rock(B, rx, y + s * 0.3, rz, s, rnd, dragon ? darkRockM() : rockM());
        collision.addCircle(rx, rz, s * 0.85);
      }
      for (let i = 0; i < 18; i++) {
        const a = rnd() * 6.28, r = rnd() * R * 0.7;
        B.add(new THREE.CylinderGeometry(0.06, 0.08, 0.8 + rnd(), 5), boneM(), M4(x + Math.cos(a) * r, y + 0.08, z + Math.sin(a) * r, rnd() * 3, 1, 1, 1, Math.PI / 2));
      }
      for (let i = 0; i < 4; i++) B.add(new THREE.SphereGeometry(0.25, 8, 6), boneM(), M4(x + (rnd() - 0.5) * 10, y + 0.2, z + (rnd() - 0.5) * 10));
      if (dragon) {
        for (let i = 0; i < 30; i++) B.add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), goldM(), M4(x + 6 + (rnd() - 0.5) * 5, y + 0.05 + rnd() * 0.6, z - 8 + (rnd() - 0.5) * 5, 0, 1, 1, 1, rnd(), rnd()));
        B.add(new THREE.ConeGeometry(3.5, 1.4, 12), goldM(), M4(x + 6, y + 0.5, z - 8));
      }
      break;
    }
    case 'shrine': {
      B.add(cylUV(5, 5.4, 0.6, 24, 2), S.wall2, M4(x, y + 0.3, z));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        B.add(cylUV(0.35, 0.4, 5, 12, 2), styleMats('marble').wall, M4(x + Math.cos(a) * 4.2, y + 3, z + Math.sin(a) * 4.2));
        collision.addCircle(x + Math.cos(a) * 4.2, z + Math.sin(a) * 4.2, 0.5);
      }
      B.add(new THREE.TorusGeometry(4.2, 0.3, 6, 24), styleMats('marble').wall, M4(x, y + 5.6, z, 0, 1, 1, 1, Math.PI / 2));
      // статуя девы
      B.add(cylUV(0.8, 1, 1.2, 12, 1), S.wall2, M4(x, y + 1.2, z));
      B.add(new THREE.ConeGeometry(0.75, 2.6, 12), styleMats('marble').wall, M4(x, y + 3.1, z));
      B.add(new THREE.SphereGeometry(0.3, 12, 10), styleMats('marble').wall, M4(x, y + 4.6, z));
      B.add(new THREE.TorusGeometry(0.45, 0.04, 6, 20), glowM('#c0d8ff'), M4(x, y + 5.0, z - 0.1));
      animated.push({ type: 'holy', x, y: y + 4.9, z, color: '#a0c8ff' });
      collision.addCircle(x, z, 1.1);
      break;
    }
    case 'trollbridge': {
      for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = 6 + rnd() * 14; rock(B, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 1 + rnd() * 2.5, rnd); }
      campfire(B, x, y, z, animated);
      break;
    }
    case 'spiderlair': {
      for (let i = 0; i < 16; i++) {
        const a = rnd() * 6.28, r = 8 + rnd() * 20;
        const wx = x + Math.cos(a) * r, wz = z + Math.sin(a) * r;
        const pl = new THREE.CircleGeometry(2.5 + rnd() * 3, 8);
        B.add(pl, webM(), M4(wx, y + 2.5 + rnd() * 3, wz, rnd() * 6, 1, 1, 1, rnd() - 0.5), { noShadow: true });
      }
      for (let i = 0; i < 14; i++) {
        const a = rnd() * 6.28, r = rnd() * 8;
        B.add(new THREE.SphereGeometry(0.5 + rnd() * 0.3, 10, 8), mat('egg', { color: '#d8e0b0', roughness: 0.4, emissive: '#405010', emissiveIntensity: 0.3 }), M4(x + Math.cos(a) * r, y + 0.4, z + Math.sin(a) * r, 0, 1, 1.3, 1));
      }
      for (let i = 0; i < 10; i++) { const a = rnd() * 6.28; rock(B, x + Math.cos(a) * 30, y, z + Math.sin(a) * 30, 2 + rnd() * 2, rnd, darkRockM()); }
      break;
    }
    case 'colossus': {
      B.add(cylUV(16, 17, 0.8, 32, 3), S.wall, M4(x, y + 0.4, z));
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const h = 4 + rnd() * 8;
        B.add(boxUV(1.8, h, 1.8, 2), S.wallStone, M4(x + Math.cos(a) * 14, y + h / 2, z + Math.sin(a) * 14, a));
        collision.addCircle(x + Math.cos(a) * 14, z + Math.sin(a) * 14, 1.4);
      }
      B.add(boxUV(4, 2, 3, 2), mat('iron', { color: '#3a3a3e', roughness: 0.5, metalness: 0.8 }), M4(x - 6, y + 1.8, z + 4));
      B.add(boxUV(3, 1.5, 3, 1), flameMat, M4(x + 6, y + 0.9, z - 5), { noShadow: true });
      animated.push({ type: 'fire', x: x + 6, y: y + 1.5, z: z - 5, big: true });
      collision.addBox(x - 6, z + 4, 2.2, 1.7, 0);
      break;
    }
    case 'cursedaltar': {
      B.add(cylUV(5, 6, 0.8, 8, 2), darkRockM(), M4(x, y + 0.4, z));
      B.add(boxUV(3, 1.4, 1.6, 1), darkRockM(), M4(x, y + 1.5, z));
      B.add(new THREE.ConeGeometry(1.2, 9, 4), mat('obsid', { color: '#100818', roughness: 0.2, metalness: 0.5 }), M4(x, y + 5.5, z - 3, Math.PI / 4));
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; B.add(new THREE.OctahedronGeometry(0.4), glowM('#a040ff'), M4(x + Math.cos(a) * 4.5, y + 1.6, z + Math.sin(a) * 4.5)); }
      animated.push({ type: 'dark', x, y: y + 2.5, z });
      collision.addCircle(x, z - 3, 1.3); collision.addBox(x, z, 1.6, 0.9, 0);
      break;
    }
    case 'crypt': {
      const Mm = styleMats('marble');
      B.add(boxUV(16, 9, 12, 3), iceM(), M4(x + 8, y + 4.5, z));
      B.add(gableRoof(16.4, 12, 4, 0.5, 0.3), iceM(), M4(x + 8, y + 9, z));
      for (const s of [-1, 1]) B.add(gableWall(12, 4, 3), iceM(), M4(x + 8 + s * 8.2, y + 9, z, s * Math.PI / 2));
      for (let i = 0; i < 4; i++) B.add(cylUV(0.5, 0.6, 8, 12, 2), Mm.wall, M4(x - 0.5, y + 4, z - 5 + i * 3.3));
      for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, r = 8 + rnd() * 18; B.add(new THREE.ConeGeometry(0.6 + rnd() * 0.8, 3 + rnd() * 5, 6), iceM(), M4(x + Math.cos(a) * r, y + 1.5, z + Math.sin(a) * r, rnd(), 1, 1, 1, (rnd() - 0.5) * 0.4)); }
      collision.addBox(x + 8, z, 8.2, 6.2, 0);
      animated.push({ type: 'holy', x: x - 1, y: y + 3, z, color: '#60e0ff' });
      break;
    }
    case 'obelisk': {
      B.add(cylUV(4, 4.5, 0.8, 6, 2), S.wall2, M4(x, y + 0.4, z));
      B.add(new THREE.ConeGeometry(1.3, 14, 4), mat('starob', { color: '#1a1a30', roughness: 0.25, metalness: 0.6 }), M4(x, y + 7.8, z, Math.PI / 4));
      for (let i = 0; i < 8; i++) B.add(new THREE.OctahedronGeometry(0.22), glowM('#a0c0ff'), M4(x + Math.sin(i) * 0.5, y + 2 + i * 1.3, z + Math.cos(i) * 0.5));
      animated.push({ type: 'holy', x, y: y + 12, z, color: '#a0c0ff' });
      collision.addCircle(x, z, 1.5);
      break;
    }
  }
  const g = new THREE.Group();
  g.name = 'poi_' + p.id;
  root.add(g);
  B.build(g);
  return g;
}

export function buildShop(s, terrain, collision, root, animated) {
  const B = new Batcher();
  const rnd = mulberry32(Math.abs(Math.round(s.x * 3 + s.z * 11)));
  const x = s.x, z = s.z, y = terrain.getHeight(x, z);
  const M = styleMats('timber');
  let npcPos = { x: x, z: z + 3.2, yaw: 0 };
  switch (s.style) {
    case 'hut': {
      B.add(boxUV(5, 3, 4, 2), M.wood, M4(x, y + 1.5, z));
      B.add(gableRoof(5.2, 4, 2.2, 0.5, 0.25), mat('moss', { color: '#4a5a2a', roughness: 1 }), M4(x, y + 3, z));
      for (const sd of [-1, 1]) B.add(gableWall(4, 2.2, 2), M.wood, M4(x + sd * 2.5, y + 3, z, sd * Math.PI / 2));
      B.add(boxUV(1.0, 2, 0.15, 1), M.darkWood, M4(x, y + 1, z + 2.05));
      B.add(new THREE.BoxGeometry(0.8, 0.8, 0.1), windowMat, M4(x + 1.5, y + 1.8, z + 2.02), { noShadow: true });
      campfire(B, x + 3, y, z + 4, animated);
      collision.addBox(x, z, 2.7, 2.2, 0);
      npcPos = { x: x - 1.2, z: z + 3, yaw: 0 };
      break;
    }
    case 'cave': {
      for (let i = 0; i < 12; i++) {
        const a = Math.PI + (i / 11) * Math.PI;
        const rx = x + Math.cos(a) * 6, rz = z + Math.sin(a) * 6;
        rock(B, rx, y + 1.5, rz, 2.5 + rnd() * 1.5, rnd);
        collision.addCircle(rx, rz, 2.2);
      }
      rock(B, x, y + 6, z - 2, 5, rnd);
      campfire(B, x, y, z, animated);
      for (let i = 0; i < 5; i++) B.add(boxUV(0.8, 0.8, 0.8, 1), M.wood, M4(x - 3 + i * 0.9, y + 0.4, z - 2.5 + (i % 2) * 0.6, rnd()));
      npcPos = { x: x + 1.5, z: z + 1.5, yaw: 0.5 };
      break;
    }
    case 'witch': {
      for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) B.add(new THREE.CylinderGeometry(0.15, 0.2, 2.5, 6), logM(), M4(x + px, y + 1.0, z + pz));
      B.add(boxUV(4.6, 2.8, 4.6, 2), M.darkWood, M4(x, y + 3.6, z, 0.1));
      B.add(new THREE.ConeGeometry(3.8, 4, 6), mat('thatch', { color: '#5a5a2a', roughness: 1 }), M4(x, y + 7, z, 0.3, 1, 1, 1, 0.08));
      B.add(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('iron', { color: '#2a2a2e', roughness: 0.5, metalness: 0.8 }), M4(x + 3.5, y + 1.0, z + 3));
      B.add(new THREE.CircleGeometry(0.9, 16), glowM('#60ff40'), M4(x + 3.5, y + 0.95, z + 3, 0, 1, 1, 1, -Math.PI / 2), { noShadow: true });
      animated.push({ type: 'cauldron', x: x + 3.5, y: y + 1.0, z: z + 3 });
      collision.addBox(x, z, 2.4, 2.4, 0);
      collision.addCircle(x + 3.5, z + 3, 1.1);
      npcPos = { x: x + 1.6, z: z + 3.6, yaw: 0.6 };
      break;
    }
    case 'dwarf': {
      const S = styleMats('stone');
      for (let i = 0; i < 8; i++) { const a = Math.PI * 1.1 + i / 7 * Math.PI * 0.8; rock(B, x + Math.cos(a) * 7, y + 2, z + Math.sin(a) * 7, 3 + rnd() * 2, rnd); collision.addCircle(x + Math.cos(a) * 7, z + Math.sin(a) * 7, 2.6); }
      B.add(boxUV(5, 5, 1.2, 2), S.wall, M4(x, y + 2.5, z - 3));
      B.add(boxUV(2.4, 3.4, 0.4, 1), S.darkWood, M4(x, y + 1.7, z - 2.3));
      B.add(boxUV(2.4, 1.4, 2, 1), S.stone, M4(x - 3, y + 0.7, z));
      B.add(boxUV(1.4, 0.5, 1.2, 1), flameMat, M4(x - 3, y + 1.45, z), { noShadow: true });
      animated.push({ type: 'fire', x: x - 3, y: y + 1.6, z });
      collision.addBox(x - 3, z, 1.3, 1.1, 0);
      collision.addBox(x, z - 3, 2.6, 0.7, 0);
      npcPos = { x: x + 1.2, z: z + 0.5, yaw: 0 };
      break;
    }
    case 'tent': {
      B.add(new THREE.ConeGeometry(4, 5, 8, 1, true), tentM('#2a1a4a'), M4(x, y + 2.5, z));
      B.add(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), logM(), M4(x, y + 3, z));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.add(new THREE.OctahedronGeometry(0.5), glowM(['#a080ff', '#60c0ff', '#ff80c0'][i % 3]), M4(x + Math.cos(a) * 6, y + 0.8, z + Math.sin(a) * 6, 0, 1, 1.6, 1)); }
      for (let i = 0; i < 20; i++) B.add(new THREE.SphereGeometry(0.06, 6, 4), glowM('#ffffff'), M4(x + (rnd() - 0.5) * 5, y + 1 + rnd() * 3.5, z + (rnd() - 0.5) * 5), { noShadow: true });
      campfire(B, x + 2, y, z + 5, animated);
      collision.addCircle(x, z, 3.5);
      npcPos = { x: x - 1, z: z + 4.5, yaw: 0 };
      break;
    }
  }
  // вывеска-фонарь
  B.add(new THREE.CylinderGeometry(0.06, 0.08, 2.8, 6), logM(), M4(npcPos.x + 1.4, y + 1.4, npcPos.z + 0.4));
  B.add(new THREE.BoxGeometry(0.35, 0.45, 0.35), windowMat, M4(npcPos.x + 1.4, y + 2.9, npcPos.z + 0.4), { noShadow: true });
  const g = new THREE.Group();
  g.name = 'shop_' + s.id;
  root.add(g);
  B.build(g);
  npcPos.y = terrain.getHeight(npcPos.x, npcPos.z);
  return npcPos;
}
