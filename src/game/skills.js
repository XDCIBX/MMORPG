// Выполнение умений игрока и визуальные эффекты к ним.
import * as THREE from 'three';
import { FX } from '../fx/particles.js';
import { WEAPON_ANIM } from '../chars/gear.js';
import { boneMat } from '../chars/materials.js';
import { fireMat, energyMat } from '../fx/effects.js';
import '../fx/vfx.js';
import { SK, makeCtx } from './skillfx.js';

// Умения по области заодно раскидывают предметы с физикой
function hitArea(game, x, z, r) {
  if (game.physics) game.physics.blast(x, z, r, 8);
  return game.combat.enemiesInRadius('player', x, z, r);
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Библиотека эффектов попадания ----------
export function hitFx(game, name, pos, opts = {}) {
  const E = game.effects;
  const p = pos.clone();
  switch (name) {
    case 'impact': {
      // удар молота: волна по земле, обломки, искры
      const g = p.clone(); g.y = game.world.standY(g.x, g.z);
      E.shockwave(g, '#ffae50', 3.2, 0.45, true);
      E.groundCrack(g, '#ff9040', 1.6, 1.4);
      FX.burst(p.x, p.y, p.z, 34, { color: ['#ffb040', '#ffe0a0', '#ffffff'], speed: 8, life: 0.45, size: 0.3, gravity: 6 });
      E.flash(p, '#ffb040', 25, 0.25);
      game.shake(0.3);
      break;
    }
    case 'slash':
      FX.burst(p.x, p.y, p.z, 14, { color: ['#ffffff', '#c0d0ff'], speed: 5, life: 0.3, size: 0.3 });
      break;
    case 'shieldflash': {
      FX.burst(p.x, p.y, p.z, 40, { color: ['#a0c8ff', '#ffffff'], speed: 8, life: 0.35, size: 0.35 });
      const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b0d0ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      fl.position.copy(p); fl.rotation.x = Math.PI / 2;
      E.add(fl, 0.3, (dt, k) => { fl.scale.setScalar(0.4 + k * 1.6); fl.material.opacity = 0.6 * (1 - k); });
      E.flash(p, '#80b0ff', 30, 0.3);
      if (opts.target) E.stunStars(() => (opts.target.alive ? opts.target.center().setY(opts.target.headY ? opts.target.headY() + 0.3 : p.y + 1.2) : null), opts.stun || 2);
      game.shake(0.25);
      break;
    }
    case 'execute': {
      const g = p.clone(); g.y = game.world.standY(g.x, g.z);
      E.crescent(p.clone().setY(p.y + 0.4), (opts.yaw || 0), '#ff2a20', 3.2, { tilt: Math.PI / 2, dur: 0.4, grow: 0.4 });
      E.shockwave(g, '#ff3020', 4.5, 0.5, true);
      FX.burst(p.x, p.y, p.z, 60, { color: ['#ff2020', '#ff8040', '#ffffff'], speed: 9, life: 0.5, size: 0.4, gravity: 5 });
      E.flash(p, '#ff2020', 50, 0.4, 18);
      game.shake(0.6);
      break;
    }
    case 'holyblade':
      E.crescent(p.clone(), (opts.yaw || 0), '#ffe070', 2.6, { dur: 0.4, travel: 3, roll: 0.5 });
      E.godRays(p.clone().setY(game.world.standY(p.x, p.z)), '#ffe8a0', 0.8, 1.2);
      FX.burst(p.x, p.y, p.z, 40, { color: ['#fff0a0', '#ffd040', '#ffffff'], speed: 7, life: 0.5, size: 0.4 });
      E.flash(p, '#ffe080', 40, 0.4);
      break;
    case 'rend':
      E.crescent(p.clone(), (opts.yaw || 0), '#d0101c', 2.4, { dur: 0.35, roll: -0.6 });
      for (let i = 0; i < 3; i++) game.schedule(i * 0.08, () => FX.burst(p.x, p.y, p.z, 20, { color: ['#c01020', '#600810'], speed: 5, life: 0.8, size: 0.25, gravity: 12 }));
      break;
    case 'arrowhit':
      FX.burst(p.x, p.y, p.z, 10, { color: ['#ffffff', '#e0d0a0'], speed: 4, life: 0.25, size: 0.2 });
      break;
    case 'poison':
      FX.burst(p.x, p.y, p.z, 30, { color: ['#70ff40', '#305010'], speed: 3, life: 0.9, size: 0.5 });
      for (let i = 0; i < 12; i++) FX.emit({ x: p.x + (Math.random() - 0.5) * 1.5, y: p.y + Math.random(), z: p.z + (Math.random() - 0.5) * 1.5, vy: 0.4, life: 2.2, size: 1.6, color: '#3a7a10', additive: false, alpha: 0.35, grow: 1 });
      break;
    case 'explosion':
      E.explosion(p, opts.color || '#ff7020', opts.size || 1);
      break;
    case 'frost':
      E.iceSpikes(p.clone().setY(game.world.standY(p.x, p.z)), 1.4, 6, (x, z) => game.world.standY(x, z));
      FX.burst(p.x, p.y, p.z, 36, { color: ['#a0e8ff', '#ffffff'], speed: 6, life: 0.6, size: 0.35 });
      E.flash(p, '#60c0ff', 25, 0.3);
      break;
    case 'lightning_hit': {
      E.skyBolt(p.clone().setY(game.world.standY(p.x, p.z)), '#90c8ff');
      E.shockwave(p.clone().setY(game.world.standY(p.x, p.z)), '#80c0ff', 3, 0.4, false);
      FX.burst(p.x, p.y, p.z, 30, { color: ['#a0d8ff', '#ffffff'], speed: 9, life: 0.3, size: 0.3 });
      break;
    }
    case 'crit': {
      const g = p.clone(); g.y = game.world.standY(g.x, g.z);
      E.shockwave(g, '#ff3030', 3.5, 0.45, false);
      FX.burst(p.x, p.y, p.z, 60, { color: ['#ff4040', '#ffd040', '#ffffff'], speed: 11, life: 0.45, size: 0.35 });
      E.flash(p, '#ff4040', 50, 0.35, 16);
      game.shake(0.45);
      break;
    }
    case 'shadowhit': {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), fireMat('#4a10a0', '#c080ff', { disp: 0.6 }));
      ball.position.copy(p);
      E.add(ball, 0.6, (dt, k) => { ball.scale.setScalar(0.4 + Math.sqrt(k) * 2.2); ball.material.uniforms.uAlpha.value = 1 - k; });
      FX.burst(p.x, p.y, p.z, 30, { color: ['#a050ff', '#300850'], speed: 5, life: 0.7, size: 0.5 });
      FX.burst(p.x, p.y, p.z, 14, { color: '#100018', speed: 2, life: 1.4, size: 1.4, additive: false, alpha: 0.55, grow: 1 });
      E.flash(p, '#8030ff', 30, 0.35);
      break;
    }
    case 'drain':
      FX.burst(p.x, p.y, p.z, 26, { color: ['#ff2050', '#a00020'], speed: 4, life: 0.6, size: 0.45 });
      drainStream(game, p, opts.to);
      break;
    case 'boneshatter':
      game.effects.shards(p, 9, boneMat('#ece4cc'), 0.16, 7);
      FX.burst(p.x, p.y, p.z, 30, { color: ['#60ff90', '#e0ffe0', '#205030'], speed: 6, life: 0.55, size: 0.4 });
      E.flash(p, '#50ff80', 20, 0.3);
      break;
    case 'bonehit':
      FX.burst(p.x, p.y, p.z, 16, { color: ['#e0e0c0', '#80ff90'], speed: 5, life: 0.4, size: 0.3 });
      break;
    default:
      FX.burst(p.x, p.y, p.z, 16, { color: opts.color || '#ffffff', speed: 4, life: 0.4, size: 0.35 });
  }
}

