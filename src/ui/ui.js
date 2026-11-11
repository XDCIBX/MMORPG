// Интерфейс: HUD, окна, подсказки, всплывающий текст, мини-карта и карта мира.
import * as THREE from 'three';
import { CLASSES, BRANCH_LEVEL, xpNeeded } from '../data/classes.js';
import { RARITY, SLOT_NAMES, STAT_NAMES, SLOTS } from '../data/items.js';
import { QUESTS, questById, NPCS } from '../data/quests.js';
import { CITIES, SECRET_SHOPS, POIS, WORLD_HALF } from '../data/world.js';
import { BOSSES, SPAWNS, MOB_TYPES } from '../data/mobs.js';
import { itemIcon, skillIcon } from './icons.js';
import { fmt } from '../core/util.js';
import { IS_TOUCH } from '../core/device.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const CLASS_ICON = { dwarf: '⚒', warrior: '⚔', archer: '➶', mage: '✦', necro: '☠' };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export class UI {
  constructor(game) {
    this.game = game;
    this.windows = {};
    this.plates = new Map();
    this.floaters = [];
    this.tmpV = new THREE.Vector3();
    this.miniT = 0;
    this.markersDirty = true;
    this.audio = null;
    this.muted = false;
    this.touch = IS_TOUCH;
    this.tipKey = null;
  }

  init() {
    const P = this.game.player;
    $('hud').classList.remove('hidden');
    $('p-name').firstChild.textContent = P.playerName;
    $('p-cls').textContent = P.C.name;
    $('p-portrait').firstChild.textContent = CLASS_ICON[P.cls];
    if (this.touch) this.initTouchUI();
    this.buildSkillbar();
    document.querySelectorAll('#menubar .mb').forEach(b => b.addEventListener('click', () => this.toggle(b.dataset.w)));
    this.updateTracker();
    $('btn-revive').onclick = () => this.game.respawn();
  }

  // ---------- Сенсорное управление ----------
  initTouchUI() {
    const g = this.game;
    $('touch-ui').classList.remove('hidden');
    const bind = (id, fn) => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('pressed'); fn(); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('pressed'));
    };
    bind('t-attack', () => g.touchAttack());
    bind('t-jump', () => g.input.tap('Space'));
    bind('t-talk', () => { const n = g.nearestInteractive(5); if (n) g.interact(n); });
    bind('t-target', () => g.tabTarget());
    bind('t-hp', () => g.player.usePotion('hp'));
    bind('t-mp', () => g.player.usePotion('mp'));
    bind('t-mount', () => g.input.tap('KeyG'));
    // подсказка над предметом скрывается касанием в другом месте
    document.addEventListener('touchstart', (e) => {
      if (!e.target.closest || !e.target.closest('.slot, .shop-item')) { this.hideTip(); this.tipKey = null; }
    }, { passive: true });
    const fit = () => {
      const k = Math.min(1, window.innerHeight / 430, window.innerWidth / 820);
      $('touch-actions').style.transform = `scale(${k.toFixed(3)})`;
    };
    window.addEventListener('resize', fit);
    fit();
  }
  unlockAudio() {
    try {
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch (e) { /* */ }
  }

  // ---------- Звук (синтез WebAudio) ----------
  sound(name) {
    if (this.muted) return;
    try {
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      const ac = this.audio, t = ac.currentTime;
      const tone = (f, d, type = 'sine', vol = 0.08, f2 = null, delay = 0) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t + delay);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + delay + d);
        g.gain.setValueAtTime(vol, t + delay); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + d);
        o.connect(g); g.connect(ac.destination); o.start(t + delay); o.stop(t + delay + d + 0.02);
      };
      const noise = (d, vol = 0.08, freq = 1200) => {
        const b = ac.createBuffer(1, ac.sampleRate * d, ac.sampleRate), data = b.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const s = ac.createBufferSource(); s.buffer = b;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
        const g = ac.createGain(); g.gain.value = vol;
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start();
      };
      switch (name) {
        case 'hit': noise(0.12, 0.12, 900); tone(140, 0.1, 'square', 0.03, 80); break;
        case 'hurt': noise(0.1, 0.06, 400); break;
        case 'skill': tone(520, 0.18, 'triangle', 0.05, 900); noise(0.15, 0.03, 3000); break;
        case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.07, null, i * 0.12)); break;
        case 'quest': tone(660, 0.2, 'sine', 0.06); tone(880, 0.3, 'sine', 0.06, null, 0.12); break;
        case 'complete': [784, 988, 1175].forEach((f, i) => tone(f, 0.4, 'triangle', 0.06, null, i * 0.1)); break;
        case 'objective': tone(880, 0.25, 'sine', 0.05); break;
        case 'equip': noise(0.15, 0.08, 2500); break;
        case 'potion': tone(400, 0.25, 'sine', 0.06, 900); break;
        case 'coin': tone(1600, 0.08, 'square', 0.03); tone(2200, 0.1, 'square', 0.03, null, 0.06); break;
        case 'error': tone(200, 0.12, 'square', 0.03); break;
        case 'boss': tone(80, 1.2, 'sawtooth', 0.06, 40); break;
        case 'click': tone(900, 0.04, 'square', 0.02); break;
      }
    } catch (e) { /* без звука */ }
  }

  // ---------- Панель умений ----------
  buildSkillbar() {
    const P = this.game.player;
    const bar = this.touch ? $('touch-skills') : $('skillbar');
    bar.innerHTML = '';
    this.skillEls = [];
    // позиции кнопок умений дугой вокруг кнопки атаки (телефон)
    const arc = [];
    [180, 150, 120, 90].forEach(a => arc.push([a, 106]));
    [180, 158, 136, 114, 92].forEach(a => arc.push([a, 170]));
    P.skillBar().forEach((s, i) => {
      if (i === 6 && !this.touch) bar.appendChild(el('div', 'sep'));
      const d = el('div', 'sk');
      d.style.backgroundImage = `url(${skillIcon(s)})`;
      d.style.backgroundSize = 'cover';
      d.innerHTML = `<span class="key">${KEYS[i]}</span><span class="glyph">${s.icon}</span><div class="cd"></div><div class="cdt"></div>`;
      if (this.touch) {
        const [a, r] = arc[i] || [90, 240];
        const rad = a * Math.PI / 180;
        d.style.left = (Math.cos(rad) * r).toFixed(0) + 'px';
        d.style.top = (-Math.sin(rad) * r).toFixed(0) + 'px';
        d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.pressSkill(i); P.trySkill(i); });
      } else {
        d.addEventListener('click', () => P.trySkill(i));
        d.addEventListener('mouseenter', (e) => this.showSkillTip(s, e));
        d.addEventListener('mouseleave', () => this.hideTip());
      }
      bar.appendChild(d);
      this.skillEls.push({ d, s, cd: d.querySelector('.cd'), cdt: d.querySelector('.cdt') });
    });
    if (this.touch) {
      // зелья на телефоне — отдельные кнопки; показываем на них число и откат
      for (const kind of ['hp', 'mp']) {
        const d = $('t-' + kind);
        if (!d.querySelector('.cd')) d.insertAdjacentHTML('beforeend', '<div class="cd"></div><div class="cdt"></div><span class="cnt"></span>');
        this.skillEls.push({ d, potion: kind, cd: d.querySelector('.cd'), cdt: d.querySelector('.cdt'), cnt: d.querySelector('.cnt') });
      }
      return;
    }
    bar.appendChild(el('div', 'sep'));
    for (const [k, kind, ic] of [['Z', 'hp', '🧪'], ['X', 'mp', '💧']]) {
      const d = el('div', 'sk');
      d.style.background = kind === 'hp' ? 'radial-gradient(circle, #6a1a1a, #1a0808)' : 'radial-gradient(circle, #1a2a6a, #08081a)';
      d.innerHTML = `<span class="key">${k}</span><span class="glyph">${ic}</span><div class="cd"></div><div class="cdt"></div><span class="cnt"></span>`;
      d.addEventListener('click', () => P.usePotion(kind));
      bar.appendChild(d);
      this.skillEls.push({ d, potion: kind, cd: d.querySelector('.cd'), cdt: d.querySelector('.cdt'), cnt: d.querySelector('.cnt') });
    }
  }
  pressSkill(i) { const s = this.skillEls[i]; if (s) { s.d.classList.add('pressed'); setTimeout(() => s.d.classList.remove('pressed'), 100); } }

  // ---------- Обновление HUD ----------
  update(dt) {
    const g = this.game, P = g.player;
    const hpk = P.hp / P.maxHp;
    $('p-hp').style.width = (hpk * 100) + '%';
    $('p-hp-lag').style.width = (hpk * 100) + '%';
    $('p-hp-t').textContent = `${fmt(P.hp)} / ${fmt(P.maxHp)}` + (P.shield > 0 ? `  (+${fmt(P.shield)})` : '');
    $('p-res').style.width = (P.res / P.maxRes * 100) + '%';
    $('p-res').style.background = P.C.resource === 'Мана' ? '' : `linear-gradient(180deg, ${P.C.resColor}, ${P.C.resColor}88)`;
    $('p-res-t').textContent = `${P.C.resource}: ${fmt(P.res)} / ${fmt(P.maxRes)}`;
    $('p-lvl').textContent = P.level;
    $('lowhp').classList.toggle('hidden', !(hpk < 0.3 && P.alive));
    const need = xpNeeded(P.level);
    $('xp-fill').style.width = (P.level >= 100 ? 100 : P.xp / need * 100) + '%';
    $('xp-t').textContent = P.level >= 100 ? 'Максимальный уровень' : `Опыт: ${fmt(P.xp)} / ${fmt(need)}  (${(P.xp / need * 100).toFixed(1)}%)`;
    this.renderBuffs($('p-buffs'), P);
    // умения
    for (const s of this.skillEls) {
      let rem = 0, total = 1;
      if (s.potion) {
        rem = P.cooldowns.potion || 0; total = 8;
        const n = P.bag.reduce((a, b) => a + (b && b.type === 'potion' && b.kind === s.potion ? b.count : 0), 0);
        s.cnt.textContent = n || '';
      } else {
        rem = Math.max(P.cooldowns[s.s.id] || 0, P.gcd > 0 ? P.gcd : 0); total = rem === P.gcd && !(P.cooldowns[s.s.id] > 0) ? 0.5 : s.s.cd;
        s.d.classList.toggle('locked', s.s.lvl > P.level);
        s.d.classList.toggle('nores', P.res < P.skillCost(s.s) && s.s.lvl <= P.level);
      }
      if (rem > 0) {
        const pct = Math.min(1, rem / total) * 360;
        s.cd.style.background = `conic-gradient(rgba(0,0,0,0.7) ${pct}deg, transparent ${pct}deg)`;
        s.cdt.textContent = rem > 1.5 ? Math.ceil(rem) : '';
      } else if (s.cd.style.background) { s.cd.style.background = ''; s.cdt.textContent = ''; }
    }
    // цель
    this.updateTarget();
    // каст
    if (P.casting) {
      $('castbar').classList.remove('hidden');
      $('cast-fill').style.width = (P.casting.t / P.casting.dur * 100) + '%';
      $('cast-t').textContent = P.casting.skill.name;
    } else if (P.mountCast > 0 && this.castInfo) {
      $('castbar').classList.remove('hidden');
      $('cast-fill').style.width = ((1 - P.mountCast / this.castInfo.dur) * 100) + '%';
      $('cast-t').textContent = this.castInfo.name;
    } else $('castbar').classList.add('hidden');
    // босс
    if (this.boss) {
      const b = this.boss;
      $('b-hp').style.width = (b.hp / b.maxHp * 100) + '%';
      $('b-hp-lag').style.width = (b.hp / b.maxHp * 100) + '%';
      $('b-hp-t').textContent = `${fmt(b.hp)} / ${fmt(b.maxHp)}  (${(b.hp / b.maxHp * 100).toFixed(0)}%)`;
      if (this.bossCastT > 0) { this.bossCastT -= dt; if (this.bossCastT <= 0) $('b-cast').textContent = ''; }
    }
    // мини-карта
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.1; this.drawMinimap(); }
    this.updatePlates();
    this.updateFloaters(dt);
    if (this.windows.map && !this.windows.map.classList.contains('hidden')) { this.mapT = (this.mapT || 0) - dt; if (this.mapT <= 0) { this.mapT = 0.25; this.drawWorldMap(); } }
    if (this.errT > 0) { this.errT -= dt; if (this.errT <= 0) $('errmsg').textContent = ''; }
    if (this.touch) {
      this.talkT = (this.talkT || 0) - dt;
      if (this.talkT <= 0) { this.talkT = 0.25; $('t-talk').classList.toggle('hidden', !g.nearestInteractive(5)); }
    }
  }

  renderBuffs(container, ent) {
    const key = ent.buffs.map(b => b.id + Math.ceil(b.dur - b.t)).join(',') + (ent.stunT > 0 ? 's' : '') + (ent.rootT > 0 ? 'r' : '') + (ent.slowT > 0 ? 'w' : '');
    if (container.dataset.key === key) return;
    container.dataset.key = key;
    container.innerHTML = '';
    for (const b of ent.buffs) {
      if (b.dur > 999) continue;
      const d = el('div', 'buff', `${b.icon || (b.dot ? '☣' : b.mods && b.mods.vuln ? '☠' : '✦')}<span>${Math.ceil(b.dur - b.t)}</span>`);
      d.style.borderColor = b.color || (b.dot ? b.dot.color : '#888');
      container.appendChild(d);
    }
    if (ent.stunT > 0) container.appendChild(el('div', 'buff', '💫'));
    if (ent.rootT > 0) container.appendChild(el('div', 'buff', '❄'));
    if (ent.slowT > 0) container.appendChild(el('div', 'buff', '🐌'));
  }

  updateTarget() {
    const t = this.game.target;
    const f = $('hud-target');
    if (!t || (t.alive === false && t.team === 'enemy' && t.deathT > 3)) { f.classList.add('hidden'); return; }
    f.classList.remove('hidden');
    const P = this.game.player;
    if (t.team === 'enemy') {
      const diff = t.level - P.level;
      const col = diff >= 5 ? '#ff3a2a' : diff >= 3 ? '#ff8a2a' : diff >= -2 ? '#ffe04a' : diff >= -8 ? '#5aff5a' : '#9a9a9a';
      $('t-name').textContent = t.name;
      $('t-name').style.color = col;
      $('t-lvl').textContent = t.isBoss ? `Уровень ${t.level} · Босс` : t.elite ? `Уровень ${t.level} · Элита` : `Уровень ${t.level}`;
      f.classList.toggle('elite', t.isBoss || t.elite);
      $('t-hp').style.width = (t.hp / t.maxHp * 100) + '%';
      $('t-hp-lag').style.width = (t.hp / t.maxHp * 100) + '%';
      $('t-hp-t').textContent = t.alive ? `${fmt(t.hp)} / ${fmt(t.maxHp)}` : 'Мёртв';
      this.renderBuffs($('t-buffs'), t);
    } else {
      $('t-name').textContent = t.name;
      $('t-name').style.color = '#7affaa';
      $('t-lvl').textContent = t.title || (t.team === 'player' ? 'Союзник' : '');
      f.classList.remove('elite');
      const k = t.maxHp ? t.hp / t.maxHp : 1;
      $('t-hp').style.width = (k * 100) + '%'; $('t-hp-lag').style.width = (k * 100) + '%';
      $('t-hp-t').textContent = t.maxHp ? `${fmt(t.hp)} / ${fmt(t.maxHp)}` : '';
      $('t-buffs').innerHTML = '';
    }
  }

  // ---------- Таблички над головами ----------
  dirtyMarkers() { this.markersDirty = true; }
  updatePlates() {
    const g = this.game, cam = g.camera, P = g.player;
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    const show = (ent, key, build, y, maxD) => {
      const d = Math.hypot(ent.pos.x - P.pos.x, ent.pos.z - P.pos.z);
      if (d > maxD) return;
      this.tmpV.set(ent.pos.x, y, ent.pos.z).project(cam);
      if (this.tmpV.z > 1 || this.tmpV.z < -1) return;
      const x = (this.tmpV.x * 0.5 + 0.5) * W, yy = (-this.tmpV.y * 0.5 + 0.5) * H;
      if (x < -100 || x > W + 100 || yy < -100 || yy > H + 100) return;
      let p = this.plates.get(key);
      if (!p) { p = build(); $('labels').appendChild(p.el); this.plates.set(key, p); }
      seen.add(key);
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -100%)`;
      p.el.style.opacity = d > maxD * 0.8 ? ((maxD - d) / (maxD * 0.2)).toFixed(2) : '1';
      return p;
    };
    for (const m of g.mobs.active) {
      if (!m.alive || !m.model) continue;
      const near = m === g.target || m.state === 'chase' || m.hp < m.maxHp || m.isBoss;
      const p = show(m, 'm' + m.id, () => {
        const e = el('div', 'plate', `<div class="n"></div><div class="hb"><div></div></div>`);
        e.style.left = '0'; e.style.top = '0';
        return { el: e, n: e.querySelector('.n'), hb: e.querySelector('.hb div'), hbw: e.querySelector('.hb') };
      }, m.headY() + 0.35, near ? 60 : 30);
      if (p) {
        const diff = m.level - P.level;
        const col = diff >= 5 ? '#ff3a2a' : diff >= 3 ? '#ff8a2a' : diff >= -2 ? '#ffe04a' : diff >= -8 ? '#5aff5a' : '#9a9a9a';
        const txt = `${m.name} <span style="opacity:.8">[${m.level}]</span>`;
        if (p.txt !== txt) { p.n.innerHTML = txt; p.n.style.color = col; p.txt = txt; }
        p.hb.style.width = (m.hp / m.maxHp * 100) + '%';
        p.el.classList.toggle('sel', m === g.target);
      }
    }
    for (const a of g.allies.list) {
      if (!a.alive) continue;
      const p = show(a, 'a' + a.id, () => {
        const e = el('div', 'plate ally', `<div class="n" style="color:#7aff9a">${a.name}</div><div class="hb"><div></div></div>`);
        e.style.left = '0'; e.style.top = '0';
        return { el: e, hb: e.querySelector('.hb div') };
      }, a.pos.y + a.model.headTop() + 0.3, 40);
      if (p) p.hb.style.width = (a.hp / a.maxHp * 100) + '%';
    }
    for (const n of g.npcs) {
      if (n.role === 'citizen') continue;
      const isTp = n.isTeleport;
      const p = show(n, 'n' + (n.shopId || n.id) + (n.cityId || '') + (n.role === 'guard' ? n.pos.x.toFixed(0) : ''), () => {
        const e = el('div', 'plate', `<div class="mk"></div><div class="n"></div><div class="ttl"></div>`);
        e.style.left = '0'; e.style.top = '0';
        return { el: e, mk: e.querySelector('.mk'), n: e.querySelector('.n'), ttl: e.querySelector('.ttl') };
      }, isTp ? n.headY() : n.headY() + 0.3, n.role === 'guard' ? 20 : 45);
      if (p) {
        if (p.nm !== n.name) {
          p.n.textContent = n.name; p.nm = n.name;
          p.n.style.color = isTp ? '#80e0ff' : n.role === 'guard' ? '#8ab0ff' : n.role === 'secret' ? '#d8a0ff' : '#7affaa';
          p.ttl.textContent = n.title ? `<${n.title}>` : '';
        }
        if (this.markersDirty || p.mkT === undefined) {
          const mk = n.role === 'quest' || n.role === 'secret' || n.role === 'merchant' || n.role === 'smith' ? g.quests.markerFor(n.id) : null;
          p.mk.textContent = mk === 'available' ? '!' : mk === 'turnin' ? '?' : mk === 'active' ? '?' : '';
          p.mk.classList.toggle('grey', mk === 'active');
          p.mkT = 1;
        }
      }
    }
    this.markersDirty = false;
    for (const [k, p] of this.plates) if (!seen.has(k)) { p.el.remove(); this.plates.delete(k); }
  }

  // ---------- Всплывающий текст ----------
  floatText(pos, text, color = '#fff', crit = false, onPlayer = false, small = false) {
    const e = el('div', 'ft' + (crit ? ' crit' : '') + (small ? ' small' : ''), text);
    e.style.color = color;
    e.style.left = '0'; e.style.top = '0';
    $('floaters').appendChild(e);
    this.floaters.push({ e, p: pos.clone(), t: 0, life: crit ? 1.4 : 1.1, dx: (Math.random() - 0.5) * 60, crit });
    if (this.floaters.length > 60) { const f = this.floaters.shift(); f.e.remove(); }
  }
  updateFloaters(dt) {
    const cam = this.game.camera, W = window.innerWidth, H = window.innerHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) { f.e.remove(); this.floaters.splice(i, 1); continue; }
      this.tmpV.copy(f.p).project(cam);
      if (this.tmpV.z > 1) { f.e.style.opacity = 0; continue; }
      const k = f.t / f.life;
      const x = (this.tmpV.x * 0.5 + 0.5) * W + f.dx * k, y = (-this.tmpV.y * 0.5 + 0.5) * H - 70 * k - 20;
      const sc = f.crit ? (k < 0.15 ? 1.6 - k * 4 : 1) : 1;
      f.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(2)})`;
      f.e.style.opacity = k > 0.7 ? (1 - (k - 0.7) / 0.3).toFixed(2) : '1';
    }
  }

  // ---------- Сообщения ----------
  notify(text, color = '#ffd23a', big = false) {
    const d = el('div', big ? 'big' : '', text);
    d.style.color = color;
    $('notify').appendChild(d);
    setTimeout(() => d.remove(), 3600);
    this.log(text, color);
  }
  error(text) { $('errmsg').textContent = text; this.errT = 1.6; this.sound('error'); }
  log(html, color = '#e0d8c0') {
    const d = el('div', '', html);
    d.style.color = color;
    const L = $('hud-log');
    L.appendChild(d);
    while (L.children.length > 9) L.firstChild.remove();
  }
  loot(text, color) { this.log(text, color); if (color === '#ffd700') this.sound('coin'); }
  lootItem(it, reward = false) {
    const c = RARITY[it.rarity || 0].color;
    this.log(`${reward ? 'Награда' : 'Добыча'}: <span style="color:${c}">[${it.name}]</span>${it.count > 1 ? ' ×' + it.count : ''}`);
    if (it.rarity >= 3) this.notify(`${RARITY[it.rarity].name}: ${it.name}`, c, it.rarity >= 4);
    if (this.windows.bag && !this.windows.bag.classList.contains('hidden')) this.renderBag();
  }
  levelUp(l) {
    const d = el('div', 'lu', `Уровень ${l}!`);
    $('levelup').innerHTML = ''; $('levelup').appendChild(d);
    this.sound('levelup');
    this.log(`Вы достигли ${l} уровня!`, '#ffe08a');
    if (this.skillEls) this.buildSkillbar();
  }
  questProgress(q, text) { this.log(`${q.title}: ${text}`, '#ffe08a'); this.updateTracker(); }
  flashDamage() { const f = $('dmgflash'); f.style.opacity = '0.6'; clearTimeout(this.dfT); this.dfT = setTimeout(() => f.style.opacity = '0', 120); }
  bossEngage(b) {
    this.boss = b;
    $('hud-boss').classList.remove('hidden');
    $('b-name').textContent = b.name;
    $('b-title').textContent = `«${b.bossDef.title}» · Уровень ${b.level}`;
    this.sound('boss');
  }
  bossDisengage(b, dead) { if (this.boss === b) { this.boss = null; $('hud-boss').classList.add('hidden'); } void dead; }
  bossCast(b, name) { if (this.boss === b) { $('b-cast').textContent = `⚠ ${name}`; this.bossCastT = 2.5; } }

  updateTracker() {
    const q = this.game.quests;
    const box = $('trk');
    box.innerHTML = '';
    const ids = Object.keys(q.active);
    if (!ids.length) box.innerHTML = '<div class="trk"><div class="p" style="color:#a89e88">Нет активных заданий.<br>Ищите NPC со знаком <b style="color:#ffd23a">!</b></div></div>';
    for (const id of ids.slice(0, 6)) {
      const Q = questById(id);
      const done = q.isComplete(Q);
      box.appendChild(el('div', 'trk', `<div class="t">${Q.title} <small style="color:#a89e88">[${Q.lvl}]</small></div><div class="p ${done ? 'ok' : ''}">${done ? '✔ Сдать: ' + (NPCS[q.turnInNpc(Q)] ? NPCS[q.turnInNpc(Q)].name : (SECRET_SHOPS.find(s => 'shop:' + s.id === q.turnInNpc(Q)) || {}).npc) : '• ' + q.progressText(Q)}</div>`));
    }
    this.markersDirty = true;
  }

  // ---------- Мини-карта ----------
  drawMinimap() {
    const g = this.game, P = g.player;
    const c = $('minimap'), ctx = c.getContext('2d');
    const S = c.width, R = 110; // метров в радиусе
    const map = g.world.terrain.mapCanvas, MS = map.width;
    const k = MS / (WORLD_HALF * 2);
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 7); ctx.clip();
    const sx = (P.pos.x + WORLD_HALF - R) * k, sz = (P.pos.z + WORLD_HALF - R) * k;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map, sx, sz, R * 2 * k, R * 2 * k, 0, 0, S, S);
    const toS = (x, z) => [(x - P.pos.x + R) / (R * 2) * S, (z - P.pos.z + R) / (R * 2) * S];
    // цели заданий
    for (const id of Object.keys(g.quests.active)) {
      const Q = questById(id); if (g.quests.isComplete(Q)) continue;
      const gp = g.quests.goalPos(Q); if (!gp) continue;
      const [x, y] = toS(gp.x, gp.z);
      ctx.strokeStyle = 'rgba(255,210,58,0.8)'; ctx.fillStyle = 'rgba(255,210,58,0.15)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, Math.max(10, gp.r / (R * 2) * S), 0, 7); ctx.fill(); ctx.stroke();
    }
    for (const m of g.mobs.active) {
      if (!m.alive) continue;
      const [x, y] = toS(m.pos.x, m.pos.z);
      ctx.fillStyle = m.isBoss ? '#ff2a00' : m.state === 'chase' ? '#ff4a3a' : '#d04a3a';
      ctx.beginPath(); ctx.arc(x, y, m.isBoss ? 9 : 4.5, 0, 7); ctx.fill();
    }
    for (const a of g.allies.list) { if (!a.alive) continue; const [x, y] = toS(a.pos.x, a.pos.z); ctx.fillStyle = '#5aff7a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); }
    for (const n of g.npcs) {
      if (n.role === 'citizen' || n.role === 'guard') continue;
      const d = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z); if (d > R) continue;
      const [x, y] = toS(n.pos.x, n.pos.z);
      const mk = g.quests.markerFor(n.id);
      ctx.font = 'bold 26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (n.isTeleport) { ctx.fillStyle = '#80e0ff'; ctx.fillText('◈', x, y); }
      else if (mk === 'available' || mk === 'turnin') { ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText(mk === 'available' ? '!' : '?', x, y); ctx.fillText(mk === 'available' ? '!' : '?', x, y); }
      else { ctx.fillStyle = n.role === 'secret' ? '#d8a0ff' : '#ffe8a0'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
    }
    // конус обзора и игрок
    const yaw = g.cam.yaw;
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, S * 0.45, Math.atan2(Math.cos(yaw), Math.sin(yaw)) - 0.6, Math.atan2(Math.cos(yaw), Math.sin(yaw)) + 0.6); ctx.closePath(); ctx.fill();
    ctx.rotate(Math.atan2(Math.cos(P.yaw), Math.sin(P.yaw)));
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-9, 9); ctx.lineTo(-4, 0); ctx.lineTo(-9, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // север
    ctx.fillStyle = '#e8c46a'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'center'; ctx.fillText('С', S / 2, 22);
    $('zone-name').textContent = g.world.zoneName(P.pos.x, P.pos.z);
    const h = g.world.hours;
    $('zone-info').textContent = `${Math.round(P.pos.x)}, ${Math.round(-P.pos.z)} · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} ${g.world.isNight ? '☾' : '☀'}`;
  }

  // ---------- Окна ----------
  openWindow(id, title, opts = {}) {
    let w = this.windows[id];
    if (!w) {
      w = el('div', 'window');
      w.innerHTML = `<div class="wh"><h3></h3><button class="x">✕</button></div><div class="wb"></div>`;
      w.querySelector('.x').onclick = () => this.close(id);
      $('windows').appendChild(w);
      this.windows[id] = w;
      this.makeDraggable(w);
      const pos = opts.pos || { left: (window.innerWidth - (opts.width || 500)) / 2, top: 90 };
      w.style.left = pos.left + 'px'; w.style.top = pos.top + 'px';
    }
    if (this.touch || window.innerHeight < 600) {
      // на маленьком экране окно по центру и целиком в пределах экрана
      requestAnimationFrame(() => {
        const r = w.getBoundingClientRect();
        w.style.left = Math.max(6, Math.min(window.innerWidth - r.width - 6, (window.innerWidth - r.width) / 2)) + 'px';
        w.style.top = Math.max(4, Math.min(window.innerHeight - r.height - 4, 6)) + 'px';
      });
    }
    w.querySelector('h3').textContent = title;
    w.classList.remove('hidden');
    w.style.zIndex = 20 + (++this.z || (this.z = 1));
    this.sound('click');
    return w.querySelector('.wb');
  }
  close(id) { const w = this.windows[id]; if (w) w.classList.add('hidden'); this.hideTip(); if (id === 'shop') this.shopNpc = null; }
  isOpen(id) { const w = this.windows[id]; return w && !w.classList.contains('hidden'); }
  closeAll() { let any = false; for (const id in this.windows) if (this.isOpen(id)) { this.close(id); any = true; } return any; }
  toggle(id) {
    if (this.isOpen(id)) { this.close(id); return; }
    if (id === 'char') this.openChar();
    else if (id === 'bag') this.openBag();
    else if (id === 'quests') this.openQuests();
    else if (id === 'skills') this.openSkills();
    else if (id === 'map') this.openMap();
    else if (id === 'help') this.openHelp();
  }
  makeDraggable(w) {
    const h = w.querySelector('.wh');
    let sx, sy, ox, oy, drag = false;
    h.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('x')) return; drag = true; sx = e.clientX; sy = e.clientY; ox = w.offsetLeft; oy = w.offsetTop; w.style.zIndex = 20 + (++this.z); e.stopPropagation(); });
    window.addEventListener('pointermove', (e) => { if (!drag) return; w.style.left = (ox + e.clientX - sx) + 'px'; w.style.top = Math.max(0, oy + e.clientY - sy) + 'px'; });
    window.addEventListener('pointerup', () => { drag = false; });
    w.addEventListener('mousedown', (e) => e.stopPropagation());
    w.addEventListener('contextmenu', (e) => e.preventDefault());
    w.addEventListener('wheel', (e) => e.stopPropagation());
  }

  // ---------- Подсказки ----------
  showTip(html, e) {
    const t = $('tooltip');
    t.innerHTML = html;
    t.classList.remove('hidden');
    const r = t.getBoundingClientRect();
    let x = e.clientX + 18, y = e.clientY + 12;
    if (x + r.width > window.innerWidth) x = e.clientX - r.width - 12;
    if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 6;
    t.style.left = Math.max(4, x) + 'px'; t.style.top = Math.max(4, y) + 'px';
  }
  hideTip() { $('tooltip').classList.add('hidden'); }
  itemTip(it, ctx = '') {
    const P = this.game.player;
    const c = RARITY[it.rarity || 0].color;
    let h = `<div class="tn" style="color:${c}">${it.name}</div>`;
    if (it.type === 'gear') {
      const typeName = it.slot === 'weapon' ? it.name.split(' ').slice(1).join(' ') : SLOT_NAMES[it.slot];
      const kindName = it.kind === 'heavy' ? 'Латы' : it.kind === 'leather' ? 'Кожа' : it.kind === 'cloth' ? 'Ткань' : '';
      h += `<div class="tt">${RARITY[it.rarity].name} · ${SLOT_NAMES[it.slot] || typeName}${kindName ? ' · ' + kindName : ''}${it.unique ? ' · <span style="color:#ff9a1a">Уникальный</span>' : ''}</div>`;
      const st = it.stats;
      if (st.dmg) h += `<div class="st" style="font-size:15px"><b>${st.dmg}</b> урона</div>`;
      if (st.armor) h += `<div class="st"><b>${st.armor}</b> брони</div>`;
      for (const k of ['str', 'agi', 'int', 'sta']) if (st[k]) h += `<div class="st g">+${st[k]} ${STAT_NAMES[k]}</div>`;
      if (st.crit) h += `<div class="st g">+${st.crit}% ${STAT_NAMES.crit}</div>`;
      h += `<div class="tt" style="margin-top:6px">Уровень предмета: ${it.ilvl}</div>`;
      if (it.cls) h += `<div class="req ${it.cls !== P.cls ? 'bad' : ''}">Класс: ${CLASSES[it.cls].name}</div>`;
      h += `<div class="req ${it.req > P.level ? 'bad' : ''}">Требуется уровень: ${it.req}</div>`;
      // сравнение
      const slot = it.slot === 'ring' ? 'ring1' : it.slot;
      const cur = P.equipment[slot];
      if (cur && cur !== it && ctx !== 'equipped') {
        h += `<div class="cmp">По сравнению с надетым:`;
        const keys = ['dmg', 'armor', 'str', 'agi', 'int', 'sta', 'crit'];
        for (const k of keys) {
          const d = (it.stats[k] || 0) - (cur.stats[k] || 0);
          if (Math.abs(d) > 0.01) h += `<div class="st ${d > 0 ? 'g' : 'r'}">${d > 0 ? '▲ +' : '▼ '}${Math.round(d * 10) / 10} ${STAT_NAMES[k]}</div>`;
        }
        h += `</div>`;
      }
    } else if (it.type === 'potion') {
      h += `<div class="tt">Зелье · Расходуемое</div><div class="st g">Восстанавливает ${fmt(it.amount)} ${it.kind === 'hp' ? 'здоровья' : 'маны/ресурса'}</div>`;
      h += `<div class="req ${it.req > P.level ? 'bad' : ''}">Требуется уровень: ${it.req}</div>`;
    } else if (it.type === 'quest') h += `<div class="tt" style="color:#ffd23a">Предмет задания</div>`;
    else h += `<div class="tt">Хлам — можно продать торговцу</div>`;
    if (ctx === 'shop') h += `<div class="hint">Цена: <span class="gold">${fmt(it.price)} з.</span> · ЛКМ — купить</div>`;
    else if (it.sell) h += `<div class="hint">Цена продажи: <span class="gold">${fmt(it.sell * (it.count || 1))} з.</span></div>`;
    if (ctx === 'bag') h += `<div class="hint">${this.touch ? 'Касание' : 'ЛКМ'} — ${it.type === 'gear' ? 'надеть' : it.type === 'potion' ? 'использовать' : '—'}${this.shopNpc ? (this.touch ? ' · долгое нажатие — продать' : ' · ПКМ — продать') : ''}</div>`;
    if (ctx === 'equipped') h += `<div class="hint">ЛКМ — снять</div>`;
    return h;
  }
  showSkillTip(s, e) {
    const P = this.game.player;
    let h = `<div class="tn" style="color:${s.color}">${s.icon} ${s.name}</div><div class="tt">${s.branch ? 'Путь: ' + P.C.branches[s.branch].name + ' · ' : ''}Уровень ${s.lvl}</div>`;
    h += `<div class="st">${s.desc}</div>`;
    const ap = P.ap;
    if (s.dmg) h += `<div class="st g">Урон: ~${fmt(ap * s.dmg)}${s.waves ? ' (за всё время)' : ''}</div>`;
    if (s.heal) h += `<div class="st g">Лечение: ${Math.round(s.heal * 100)}% здоровья</div>`;
    h += `<div class="tt" style="margin-top:6px">Затраты: ${P.skillCost(s)} ${P.C.resource.toLowerCase()} · Восст.: ${s.cd} сек${s.cast ? ' · Подготовка: ' + s.cast + ' сек' : ''}${s.range ? ' · Дальность: ' + s.range + ' м' : ''}</div>`;
    if (s.lvl > P.level) h += `<div class="req bad">Откроется на ${s.lvl} уровне</div>`;
    this.showTip(h, e);
  }
  slotEl(it, ctx, onClick, onRight, placeholder = '') {
    const s = el('div', 'slot' + (it ? ' r' + (it.rarity || 0) : ''));
    if (it) {
      const img = new Image(); img.src = itemIcon(it); img.draggable = false; s.appendChild(img);
      if (it.count > 1) s.appendChild(el('span', 'cnt', it.count));
      if (it.type === 'gear' && this.game.player.canEquip(it) && ctx === 'bag') s.classList.add('unusable');
      s.addEventListener('mouseenter', (e) => this.showTip(this.itemTip(it, ctx), e));
      s.addEventListener('mousemove', (e) => this.showTip(this.itemTip(it, ctx), e));
      s.addEventListener('mouseleave', () => this.hideTip());
    } else if (placeholder) s.appendChild(el('div', 'ph', placeholder));
    let longFired = false, lp = null;
    if (this.touch && it) {
      // долгое нажатие = ПКМ (например, продать)
      s.addEventListener('touchstart', () => { longFired = false; clearTimeout(lp); lp = setTimeout(() => { longFired = true; this.hideTip(); this.tipKey = null; (onRight || onClick) && (onRight || onClick)(); }, 550); }, { passive: true });
      for (const ev of ['touchend', 'touchmove', 'touchcancel']) s.addEventListener(ev, () => clearTimeout(lp), { passive: true });
    }
    s.addEventListener('click', () => {
      if (longFired) { longFired = false; return; }
      if (this.touch && it && !this.previewTap(s, it.id + ctx, () => this.itemTip(it, ctx))) return;
      this.hideTip(); onClick && onClick();
    });
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.touch) return; this.hideTip(); (onRight || onClick) && (onRight || onClick)(); });
    return s;
  }
  // На телефоне первое касание показывает подсказку, второе — выполняет действие
  previewTap(elm, key, htmlFn) {
    if (this.tipKey === key) { this.tipKey = null; return true; }
    this.tipKey = key;
    const r = elm.getBoundingClientRect();
    this.showTip(htmlFn() + '<div class="hint">Нажмите ещё раз, чтобы применить</div>', { clientX: r.right, clientY: r.top });
    return false;
  }

  // Персонаж
  openChar() {
    const b = this.openWindow('char', 'Персонаж', { pos: { left: 30, top: 110 }, width: 560 });
    this.renderChar(b);
  }
  renderChar(b = this.windows.char && this.windows.char.querySelector('.wb')) {
    if (!b) return;
    const P = this.game.player;
    b.innerHTML = '';
    const wrap = el('div', 'char-wrap');
    const col1 = el('div', 'eq-col'), col2 = el('div', 'eq-col');
    const order1 = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet'], order2 = ['weapon', 'offhand', 'amulet', 'ring1', 'ring2'];
    for (const [col, order] of [[col1, order1], [col2, order2]]) {
      for (const s of order) {
        const row = el('div', 'eq-row');
        row.appendChild(this.slotEl(P.equipment[s], 'equipped', () => { P.unequip(s); this.renderChar(); this.renderBag(); }, null, SLOT_NAMES[s]));
        row.appendChild(el('div', 'lbl', SLOT_NAMES[s]));
        col.appendChild(row);
      }
    }
    const st = P.stats;
    const br = P.branch ? P.C.branches[P.branch] : null;
    const stats = el('div', 'stats', `
      <div style="font-family:var(--head);font-size:24px;color:var(--gold)">${P.playerName}</div>
      <div style="color:var(--muted);margin-bottom:6px">${P.C.name} ${P.level} уровня${br ? ` · <span style="color:${br.color}">${br.name}</span>` : ''}</div>
      <h4>Характеристики</h4>
      <div class="row"><span>Сила</span><b>${Math.round(st.str)}</b></div>
      <div class="row"><span>Ловкость</span><b>${Math.round(st.agi)}</b></div>
      <div class="row"><span>Интеллект</span><b>${Math.round(st.int)}</b></div>
      <div class="row"><span>Выносливость</span><b>${Math.round(st.sta)}</b></div>
      <h4>Бой</h4>
      <div class="row"><span>Здоровье</span><b>${fmt(P.maxHp)}</b></div>
      <div class="row"><span>${P.C.resource}</span><b>${fmt(P.maxRes)}</b></div>
      <div class="row"><span>Сила атаки</span><b>${fmt(P.ap)}</b></div>
      <div class="row"><span>Броня</span><b>${fmt(P.armor)}</b></div>
      <div class="row"><span>Крит. шанс</span><b>${(P.critChance * 100).toFixed(1)}%</b></div>
      <div class="row"><span>Крит. урон</span><b>${Math.round(P.critDmg * 100)}%</b></div>
      <div class="row"><span>Скорость атаки</span><b>${P.atkInterval.toFixed(2)} с</b></div>
      <div class="row" style="margin-top:8px"><span>Золото</span><b class="gold">${fmt(P.gold)}</b></div>`);
    wrap.append(col1, col2, stats);
    b.appendChild(wrap);
  }

  // Сумка
  openBag() {
    const b = this.openWindow('bag', 'Сумка', { pos: { left: window.innerWidth - 470, top: 300 }, width: 450 });
    this.renderBag(b);
  }
  renderBag(b = this.windows.bag && this.windows.bag.querySelector('.wb')) {
    if (!b || !this.isOpen('bag')) return;
    const P = this.game.player;
    b.innerHTML = '';
    const grid = el('div', 'grid-bag');
    P.bag.forEach((it, i) => {
      grid.appendChild(this.slotEl(it, 'bag', () => {
        if (!it) return;
        P.useBagItem(i);
        this.renderBag(); this.renderChar();
      }, () => {
        if (!it) return;
        if (this.shopNpc) this.sellItem(i);
        else { P.useBagItem(i); this.renderBag(); this.renderChar(); }
      }));
    });
    b.appendChild(grid);
    const foot = el('div', '', `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span>Золото: <span class="gold">${fmt(P.gold)}</span></span><span style="color:var(--muted);font-size:12px">${P.bag.filter(Boolean).length}/${P.bag.length}</span></div>`);
    if (this.shopNpc) {
      const btn = el('button', 'btn small', 'Продать весь хлам');
      btn.onclick = () => { P.bag.forEach((it, i) => { if (it && it.type === 'junk') this.sellItem(i, true); }); this.renderBag(); };
      foot.appendChild(btn);
    }
    b.appendChild(foot);
  }
  sellItem(i, quiet = false) {
    const P = this.game.player;
    const it = P.bag[i];
    if (!it) return;
    if (it.type === 'quest') { this.error('Предмет задания нельзя продать'); return; }
    const price = (it.sell || 1) * (it.count || 1);
    P.gold += price;
    P.bag[i] = null;
    if (!quiet) { this.log(`Продано: ${it.name} за ${fmt(price)} з.`, '#ffd700'); this.renderBag(); }
    this.sound('coin');
  }

  // Задания
  openQuests(sel = null) {
    const b = this.openWindow('quests', 'Журнал заданий', { width: 640 });
    const q = this.game.quests;
    const ids = Object.keys(q.active);
    b.innerHTML = '';
    const wrap = el('div', 'q-list');
    const left = el('div', 'q-left'), right = el('div', 'q-right');
    sel = sel || ids[0];
    for (const id of ids) {
      const Q = questById(id);
      const it = el('div', 'q-item' + (id === sel ? ' sel' : ''), `${q.isComplete(Q) ? '✔ ' : ''}${Q.title} <small>[${Q.lvl}]</small>`);
      it.onclick = () => this.openQuests(id);
      left.appendChild(it);
    }
    if (!ids.length) left.innerHTML = '<div style="color:var(--muted)">Нет заданий</div>';
    left.appendChild(el('div', '', `<div style="margin-top:14px;color:var(--muted);font-size:12px">Выполнено: ${q.done.size} / ${QUESTS.length}</div>`));
    if (sel && q.active[sel]) {
      const Q = questById(sel);
      right.innerHTML = `<h4>${Q.title}</h4><div>${Q.text}</div><div class="q-goal">${q.isComplete(Q) ? '<span style="color:var(--green)">✔ Цель выполнена — вернитесь к заказчику</span>' : q.progressText(Q)}</div>`;
      const ab = el('button', 'btn small danger', 'Отказаться');
      ab.onclick = () => { q.abandon(sel); this.openQuests(); };
      right.appendChild(ab);
    }
    wrap.append(left, right);
    b.appendChild(wrap);
  }

  // Умения
  openSkills() {
    const b = this.openWindow('skills', 'Умения', { width: 600 });
    const P = this.game.player;
    b.innerHTML = '';
    const list = el('div', 'skills-list');
    const addRow = (s, i) => {
      const r = el('div', 'sk-row');
      const ic = el('div', 'sk' + (s.lvl > P.level || (s.branch && s.branch !== P.branch) ? ' locked' : ''));
      ic.style.backgroundImage = `url(${skillIcon(s)})`; ic.style.backgroundSize = 'cover';
      ic.innerHTML = `<span class="key">${i != null ? KEYS[i] : ''}</span><span class="glyph">${s.icon}</span>`;
      r.appendChild(ic);
      r.appendChild(el('div', 'd', `<b style="color:${s.color}">${s.name}</b> <small>Уровень ${s.lvl} · ${P.skillCost(s)} ${P.C.resource.toLowerCase()} · ${s.cd} сек</small>${s.desc}`));
      list.appendChild(r);
    };
    P.C.skills.filter(s => !s.branch).forEach((s, i) => addRow(s, i));
    list.appendChild(el('div', '', `<div style="font-family:var(--head);font-size:22px;color:var(--gold);margin-top:8px">Пути развития (с ${BRANCH_LEVEL} уровня)</div>`));
    for (const [bid, B] of Object.entries(P.C.branches)) {
      list.appendChild(el('div', '', `<div style="margin-top:6px"><b style="font-family:var(--head);font-size:20px;color:${B.color}">${B.name}</b>${P.branch === bid ? ' <span style="color:var(--green)">— избран</span>' : ''}<div style="color:var(--muted);font-size:13px">${B.desc}</div></div>`));
      P.C.skills.filter(s => s.branch === bid).forEach((s, k) => addRow(s, P.branch === bid ? 6 + k : null));
    }
    if (!P.branch && P.level >= BRANCH_LEVEL) {
      const btn = el('button', 'btn', 'Избрать путь');
      btn.onclick = () => this.openBranch();
      list.appendChild(btn);
    }
    b.appendChild(list);
  }
  openBranch() {
    const P = this.game.player;
    if (P.branch) return;
    const b = this.openWindow('branch', `${P.C.name}: выбор пути`, { width: 720, pos: { left: (window.innerWidth - 720) / 2, top: 120 } });
    b.innerHTML = `<div style="margin-bottom:12px;font-size:15px">Вы достигли ${BRANCH_LEVEL} уровня. Пришло время избрать свой путь. <b style="color:#ff8a6a">Выбор окончателен.</b></div>`;
    const wrap = el('div', 'branch-pick');
    for (const [bid, B] of Object.entries(P.C.branches)) {
      const sk = P.C.skills.filter(s => s.branch === bid).map(s => `<div style="margin-top:4px">${s.icon} <b style="color:${s.color}">${s.name}</b> <small style="color:var(--muted)">(${s.lvl} ур.)</small> — <span style="font-size:13px">${s.desc}</span></div>`).join('');
      const o = el('div', 'branch-opt', `<h4 style="color:${B.color}">${B.name}</h4><p>${B.desc}</p>${sk}`);
      o.onclick = () => { P.setBranch(bid); this.close('branch'); this.buildSkillbar(); if (this.isOpen('skills')) this.openSkills(); };
      wrap.appendChild(o);
    }
    b.appendChild(wrap);
  }

  // Карта мира
  openMap() {
    const b = this.openWindow('map', 'Карта мира', { width: 760, pos: { left: (window.innerWidth - 760) / 2, top: 40 } });
    if (!b.querySelector('canvas')) {
      const c = el('canvas'); c.id = 'map-canvas';
      const sz = Math.max(200, Math.min(720, window.innerHeight - (this.touch ? 80 : 170), window.innerWidth - 40));
      c.width = c.height = 1024; c.style.width = c.style.height = sz + 'px';
      b.appendChild(c);
      b.appendChild(el('div', 'map-legend', '<span>⬤ <span style="color:#e8c46a">Город</span></span><span>☠ Босс</span><span>◆ <span style="color:#d8a0ff">Тайная лавка</span></span><span>◯ <span style="color:#ffd23a">Цель задания</span></span><span>Подписи — монстры и их уровни</span>'));
    }
    this.drawWorldMap();
  }
  drawWorldMap() {
    const c = $('map-canvas'); if (!c) return;
    const g = this.game, ctx = c.getContext('2d'), S = c.width;
    const k = S / (WORLD_HALF * 2);
    const toS = (x, z) => [(x + WORLD_HALF) * k, (z + WORLD_HALF) * k];
    ctx.drawImage(g.world.terrain.mapCanvas, 0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, S, S);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // зоны монстров
    ctx.font = '600 15px "PT Sans", sans-serif';
    for (const sp of SPAWNS) {
      const [x, y] = toS(sp.x, sp.z);
      ctx.strokeStyle = 'rgba(200,60,40,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(x, y, sp.r * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      const txt = `${MOB_TYPES[sp.type].name} ${sp.lvl[0]}–${sp.lvl[1]}`;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(txt, x, y);
      const P = g.player;
      ctx.fillStyle = sp.lvl[0] > P.level + 4 ? '#ff7a6a' : sp.lvl[1] < P.level - 8 ? '#aaa' : '#ffe8a0';
      ctx.fillText(txt, x, y);
    }
    // дороги уже на текстуре; локации
    ctx.font = 'italic 14px "PT Sans", sans-serif';
    for (const p of POIS) { const [x, y] = toS(p.x, p.z); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(p.name, x, y + 16); ctx.fillStyle = '#e0e0ff'; ctx.fillText(p.name, x, y + 16); }
    // цели заданий
    for (const id of Object.keys(g.quests.active)) {
      const Q = questById(id); const gp = g.quests.isComplete(Q) ? null : g.quests.goalPos(Q); if (!gp) continue;
      const [x, y] = toS(gp.x, gp.z);
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(255,210,58,0.18)';
      ctx.beginPath(); ctx.arc(x, y, Math.max(12, gp.r * k), 0, 7); ctx.fill(); ctx.stroke();
    }
    // боссы
    ctx.font = 'bold 26px serif';
    for (const b of BOSSES) {
      const [x, y] = toS(b.x, b.z);
      const m = g.mobs.bossById(b.id);
      ctx.fillStyle = m && m.alive ? '#ff4a2a' : '#777';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText('☠', x, y); ctx.fillText('☠', x, y);
      ctx.font = 'bold 14px "PT Sans", sans-serif'; ctx.lineWidth = 3;
      ctx.strokeText(`${b.name} [${b.lvl}]`, x, y + 22); ctx.fillStyle = '#ffb08a'; ctx.fillText(`${b.name} [${b.lvl}]`, x, y + 22);
      ctx.font = 'bold 26px serif';
    }
    // тайные лавки
    for (const s of SECRET_SHOPS) {
      if (!g.discovered.shops.includes(s.id)) continue;
      const [x, y] = toS(s.x, s.z);
      ctx.font = 'bold 22px serif'; ctx.fillStyle = '#d8a0ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText('◆', x, y); ctx.fillText('◆', x, y);
      ctx.font = 'bold 13px "PT Sans", sans-serif'; ctx.lineWidth = 3; ctx.strokeText(s.name, x, y - 18); ctx.fillText(s.name, x, y - 18);
    }
    // города
    for (const ct of CITIES) {
      const [x, y] = toS(ct.x, ct.z);
      ctx.font = 'bold 30px "Cormorant Garamond", serif';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.strokeText(ct.name, x, y - ct.r * k - 18);
      ctx.fillStyle = '#ffe08a'; ctx.fillText(ct.name, x, y - ct.r * k - 18);
      ctx.font = 'bold 15px "PT Sans", sans-serif'; ctx.lineWidth = 3;
      ctx.strokeText(`Ур. ${ct.minLvl}–${ct.maxLvl}`, x, y + ct.r * k + 14); ctx.fillStyle = '#fff'; ctx.fillText(`Ур. ${ct.minLvl}–${ct.maxLvl}`, x, y + ct.r * k + 14);
    }
    // игрок
    const P = g.player;
    const [px, py] = toS(P.pos.x, P.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(Math.cos(P.yaw), Math.sin(P.yaw)));
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, 10); ctx.lineTo(-5, 0); ctx.lineTo(-10, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#e8c46a'; ctx.font = 'bold 28px serif'; ctx.fillText('С ↑', S - 40, 30);
  }

  // Меню и справка
  openHelp() {
    const b = this.openWindow('help', 'Меню', { width: 560 });
    const g = this.game;
    const touchHelp = `<div class="help-grid">
      <kbd>Левая часть экрана</kbd><span>Джойстик — движение (появляется под пальцем)</span>
      <kbd>Свайп справа</kbd><span>Поворот камеры; два пальца — приближение</span>
      <kbd>Касание врага</kbd><span>Выбрать цель, повторное касание — атаковать</span>
      <kbd>Касание NPC</kbd><span>Поговорить (или кнопка 💬 рядом с ним)</span>
      <kbd>⚔</kbd><span>Атака: ближайший враг или выбранная цель</span>
      <kbd>Кнопки по дуге</kbd><span>Умения: внутренняя дуга — 1–4, внешняя — 5–9 (7–9 — умения пути)</span>
      <kbd>⤒ · ⟳ · 🧪 · 💧 · 🐎</kbd><span>Прыжок · следующая цель · зелья · призвать скакуна</span>
      <kbd>Предметы</kbd><span>Касание — описание, повторное — надеть/купить, долгое — продать</span>
    </div>`;
    b.innerHTML = this.touch ? touchHelp : '';
    b.innerHTML += `<div class="help-grid" ${this.touch ? 'style="display:none"' : ''}>
      <kbd>W A S D</kbd><span>Движение (Q / E — шаг в сторону)</span>
      <kbd>Мышь (ЛКМ/ПКМ зажать)</kbd><span>Вращение камеры; обе кнопки — бег вперёд</span>
      <kbd>Колесо</kbd><span>Приближение камеры</span>
      <kbd>Пробел</kbd><span>Прыжок</span>
      <kbd>ЛКМ по цели</kbd><span>Выбрать цель · <b>ПКМ</b> — атаковать / говорить</span>
      <kbd>Tab</kbd><span>Ближайший враг</span>
      <kbd>1 – 9</kbd><span>Умения (1–6 основные, 7–9 — путь развития)</span>
      <kbd>Z / X</kbd><span>Зелье здоровья / маны</span>
      <kbd>F</kbd><span>Говорить с NPC, телепорт</span>
      <kbd>G</kbd><span>Призвать скакуна / спешиться</span>
      <kbd>C · B · L · K · M</kbd><span>Персонаж · Сумка · Задания · Умения · Карта</span>
      <kbd>Esc</kbd><span>Закрыть окна / меню</span>
    </div>
    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn small" id="h-save">💾 Сохранить</button>
      <button class="btn small" id="h-q">Графика: ${g.quality >= 1 ? 'Высокая' : 'Средняя'}</button>
      <button class="btn small" id="h-snd">Звук: ${this.muted ? 'выкл' : 'вкл'}</button>
      <button class="btn small danger" id="h-del">Удалить героя</button>
    </div>
    <div style="margin-top:12px;color:var(--muted);font-size:13px">Прогресс сохраняется автоматически в браузере. Время в игре: ${String(Math.floor(g.world.hours)).padStart(2, '0')}:${String(Math.floor((g.world.hours % 1) * 60)).padStart(2, '0')}</div>`;
    $('h-save').onclick = () => { g.save(); this.notify('Игра сохранена', '#7aff7a'); };
    $('h-q').onclick = () => { g.setQuality(g.quality >= 1 ? 0.6 : 1); this.openHelp(); };
    $('h-snd').onclick = () => { this.muted = !this.muted; this.openHelp(); };
    $('h-del').onclick = () => {
      const b = $('h-del');
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Точно удалить? Нажмите ещё раз'; return; }
      g.saveKey = 'deleted'; try { localStorage.removeItem('three_crowns_save_v1'); } catch (e) { /* */ }
      location.reload();
    };
  }

  // ---------- Диалоги с NPC ----------
  openDialog(npc) {
    const g = this.game, P = g.player, q = g.quests;
    if (npc.isTeleport) return this.openTeleport(npc);
    npc.talk && npc.talk();
    const b = this.openWindow('dialog', npc.name, { width: 520, pos: { left: 40, top: 120 } });
    b.parentElement.classList.add('dlg');
    b.innerHTML = '';
    if (npc.title) b.appendChild(el('div', 'npc-title', `<${npc.title}>`));
    // задания «поговорить», завершаемые этим NPC
    const talkDone = q.onTalk(npc.id);
    if (talkDone.length) {
      const Q = talkDone[0];
      return this.showQuestComplete(npc, Q);
    }
    let greet = npc.def ? npc.def.greet : npc.greet;
    if (npc.role === 'guard') greet = ['Порядок в городе — наша забота.', 'Будь осторожен за воротами, путник.', 'Ночью из леса слышен вой… не к добру.', 'Без нужды оружие не обнажай.'][Math.floor(Math.random() * 4)];
    b.appendChild(el('div', 'say', greet || '...'));
    const opts = el('div');
    for (const Q of q.activeFrom(npc.id)) {
      if (Q.type === 'talk') continue;
      const done = q.isComplete(Q);
      const o = el('div', 'opt', `<span class="ic" style="color:${done ? '#ffd23a' : '#999'}">?</span>${Q.title} ${done ? '' : '<small style="color:var(--muted)">(не выполнено)</small>'}`);
      o.onclick = () => done ? this.showQuestComplete(npc, Q) : this.showQuestInfo(npc, Q, true);
      opts.appendChild(o);
    }
    for (const Q of q.availableFrom(npc.id)) {
      const o = el('div', 'opt', `<span class="ic" style="color:#ffd23a">!</span>${Q.title} <small style="color:var(--muted)">[${Q.lvl}]</small>`);
      o.onclick = () => this.showQuestInfo(npc, Q, false);
      opts.appendChild(o);
    }
    if (npc.role === 'merchant' || npc.role === 'smith' || npc.role === 'secret') {
      const o = el('div', 'opt', `<span class="ic" style="color:#ffd700">⚖</span>${npc.role === 'merchant' ? 'Покажи свои товары' : npc.role === 'smith' ? 'Хочу посмотреть оружие и доспехи' : 'Покажи свои сокровища'}`);
      o.onclick = () => { this.close('dialog'); this.openShop(npc); };
      opts.appendChild(o);
    }
    const bye = el('div', 'opt', `<span class="ic" style="color:#999">✕</span>Прощай`);
    bye.onclick = () => this.close('dialog');
    opts.appendChild(bye);
    b.appendChild(opts);
  }
  rewardText(Q) {
    const rw = Q.reward || {};
    const xp = Math.round(xpNeeded(Math.max(1, Math.min(Q.lvl, this.game.player.level))) * 0.42 * (rw.xpMul || 1));
    const gold = Math.round(15 + Math.pow(Q.lvl, 1.6) * 1.4);
    let t = `Награда: <span style="color:#c890ff">${fmt(xp)} опыта</span>, <span class="gold">${fmt(gold)} з.</span>`;
    if (rw.item) t += `, <span style="color:${RARITY[rw.item].color}">${RARITY[rw.item].name.toLowerCase()} предмет</span>`;
    return t;
  }
  showQuestInfo(npc, Q, active) {
    const b = this.windows.dialog.querySelector('.wb');
    b.innerHTML = `<div style="font-family:var(--head);font-size:24px;color:var(--gold)">${Q.title}</div><div class="say">${Q.text}</div>`;
    if (active) b.appendChild(el('div', 'q-goal', this.game.quests.progressText(Q)));
    b.appendChild(el('div', 'reward', this.rewardText(Q)));
    const btns = el('div', 'btns');
    if (!active) {
      const a = el('button', 'btn small', 'Принять');
      a.onclick = () => { this.game.quests.accept(Q.id); this.openDialog(npc); };
      btns.appendChild(a);
    }
    const back = el('button', 'btn small', 'Назад');
    back.onclick = () => this.openDialog(npc);
    btns.appendChild(back);
    b.appendChild(btns);
  }
  showQuestComplete(npc, Q) {
    const b = this.windows.dialog.querySelector('.wb');
    b.innerHTML = `<div style="font-family:var(--head);font-size:24px;color:var(--gold)">${Q.title}</div><div class="say">${Q.done}</div>`;
    b.appendChild(el('div', 'reward', this.rewardText(Q)));
    const btns = el('div', 'btns');
    const a = el('button', 'btn small', 'Завершить задание');
    a.onclick = () => { if (this.game.quests.turnIn(Q.id)) this.openDialog(npc); };
    btns.appendChild(a);
    b.appendChild(btns);
  }

  openTeleport(npc) {
    const g = this.game, P = g.player;
    const b = this.openWindow('dialog', 'Камень телепортации', { width: 420, pos: { left: 40, top: 120 } });
    b.innerHTML = '<div class="say">Древние руны мерцают голубым светом. Куда отправиться?</div>';
    const list = el('div', 'tp-list');
    for (const c of CITIES) {
      if (c.id === npc.cityId) continue;
      const known = g.discovered.cities.includes(c.id);
      const cost = Math.round(5 + P.level * 2);
      const o = el('div', 'opt', `<span>${known ? c.name : '??? (не открыт)'} <small style="color:var(--muted)">ур. ${c.minLvl}–${c.maxLvl}</small></span><span class="gold">${known ? cost + ' з.' : ''}</span>`);
      if (known) o.onclick = () => {
        if (P.gold < cost) { this.error('Недостаточно золота'); return; }
        P.gold -= cost; this.close('dialog'); g.teleportTo(c.id);
      };
      else o.style.opacity = 0.5;
      list.appendChild(o);
    }
    b.appendChild(list);
  }

  // ---------- Магазины ----------
  openShop(npc) {
    const g = this.game, P = g.player;
    this.shopNpc = npc;
    const stock = g.shopStock(npc);
    const b = this.openWindow('shop', npc.title || npc.name, { width: 420, pos: { left: 40, top: 100 } });
    b.innerHTML = '';
    if (npc.role === 'secret') b.appendChild(el('div', 'say', npc.greet || ''));
    const list = el('div', 'shop-list');
    stock.forEach((it, i) => {
      const can = P.gold >= it.price;
      const row = el('div', 'shop-item' + (can ? '' : ' cant'));
      const img = new Image(); img.src = itemIcon(it); img.style.width = '42px'; img.style.height = '42px'; img.style.borderRadius = '6px'; img.style.border = `1px solid ${RARITY[it.rarity].color}`;
      row.appendChild(img);
      const sub = it.type === 'gear' ? `${SLOT_NAMES[it.slot]} · ур. ${it.req}${it.cls && it.cls !== P.cls ? ' · не ваш класс' : ''}` : `Требуется ур. ${it.req}`;
      row.appendChild(el('div', 'info', `<span style="color:${RARITY[it.rarity].color}">${it.name}</span><small>${sub}</small>`));
      row.appendChild(el('div', 'price', fmt(it.price) + ' з.'));
      row.addEventListener('mouseenter', (e) => this.showTip(this.itemTip(it, 'shop'), e));
      row.addEventListener('mousemove', (e) => this.showTip(this.itemTip(it, 'shop'), e));
      row.addEventListener('mouseleave', () => this.hideTip());
      row.onclick = () => {
        if (this.touch && !this.previewTap(row, 'shop' + it.id, () => this.itemTip(it, 'shop'))) return;
        this.hideTip();
        if (P.gold < it.price) { this.error('Недостаточно золота'); return; }
        const copy = it.type === 'potion' ? Object.assign({}, it, { id: it.id + Math.random(), count: 1 }) : it;
        if (!P.addItem(copy)) { this.error('Сумка переполнена'); return; }
        P.gold -= it.price;
        if (it.type !== 'potion') stock.splice(i, 1);
        this.log(`Куплено: <span style="color:${RARITY[it.rarity].color}">${it.name}</span>`, '#ffd700');
        this.sound('coin');
        this.openShop(npc);
        this.renderBag();
      };
      list.appendChild(row);
    });
    b.appendChild(list);
    b.appendChild(el('div', '', `<div style="margin-top:10px;color:var(--muted);font-size:13px">${this.touch ? 'Долгое нажатие на предмет в сумке' : 'ПКМ по предмету в сумке'} — продать. Ваше золото: <span class="gold">${fmt(P.gold)}</span></div>`));
    if (!this.isOpen('bag')) this.openBag(); else this.renderBag();
  }
}
