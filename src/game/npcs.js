// NPC в городах и у тайных лавок: внешность, поведение, взаимодействие.
import * as THREE from 'three';
import { Humanoid } from '../chars/humanoid.js';
import { equipVisual, animateGear } from '../chars/gear.js';
import { NPCS } from '../data/quests.js';
import { SECRET_SHOPS } from '../data/world.js';
import { pick, rand, angleLerp } from '../core/util.js';

const SKINS = ['#e0b090', '#d8a07c', '#c88a6a', '#f0c8a8', '#b87a5a', '#e8c0a0'];
const HAIRS = ['#2a1a10', '#5a3a1a', '#8a5a2a', '#c8a050', '#1a1a1a', '#a0a0a0', '#7a3a1a'];
const SHIRTS = ['#6a4a2a', '#4a5a3a', '#7a3a3a', '#3a4a6a', '#8a7a5a', '#5a3a5a'];

const SHOP_LOOKS = {
  hut: { look: { skin: '#d0a080', hair: { style: 'long', color: '#d0d0d0' }, beard: 'dwarf', base: { shirt: '#4a3a2a', pants: '#3a2a1a', boots: '#2a1a10' } }, outfit: { chest: { kind: 'cloth', c1: '#5a4a32', c2: '#3a2a1a', tier: 1 } }, weapon: 'hammer' },
  cave: { look: { skin: '#c08868', hair: { style: 'short', color: '#1a1a1a' }, beard: 'short', base: { shirt: '#2a2a2a', pants: '#2a2a2a', boots: '#1a1a1a' } }, outfit: { chest: { kind: 'leather', c1: '#2a2a30', c2: '#4a3a5a', tier: 4 }, head: { kind: 'leather', c1: '#2a2a30', c2: '#3a3040', tier: 3, style: 0 } }, weapon: 'sword' },
  witch: { look: { female: true, skin: '#a8b090', hair: { style: 'long', color: '#e0e0d0' }, eyes: { color: '#70ff40', glow: true }, base: { shirt: '#2a3a1a', pants: '#2a2a1a', boots: '#1a1a10' } }, outfit: { chest: { kind: 'cloth', c1: '#2a3a1a', c2: '#6a8a2a', tier: 3, gem: '#70ff40' }, head: { kind: 'cloth', c1: '#2a3a1a', c2: '#6a8a2a', tier: 3, style: 0 } }, weapon: 'staff' },
  dwarf: { look: { skin: '#c88a6a', scale: 0.86, legLen: 0.72, torsoW: 1.35, torsoD: 1.25, limb: 1.4, head: 1.15, neckLen: 0.5, hair: { style: 'braids', color: '#e0e0e0' }, beard: 'dwarf', base: { shirt: '#3a2a1a', pants: '#2a2a2a', boots: '#2a1a10' } }, outfit: { chest: { kind: 'heavy', c1: '#4e5e70', c2: '#1a3a6a', trim: '#c9a640', tier: 4 }, shoulders: { kind: 'heavy', c1: '#4e5e70', c2: '#3a4a5a', trim: '#c9a640', tier: 4, style: 2 } }, weapon: 'hammer' },
  tent: { look: { skin: '#9a8ac8', hair: { style: 'long', color: '#101030' }, eyes: { color: '#c0e0ff', glow: true }, base: { shirt: '#1a1a3a', pants: '#1a1a3a', boots: '#101020' } }, outfit: { chest: { kind: 'cloth', c1: '#141436', c2: '#a0c0ff', tier: 7, gem: '#a0c0ff' }, shoulders: { kind: 'cloth', c1: '#141436', c2: '#a0c0ff', tier: 7, gem: '#a0c0ff' }, head: { kind: 'cloth', c1: '#141436', c2: '#a0c0ff', tier: 7, style: 1, gem: '#a0c0ff' } }, weapon: 'staff' },
};

function outfitItem(o, slot) {
  return { vis: Object.assign({ style: 0, trim: '#b08a3a' }, o), slot };
}

export function makeNpcModel(look, outfit = {}, weapon = null) {
  const h = new Humanoid(JSON.parse(JSON.stringify(look)));
  for (const [slot, o] of Object.entries(outfit || {})) equipVisual(h, slot, outfitItem(o, slot));
  if (weapon) {
    const t = 2;
    equipVisual(h, 'weapon', { wtype: weapon, vis: { tier: t, c1: weapon === 'staff' ? '#5a3a22' : '#b0b4ba', trim: '#b08a3a', gem: weapon === 'staff' ? '#80c0ff' : null } });
  }
  h.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return h;
}