function starStun(game, p) {
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    FX.emit({ x: p.x + Math.cos(a) * 0.5, y: p.y + 0.9, z: p.z + Math.sin(a) * 0.5, vx: -Math.sin(a) * 1.2, vz: Math.cos(a) * 1.2, life: 1.0, size: 0.25, color: '#ffe060', drag: 1 });
  }
}

function drainStream(game, from, toFn) {
  if (!toFn) return;
  for (let i = 0; i < 18; i++) {
    game.schedule(i * 0.03, () => {
      const to = toFn();
      const p = from.clone().lerp(to, Math.random());
      FX.emit({ x: p.x, y: p.y, z: p.z, vx: (to.x - p.x) * 1.5, vy: (to.y - p.y) * 1.5, vz: (to.z - p.z) * 1.5, life: 0.5, size: 0.35, color: '#ff3060' });
    });
  }
}

// ---------- Эффекты области ----------
function areaFx(game, name, pos, r, color) {
  const E = game.effects;
  const p = pos.clone();
  switch (name) {
    case 'quake': {
      // землетрясение: волна, радиальные разломы с шипами, летящие камни
      E.shockwave(p, '#d09a50', r * 1.1, 0.7, true);
      const sy = (x, z) => game.world.standY(x, z);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.random() * 0.3; E.fissure(p.clone(), V(Math.cos(a), 0, Math.sin(a)), r, '#ff9a40', sy); }
      game.shake(0.8);
      break;
    }
    case 'harvest':
      E.spectralScythe(p, '#40e0d0', r, 0.55, 1.15);
      E.ringWave(p, '#40e0d0', r, 0.5);
      break;
    case 'whirl': case 'runespin': case 'bladestorm': {
      const c = name === 'runespin' ? '#ff7a20' : name === 'bladestorm' ? '#ff4050' : '#b8ccff';
      E.tornado(p, c, r * 0.75, 3.2, 0.7, game.player.model.root);
      for (let k = 0; k < 4; k++) game.schedule(k * 0.08, () => E.crescent(game.player.pos.clone().setY(game.player.pos.y + 1.0), k * 1.57 + Math.random(), c, r * 0.85, { dur: 0.3, roll: (Math.random() - 0.5) * 0.6, grow: 0.3 }));
      if (name === 'runespin') E.runeDecal(p, '#ff7020', r, 0.8, 4);
      FX.ring(p.x, p.y + 1, p.z, r * 0.8, 40, { color: c, speed: 3, life: 0.5, size: 0.35 });
      break;
    }
    case 'frostnova':
      E.iceSpikes(p, r, 22, (x, z) => game.world.standY(x, z));
      E.shockwave(p, '#a0e8ff', r, 0.6, false);
      E.ringWave(p, '#a0e8ff', r, 0.6);
      FX.ring(p.x, p.y + 0.5, p.z, 0.5, 60, { color: ['#a0e8ff', '#ffffff'], speed: r * 2.2, life: 0.6, size: 0.6, drag: 0.92 });
      E.runeDecal(p, '#80d0ff', r, 1.5, 1);
      E.flash(p, '#80d0ff', 40, 0.5, 20);
      break;
    case 'meteor':
      E.runeDecal(p, '#ff5020', r, 1.2, 2);
      break;
    case 'rockfall': {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * 6.28, rr = Math.random() * r * 0.8;
        const tp = p.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.6, 0), new THREE.MeshStandardMaterial({ color: '#6a6058', roughness: 0.9, flatShading: true }));
        m.castShadow = true;
        game.effects.dropFromSky(tp, m, 0.45 + i * 0.06, () => { FX.burst(tp.x, tp.y + 0.3, tp.z, 14, { color: '#7a6a50', speed: 5, life: 0.7, size: 0.6, additive: false, alpha: 0.8, gravity: 10, up: 3 }); E.shockwave(tp, '#c09060', 2.2, 0.4, true); });
      }
      game.schedule(0.5, () => game.shake(0.4));
      break;
    }
    case 'judgement':
      // гигантский меч света падает с неба
      E.runeDecal(p, '#ffd040', r, 1.4, 2);
      E.giantSword(p, '#ffe070', () => { E.godRays(p, '#fff0a0', 1.0, r * 0.5); FX.burst(p.x, p.y + 1, p.z, 70, { color: ['#fff0a0', '#ffd040', '#ffffff'], speed: 9, life: 0.8, size: 0.45 }); game.shake(0.7); });
      break;
    case 'solar': {
      // маленькое солнце опускается и взрывается
      const sun = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 4), fireMat('#ff8a10', '#fff0a0', { disp: 0.6 }));
      const corona = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 3), fireMat('#ff4000', '#ffb040', { disp: 1.0 }));
      corona.material.uniforms.uAlpha.value = 0.5;
      sun.add(core, corona);
      const start = p.clone().setY(p.y + 16);
      sun.position.copy(start);
      E.runeDecal(p, '#ffb030', r, 1.4, 2);
      E.add(sun, 0.9, (dt, k) => { sun.position.lerpVectors(start, p.clone().setY(p.y + 2), k * k); sun.rotation.y += dt * 2; }, () => {
        E.explosion(p.clone().setY(p.y + 2), '#ffa020', 3.2);
        E.shockwave(p, '#ffb040', r, 0.7, true);
        game.shake(0.9);
      });
      E.flash(p.clone().setY(p.y + 8), '#ffb040', 60, 1.0, 40);
      break;
    }
    case 'phantomblades':
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.28, rr = r * 0.6;
        const tp = p.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
        const sw = new THREE.Group();
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.8, 0.05), energyMat('#9ab8ff', { scale: 2, speed: 2, rim: 1, rimA: 0.6 }));
        bl.position.y = 1.3; sw.add(bl);
        const cg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), bl.material); cg.position.y = 2.7; sw.add(cg);
        game.effects.dropFromSky(tp, sw, 0.35 + i * 0.07, () => { FX.burst(tp.x, tp.y + 0.3, tp.z, 18, { color: ['#a0c0ff', '#ffffff'], speed: 5, life: 0.5, size: 0.4 }); E.shockwave(tp, '#a0c0ff', 1.8, 0.35, false); }, 14);
      }
      E.runeDecal(p, '#80a0ff', r, 1.2, 3);
      break;
    case 'vines':
      E.vines(p, r, 26, (x, z) => game.world.standY(x, z));
      E.runeDecal(p, '#50c040', r, 4, 0.5);
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, rr = Math.random() * r; FX.emit({ x: p.x + Math.cos(a) * rr, y: p.y + 0.1, z: p.z + Math.sin(a) * rr, vy: 2 + Math.random() * 2, life: 1.0, size: 0.4, color: Math.random() < 0.5 ? '#50c040' : '#a0ff60', drag: 0.9 }); }
      break;
    case 'plague': {
      // ядовитое облако клубится и оседает
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, rr = Math.random() * r; FX.emit({ x: p.x + Math.cos(a) * rr, y: p.y + 0.4 + Math.random(), z: p.z + Math.sin(a) * rr, vx: Math.cos(a) * 0.6, vy: 0.3, vz: Math.sin(a) * 0.6, life: 3 + Math.random(), size: 2.6, color: Math.random() < 0.5 ? '#3a6a10' : '#5a8a20', additive: false, alpha: 0.35, grow: 0.8, drag: 0.97 }); }
      for (let i = 0; i < 4; i++) E.add(null, 3, () => { if (Math.random() < 0.6) { const a = Math.random() * 6.28, rr = Math.random() * r; FX.emit({ x: p.x + Math.cos(a) * rr, y: p.y + 0.1, z: p.z + Math.sin(a) * rr, vy: 1.2, life: 0.8, size: 0.35, color: '#a0ff50' }); } });
      E.groundCrack(p, '#70ff30', r * 0.8, 3);
    }
    // eslint-disable-next-line no-fallthrough
    case 'plagueBurst':
      E.ringWave(p, '#90ff50', r, 0.6);
      FX.burst(p.x, p.y + 1, p.z, 40, { color: ['#90ff50', '#406010'], speed: 5, life: 1.2, size: 1.2, drag: 0.9, grow: 1 });
      FX.burst(p.x, p.y + 1, p.z, 20, { color: '#304010', speed: 3, life: 2, size: 2, additive: false, alpha: 0.4, grow: 1.5 });
      E.flash(p, '#80ff40', 30, 0.5);
      break;
    case 'arrowrain': case 'shadowrain': {
      const c = name === 'shadowrain' ? '#a080ff' : '#e0d0a0';
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * 6.28, rr = Math.random() * r;
        const tp = p.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
        game.effects.projectile(name === 'shadowrain' ? 'shadow' : 'arrow', tp.clone().add(V(-2, 16, -1)), () => tp, 40, () => FX.burst(tp.x, tp.y + 0.2, tp.z, 5, { color: c, speed: 3, life: 0.3, size: 0.25 }));
      }
      break;
    }
    case 'voidrift': {
      // чёрная дыра с вращающимся аккреционным диском
      const disk = new THREE.Mesh(new THREE.RingGeometry(1.4, r * 0.7, 48, 2), energyMat('#9040ff', { scale: 6, speed: 3, rim: 1, rimA: 0.2 }));
      disk.rotation.x = -Math.PI / 2 + 0.25; disk.position.copy(p).setY(p.y + 1.5);
      E.add(disk, 0.5, (dt, k) => { disk.rotation.z -= dt * 8; disk.material.uniforms.uAlpha.value = Math.sin(k * Math.PI); disk.scale.setScalar(1.2 - k * 0.4); });
      E.runeDecal(p, '#7020c0', r, 0.6, -4);
    }
    // eslint-disable-next-line no-fallthrough
    case 'voidcore':
      FX.ring(p.x, p.y + 1, p.z, r, 40, { color: ['#a050ff', '#300850'], speed: -r * 1.5, life: 0.6, size: 0.6, drag: 1 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#000000' }));
      core.position.copy(p).setY(p.y + 1.5);
      game.effects.add(core, 0.5, (dt, k) => core.scale.setScalar(Math.sin(k * Math.PI) * 1.2 + 0.1));
      game.effects.flash(p, '#7020ff', 20, 0.5);
      break;
    default:
      E.ringWave(p, color || '#ffffff', r, 0.5);
  }
}

