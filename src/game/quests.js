// Журнал заданий: принятие, прогресс, сдача, маркеры над NPC.
import { QUESTS, questById, NPCS } from '../data/quests.js';
import { POIS, SECRET_SHOPS } from '../data/world.js';
import { xpNeeded } from '../data/classes.js';
import { makeQuestItem, makeWeapon, makeArmor, makeOffhand, makeJewel } from '../data/items.js';
import { MOB_TYPES, BOSSES } from '../data/mobs.js';
import { pick } from '../core/util.js';

export class QuestLog {
  constructor(game, data = {}) {
    this.game = game;
    this.active = data.active || {}; // id -> {progress}
    this.done = new Set(data.done || []);
  }
  serialize() { return { active: this.active, done: [...this.done] }; }

  isAvailable(q) {
    if (this.active[q.id] || this.done.has(q.id)) return false;
    if (q.prereq && !this.done.has(q.prereq)) return false;
    return this.game.player.level >= q.lvl - 2;
  }
  availableFrom(npcId) { return QUESTS.filter(q => q.giver === npcId && this.isAvailable(q)); }
  activeFrom(npcId) { return QUESTS.filter(q => this.active[q.id] && this.turnInNpc(q) === npcId); }
  turnInNpc(q) {
    if (q.type === 'talk') return q.target.startsWith('npc:') ? q.target.slice(4) : q.target;
    return q.giver;
  }
  isComplete(q) {
    const a = this.active[q.id];
    if (!a) return false;
    if (q.type === 'collect') return this.game.player.countItem(q.item) >= q.count;
    if (q.type === 'kill') return a.progress >= q.count;
    return a.progress >= 1;
  }
  progressText(q) {
    const a = this.active[q.id];
    if (!a) return '';
    switch (q.type) {
      case 'kill': return `${MOB_TYPES[q.target].name}: ${Math.min(a.progress, q.count)}/${q.count}`;
      case 'collect': return `${q.item}: ${Math.min(this.game.player.countItem(q.item), q.count)}/${q.count}`;
      case 'explore': return `Найти: ${(POIS.find(p => p.id === q.target) || {}).name}${a.progress ? ' ✔' : ''}`;
      case 'talk': {
        const t = q.target.startsWith('npc:') ? NPCS[q.target.slice(4)].name : (SECRET_SHOPS.find(s => 'shop:' + s.id === q.target) || {}).npc;
        return `Поговорить: ${t}`;
      }
      case 'boss': return `Победить: ${BOSSES.find(b => b.id === q.target).name}${a.progress ? ' ✔' : ''}`;
    }
    return '';
  }
  goalPos(q) {
    switch (q.type) {
      case 'kill': case 'collect': {
        const spawns = this.game.mobs.all.filter(m => m.typeKey === q.target && m.spawn && !m.isBoss).map(m => m.spawn);
        if (!spawns.length) return null;
        const P = this.game.player.pos;
        const ok = spawns.filter(s => s.lvl[0] <= this.game.player.level + 4);
        const list = ok.length ? ok : spawns;
        list.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
        return { x: list[0].x, z: list[0].z, r: list[0].r };
      }
      case 'explore': { const p = POIS.find(p => p.id === q.target); return { x: p.x, z: p.z, r: p.r }; }
      case 'boss': { const b = BOSSES.find(b => b.id === q.target); return { x: b.x, z: b.z, r: 20 }; }
      case 'talk': {
        if (q.target.startsWith('shop:')) { const s = SECRET_SHOPS.find(s => 'shop:' + s.id === q.target); return { x: s.x, z: s.z, r: 10 }; }
        const n = this.game.npcs.find(n => n.id === q.target.slice(4));
        return n ? { x: n.pos.x, z: n.pos.z, r: 6 } : null;
      }
    }
    return null;
  }

