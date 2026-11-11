// Расчёт урона и лечения.
import { clamp } from '../core/util.js';

export class Combat {
  constructor(game) { this.game = game; }

  // amount — «сырой» урон (до брони). opts: {noCrit, dot, color, skill, crit:bool, critBonus, pure}
  dealDamage(src, tgt, amount, opts = {}) {
    if (!tgt || !tgt.alive) return 0;
    const g = this.game;
    let dmg = amount;
    let crit = false;
    if (src && src.alive !== undefined) {
      dmg *= src.mod ? src.mod('dmgMul') : 1;
      if (src.mod && src.mod('weak') !== 1) dmg *= src.mod('weak');
      if (!opts.noCrit && !opts.dot) {
        const cc = (src.critChance || 0.05) + (opts.critBonus || 0);
        if (Math.random() < cc) { crit = true; dmg *= src.critDmg || 1.6; }
      }
      // разница уровней
      const d = (tgt.level || 1) - (src.level || 1);
      if (d > 0) dmg *= Math.max(0.45, 1 - d * 0.045);
      else dmg *= 1 + Math.min(10, -d) * 0.02;
    }
    if (!opts.pure) {
      const armor = (tgt.armor || 0) * (tgt.mod ? tgt.mod('armorMul') : 1);
      const lvl = src ? src.level || 1 : 1;
      const dr = clamp(armor / (armor + 60 + 18 * lvl), 0, 0.75);
      dmg *= 1 - dr;
    }
    dmg *= tgt.mod ? tgt.mod('dmgTaken') : 1;
    dmg *= tgt.mod ? tgt.mod('vuln') : 1;
    dmg *= 0.92 + Math.random() * 0.16;
    dmg = Math.max(1, Math.round(dmg));
    // щит
    let absorbed = 0;
    if (tgt.shield > 0) {
      absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
    }
    tgt.hp -= dmg;
    tgt.lastHitT = g.time;
    tgt.hitFlash = 0.15;
    // всплывающий текст
    const isPlayerSrc = src === g.player || (src && src.owner === g.player);
    const isPlayerTgt = tgt === g.player;
    if (isPlayerSrc || isPlayerTgt || tgt.owner === g.player) {
      const p = tgt.center();
      let color = opts.color || (isPlayerTgt ? '#ff4a4a' : crit ? '#ffd23a' : '#ffffff');
      if (tgt.owner === g.player) color = '#ff9a6a';
      if (absorbed && !dmg) g.ui.floatText(p, 'Поглощено', '#9ad0ff', false);
      else g.ui.floatText(p, (crit ? '' : '') + dmg + (crit ? '!' : ''), color, crit, isPlayerTgt);
    }
    // угроза
    if (tgt.onDamaged) tgt.onDamaged(src, dmg);
    // вампиризм
    if (src && src.alive && src.mod) {
      const ls = (src.mod('lifesteal', 0) || 0) + (opts.lifesteal || 0) + (src.lifestealBase || 0);
      if (ls > 0) this.heal(src, dmg * ls, src, true);
    }
    if (tgt.hp <= 0) {
      tgt.hp = 0;
      tgt.alive = false;
      if (tgt.onDeath) tgt.onDeath(src);
    }
    return dmg;
  }

  heal(tgt, amount, src = null, quiet = false) {
    if (!tgt || !tgt.alive) return 0;
    const mul = src && src.healMul ? src.healMul : 1;
    const h = Math.round(Math.min(tgt.maxHp - tgt.hp, amount * mul));
    if (h <= 0) return 0;
    tgt.hp += h;
    if (!quiet || h > tgt.maxHp * 0.05) {
      if (tgt === this.game.player || tgt.owner === this.game.player) this.game.ui.floatText(tgt.center(), '+' + h, '#5aff7a', false);
    }
    return h;
  }

  // Все враги в радиусе от точки
  enemiesInRadius(team, x, z, r) {
    const out = [];
    const list = team === 'player' ? this.game.mobs.active : this.game.friendlies();
    for (const e of list) if (e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) <= r + e.radius) out.push(e);
    return out;
  }
  enemiesInLine(team, from, dir, len, width) {
    const out = [];
    const list = team === 'player' ? this.game.mobs.active : this.game.friendlies();
    for (const e of list) {
      if (!e.alive) continue;
      const dx = e.pos.x - from.x, dz = e.pos.z - from.z;
      const t = dx * dir.x + dz * dir.z;
      if (t < 0 || t > len) continue;
      const perp = Math.abs(dx * dir.z - dz * dir.x);
      if (perp <= width / 2 + e.radius) out.push(e);
    }
    return out;
  }
}
