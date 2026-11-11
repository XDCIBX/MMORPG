// Рисованные иконки предметов (canvas → dataURL).
import { RARITY } from '../data/items.js';

const cache = new Map();
const S = 64;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * k))); g = Math.max(0, Math.min(255, Math.round(g * k))); b = Math.max(0, Math.min(255, Math.round(b * k)));
  return `rgb(${r},${g},${b})`;
}
function metalGrad(ctx, x0, y0, x1, y1, c) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(c, 1.5)); g.addColorStop(0.45, shade(c, 1.05)); g.addColorStop(0.55, shade(c, 0.75)); g.addColorStop(1, shade(c, 1.2));
  return g;
}
function gem(ctx, x, y, r, c) {
  if (!c) return;
  ctx.save();
  ctx.shadowColor = c; ctx.shadowBlur = 10;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c); g.addColorStop(1, shade(c, 0.4));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.restore();
}
function outline(ctx) { ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.5; ctx.stroke(); }

const DRAW = {
  sword(ctx, v, big) {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-Math.PI / 4);
    const L = big ? 30 : 25, w = big ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(-w / 2, 8); ctx.lineTo(-w / 2, -L + 6); ctx.lineTo(0, -L); ctx.lineTo(w / 2, -L + 6); ctx.lineTo(w / 2, 8); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, -w, 0, w, 0, v.c1 || '#c8ccd2'); ctx.fill(); outline(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-0.8, -L + 8, 1.6, L - 4);
    ctx.fillStyle = metalGrad(ctx, 0, 6, 0, 12, v.trim || '#b08a3a'); ctx.beginPath(); ctx.roundRect(-12, 8, 24, 4, 2); ctx.fill(); outline(ctx);
    ctx.fillStyle = '#3a2416'; ctx.fillRect(-2, 12, 4, big ? 14 : 10); outline(ctx);
    gem(ctx, 0, big ? 28 : 24, 3.5, v.trim || '#b08a3a');
    gem(ctx, 0, 10, 2.5, v.gem);
    ctx.restore();
  },
  axe(ctx, v) {
    ctx.save(); ctx.translate(32, 34); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(-2.5, -26, 5, 50); outline(ctx);
    ctx.beginPath(); ctx.moveTo(2, -22); ctx.quadraticCurveTo(18, -28, 20, -12); ctx.quadraticCurveTo(18, 2, 2, -4); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 0, -26, 20, 0, v.c1 || '#c8ccd2'); ctx.fill(); outline(ctx);
    if (v.tier >= 3) { ctx.beginPath(); ctx.moveTo(-2, -22); ctx.quadraticCurveTo(-18, -28, -20, -12); ctx.quadraticCurveTo(-18, 2, -2, -4); ctx.closePath(); ctx.fill(); outline(ctx); }
    gem(ctx, 0, -13, 3, v.gem);
    ctx.restore();
  },
  hammer(ctx, v) {
    ctx.save(); ctx.translate(32, 34); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(-2.5, -20, 5, 46); outline(ctx);
    ctx.fillStyle = metalGrad(ctx, -16, -30, 16, -14, v.c1 || '#a0a4a8'); ctx.beginPath(); ctx.roundRect(-16, -30, 32, 16, 3); ctx.fill(); outline(ctx);
    ctx.fillStyle = metalGrad(ctx, 0, -30, 0, -14, v.trim || '#b08a3a'); ctx.fillRect(-17, -31, 4, 18); ctx.fillRect(13, -31, 4, 18);
    gem(ctx, 0, -22, 3.5, v.gem);
    ctx.restore();
  },
  bow(ctx, v) {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = v.tier >= 5 ? shade(v.c1, 1.2) : (v.c1 || '#6a4428'); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, -27); ctx.quadraticCurveTo(14, 0, -4, 27); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, -27); ctx.lineTo(-4, 27); ctx.stroke();
    ctx.fillStyle = '#3a2416'; ctx.fillRect(2, -5, 6, 10);
    gem(ctx, 5, 0, 3, v.gem);
    ctx.restore();
  },
  staff(ctx, v, small) {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-Math.PI / 4);
    const L = small ? 20 : 28;
    ctx.fillStyle = v.c1 || '#5a3b22'; ctx.fillRect(-2.5, -L + 8, 5, L * 2 - 8); outline(ctx);
    ctx.strokeStyle = v.trim || '#b08a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -L + 4, 7, Math.PI * 0.1, Math.PI * 0.9, true); ctx.stroke();
    ctx.save(); ctx.shadowColor = v.gem || '#66aaff'; ctx.shadowBlur = 18; gem(ctx, 0, -L + 2, small ? 5 : 7, v.gem || '#66aaff'); ctx.restore();
    ctx.restore();
  },
  scythe(ctx, v) {
    ctx.save(); ctx.translate(30, 34); ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = '#2a1e18'; ctx.fillRect(-2, -28, 4, 56); outline(ctx);
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.quadraticCurveTo(22, -30, 26, -10); ctx.quadraticCurveTo(16, -22, 0, -20); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 0, -30, 26, -10, v.c1 || '#a8a090'); ctx.fill(); outline(ctx);
    gem(ctx, 0, -24, 3, v.gem);
    ctx.restore();
  },
  bonestaff(ctx, v) {
    ctx.save(); ctx.translate(32, 32); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#d8cfb4'; ctx.fillRect(-2.5, -18, 5, 46); outline(ctx);
    ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(0, -22, 9, 0, 7); ctx.fill(); outline(ctx);
    ctx.fillRect(-5, -16, 10, 6);
    gem(ctx, -3.5, -22, 2.4, v.gem || '#55ff88'); gem(ctx, 3.5, -22, 2.4, v.gem || '#55ff88');
    ctx.restore();
  },
  shield(ctx, v) {
    ctx.beginPath();
    if (v.style === 1) { ctx.moveTo(32, 58); ctx.quadraticCurveTo(52, 40, 50, 12); ctx.lineTo(14, 12); ctx.quadraticCurveTo(12, 40, 32, 58); }
    else ctx.arc(32, 33, 23, 0, 7);
    ctx.fillStyle = metalGrad(ctx, 10, 10, 54, 56, v.c1 || '#8a8a8a'); ctx.fill(); outline(ctx);
    ctx.save(); ctx.clip();
    ctx.fillStyle = v.c2 || '#8a1c1c'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); if (v.style === 1) { ctx.moveTo(32, 50); ctx.quadraticCurveTo(45, 38, 44, 17); ctx.lineTo(20, 17); ctx.quadraticCurveTo(19, 38, 32, 50); } else ctx.arc(32, 33, 16, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = v.trim || '#c9a640'; ctx.lineWidth = 3; ctx.stroke();
    gem(ctx, 32, 32, 4.5, v.gem || v.trim);
  },
  quiver(ctx, v) {
    ctx.save(); ctx.translate(32, 34); ctx.rotate(0.35);
    for (let i = -2; i <= 2; i++) { ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(i * 3, -10); ctx.lineTo(i * 3, -26); ctx.stroke(); ctx.fillStyle = v.gem || '#c03030'; ctx.fillRect(i * 3 - 2, -28, 4, 6); }
    ctx.fillStyle = v.c1 || '#5a3a22'; ctx.beginPath(); ctx.roundRect(-9, -12, 18, 36, 4); ctx.fill(); outline(ctx);
    ctx.fillStyle = v.trim || '#b08a3a'; ctx.fillRect(-9, -12, 18, 3); ctx.fillRect(-9, 16, 18, 3);
    ctx.restore();
  },
  orb(ctx, v) {
    ctx.save(); ctx.shadowColor = v.gem || '#66aaff'; ctx.shadowBlur = 20; gem(ctx, 32, 32, 14, v.gem || '#66aaff'); ctx.restore();
    ctx.strokeStyle = v.trim || '#c9a640'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(32, 32, 22, 8, -0.4, 0, 7); ctx.stroke();
  },
  skull(ctx, v) {
    ctx.fillStyle = '#e6dcc0'; ctx.beginPath(); ctx.arc(32, 28, 15, 0, 7); ctx.fill(); outline(ctx);
    ctx.fillRect(24, 36, 16, 10); outline(ctx);
    ctx.fillStyle = '#111'; for (let i = 0; i < 4; i++) ctx.fillRect(25 + i * 4, 40, 2, 6);
    gem(ctx, 26, 28, 4, v.gem || '#55ff88'); gem(ctx, 38, 28, 4, v.gem || '#55ff88');
  },
  head(ctx, v) {
    const c = v.c1 || '#888';
    if (v.kind === 'cloth' && v.style === 0) {
      ctx.beginPath(); ctx.ellipse(32, 46, 26, 7, 0, 0, 7); ctx.fillStyle = c; ctx.fill(); outline(ctx);
      ctx.beginPath(); ctx.moveTo(18, 45); ctx.quadraticCurveTo(30, 20, 30, 8); ctx.quadraticCurveTo(40, 14, 46, 45); ctx.closePath(); ctx.fillStyle = metalGrad(ctx, 18, 0, 46, 0, c); ctx.fill(); outline(ctx);
      ctx.fillStyle = v.c2 || '#c8a040'; ctx.fillRect(19, 38, 26, 5);
      gem(ctx, 32, 40, 3, v.gem);
    } else if (v.kind !== 'heavy') {
      ctx.beginPath(); ctx.moveTo(12, 54); ctx.quadraticCurveTo(10, 10, 32, 8); ctx.quadraticCurveTo(54, 10, 52, 54); ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, 12, 0, 52, 0, c); ctx.fill(); outline(ctx);
      ctx.fillStyle = '#0a0806'; ctx.beginPath(); ctx.ellipse(32, 36, 12, 15, 0, 0, 7); ctx.fill();
      if (v.gem && v.kind === 'cloth') { gem(ctx, 28, 34, 2, v.gem); gem(ctx, 36, 34, 2, v.gem); }
    } else {
      ctx.beginPath(); ctx.arc(32, 34, 20, Math.PI, 0); ctx.lineTo(52, 50); ctx.lineTo(40, 52); ctx.lineTo(40, 40); ctx.lineTo(24, 40); ctx.lineTo(24, 52); ctx.lineTo(12, 50); ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, 12, 14, 52, 50, c); ctx.fill(); outline(ctx);
      ctx.fillStyle = v.trim || '#b08a3a'; ctx.fillRect(30, 14, 4, 30);
      if (v.style === 2 || v.tier >= 4) {
        ctx.fillStyle = '#e9dcc0';
        ctx.beginPath(); ctx.moveTo(13, 30); ctx.quadraticCurveTo(2, 22, 6, 6); ctx.quadraticCurveTo(10, 20, 18, 24); ctx.fill(); outline(ctx);
        ctx.beginPath(); ctx.moveTo(51, 30); ctx.quadraticCurveTo(62, 22, 58, 6); ctx.quadraticCurveTo(54, 20, 46, 24); ctx.fill(); outline(ctx);
      }
      gem(ctx, 32, 22, 3, v.gem);
    }
  },
  shoulders(ctx, v) {
    const c = v.c1 || '#888';
    for (const x of [18, 46]) {
      ctx.beginPath(); ctx.ellipse(x, 34, 15, 12, 0, Math.PI, 0); ctx.lineTo(x + 15, 40); ctx.lineTo(x - 15, 40); ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, x - 15, 22, x + 15, 40, c); ctx.fill(); outline(ctx);
      ctx.fillStyle = v.trim || v.c2 || '#b08a3a'; ctx.fillRect(x - 15, 38, 30, 3);
      if (v.tier >= 3 && v.kind === 'heavy') { ctx.fillStyle = shade(c, 1.4); ctx.beginPath(); ctx.moveTo(x - 3, 23); ctx.lineTo(x, 10); ctx.lineTo(x + 3, 23); ctx.fill(); }
    }
    gem(ctx, 32, 34, 3, v.gem);
  },
  chest(ctx, v) {
    const c = v.c1 || '#888';
    ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(24, 10); ctx.quadraticCurveTo(32, 18, 40, 10); ctx.lineTo(50, 14); ctx.lineTo(48, 34); ctx.lineTo(44, 56); ctx.lineTo(20, 56); ctx.lineTo(16, 34); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 14, 10, 50, 56, c); ctx.fill(); outline(ctx);
    if (v.kind === 'cloth') { ctx.fillStyle = v.c2 || '#c8a040'; ctx.fillRect(30, 18, 4, 38); ctx.fillRect(18, 38, 28, 3); }
    else { ctx.fillStyle = v.kind === 'heavy' ? (v.trim || '#b08a3a') : (v.c2 || '#3a2a1a'); ctx.fillRect(18, 40, 28, 4); ctx.fillRect(31, 14, 2, 26); }
    gem(ctx, 32, 26, 3.5, v.gem);
  },
  hands(ctx, v) {
    const c = v.c1 || '#888';
    ctx.beginPath(); ctx.moveTo(20, 58); ctx.lineTo(20, 34); ctx.lineTo(16, 24); ctx.lineTo(20, 20); ctx.lineTo(26, 28); ctx.lineTo(26, 10); ctx.lineTo(31, 10); ctx.lineTo(32, 26); ctx.lineTo(34, 8); ctx.lineTo(39, 9); ctx.lineTo(38, 26); ctx.lineTo(42, 12); ctx.lineTo(46, 14); ctx.lineTo(44, 34); ctx.lineTo(44, 58); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 16, 8, 46, 58, c); ctx.fill(); outline(ctx);
    ctx.fillStyle = v.trim || v.c2 || '#6a5030'; ctx.fillRect(19, 44, 26, 4);
  },
  legs(ctx, v) {
    const c = v.c1 || '#888';
    ctx.beginPath(); ctx.moveTo(16, 8); ctx.lineTo(48, 8); ctx.lineTo(50, 58); ctx.lineTo(36, 58); ctx.lineTo(32, 24); ctx.lineTo(28, 58); ctx.lineTo(14, 58); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 14, 8, 50, 58, c); ctx.fill(); outline(ctx);
    ctx.fillStyle = v.trim || v.c2 || '#3a2a1a'; ctx.fillRect(16, 8, 32, 5);
    if (v.kind === 'heavy') { ctx.fillStyle = shade(c, 1.4); ctx.beginPath(); ctx.arc(21, 36, 4, 0, 7); ctx.arc(43, 36, 4, 0, 7); ctx.fill(); }
  },
  feet(ctx, v) {
    const c = v.c1 || '#888';
    ctx.beginPath(); ctx.moveTo(22, 8); ctx.lineTo(38, 8); ctx.lineTo(38, 40); ctx.lineTo(54, 46); ctx.lineTo(54, 56); ctx.lineTo(18, 56); ctx.lineTo(20, 40); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 18, 8, 54, 56, c); ctx.fill(); outline(ctx);
    ctx.fillStyle = v.trim || v.c2 || '#3a2a1a'; ctx.fillRect(21, 10, 18, 4); ctx.fillRect(18, 52, 36, 4);
  },
  ring(ctx, v, item) {
    ctx.strokeStyle = metalGrad(ctx, 14, 20, 50, 50, item.ilvl > 40 ? '#e0c060' : '#b0b0b8'); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(32, 38, 15, 13, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    gem(ctx, 32, 24, 7, RARITY[item.rarity].color);
  },
  amulet(ctx, v, item) {
    ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 8); ctx.quadraticCurveTo(32, 36, 50, 8); ctx.stroke();
    ctx.fillStyle = metalGrad(ctx, 20, 30, 44, 56, '#d0a840'); ctx.beginPath(); ctx.moveTo(32, 28); ctx.lineTo(44, 40); ctx.lineTo(32, 58); ctx.lineTo(20, 40); ctx.closePath(); ctx.fill(); outline(ctx);
    gem(ctx, 32, 42, 6, RARITY[item.rarity].color);
  },
  potion(ctx, v, item) {
    ctx.fillStyle = '#8a6a40'; ctx.fillRect(27, 6, 10, 8);
    ctx.beginPath(); ctx.moveTo(28, 14); ctx.lineTo(36, 14); ctx.lineTo(36, 24); ctx.quadraticCurveTo(52, 30, 50, 44); ctx.quadraticCurveTo(48, 58, 32, 58); ctx.quadraticCurveTo(16, 58, 14, 44); ctx.quadraticCurveTo(12, 30, 28, 24); ctx.closePath();
    ctx.fillStyle = 'rgba(200,220,255,0.25)'; ctx.fill(); outline(ctx);
    ctx.save(); ctx.clip();
    const lv = 30 + (item.key ? (4 - +item.key.slice(2)) * 3 : 0);
    const g = ctx.createLinearGradient(0, lv, 0, 58); g.addColorStop(0, shade(item.color || '#e03030', 1.3)); g.addColorStop(1, shade(item.color || '#e03030', 0.5));
    ctx.fillStyle = g; ctx.fillRect(10, lv, 44, 30);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(24, 38, 3, 7, 0.3, 0, 7); ctx.fill();
  },
  quest(ctx) {
    ctx.fillStyle = '#d8c8a0'; ctx.beginPath(); ctx.roundRect(14, 14, 36, 38, 4); ctx.fill(); outline(ctx);
    ctx.fillStyle = '#b8a070'; ctx.beginPath(); ctx.ellipse(14, 33, 5, 19, 0, 0, 7); ctx.ellipse(50, 33, 5, 19, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 1.5; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(20, 22 + i * 6); ctx.lineTo(44, 22 + i * 6); ctx.stroke(); }
    ctx.fillStyle = '#ffd23a'; ctx.font = 'bold 18px serif'; ctx.fillText('!', 48, 16);
  },
  junk(ctx) {
    ctx.fillStyle = '#7a6a58'; ctx.beginPath(); ctx.moveTo(18, 40); ctx.lineTo(28, 20); ctx.lineTo(44, 22); ctx.lineTo(48, 42); ctx.lineTo(34, 50); ctx.closePath(); ctx.fill(); outline(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(28, 24); ctx.lineTo(40, 26); ctx.lineTo(32, 34); ctx.fill();
  },
};