export class NPC {
  constructor(game, opts) {
    this.game = game;
    this.id = opts.id;
    this.def = opts.def || null;
    this.name = opts.name;
    this.title = opts.title || '';
    this.role = opts.role;
    this.shopId = opts.shopId || null;
    this.cityId = opts.cityId || null;
    this.pos = new THREE.Vector3(opts.x, game.world.standY(opts.x, opts.z), opts.z);
    this.home = this.pos.clone();
    this.yaw = opts.yaw || 0;
    this.homeYaw = this.yaw;
    this.model = opts.model;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    game.scene.add(this.model.root);
    this.wander = !!opts.wander;
    this.wanderT = rand(2, 8);
    this.target = null;
    this.speed = 0;
    this.talkT = 0;
    this.marker = null;
    this.interactive = !!opts.interactive;
    this.radius = 0.5;
    game.world.collision.addCircle(opts.x, opts.z, 0.45);
  }
  center() { return new THREE.Vector3(this.pos.x, this.pos.y + this.model.headTop() * 0.55, this.pos.z); }
  headY() { return this.pos.y + this.model.headTop(); }
  update(dt, playerPos) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    const visible = d < 150;
    this.model.root.visible = visible;
    if (!visible) return;
    if (d > 90) return;
    let speed = 0;
    if (this.talkT > 0) {
      this.talkT -= dt;
      const ty = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.yaw = angleLerp(this.yaw, ty, Math.min(1, dt * 5));
    } else if (this.wander) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rand(5, 12);
        const a = Math.random() * Math.PI * 2, r = rand(2, 7);
        this.target = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      }
      if (this.target) {
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, dd = Math.hypot(dx, dz);
        if (dd < 0.5) this.target = null;
        else {
          speed = 1.4;
          this.pos.x += dx / dd * speed * dt; this.pos.z += dz / dd * speed * dt;
          const p = { x: this.pos.x, z: this.pos.z };
          this.game.world.collision.resolve(p, 0.4);
          this.pos.x = p.x; this.pos.z = p.z;
          this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 5));
          this.pos.y = this.game.world.standY(this.pos.x, this.pos.z);
        }
      }
    } else {
      // смотрит на игрока, если рядом
      const ty = d < 8 ? Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z) : this.homeYaw;
      this.yaw = angleLerp(this.yaw, ty, Math.min(1, dt * 2));
    }
    this.model.update(dt, { speed, runSpeed: 6 });
    animateGear(this.model, this.game.time);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
  talk() {
    this.talkT = 6;
    this.model.playAction('talk');
  }
}