// ---------- Эффекты на заклинателе ----------
function selfFx(game, name, ent, color) {
  const E = game.effects;
  const p = ent.pos.clone();
  switch (name) {
    case 'shout': case 'roar': {
      // боевой клич: несколько звуковых волн, пыль сдувает ветром, аура
      const c = name === 'roar' ? '#ff3a20' : '#ff9a40';
      for (let i = 0; i < 3; i++) game.schedule(i * 0.12, () => E.shockwave(ent.pos.clone(), c, 9 + i * 3, 0.7, false));
      E.attachAura(ent.model.root, c, 8, 1.5);
      FX.burst(p.x, p.y + 1.6, p.z, 40, { color: [c, '#ffd060'], speed: 8, life: 0.6, size: 0.4, flat: true });
      game.shake(0.45);
      break;
    }
    case 'stoneskin':
      E.orbitRocks(ent.model.root, 10, 1.1, 8);
      E.dome(ent.model.root, '#b0a890', 1.3, 8);
      FX.burst(p.x, p.y + 1, p.z, 30, { color: ['#a0a0a0', '#c0c0c0'], speed: 3, life: 0.8, size: 0.5, additive: false, alpha: 0.8 });
      break;
    case 'bastion':
      E.dome(ent.model.root, '#80b8ff', 1.6, 12);
      E.shockwave(p, '#80b8ff', 3, 0.5, false);
      break;
    case 'ancestral':
      E.ghostClone(ent.model, '#ff7a30', 2.6, 1.7, 0.9);
      E.attachAura(ent.model.root, color, 12, 1.6);
      E.tornado(p, '#ff5020', 1.6, 3.5, 1.0, ent.model.root);
      game.shake(0.5);
      break;
    case 'avatar': case 'frenzy':
      E.attachAura(ent.model.root, color, name === 'frenzy' ? 3 : 12, 1.6);
      E.pillar(p, color, 1.0, 8, 0.6);
      FX.burst(p.x, p.y + 1, p.z, 40, { color: [color, '#ffffff'], speed: 6, life: 0.7, size: 0.5 });
      break;
    case 'mountainheart': case 'holylight':
      E.godRays(p, name === 'holylight' ? '#fff0a0' : '#ffa060', 1.5, 2);
      if (name === 'holylight') E.dome(ent.model.root, '#ffe080', 1.4, 1.6);
      else E.rocks(p, 10, 2, 0.3);
      E.pillar(p, name === 'holylight' ? '#fff0a0' : '#ff9060', 1.2, 14, 0.9);
      E.runeDecal(p, name === 'holylight' ? '#ffe080' : '#ff9060', 3, 1.5, 1);
      FX.burst(p.x, p.y + 1, p.z, 40, { color: ['#a0ff90', '#ffffff', '#fff0a0'], speed: 3, life: 1.2, size: 0.4, up: 2 });
      break;
    case 'summondark':
      E.runeDecal(p, '#40ff80', 3, 1.4, 2);
      break;
    case 'summonnature':
      E.runeDecal(p, '#80d0ff', 3, 1.4, 2);
      break;
    case 'dust':
      FX.burst(p.x, p.y + 0.3, p.z, 20, { color: '#9a8a70', speed: 3, life: 0.8, size: 0.8, additive: false, alpha: 0.6, grow: 1 });
      break;
    case 'blink': {
      FX.burst(p.x, p.y + 1, p.z, 50, { color: ['#c0a0ff', '#ffffff', '#7040ff'], speed: 6, life: 0.5, size: 0.4 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 40), energyMat('#b090ff', { scale: 4, speed: 4 }));
      ring.position.copy(p).setY(p.y + 1); ring.rotation.x = Math.PI / 2;
      E.add(ring, 0.4, (dt, k) => { ring.scale.setScalar(1 + k * 1.5); ring.position.y = p.y + 0.2 + k * 2; ring.material.uniforms.uAlpha.value = 1 - k; });
      E.ringWave(p, '#c0a0ff', 3, 0.4);
      break;
    }
  }
}

