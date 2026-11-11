// Выполнение умений игрока и визуальные эффекты к ним.
import * as THREE from 'three';
import { FX } from '../fx/particles.js';
import { WEAPON_ANIM } from '../chars/gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Библиотека эффектов попадания ----------
export function hitFx(game, name, pos, opts = {}) {
  const E = game.effects;
  const p = pos.clone();
  switch (name) {
    case 'impact':
      FX.burst(p.x, p.y, p.z, 26, { color: ['#ffb040', '#ffe0a0', '#ffffff'], speed: 6, life: 0.4, size: 0.35 });
      E.ringWave(p.clone().setY(p.y - 0.8), '#ffb060', 2.5, 0.35);
      E.flash(p, '#ffb040', 15, 0.25);
      break;
    case 'slash':
      FX.burst(p.x, p.y, p.z, 14, { color: ['#ffffff', '#c0d0ff'], speed: 5, life: 0.3, size: 0.3 });
      break;
    case 'shieldflash':
      FX.burst(p.x, p.y, p.z, 30, { color: ['#a0c8ff', '#ffffff'], speed: 7, life: 0.35, size: 0.35 });
      E.flash(p, '#80b0ff', 20, 0.3);
      starStun(game, p);
      break;
    case 'execute':
      FX.burst(p.x, p.y, p.z, 40, { color: ['#ff2020', '#ff8040', '#300000'], speed: 7, life: 0.5, size: 0.45 });
      E.flash(p, '#ff2020', 30, 0.35);
      break;
    case 'holyblade':
      FX.burst(p.x, p.y, p.z, 36, { color: ['#fff0a0', '#ffd040', '#ffffff'], speed: 6, life: 0.5, size: 0.45 });
      E.flash(p, '#ffe080', 30, 0.4);
      break;
    case 'rend':
      FX.burst(p.x, p.y, p.z, 30, { color: ['#d02030', '#801018'], speed: 5, life: 0.6, size: 0.3, gravity: 9 });
      break;
    case 'arrowhit':
      FX.burst(p.x, p.y, p.z, 10, { color: ['#ffffff', '#e0d0a0'], speed: 4, life: 0.25, size: 0.2 });
      break;
    case 'poison':
      FX.burst(p.x, p.y, p.z, 24, { color: ['#70ff40', '#305010'], speed: 3, life: 0.8, size: 0.5 });
      break;
    case 'explosion':
      E.explosion(p, opts.color || '#ff7020', opts.size || 1);
      break;
    case 'frost':
      FX.burst(p.x, p.y, p.z, 30, { color: ['#a0e8ff', '#ffffff'], speed: 5, life: 0.6, size: 0.4 });
      E.flash(p, '#60c0ff', 20, 0.3);
      break;
    case 'lightning_hit':
      FX.burst(p.x, p.y, p.z, 26, { color: ['#a0d8ff', '#ffffff'], speed: 8, life: 0.3, size: 0.3 });
      E.flash(p, '#80c0ff', 30, 0.3);
      break;
    case 'crit':
      FX.burst(p.x, p.y, p.z, 40, { color: ['#ff4040', '#ffd040', '#ffffff'], speed: 9, life: 0.4, size: 0.4 });
      E.ringWave(p, '#ff6040', 3, 0.3, 0);
      E.flash(p, '#ff4040', 30, 0.3);
      break;
    case 'shadowhit':
      FX.burst(p.x, p.y, p.z, 30, { color: ['#a050ff', '#300850'], speed: 5, life: 0.7, size: 0.55 });
      FX.burst(p.x, p.y, p.z, 10, { color: '#100018', speed: 2, life: 1.0, size: 1.0, additive: false, alpha: 0.6, grow: 1 });
      E.flash(p, '#8030ff', 25, 0.35);
      break;
    case 'drain':
      FX.burst(p.x, p.y, p.z, 26, { color: ['#ff2050', '#a00020'], speed: 4, life: 0.6, size: 0.45 });
      drainStream(game, p, opts.to);
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
    case 'quake':
      E.ringWave(p, '#d0a060', r, 0.7);
      E.ringWave(p, '#ffffff', r * 0.7, 0.5);
      FX.ring(p.x, p.y + 0.2, p.z, r * 0.6, 40, { color: '#8a7050', speed: 6, vy: 3, life: 0.8, size: 0.9, additive: false, alpha: 0.7, gravity: 8 });
      for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, rr = Math.random() * r; FX.burst(p.x + Math.cos(a) * rr, p.y, p.z + Math.sin(a) * rr, 3, { color: '#6a5a40', speed: 4, life: 0.8, size: 0.4, additive: false, alpha: 0.9, gravity: 12, up: 4 }); }
      game.shake(0.5);
      break;
    case 'whirl': case 'runespin': case 'harvest': {
      const c = name === 'runespin' ? '#ff8a30' : name === 'harvest' ? '#40e0d0' : '#c0d0ff';
      for (let k = 0; k < 3; k++) E.slashArc(p.clone().setY(p.y + 1), k * 2.1, c, r, 0.35);
      FX.ring(p.x, p.y + 1, p.z, r * 0.8, 36, { color: c, speed: 2, life: 0.5, size: 0.4 });
      if (name === 'runespin') E.runeDecal(p, '#ff7020', r, 0.8, 4);
      break;
    }
    case 'frostnova':
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
        game.effects.dropFromSky(tp, m, 0.45 + i * 0.06, () => { FX.burst(tp.x, tp.y + 0.3, tp.z, 14, { color: '#7a6a50', speed: 5, life: 0.7, size: 0.6, additive: false, alpha: 0.8, gravity: 10, up: 3 }); });
      }
      game.schedule(0.5, () => game.shake(0.4));
      break;
    }
    case 'judgement': case 'solar':
      game.effects.pillar(p, name === 'solar' ? '#ffb030' : '#ffe080', r * 0.45, 20, 0.9);
      E.ringWave(p, '#fff0a0', r, 0.7);
      E.runeDecal(p, '#ffd040', r, 1.2, 2);
      FX.burst(p.x, p.y + 1, p.z, 60, { color: ['#fff0a0', '#ffd040', '#ffffff'], speed: 8, life: 0.8, size: 0.5 });
      if (name === 'solar') game.effects.explosion(p.clone().setY(p.y + 2), '#ffa020', 2.5);
      break;
    case 'phantomblades':
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * 6.28, rr = r * 0.6;
        const tp = p.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
        const sw = new THREE.Group();
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.03), new THREE.MeshBasicMaterial({ color: '#a0c0ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
        bl.position.y = 1.3; sw.add(bl);
        const cg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), bl.material); cg.position.y = 2.7; sw.add(cg);
        game.effects.dropFromSky(tp, sw, 0.35 + i * 0.07, () => { FX.burst(tp.x, tp.y + 0.3, tp.z, 18, { color: ['#a0c0ff', '#ffffff'], speed: 5, life: 0.5, size: 0.4 }); }, 14);
      }
      E.runeDecal(p, '#80a0ff', r, 1.2, 3);
      break;
    case 'vines':
      E.runeDecal(p, '#50c040', r, 4, 0.5);
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, rr = Math.random() * r; FX.emit({ x: p.x + Math.cos(a) * rr, y: p.y + 0.1, z: p.z + Math.sin(a) * rr, vy: 2 + Math.random() * 2, life: 1.0, size: 0.4, color: Math.random() < 0.5 ? '#50c040' : '#a0ff60', drag: 0.9 }); }
      break;
    case 'plague':
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
    case 'voidrift':
      E.runeDecal(p, '#7020c0', r, 0.6, -4);
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
    case 'shout':
      E.ringWave(p, '#ff8040', 12, 0.8, 0.5);
      E.ringWave(p, '#ffffff', 8, 0.6, 1.2);
      FX.burst(p.x, p.y + 1.6, p.z, 30, { color: ['#ff8040', '#ffd060'], speed: 6, life: 0.6, size: 0.4, flat: true });
      game.shake(0.25);
      break;
    case 'stoneskin': case 'bastion':
      E.sphere(p, name === 'bastion' ? '#80a8e0' : '#a0a0a0', 1.4, name === 'bastion' ? 12 : 8, ent.model.root);
      FX.burst(p.x, p.y + 1, p.z, 30, { color: ['#a0a0a0', '#c0c0c0'], speed: 3, life: 0.8, size: 0.5, additive: false, alpha: 0.8 });
      break;
    case 'ancestral': case 'avatar': case 'frenzy':
      E.attachAura(ent.model.root, color, name === 'frenzy' ? 3 : 12, 1.6);
      E.pillar(p, color, 1.0, 8, 0.6);
      FX.burst(p.x, p.y + 1, p.z, 40, { color: [color, '#ffffff'], speed: 6, life: 0.7, size: 0.5 });
      break;
    case 'mountainheart': case 'holylight':
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
    case 'blink':
      FX.burst(p.x, p.y + 1, p.z, 40, { color: ['#c0a0ff', '#ffffff'], speed: 5, life: 0.5, size: 0.4 });
      E.ringWave(p, '#c0a0ff', 3, 0.4);
      break;
  }
}