export function createNPCs(game) {
  const list = [];
  const W = game.world;
  for (const city of W.cities) {
    const cid = city.def.id;
    for (const sp of city.spots) {
      if (sp.role === 'quest') {
        const entry = Object.entries(NPCS).find(([, n]) => n.city === cid && n.slot === sp.idx);
        if (!entry) continue;
        const [id, n] = entry;
        list.push(new NPC(game, { id, def: n, name: n.name, title: n.title, role: 'quest', cityId: cid, x: sp.x, z: sp.z, yaw: sp.yaw, model: makeNpcModel(n.look, n.outfit, n.weapon), interactive: true }));
      } else if (sp.role === 'merchant' || sp.role === 'smith') {
        const entry = Object.entries(NPCS).find(([, n]) => n.city === cid && n.role === sp.role);
        if (!entry) continue;
        const [id, n] = entry;
        list.push(new NPC(game, { id, def: n, name: n.name, title: n.title, role: sp.role, cityId: cid, x: sp.x, z: sp.z, yaw: sp.yaw, model: makeNpcModel(n.look, n.outfit, n.weapon), interactive: true }));
      } else if (sp.role === 'guard') {
        const style = city.def.style;
        const c1 = style === 'marble' ? '#ece2c8' : style === 'stone' ? '#7e8a9a' : '#a2a6aa';
        const outfit = {
          chest: { kind: 'heavy', c1, c2: city.def.banner, trim: style === 'marble' ? '#ffd860' : '#8a7a5a', tier: style === 'marble' ? 6 : 2 },
          shoulders: { kind: 'heavy', c1, c2: '#6a6a6a', trim: '#8a7a5a', tier: 3 },
          head: { kind: 'heavy', c1, c2: city.def.banner, trim: '#8a7a5a', tier: 3, style: style === 'stone' ? 2 : 1 },
          legs: { kind: 'heavy', c1, c2: '#6a6a6a', tier: 2 }, feet: { kind: 'heavy', c1, c2: '#5a5a5a', tier: 2 }, hands: { kind: 'heavy', c1, c2: '#5a5a5a', tier: 2 },
        };
        const dwarfish = style === 'stone';
        const look = dwarfish ? { skin: pick(SKINS), scale: 0.86, legLen: 0.72, torsoW: 1.3, torsoD: 1.2, limb: 1.3, head: 1.15, neckLen: 0.5, hair: { style: 'braids', color: pick(HAIRS) }, beard: 'dwarf' } : { skin: pick(SKINS), hair: { style: 'short', color: pick(HAIRS) }, beard: Math.random() < 0.5 ? 'short' : null };
        look.base = { shirt: '#4a4a4a', pants: '#3a3a3a', boots: '#2a2a2a' };
        const m = makeNpcModel(look, outfit, dwarfish ? 'axe' : 'sword');
        equipVisual(m, 'offhand', { otype: 'shield', vis: { kind: 'heavy', tier: 3, c1, c2: city.def.banner, trim: '#c9a640', style: 1 } });
        list.push(new NPC(game, { id: 'guard', name: 'Стражник', role: 'guard', cityId: cid, x: sp.x, z: sp.z, yaw: sp.yaw, model: m }));
      } else if (sp.role === 'citizen' || sp.role === 'vendorExtra') {
        const female = Math.random() < 0.5;
        const look = { female, skin: pick(SKINS), hair: { style: female ? pick(['long', 'bun', 'ponytail']) : pick(['short', 'short', 'none']), color: pick(HAIRS) }, beard: !female && Math.random() < 0.4 ? 'short' : null, base: { shirt: pick(SHIRTS), pants: '#4a3a2a', boots: '#2a1a10' } };
        const outfit = Math.random() < 0.5 ? { chest: { kind: 'cloth', c1: pick(SHIRTS), c2: '#8a7a5a', tier: 0 } } : {};
        const names = female ? ['Горожанка', 'Селянка', 'Торговка'] : ['Горожанин', 'Ремесленник', 'Крестьянин'];
        list.push(new NPC(game, { id: 'citizen', name: sp.role === 'vendorExtra' ? (female ? 'Лоточница' : 'Лоточник') : pick(names), role: 'citizen', cityId: cid, x: sp.x, z: sp.z, yaw: sp.yaw, model: makeNpcModel(look, outfit), wander: sp.role === 'citizen' }));
      } else if (sp.role === 'teleport') {
        list.push({ isTeleport: true, id: 'tp_' + cid, cityId: cid, name: 'Камень телепортации', pos: new THREE.Vector3(sp.x, city.cy, sp.z), interactive: true, update() {}, headY() { return city.cy + 5.5; } });
      }
    }
    // гуляющие горожане по площади
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(8, 13);
      const female = Math.random() < 0.5;
      const look = { female, skin: pick(SKINS), hair: { style: female ? pick(['long', 'bun', 'ponytail']) : 'short', color: pick(HAIRS) }, beard: !female && Math.random() < 0.4 ? 'short' : null, base: { shirt: pick(SHIRTS), pants: '#4a3a2a', boots: '#2a1a10' } };
      list.push(new NPC(game, { id: 'citizen', name: female ? 'Горожанка' : 'Горожанин', role: 'citizen', cityId: cid, x: city.def.x + Math.cos(a) * r, z: city.def.z + Math.sin(a) * r, yaw: 0, model: makeNpcModel(look, Math.random() < 0.5 ? { chest: { kind: 'cloth', c1: pick(SHIRTS), c2: '#8a7a5a', tier: 0 } } : {}), wander: true }));
    }
  }
  // Тайные лавки
  W.shops.forEach((s) => {
    const def = s.def;
    const L = SHOP_LOOKS[def.style];
    const n = new NPC(game, { id: 'shop:' + def.id, name: def.npc, title: def.name, role: 'secret', shopId: def.id, x: s.npcPos.x, z: s.npcPos.z, yaw: s.npcPos.yaw, model: makeNpcModel(L.look, L.outfit, L.weapon), interactive: true });
    n.greet = def.greet;
    list.push(n);
  });
  void SECRET_SHOPS;
  return list;
}