export function itemIcon(item) {
  const v = item.vis || {};
  const key = [item.type, item.slot, item.wtype, item.otype, v.c1, v.c2, v.trim, v.gem, v.kind, v.style, v.tier, item.rarity, item.key].join('|');
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rc = RARITY[item.rarity || 0].color;
  const bg = ctx.createRadialGradient(32, 28, 4, 32, 32, 46);
  bg.addColorStop(0, shade(rc, 0.32)); bg.addColorStop(1, '#07060a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  if (item.type === 'potion') DRAW.potion(ctx, v, item);
  else if (item.type === 'quest') DRAW.quest(ctx);
  else if (item.type === 'junk') DRAW.junk(ctx);
  else if (item.slot === 'weapon') {
    const t = item.wtype;
    if (t === 'sword' || t === 'greatsword') DRAW.sword(ctx, v, t === 'greatsword');
    else if (t === 'staff' || t === 'wand') DRAW.staff(ctx, v, t === 'wand');
    else if (t === 'longbow') DRAW.bow(ctx, v);
    else DRAW[t](ctx, v);
  } else if (item.slot === 'offhand') DRAW[item.otype](ctx, v);
  else if (item.slot === 'ring' || item.slot === 'amulet') DRAW[item.slot](ctx, v, item);
  else if (DRAW[item.slot]) DRAW[item.slot](ctx, v);
  // рамка редкости
  ctx.strokeStyle = rc; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2); ctx.globalAlpha = 1;
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function skillIcon(skill, size = 64) {
  const key = 'sk_' + skill.id + size;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.4, size * 0.35, 2, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, shade(skill.color, 1.1)); g.addColorStop(0.5, shade(skill.color, 0.45)); g.addColorStop(1, '#050408');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  // узор
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(size / 2, size / 2, size * (0.15 + i * 0.07), 0, 7); ctx.stroke(); }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