export function levelUpFx(game, ent) {
  const p = ent.pos.clone();
  game.effects.pillar(p, '#ffd860', 1.4, 18, 1.4);
  game.effects.runeDecal(p, '#ffd040', 4, 2.4, 1);
  FX.burst(p.x, p.y + 1, p.z, 80, { color: ['#ffe080', '#ffffff', '#ffb030'], speed: 6, life: 1.5, size: 0.45, up: 3 });
}

// ---------- Исполнение умения ----------
function skillCtx(game, P, skill, target) {
  const K = SK[skill.id] || {};
  const anim = K.anim || skill.anim || WEAPON_ANIM[P.model.weaponType || 'none'];
  const handPos = () => {
    const v = new THREE.Vector3();
    if (P.model.weaponObj && (P.model.hold === 'staff')) { P.model.weaponObj.localToWorld(v.set(0, 1.15, 0)); return v; }
    return P.model.worldPos(P.model.hold === 'bow' ? 'gripL' : 'gripR', v);
  };
  const c = makeCtx(game, P, skill, target, handPos, anim);
  c.old = { hit: (n, p, o) => hitFx(game, n, p, o), area: (n, p, r, col) => areaFx(game, n, p, r, col), self: (n) => selfFx(game, n, P, skill.color) };
  c.point = target ? target.pos.clone() : P.pos.clone().add(V(Math.sin(P.yaw) * 10, 0, Math.cos(P.yaw) * 10));
  return { K, c, anim, handPos };
}
// Подготовка во время долгого каста (метка на цели, печать на земле)
export function precastSkill(game, P, skill, target, dur) {
  const { K, c } = skillCtx(game, P, skill, target);
  if (K.precast) K.precast(c, dur);
}