  accept(id) {
    const q = questById(id);
    this.active[id] = { progress: 0 };
    this.game.ui.notify(`Новое задание: «${q.title}»`, '#ffd23a');
    this.game.ui.sound('quest');
    if (q.type === 'explore') this.checkExplore();
    this.refreshMarkers();
    this.game.ui.updateTracker();
    this.game.save();
  }
  abandon(id) {
    delete this.active[id];
    this.refreshMarkers();
    this.game.ui.updateTracker();
  }
  turnIn(id) {
    const q = questById(id);
    const P = this.game.player;
    if (!this.isComplete(q)) return false;
    const rw = q.reward || {};
    if (rw.item) {
      const it = this.rewardItem(q.lvl, rw.item);
      if (!P.addItem(it)) { this.game.ui.error('Освободите место в сумке!'); return false; }
      this.game.ui.lootItem(it, true);
    }
    if (q.type === 'collect') P.removeItemByName(q.item, q.count);
    delete this.active[id];
    this.done.add(id);
    const xp = xpNeeded(Math.max(1, Math.min(q.lvl, P.level))) * 0.42 * (rw.xpMul || 1);
    const gold = Math.round(15 + Math.pow(q.lvl, 1.6) * 1.4);
    P.gold += gold;
    this.game.ui.notify(`Задание выполнено: «${q.title}»`, '#7aff7a', true);
    this.game.ui.loot(`+${gold} золота`, '#ffd700');
    P.gainXp(xp);
    this.game.ui.sound('complete');
    this.refreshMarkers();
    this.game.ui.updateTracker();
    this.game.save();
    return true;
  }
  rewardItem(lvl, rarity) {
    const P = this.game.player;
    const r = Math.random();
    const ilvl = Math.min(100, lvl + 1);
    if (r < 0.3) return makeWeapon(P.cls, ilvl, rarity);
    if (r < 0.38 && P.C.offhand.length) return makeOffhand(P.cls, ilvl, rarity);
    if (r < 0.46) return makeJewel(Math.random() < 0.5 ? 'ring' : 'amulet', ilvl, rarity, P.cls);
    return makeArmor(P.cls, pick(['head', 'shoulders', 'chest', 'hands', 'legs', 'feet']), ilvl, rarity);
  }

  onKill(m) {
    for (const id of Object.keys(this.active)) {
      const q = questById(id), a = this.active[id];
      if (q.type === 'kill' && q.target === m.typeKey && a.progress < q.count) {
        a.progress++;
        this.game.ui.questProgress(q, this.progressText(q));
        if (this.isComplete(q)) this.onComplete(q);
      } else if (q.type === 'collect' && q.target === m.typeKey && this.game.player.countItem(q.item) < q.count) {
        if (Math.random() < q.chance) {
          this.game.player.addItem(makeQuestItem(q.id, q.item, 1));
          this.game.ui.questProgress(q, this.progressText(q));
          if (this.isComplete(q)) this.onComplete(q);
        }
      } else if (q.type === 'boss' && m.bossId === q.target && !a.progress) {
        a.progress = 1;
        this.onComplete(q);
      }
    }
    this.game.ui.updateTracker();
  }
  onComplete(q) {
    this.game.ui.notify(`«${q.title}» — цель выполнена! Возвращайтесь к ${NPCS[this.turnInNpc(q)] ? NPCS[this.turnInNpc(q)].name : 'заказчику'}.`, '#7aff7a');
    this.game.ui.sound('objective');
    this.refreshMarkers();
  }
  // Разговор с NPC (для заданий «поговорить»)
  onTalk(npcId) {
    const res = [];
    for (const id of Object.keys(this.active)) {
      const q = questById(id);
      if (q.type === 'talk' && this.turnInNpc(q) === npcId) {
        this.active[id].progress = 1;
        res.push(q);
      }
    }
    return res;
  }
  checkExplore() {
    const P = this.game.player.pos;
    for (const id of Object.keys(this.active)) {
      const q = questById(id), a = this.active[id];
      if (q.type === 'explore' && !a.progress) {
        const p = POIS.find(p => p.id === q.target);
        if (Math.hypot(P.x - p.x, P.z - p.z) < p.r + 6) { a.progress = 1; this.onComplete(q); this.game.ui.updateTracker(); }
      }
    }
  }
  update() { this.checkExplore(); }

  markerFor(npcId) {
    if (this.activeFrom(npcId).some(q => this.isComplete(q) || q.type === 'talk')) return 'turnin';
    const av = this.availableFrom(npcId);
    if (av.length) return 'available';
    if (QUESTS.some(q => this.active[q.id] && q.giver === npcId)) return 'active';
    return null;
  }
  refreshMarkers() { this.game.ui && this.game.ui.dirtyMarkers && this.game.ui.dirtyMarkers(); }
}