export function levelUpFx(game, ent) {
  const p = ent.pos.clone();
  game.effects.pillar(p, '#ffd860', 1.4, 18, 1.4);
  game.effects.runeDecal(p, '#ffd040', 4, 2.4, 1);
  FX.burst(p.x, p.y + 1, p.z, 80, { color: ['#ffe080', '#ffffff', '#ffb030'], speed: 6, life: 1.5, size: 0.45, up: 3 });
}

// ---------- Исполнение умения ----------
export function castSkill(game, P, skill, target) {
  const C = P.C;
  const E = game.effects;
  const ap = P.ap;
  const dmgOf = (mul) => ap * mul;
  const range = (skill.range || C.range) + (P.rangeAdd || 0);
  const anim = skill.anim || WEAPON_ANIM[P.model.weaponType || 'none'];
  P.model.playAction(anim, P.hasteMul);
  const handPos = () => {
    const v = new THREE.Vector3();
    if (P.model.weaponObj && (P.model.hold === 'staff')) { P.model.weaponObj.localToWorld(v.set(0, 1.15, 0)); return v; }
    return P.model.worldPos(P.model.hold === 'bow' ? 'gripL' : 'gripR', v);
  };
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
  const point = () => target ? target.pos.clone() : P.pos.clone().add(V(Math.sin(P.yaw) * 10, 0, Math.cos(P.yaw) * 10));
  const strikeDelay = 0.26 / P.hasteMul;
  switch (skill.type) {
    case 'melee': {
      game.schedule(strikeDelay, () => {
        if (!target || !target.alive) return;
        const c = target.center();
        E.slashArc(P.pos.clone().setY(P.pos.y + 1.1), P.yaw, skill.color, 2.2, 0.25, 0.3);
        apply(target, skill.dmg);
        hitFx(game, skill.fx, c);
      });
      break;
    }
    case 'proj': {
      game.schedule(anim === 'bow' ? 0.42 / P.hasteMul : strikeDelay, () => {
        if (!target || !target.alive) return;
        const from = handPos();
        const speed = skill.projectile === 'fireball' ? 26 : skill.projectile === 'hammer' ? 30 : 42;
        E.projectile(skill.projectile, from, tgtCenter(target), speed, (hp) => {
          apply(target, skill.dmg);
          if (skill.splash) for (const e of game.combat.enemiesInRadius('player', hp.x, hp.z, skill.splash)) if (e !== target) apply(e, skill.dmg * 0.6);
          hitFx(game, skill.fx, hp, { to: () => P.center(), size: skill.splash ? 1.5 : 1 });
        });
      });
      break;
    }
    case 'multi': {
      game.schedule(0.42 / P.hasteMul, () => {
        const from = handPos();
        const baseDir = target ? Math.atan2(target.pos.x - P.pos.x, target.pos.z - P.pos.z) : P.yaw;
        const enemies = game.mobs.active.filter(e => e.alive && e.distTo(P) < range);
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
          E.projectile(skill.projectile, from.clone(), tgtFn, 44, (hp) => { if (b) { apply(b, skill.dmg); hitFx(game, skill.fx, hp); } });
        }
      });
      break;
    }
    case 'aoeSelf': {
      game.schedule(skill.anim === 'slam' ? 0.45 / P.hasteMul : 0.3 / P.hasteMul, () => {
        areaFx(game, skill.fx, P.pos, skill.radius, skill.color);
        for (const e of game.combat.enemiesInRadius('player', P.pos.x, P.pos.z, skill.radius)) { apply(e, skill.dmg); hitFx(game, 'slash', e.center()); }
      });
      break;
    }
    case 'aoeTarget': {
      const p = point();
      const delay = skill.fx === 'meteor' ? 0 : skill.fx === 'rockfall' ? 0.55 : skill.fx === 'phantomblades' ? 0.45 : 0.35;
      if (skill.fx === 'meteor') {
        areaFx(game, 'meteor', p, skill.radius);
        game.schedule(0.2, () => E.meteor(p.clone().setY(game.world.standY(p.x, p.z)), '#ff5020', () => {
          game.shake(0.6);
          for (const e of game.combat.enemiesInRadius('player', p.x, p.z, skill.radius)) apply(e, skill.dmg);
        }));
      } else {
        game.schedule(0.15, () => areaFx(game, skill.fx, p.clone().setY(game.world.standY(p.x, p.z)), skill.radius, skill.color));
        game.schedule(delay + 0.15, () => {
          for (const e of game.combat.enemiesInRadius('player', p.x, p.z, skill.radius)) { apply(e, skill.dmg); hitFx(game, 'default', e.center(), { color: skill.color }); }
        });
      }
      break;
    }
    case 'rain': case 'pull': {
      const p = skill.self ? null : point();
      const waves = skill.waves || 3;
      for (let w = 0; w < waves; w++) {
        game.schedule(0.35 + w * 0.45, () => {
          const c = p || P.pos.clone();
          c.y = game.world.standY(c.x, c.z);
          areaFx(game, skill.fx, c, skill.radius, skill.color);
          for (const e of game.combat.enemiesInRadius('player', c.x, c.z, skill.radius)) {
            apply(e, skill.dmg / waves, { noCrit: w > 0 });
            if (skill.type === 'pull' && e.canMove && !e.isBoss) {
              const dx = c.x - e.pos.x, dz = c.z - e.pos.z, d = Math.hypot(dx, dz);
              if (d > 0.8) { e.pos.x += dx / d * Math.min(d - 0.6, 2.5); e.pos.z += dz / d * Math.min(d - 0.6, 2.5); }
            }
          }
        });
      }
      break;
    }
    case 'line': {
      game.schedule(skill.anim === 'bow' ? 0.42 / P.hasteMul : strikeDelay + 0.1, () => {
        const dir = target ? V(target.pos.x - P.pos.x, 0, target.pos.z - P.pos.z).normalize() : V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
        const len = skill.range;
        const from = P.pos.clone().setY(P.pos.y + 1.2);
        const to = from.clone().addScaledVector(dir, len);
        const hit = game.combat.enemiesInLine('player', P.pos, dir, len, skill.width);
        if (skill.fx === 'fissure') {
          for (let i = 1; i < len; i += 0.8) {
            const pp = P.pos.clone().addScaledVector(dir, i);
            game.schedule(i * 0.02, () => FX.burst(pp.x, game.world.standY(pp.x, pp.z) + 0.2, pp.z, 4, { color: '#8a7050', speed: 3, up: 4, life: 0.8, size: 0.6, additive: false, alpha: 0.9, gravity: 12 }));
          }
          game.shake(0.3);
        } else if (skill.fx === 'piercearrow') {
          E.projectile('bigarrow', from, () => to, 70, () => {});
          E.beam(from, to, '#ffffff', 0.08, 0.4);
        } else if (skill.fx === 'scytheline') {
          for (let i = 0; i < 6; i++) game.schedule(i * 0.05, () => E.slashArc(from.clone().addScaledVector(dir, 3 + i * (len - 3) / 6), Math.atan2(dir.x, dir.z), '#30d0c0', 3, 0.35, 0));
        } else {
          E.beam(from, to, skill.color, 0.5, 0.6);
        }
        for (const e of hit) { apply(e, skill.dmg); hitFx(game, 'default', e.center(), { color: skill.color }); }
      });
      break;
    }
    case 'chain': {
      game.schedule(skill.anim === 'bow' ? 0.42 / P.hasteMul : strikeDelay, () => {
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
        let mul = skill.dmg;
        hitList.forEach((e, i) => {
          const f = from.clone();
          game.schedule(i * 0.12, () => {
            if (!e.alive) return;
            E.lightning(f, e.center(), '#a0d0ff', 0.3);
            apply(e, mul * Math.pow(0.85, i));
          });
          from = e.center();
        });
        void mul;
      });
      break;
    }
    case 'buff': {
      game.schedule(0.3, () => {
        selfFx(game, skill.fx, P, skill.color);
        if (skill.buff) P.addBuff({ id: skill.id, name: skill.name, icon: skill.icon, color: skill.color, dur: skill.buff.dur, mods: { dmgMul: skill.buff.dmgMul, armorMul: skill.buff.armorMul, dmgTaken: skill.buff.dmgTaken, hasteMul: skill.buff.hasteMul, lifesteal: skill.buff.lifesteal } });
        if (skill.taunt) for (const e of game.combat.enemiesInRadius('player', P.pos.x, P.pos.z, skill.taunt)) { e.aggro(P, true); }
        P.recalc();
      });
      break;
    }
    case 'heal': {
      game.schedule(0.35, () => {
        selfFx(game, skill.fx, P, skill.color);
        game.combat.heal(P, P.maxHp * skill.heal, P);
        if (skill.shield) { P.shield = P.maxHp * skill.shield; P.shieldT = skill.dur || 10; E.sphere(P.pos, '#ffe080', 1.3, skill.dur || 10, P.model.root); }
      });
      break;
    }
    case 'shield': {
      game.schedule(0.3, () => {
        selfFx(game, skill.fx, P, skill.color);
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
        FX.emit({ x: P.pos.x, y: P.pos.y + 0.3, z: P.pos.z, life: 0.6, size: 0.9, color: '#9a8a70', additive: false, alpha: 0.4, grow: 1 });
        FX.emit({ x: P.pos.x, y: P.pos.y + 1, z: P.pos.z, life: 0.25, size: 0.6, color: skill.color });
      }, () => {
        if (target.alive) { apply(target, skill.dmg); hitFx(game, 'shieldflash', target.center()); }
        game.shake(0.3);
      });
      break;
    }
    case 'leap': {
      const start = P.pos.clone();
      const dir = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      const end = start.clone().addScaledVector(dir, skill.dist);
      selfFx(game, 'dust', P);
      P.dashing = 0.4;
      E.add(null, 0.4, (dt, k) => {
        P.pos.x = start.x + (end.x - start.x) * k;
        P.pos.z = start.z + (end.z - start.z) * k;
        P.jumpOffset = Math.sin(k * Math.PI) * 2.2;
      }, () => { P.jumpOffset = 0; selfFx(game, 'dust', P); });
      break;
    }
    case 'blink': {
      selfFx(game, 'blink', P);
      const dir = V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      for (let i = 0; i < 12; i++) {
        const nx = P.pos.x + dir.x * skill.dist / 12, nz = P.pos.z + dir.z * skill.dist / 12;
        const pos = { x: nx, z: nz };
        game.world.collision.resolve(pos, 0.45);
        P.pos.x = pos.x; P.pos.z = pos.z;
      }
      P.pos.y = game.world.standY(P.pos.x, P.pos.z);
      selfFx(game, 'blink', P);
      break;
    }
    case 'summon': {
      game.schedule(0.5, () => {
        selfFx(game, skill.fx, P);
        const max = skill.summon === 'skeleton' && skill.max < 10 ? (P.maxMinions || skill.max) : skill.max;
        for (let i = 0; i < skill.count; i++) {
          const a = P.yaw + Math.PI + (i - (skill.count - 1) / 2) * 0.8;
          const pos = P.pos.clone().add(V(Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2));
          game.allies.summon(skill.summon, pos, skill.dur, max);
        }
      });
      break;
    }
    case 'minionbuff': {
      game.schedule(0.3, () => {
        selfFx(game, skill.fx, P, skill.color);
        for (const a of game.allies.list) {
          if (!a.alive) continue;
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