export function castSkill(game, P, skill, target) {
  const C = P.C;
  const E = game.effects;
  const ap = P.ap;
  const dmgOf = (mul) => ap * mul;
  const range = (skill.range || C.range) + (P.rangeAdd || 0);
  const { K, c, anim, handPos } = skillCtx(game, P, skill, target);
  P.model.playAction(anim, P.hasteMul);
  const T = c.T;                         // момент удара по анимации
  if (K.cast) K.cast(c);
  // зрелище: своя постановка умения, иначе общая библиотека
  const fxHit = (pos, o = {}) => { if (K.hit) K.hit(c, pos, o); else hitFx(game, skill.fx, pos, o); };
  const fxEach = (e) => { if (K.each) K.each(c, e); else hitFx(game, 'default', e.center(), { color: skill.color }); };
  const fxSelf = () => { if (K.self) K.self(c); else selfFx(game, skill.fx, P, skill.color); };
  const tgtCenter = (t) => () => (t && t.alive ? t.center() : null);
  const apply = (t, mul, extra = {}) => {
    if (!t || !t.alive) return 0;
    let m = mul;
    if (skill.execute && t.hp / t.maxHp < skill.execute) m *= 2;
    const d = game.combat.dealDamage(P, t, dmgOf(m), { lifesteal: skill.lifesteal || 0, ...extra });
    if (skill.stun) t.stunT = Math.max(t.stunT, skill.stun);
    if (skill.root) t.rootT = Math.max(t.rootT, skill.root);
    if (skill.slow) t.slowT = Math.max(t.slowT, skill.slow);
    if (skill.dot) t.addBuff({ id: 'dot_' + skill.id, src: P, dur: skill.dot.dur, dot: { dps: dmgOf(skill.dot.dmg) / skill.dot.dur, color: skill.dot.color } });
    if (skill.curse) t.addBuff({ id: 'curse', src: P, dur: skill.curse.dur, mods: { vuln: skill.curse.vuln, weak: skill.curse.weak } });
    if (skill.healPerHit) game.combat.heal(P, P.maxHp * skill.healPerHit, P);
    if (t.aggro) t.aggro(P);
    return d;
  };
  switch (skill.type) {
    case 'melee': {
      game.schedule(T, () => {
        if (!target || !target.alive) return;
        const cpos = target.center();
        const yaw = P.yaw;
        if (K.swing) K.swing(c, cpos, yaw);
        else if (skill.fx !== 'impact') E.crescent(P.pos.clone().setY(P.pos.y + 1.1).add(V(Math.sin(yaw) * 0.6, 0, Math.cos(yaw) * 0.6)), yaw, skill.color, 2.4, { dur: 0.3, travel: 1.4, roll: anim === 'slash2' ? -0.6 : 0.6 });
        game.schedule(0.05, () => {
          if (!target.alive) return;
          apply(target, skill.dmg);
          fxHit(target.center(), { target, stun: skill.stun, yaw });
          if (!K.hit) game.shake(0.2);
          if (game.physics) game.physics.blast(target.pos.x, target.pos.z, 2.2, 5);
        });
      });
      break;
    }
    case 'proj': {
      if (skill.projectile === 'drain') {
        // жгуты жизненной силы тянутся от врага к заклинателю
        game.schedule(T, () => {
          if (!target || !target.alive) return;
          E.drainBeam(() => (target.alive ? target.center() : null), () => handPos(), skill.color, 1.0);
          if (K.drain) K.drain(c, target);
          game.schedule(0.35, () => {
            apply(target, skill.dmg);
            if (K.hit) K.hit(c, target.center(), { target }); else hitFx(game, 'drain', target.center(), { to: () => P.center() });
            E.sphere(P.pos, '#ff3060', 1.1, 0.6, P.model.root);
          });
        });
        break;
      }
      game.schedule(T, () => {
        if (!target || !target.alive) return;
        if (skill.id === 'n_curse') game.schedule(0.45, () => target.alive && E.sigil(() => (target.alive ? target.center().setY(target.headY ? target.headY() + 0.6 : target.pos.y + 2.5) : null), '#90ff40', skill.curse.dur));
        const from = handPos();
        const po = K.proj || {};
        const speed = po.speed || (skill.projectile === 'fireball' ? 26 : skill.projectile === 'hammer' ? 30 : 42);
        if (K.launch) K.launch(c, from);
        E.projectile(skill.projectile, from, tgtCenter(target), speed, (hp) => {
          apply(target, skill.dmg);
          if (skill.splash) for (const e of hitArea(game, hp.x, hp.z, skill.splash)) if (e !== target) apply(e, skill.dmg * 0.6);
          fxHit(hp, { target, to: () => P.center(), size: skill.splash ? 1.5 : 1 });
        }, po);
      });
      break;
    }
    case 'multi': {
      game.schedule(T, () => {
        const from = handPos();
        const baseDir = target ? Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z) : P.yaw;
        const enemies = game.mobs.active.filter(e => e.alive && e.distTo(P) < range);
        const po = K.proj || {};
        if (K.launch) K.launch(c, from);
        for (let i = 0; i < skill.count; i++) {
          const a = baseDir + (i - (skill.count - 1) / 2) * (skill.spread / (skill.count - 1)) * 2;
          let best = null, bd = 1e9;
          for (const e of enemies) {
            const ea = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
            let da = Math.abs(Math.atan2(Math.sin(ea - a), Math.cos(ea - a)));
            if (da < 0.22 && da < bd) { bd = da; best = e; }
          }
          if (i === Math.floor(skill.count / 2) && target) best = target;
          const tgtFn = best ? tgtCenter(best) : (() => { const pt = P.pos.clone().add(V(Math.sin(a) * range, 1.2, Math.cos(a) * range)); return () => pt; })();
          const b = best;
          E.projectile(skill.projectile, from.clone(), tgtFn, po.speed || 44, (hp) => { if (b) { apply(b, skill.dmg); fxHit(hp, { target: b }); } }, po);
        }
      });
      break;
    }
    case 'aoeSelf': {
      game.schedule(T, () => {
        if (K.area) K.area(c, P.pos.clone(), skill.radius); else areaFx(game, skill.fx, P.pos, skill.radius, skill.color);
        for (const e of hitArea(game, P.pos.x, P.pos.z, skill.radius)) {
          apply(e, skill.dmg);
          if (K.each) K.each(c, e); else hitFx(game, 'slash', e.center());
        }
      });
      break;
    }
    case 'aoeTarget': {
      const p = c.point;
      if (K.cast) {
        // постановка уже запущена в K.cast; урон — в момент удара
        game.schedule(K.delay || 0.5, () => {
          const g = p.clone().setY(game.world.standY(p.x, p.z));
          if (K.impact) K.impact(c, g);
          for (const e of hitArea(game, p.x, p.z, skill.radius)) { apply(e, skill.dmg); fxEach(e); }
        });
        break;
      }
      const delay = skill.fx === 'meteor' ? 0 : skill.fx === 'rockfall' ? 0.55 : skill.fx === 'phantomblades' ? 0.45 : 0.35;
      if (skill.fx === 'meteor') {
        areaFx(game, 'meteor', p, skill.radius);
        game.schedule(0.2, () => E.meteor(p.clone().setY(game.world.standY(p.x, p.z)), '#ff5020', () => {
          game.shake(0.6);
          for (const e of hitArea(game, p.x, p.z, skill.radius)) apply(e, skill.dmg);
        }));
      } else {
        game.schedule(0.15, () => areaFx(game, skill.fx, p.clone().setY(game.world.standY(p.x, p.z)), skill.radius, skill.color));
        game.schedule(delay + 0.15, () => {
          for (const e of hitArea(game, p.x, p.z, skill.radius)) { apply(e, skill.dmg); fxEach(e); }
        });
      }
      break;
    }
    case 'rain': case 'pull': {
      const p = skill.self ? null : c.point;
      const waves = skill.waves || 3;
      const t0 = K.waveStart || 0.35;
      for (let w = 0; w < waves; w++) {
        game.schedule(t0 + w * 0.45, () => {
          const cc = p ? p.clone() : P.pos.clone();
          cc.y = game.world.standY(cc.x, cc.z);
          if (K.area) K.area(c, cc, skill.radius, w); else areaFx(game, skill.fx, cc, skill.radius, skill.color);
          for (const e of hitArea(game, cc.x, cc.z, skill.radius)) {
            apply(e, skill.dmg / waves, { noCrit: w > 0 });
            if (K.each) K.each(c, e);
            if (skill.type === 'pull' && e.canMove && !e.isBoss) {
              const dx = cc.x - e.pos.x, dz = cc.z - e.pos.z, d = Math.hypot(dx, dz);
              if (d > 0.8) { e.pos.x += dx / d * Math.min(d - 0.6, 2.5); e.pos.z += dz / d * Math.min(d - 0.6, 2.5); }
            }
          }
        });
      }
      break;
    }
    case 'line': {
      game.schedule(T, () => {
        const dir = target ? V(target.pos.x - P.pos.x, 0, target.pos.z - P.pos.z).normalize() : V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
        const len = skill.range;
        const from = P.pos.clone().setY(P.pos.y + 1.2);
        const to = from.clone().addScaledVector(dir, len);
        const hit = game.combat.enemiesInLine('player', P.pos, dir, len, skill.width);
        if (game.physics) for (let i = 1; i <= 4; i++) game.physics.blast(P.pos.x + dir.x * len * i / 4, P.pos.z + dir.z * len * i / 4, skill.width + 1, 6);
        if (K.line) K.line(c, from, to, dir, len);
        else if (skill.fx === 'fissure') {
          E.fissure(P.pos.clone(), dir, len, '#ff8a30', (x, z) => game.world.standY(x, z));
          E.shockwave(P.pos.clone(), '#d09a50', 2.5, 0.4, true);
          game.shake(0.5);
        } else {
          E.beam(from, to, skill.color, 0.5, 0.6);
          E.godRays(to.clone().setY(game.world.standY(to.x, to.z)), skill.color, 0.8, 1.5);
        }
        for (const e of hit) { apply(e, skill.dmg); fxEach(e); }
      });
      break;
    }
    case 'chain': {
      game.schedule(T, () => {
        if (!target || !target.alive) return;
        const hitList = [target];
        let cur = target;
        for (let j = 1; j < skill.jumps; j++) {
          let best = null, bd = 12;
          for (const e of game.mobs.active) { if (!e.alive || hitList.includes(e)) continue; const d = e.distTo(cur); if (d < bd) { bd = d; best = e; } }
          if (!best) break;
          hitList.push(best); cur = best;
        }
        let from = handPos();
        const mul = skill.dmg;
        if (K.chainStart) K.chainStart(c, hitList);
        else if (skill.id === 'a_storm' && hitList[0]) E.skyBolt(hitList[0].pos.clone(), '#90c8ff');
        hitList.forEach((e, i) => {
          const f = from.clone();
          game.schedule(i * 0.12, () => {
            if (!e.alive) return;
            if (K.hop) K.hop(c, i ? (hitList[i - 1].alive ? hitList[i - 1].center() : f) : handPos(), e, i);
            else E.lightning(f, e.center(), '#a0d0ff', 0.3);
            apply(e, mul * Math.pow(0.85, i));
          });
          from = e.center();
        });
      });
      break;
    }
    case 'buff': {
      game.schedule(T, () => {
        fxSelf();
        if (skill.buff) P.addBuff({ id: skill.id, name: skill.name, icon: skill.icon, color: skill.color, dur: skill.buff.dur, mods: { dmgMul: skill.buff.dmgMul, armorMul: skill.buff.armorMul, dmgTaken: skill.buff.dmgTaken, hasteMul: skill.buff.hasteMul, lifesteal: skill.buff.lifesteal } });
        if (skill.fx === 'avatar') {
          E.wings(P.model.j.chest, '#30ffe0', skill.buff.dur);
          const base = P.model.root.scale.x, dur = skill.buff.dur;
          E.add(null, dur, (dt, k) => {
            const sc = base * (1 + 0.18 * Math.min(1, k * dur * 3) * (k > 0.95 ? (1 - k) * 20 : 1));
            P.model.root.scale.setScalar(sc);
            if (Math.random() < 0.6) FX.emit({ x: P.pos.x + (Math.random() - 0.5) * 1.2, y: P.pos.y + Math.random() * 0.5, z: P.pos.z + (Math.random() - 0.5) * 1.2, vy: 0.6, life: 1.4, size: 1.3, color: '#0a1414', additive: false, alpha: 0.5, grow: 1 });
          }, () => P.model.root.scale.setScalar(base));
          game.shake(0.4);
        }
        if (skill.taunt) for (const e of hitArea(game, P.pos.x, P.pos.z, skill.taunt)) { e.aggro(P, true); }
        P.recalc();
      });
      break;
    }
    case 'heal': {
      game.schedule(T, () => {
        fxSelf();
        game.combat.heal(P, P.maxHp * skill.heal, P);
        if (skill.shield) { P.shield = P.maxHp * skill.shield; P.shieldT = skill.dur || 10; E.sphere(P.pos, '#ffe080', 1.3, skill.dur || 10, P.model.root); }
      });
      break;
    }
    case 'shield': {
      game.schedule(T, () => {
        fxSelf();
        P.shield = P.maxHp * skill.shield; P.shieldT = skill.dur;
      });
      break;
    }
    case 'charge': {
      if (!target) return;
      const start = P.pos.clone();
      const dest = target.pos.clone();
      const dir = dest.clone().sub(start); dir.y = 0;
      const dist = dir.length();
      dir.normalize();
      const end = start.clone().addScaledVector(dir, Math.max(0, dist - (target.radius + 1.0)));
      P.dashing = 0.28;
      E.add(null, 0.28, (dt, k) => {
        P.pos.x = start.x + (end.x - start.x) * k;
        P.pos.z = start.z + (end.z - start.z) * k;
        if (K.dash) K.dash(c, k, dir);
        else {
          FX.emit({ x: P.pos.x, y: P.pos.y + 0.3, z: P.pos.z, life: 0.6, size: 0.9, color: '#9a8a70', additive: false, alpha: 0.4, grow: 1 });
          FX.emit({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z, life: 0.25, size: 0.6, color: skill.color });
        }
      }, () => {
        if (target.alive) {
          apply(target, skill.dmg);
          if (K.dashEnd) K.dashEnd(c, target, { target, stun: skill.stun }); else hitFx(game, 'shieldflash', target.center(), { target, stun: skill.stun });
        }
        if (!K.dashEnd) { E.shockwave(P.pos.clone(), skill.color, 3.5, 0.45, true); game.shake(0.45); }
        if (game.physics) game.physics.blast(P.pos.x, P.pos.z, 3.5, 8);
      });
      break;
    }
    case 'leap': {
      const start = P.pos.clone();
      const dir = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      const end = start.clone().addScaledVector(dir, skill.dist);
      if (K.leapStart) K.leapStart(c);
      else { selfFx(game, 'dust', P); E.crescent(P.pos.clone().setY(P.pos.y + 1), P.yaw + Math.PI, '#c8f0ff', 2.2, { dur: 0.35, travel: 3, tilt: Math.PI / 2 }); }
      P.dashing = 0.4;
      E.add(null, 0.4, (dt, k) => {
        P.pos.x = start.x + (end.x - start.x) * k;
        P.pos.z = start.z + (end.z - start.z) * k;
        P.jumpOffset = Math.sin(k * Math.PI) * 2.2;
        if (K.leapTick) K.leapTick(c, k);
      }, () => { P.jumpOffset = 0; if (K.leapEnd) K.leapEnd(c); else selfFx(game, 'dust', P); });
      break;
    }
    case 'blink': {
      const from = P.center();
      if (K.blinkOut) K.blinkOut(c); else selfFx(game, 'blink', P);
      const dir = V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      for (let i = 0; i < 12; i++) {
        const nx = P.pos.x + dir.x * skill.dist / 12, nz = P.pos.z + dir.z * skill.dist / 12;
        const pos = { x: nx, z: nz };
        game.world.collision.resolve(pos, 0.45);
        P.pos.x = pos.x; P.pos.z = pos.z;
      }
      P.pos.y = game.world.standY(P.pos.x, P.pos.z);
      if (K.blinkIn) K.blinkIn(c, from); else selfFx(game, 'blink', P);
      break;
    }
    case 'summon': {
      game.schedule(Math.max(T, 0.4), () => {
        fxSelf();
        const max = skill.summon === 'skeleton' && skill.max < 10 ? (P.maxMinions || skill.max) : skill.max;
        for (let i = 0; i < skill.count; i++) {
          const a = P.yaw + Math.PI + (i - (skill.count - 1) / 2) * 0.8;
          const pos = P.pos.clone().add(V(Math.sin(a) * (skill.count > 2 ? 3.2 : 2.4), 0, Math.cos(a) * (skill.count > 2 ? 3.2 : 2.4)));
          pos.y = game.world.standY(pos.x, pos.z);
          const kind = skill.summon;
          // у каждого призыва своё появление
          if (K.appear) K.appear(c, pos, kind, i);
          else if (kind === 'bonegolem') { E.boneSpikes(pos, 3.2, 14, boneMat('#e4dcc4')); E.groundCrack(pos, '#60ff80', 3, 2.2); game.shake(0.5); }
          else if (kind === 'deathknight') { E.skyBolt(pos, '#50ff90'); E.groundCrack(pos, '#40ff80', 2.6, 2.5); E.pillar(pos, '#30c070', 1.2, 14, 1.0); game.shake(0.7); }
          else if (kind === 'spiritwolf') { E.runeDecal(pos, '#80d0ff', 2, 1.4, 2); FX.burst(pos.x, pos.y + 0.6, pos.z, 40, { color: ['#80d0ff', '#ffffff'], speed: 3, up: 2, life: 1, size: 0.4 }); }
          else E.groundCrack(pos, '#50ff80', 1.6, 1.8);
          game.schedule((kind === 'bonegolem' ? 0.5 : 0.15) + (skill.count > 1 && K.appear ? i * 0.12 : 0), () => game.allies.summon(kind, pos, skill.dur, max));
        }
      });
      break;
    }
    case 'minionbuff': {
      game.schedule(T, () => {
        fxSelf();
        for (const a of game.allies.list) {
          if (!a.alive) continue;
          if (K.minion) K.minion(c, a); else E.lightning(handPos(), a.center(), '#40ff60', 0.4);
          a.addBuff({ id: 'frenzy', dur: skill.buff.dur, mods: { dmgMul: skill.buff.dmgMul } });
          a.hp = a.maxHp;
          game.effects.attachAura(a.model.root, skill.color, skill.buff.dur, 1.0);
        }
      });
      break;
    }
  }
}

export { areaFx, selfFx };
