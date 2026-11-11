// Генерация предметов: оружие, доспехи, украшения, зелья. Названия, характеристики, визуал.
import { CLASSES } from './classes.js';
import { clamp, pick } from '../core/util.js';

export const RARITY = [
  { name: 'Обычный', color: '#d8d8d8', mul: 1.0 },
  { name: 'Необычный', color: '#3ddc5a', mul: 1.25 },
  { name: 'Редкий', color: '#3a8cff', mul: 1.55 },
  { name: 'Эпический', color: '#b450ff', mul: 1.9 },
  { name: 'Легендарный', color: '#ff9a1a', mul: 2.4 },
];

export const SLOTS = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'weapon', 'offhand', 'ring1', 'ring2', 'amulet'];
export const SLOT_NAMES = {
  head: 'Голова', shoulders: 'Плечи', chest: 'Грудь', hands: 'Руки', legs: 'Ноги', feet: 'Ступни',
  weapon: 'Оружие', offhand: 'Левая рука', ring1: 'Кольцо', ring2: 'Кольцо', amulet: 'Амулет', ring: 'Кольцо',
};
export const ARMOR_SLOTS = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet'];
export const STAT_NAMES = { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', sta: 'Выносливость', crit: 'Крит. удар', armor: 'Броня', dmg: 'Урон' };

// Прилагательные по тирам: [муж, жен, ср, мн]
const A = (m, f, n, p) => [m, f, n, p];
const ADJ = {
  heavy: [A('Железный', 'Железная', 'Железное', 'Железные'), A('Стальной', 'Стальная', 'Стальное', 'Стальные'), A('Закалённый', 'Закалённая', 'Закалённое', 'Закалённые'), A('Мифриловый', 'Мифриловая', 'Мифриловое', 'Мифриловые'), A('Адамантовый', 'Адамантовая', 'Адамантовое', 'Адамантовые'), A('Рунный', 'Рунная', 'Рунное', 'Рунные'), A('Драконий', 'Драконья', 'Драконье', 'Драконьи'), A('Небесный', 'Небесная', 'Небесное', 'Небесные')],
  leather: [A('Кожаный', 'Кожаная', 'Кожаное', 'Кожаные'), A('Дублёный', 'Дублёная', 'Дублёное', 'Дублёные'), A('Укреплённый', 'Укреплённая', 'Укреплённое', 'Укреплённые'), A('Рейнджерский', 'Рейнджерская', 'Рейнджерское', 'Рейнджерские'), A('Теневой', 'Теневая', 'Теневое', 'Теневые'), A('Эльфийский', 'Эльфийская', 'Эльфийское', 'Эльфийские'), A('Драконий', 'Драконья', 'Драконье', 'Драконьи'), A('Звёздный', 'Звёздная', 'Звёздное', 'Звёздные')],
  cloth: [A('Льняной', 'Льняная', 'Льняное', 'Льняные'), A('Шерстяной', 'Шерстяная', 'Шерстяное', 'Шерстяные'), A('Шёлковый', 'Шёлковая', 'Шёлковое', 'Шёлковые'), A('Зачарованный', 'Зачарованная', 'Зачарованное', 'Зачарованные'), A('Лунный', 'Лунная', 'Лунное', 'Лунные'), A('Астральный', 'Астральная', 'Астральное', 'Астральные'), A('Пламенный', 'Пламенная', 'Пламенное', 'Пламенные'), A('Небесный', 'Небесная', 'Небесное', 'Небесные')],
  wood: [A('Ясеневый', 'Ясеневая', 'Ясеневое', 'Ясеневые'), A('Тисовый', 'Тисовая', 'Тисовое', 'Тисовые'), A('Резной', 'Резная', 'Резное', 'Резные'), A('Зачарованный', 'Зачарованная', 'Зачарованное', 'Зачарованные'), A('Лунный', 'Лунная', 'Лунное', 'Лунные'), A('Эльфийский', 'Эльфийская', 'Эльфийское', 'Эльфийские'), A('Драконий', 'Драконья', 'Драконье', 'Драконьи'), A('Небесный', 'Небесная', 'Небесное', 'Небесные')],
  dark: [A('Гнилой', 'Гнилая', 'Гнилое', 'Гнилые'), A('Мрачный', 'Мрачная', 'Мрачное', 'Мрачные'), A('Зловещий', 'Зловещая', 'Зловещее', 'Зловещие'), A('Проклятый', 'Проклятая', 'Проклятое', 'Проклятые'), A('Могильный', 'Могильная', 'Могильное', 'Могильные'), A('Чумной', 'Чумная', 'Чумное', 'Чумные'), A('Кровавый', 'Кровавая', 'Кровавое', 'Кровавые'), A('Вечный', 'Вечная', 'Вечное', 'Вечные')],
  jewel: [A('Медный', 'Медная', 'Медное', 'Медные'), A('Серебряный', 'Серебряная', 'Серебряное', 'Серебряные'), A('Золотой', 'Золотая', 'Золотое', 'Золотые'), A('Самоцветный', 'Самоцветная', 'Самоцветное', 'Самоцветные'), A('Мифриловый', 'Мифриловая', 'Мифриловое', 'Мифриловые'), A('Рунный', 'Рунная', 'Рунное', 'Рунные'), A('Драконий', 'Драконья', 'Драконье', 'Драконьи'), A('Звёздный', 'Звёздная', 'Звёздное', 'Звёздные')],
};
const G = { m: 0, f: 1, n: 2, p: 3 };

const NOUNS = {
  heavy: { head: ['шлем', 'm'], shoulders: ['наплечники', 'p'], chest: ['кираса', 'f'], hands: ['латные рукавицы', 'p'], legs: ['поножи', 'p'], feet: ['сабатоны', 'p'] },
  leather: { head: ['капюшон', 'm'], shoulders: ['наплечье', 'n'], chest: ['куртка', 'f'], hands: ['перчатки', 'p'], legs: ['штаны', 'p'], feet: ['сапоги', 'p'] },
  cloth: { head: ['шляпа', 'f'], shoulders: ['пелерина', 'f'], chest: ['мантия', 'f'], hands: ['обмотки', 'p'], legs: ['штаны', 'p'], feet: ['туфли', 'p'] },
};
const WEAPONS = {
  sword: { noun: 'меч', g: 'm', adj: 'heavy', mul: 1.0, speed: 1.0 },
  greatsword: { noun: 'двуручный меч', g: 'm', adj: 'heavy', mul: 1.22, speed: 0.9 },
  axe: { noun: 'топор', g: 'm', adj: 'heavy', mul: 1.05, speed: 1.0 },
  hammer: { noun: 'молот', g: 'm', adj: 'heavy', mul: 1.1, speed: 0.95 },
  bow: { noun: 'лук', g: 'm', adj: 'wood', mul: 1.0, speed: 1.0 },
  longbow: { noun: 'длинный лук', g: 'm', adj: 'wood', mul: 1.18, speed: 0.9 },
  staff: { noun: 'посох', g: 'm', adj: 'wood', mul: 1.15, speed: 1.0 },
  wand: { noun: 'жезл', g: 'm', adj: 'wood', mul: 0.95, speed: 1.1 },
  scythe: { noun: 'коса', g: 'f', adj: 'dark', mul: 1.2, speed: 0.92 },
  bonestaff: { noun: 'костяной посох', g: 'm', adj: 'dark', mul: 1.12, speed: 1.0 },
};
const OFFHANDS = {
  shield: { noun: 'щит', g: 'm', adj: 'heavy' },
  quiver: { noun: 'колчан', g: 'm', adj: 'leather' },
  orb: { noun: 'сфера', g: 'f', adj: 'wood' },
  skull: { noun: 'череп-талисман', g: 'm', adj: 'dark' },
};

const PAL = {
  heavy: { c1: ['#6e6e6c', '#a2a6aa', '#7e8a9a', '#c4d8ea', '#4e5e70', '#2e3e5e', '#5e1414', '#ece2c8'], trim: ['#5a4428', '#8a7a5a', '#b08a3a', '#d0d8e8', '#c9a640', '#60c0ff', '#ffb040', '#ffd860'], gem: [null, null, '#40a0ff', '#80e0ff', '#ff4040', '#40c0ff', '#ff6020', '#ffe080'] },
  leather: { c1: ['#6a4a2e', '#5a3a22', '#4a3a2a', '#3a4a2a', '#2a2a30', '#2a4a3a', '#5a1a14', '#1a2a4a'], c2: ['#3a2a1a', '#7a5a3a', '#6a5a40', '#7a6a40', '#4a3a5a', '#c8b080', '#c09040', '#c0c8e8'], trim: ['#5a4428', '#7a6a4a', '#9a8040', '#b09a50', '#8080a0', '#d0c080', '#ffb040', '#e0e8ff'], gem: [null, null, '#c03030', '#40c040', '#a040ff', '#40ffa0', '#ff6020', '#80c0ff'] },
  mage: { c1: ['#6a6a8a', '#3a4a8a', '#2a3a9a', '#4a2a8a', '#2a3a6a', '#1a2a5a', '#7a1414', '#e8e8f8'], c2: ['#8a7a5a', '#c8a040', '#d0b060', '#e0c060', '#c0c8e8', '#80c0ff', '#ffb040', '#ffd860'], gem: [null, '#60a0ff', '#40c0ff', '#a060ff', '#80e0ff', '#40e0ff', '#ff5020', '#ffe080'] },
  necro: { c1: ['#3a3a30', '#2a2a2a', '#2a2a1a', '#1a2a1a', '#1a1a24', '#101418', '#2a0a0a', '#0a0a0a'], c2: ['#5a5a40', '#4a6a4a', '#6a8a5a', '#40a060', '#40c080', '#30e0a0', '#c03030', '#40ffc0'], gem: [null, '#60ff80', '#50ff90', '#40ff90', '#40ffc0', '#30ffe0', '#ff3030', '#40ffd0'] },
};
const CLASS_C2 = { dwarf: ['#2d4f8a', '#1e5a3a', '#2d4f8a', '#1a3a6a', '#3a2a6a', '#103a7a', '#7a1010', '#e8d090'], warrior: ['#8a1c1c', '#6a1a2a', '#8a1c1c', '#1c2a6a', '#5a1a5a', '#141a3a', '#3a0a0a', '#f0e0a0'] };

let uid = 1;
export function newId() { return 'i' + Date.now().toString(36) + (uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

export function tierFor(ilvl) { return clamp(Math.floor((ilvl - 1) / 12.6), 0, 7); }

function statKey(cls) { return CLASSES[cls].mainStat; }

const SLOT_MUL = { chest: 1, legs: 0.9, head: 0.85, shoulders: 0.75, hands: 0.65, feet: 0.7, weapon: 1, offhand: 0.6, ring: 0.55, amulet: 0.7 };
const ARMOR_SLOT_MUL = { chest: 1, legs: 0.85, head: 0.7, shoulders: 0.6, hands: 0.45, feet: 0.55, offhand: 1.1 };
const KIND_ARMOR = { heavy: 1, leather: 0.6, cloth: 0.35 };
const SUFFIX = {
  str: ['силы', 'медведя', 'титана'], agi: ['ловкости', 'орла', 'тени'], int: ['мудрости', 'совы', 'чародея'], sta: ['стойкости', 'крепости', 'горы'],
};

function makeStats(cls, slot, ilvl, rarity, rnd) {
  const budget = (ilvl * 1.1 + 3) * RARITY[rarity].mul * (SLOT_MUL[slot] || 0.7);
  const st = {};
  const main = cls ? statKey(cls) : pick(['str', 'agi', 'int'], rnd);
  st[main] = Math.max(1, Math.round(budget * (rarity >= 2 ? 0.5 : 0.62)));
  st.sta = Math.max(1, Math.round(budget * 0.32));
  if (rarity >= 2) st.crit = Math.round(clamp(budget * 0.018, 0.5, 6) * 10) / 10;
  if (rarity >= 3 && rnd() < 0.6) st.sta = Math.round(st.sta * 1.3);
  return { st, main };
}

function vis(cls, kind, ilvl, rarity, rnd, override = {}) {
  let t = clamp(tierFor(ilvl) + (rarity >= 3 ? 1 : 0) + (rarity >= 4 ? 1 : 0), 0, 7);
  const v = { kind, tier: t, style: 0 };
  if (kind === 'heavy') {
    v.c1 = PAL.heavy.c1[t]; v.trim = PAL.heavy.trim[t]; v.gem = rarity >= 2 ? (PAL.heavy.gem[t] || '#40a0ff') : null;
    v.c2 = (CLASS_C2[cls] || CLASS_C2.warrior)[t];
    v.style = cls === 'dwarf' ? (rnd() < 0.6 ? 2 : 0) : (t >= 3 && rnd() < 0.6 ? 1 : 0);
  } else if (kind === 'leather') {
    v.c1 = PAL.leather.c1[t]; v.c2 = PAL.leather.c2[t]; v.trim = PAL.leather.trim[t]; v.gem = rarity >= 2 ? PAL.leather.gem[t] || '#c03030' : '#c03030';
    v.style = rnd() < 0.5 ? 0 : 1;
  } else {
    const p = cls === 'necro' ? PAL.necro : PAL.mage;
    v.c1 = p.c1[t]; v.c2 = p.c2[t]; v.trim = p.c2[t]; v.gem = rarity >= 1 ? p.gem[t] || p.gem[1] : null;
    v.style = CLASSES[cls] ? CLASSES[cls].hat : 0;
    if (cls === 'mage' && t >= 5 && rnd() < 0.3) v.style = 2;
  }
  return Object.assign(v, override);
}

export function itemName(item) { return item.name; }

export function makeArmor(cls, slot, ilvl, rarity, rnd = Math.random, opts = {}) {
  const C = CLASSES[cls];
  const kind = C.armorType;
  const t = tierFor(ilvl);
  let [noun, g] = NOUNS[kind][slot];
  const v = vis(cls, kind, ilvl, rarity, rnd, opts.vis || {});
  if (slot === 'head' && kind === 'cloth' && v.style === 1) { noun = 'капюшон'; g = 'm'; }
  if (slot === 'head' && kind === 'cloth' && v.style === 2) { noun = 'обруч'; g = 'm'; }
  if (slot === 'head' && kind === 'leather' && v.style === 1) { noun = 'шапка'; g = 'f'; }
  if (slot === 'head' && kind === 'heavy' && v.style === 1) { noun = 'закрытый шлем'; g = 'm'; }
  if (slot === 'head' && kind === 'heavy' && v.style === 2) { noun = 'рогатый шлем'; g = 'm'; }
  const adj = ADJ[kind][t][G[g]];
  const { st, main } = makeStats(cls, slot, ilvl, rarity, rnd);
  st.armor = Math.round((4 + ilvl * 1.8) * KIND_ARMOR[kind] * ARMOR_SLOT_MUL[slot] * (1 + rarity * 0.1));
  let name = `${adj} ${noun}`;
  if (rarity >= 1 && !opts.name) name += ' ' + pick(SUFFIX[main], rnd);
  if (opts.name) name = opts.name;
  return finalize({ name, slot, cls, kind, ilvl, rarity, stats: st, vis: v, unique: opts.unique });
}

export function makeWeapon(cls, ilvl, rarity, rnd = Math.random, opts = {}) {
  const C = CLASSES[cls];
  const wtype = opts.wtype || pick(C.weapons, rnd);
  const W = WEAPONS[wtype];
  const t = tierFor(ilvl);
  const adj = ADJ[W.adj][t][G[W.g]];
  const { st, main } = makeStats(cls, 'weapon', ilvl, rarity, rnd);
  st.dmg = Math.round((7 + ilvl * 4.3) * (1 + rarity * 0.12) * W.mul);
  delete st.sta;
  st[main] = Math.round(st[main] * 0.8);
  const vt = clamp(t + (rarity >= 3 ? 1 : 0) + (rarity >= 4 ? 1 : 0), 0, 7);
  const v = {
    kind: 'weapon', tier: vt,
    c1: W.adj === 'heavy' ? ['#9a9a98', '#c8ccd2', '#b0b8c4', '#e0f0ff', '#8090a8', '#506080', '#a02020', '#fff6e0'][vt] : W.adj === 'wood' ? ['#6a4428', '#5a3a20', '#4a2a18', '#3a2a40', '#c0c8e0', '#d8e0d0', '#5a1010', '#f0f0ff'][vt] : ['#a8a090', '#909080', '#808878', '#70806a', '#606870', '#505860', '#602020', '#e0f0f0'][vt],
    trim: ['#5a4428', '#8a7a5a', '#b08a3a', '#d0d8e8', '#c9a640', '#60c0ff', '#ffb040', '#ffd860'][vt],
    gem: rarity >= 1 || W.adj !== 'heavy' ? (cls === 'necro' ? PAL.necro.gem[Math.max(1, vt)] : cls === 'mage' ? PAL.mage.gem[Math.max(1, vt)] : ['#40a0ff', '#40a0ff', '#40a0ff', '#80e0ff', '#ff4040', '#40c0ff', '#ff6020', '#ffe080'][vt]) : null,
  };
  Object.assign(v, opts.vis || {});
  let name = `${adj} ${W.noun}`;
  if (rarity >= 1 && !opts.name) name += ' ' + pick(SUFFIX[main], rnd);
  if (opts.name) name = opts.name;
  return finalize({ name, slot: 'weapon', cls, wtype, ilvl, rarity, stats: st, vis: v, speed: W.speed, unique: opts.unique });
}

export function makeOffhand(cls, ilvl, rarity, rnd = Math.random, opts = {}) {
  const C = CLASSES[cls];
  if (!C.offhand.length) return null;
  const otype = C.offhand[0];
  const O = OFFHANDS[otype];
  const t = tierFor(ilvl);
  const adj = ADJ[O.adj][t][G[O.g]];
  const { st, main } = makeStats(cls, 'offhand', ilvl, rarity, rnd);
  if (otype === 'shield') st.armor = Math.round((4 + ilvl * 1.8) * ARMOR_SLOT_MUL.offhand * (1 + rarity * 0.1));
  if (otype === 'orb' || otype === 'skull') st.int = Math.round((st.int || 0) * 1.3) + 1;
  const v = vis(cls, otype === 'shield' ? 'heavy' : 'leather', ilvl, rarity, rnd, opts.vis || {});
  if (otype === 'shield') v.style = rnd() < 0.5 ? 0 : 1;
  if (otype === 'orb') v.gem = PAL.mage.gem[Math.max(1, v.tier)];
  if (otype === 'skull') v.gem = PAL.necro.gem[Math.max(1, v.tier)];
  let name = `${adj} ${O.noun}`;
  if (rarity >= 1 && !opts.name) name += ' ' + pick(SUFFIX[main], rnd);
  if (opts.name) name = opts.name;
  return finalize({ name, slot: 'offhand', cls, otype, ilvl, rarity, stats: st, vis: v, unique: opts.unique });
}

export function makeJewel(slot, ilvl, rarity, cls = null, rnd = Math.random, opts = {}) {
  const t = tierFor(ilvl);
  const isRing = slot === 'ring';
  const g = isRing ? 'n' : 'm';
  const adj = ADJ.jewel[t][G[g]];
  const { st, main } = makeStats(cls, slot, ilvl, rarity, rnd);
  st.crit = Math.round(((st.crit || 0) + 0.5 + rarity * 0.4) * 10) / 10;
  let name = `${adj} ${isRing ? 'кольцо' : 'амулет'}`;
  if (!opts.name) name += ' ' + pick(SUFFIX[main], rnd);
  else name = opts.name;
  return finalize({ name, slot, cls: null, ilvl, rarity, stats: st, vis: null, jewel: true, unique: opts.unique });
}

function finalize(it) {
  it.id = newId();
  it.type = 'gear';
  it.req = Math.max(1, it.ilvl - 1);
  const base = it.ilvl * it.ilvl * 0.28 + it.ilvl * 4 + 6;
  it.sell = Math.round(base * (1 + it.rarity * 0.9));
  it.price = Math.round(it.sell * 4.5);
  return it;
}

// Случайная добыча под класс
export function randomGear(cls, ilvl, rarity, rnd = Math.random) {
  const r = rnd();
  if (r < 0.22) return makeWeapon(cls, ilvl, rarity, rnd);
  if (r < 0.3 && CLASSES[cls].offhand.length) return makeOffhand(cls, ilvl, rarity, rnd);
  if (r < 0.38) return makeJewel(rnd() < 0.6 ? 'ring' : 'amulet', ilvl, rarity, cls, rnd);
  return makeArmor(cls, pick(['head', 'shoulders', 'chest', 'hands', 'legs', 'feet'], rnd), ilvl, rarity, rnd);
}

export function rollRarity(bonus = 0, rnd = Math.random) {
  const r = rnd();
  if (r < 0.006 + bonus * 0.02) return 4;
  if (r < 0.035 + bonus * 0.08) return 3;
  if (r < 0.14 + bonus * 0.2) return 2;
  if (r < 0.42 + bonus * 0.2) return 1;
  return 0;
}

// Стартовый комплект
export function starterKit(cls) {
  const rnd = Math.random;
  const C = CLASSES[cls];
  const eq = {
    weapon: makeWeapon(cls, 1, 0, rnd, { wtype: C.weapons[0] }),
    chest: makeArmor(cls, 'chest', 1, 0, rnd),
    legs: makeArmor(cls, 'legs', 1, 0, rnd),
    feet: makeArmor(cls, 'feet', 1, 0, rnd),
  };
  if (C.offhand.length) eq.offhand = makeOffhand(cls, 1, 0, rnd);
  if (cls === 'mage' || cls === 'necro') eq.head = makeArmor(cls, 'head', 1, 0, rnd);
  return eq;
}

// Красивый «витринный» комплект для экрана выбора класса
export function showcaseKit(cls, level = 35, rarity = 3) {
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const eq = {};
  for (const sl of ARMOR_SLOTS) eq[sl] = makeArmor(cls, sl, level, rarity, rnd);
  eq.weapon = makeWeapon(cls, level, rarity, rnd, { wtype: CLASSES[cls].weapons[0] });
  if (CLASSES[cls].offhand.length) eq.offhand = makeOffhand(cls, level, rarity, rnd);
  if (cls === 'dwarf') eq.head.vis.style = 2;
  return eq;
}

// ---------- Зелья и прочее ----------
export const POTIONS = [
  { key: 'hp1', name: 'Малое зелье здоровья', kind: 'hp', amount: 140, req: 1, price: 15, color: '#e03030' },
  { key: 'hp2', name: 'Зелье здоровья', kind: 'hp', amount: 650, req: 25, price: 70, color: '#e03030' },
  { key: 'hp3', name: 'Большое зелье здоровья', kind: 'hp', amount: 1800, req: 50, price: 220, color: '#e03030' },
  { key: 'hp4', name: 'Великое зелье здоровья', kind: 'hp', amount: 4200, req: 75, price: 600, color: '#ff4040' },
  { key: 'mp1', name: 'Малое зелье маны', kind: 'mp', amount: 90, req: 1, price: 15, color: '#3060ff' },
  { key: 'mp2', name: 'Зелье маны', kind: 'mp', amount: 320, req: 25, price: 70, color: '#3060ff' },
  { key: 'mp3', name: 'Большое зелье маны', kind: 'mp', amount: 800, req: 50, price: 220, color: '#3060ff' },
  { key: 'mp4', name: 'Великое зелье маны', kind: 'mp', amount: 1600, req: 75, price: 600, color: '#4080ff' },
];
export function makePotion(key, count = 1) {
  const p = POTIONS.find(x => x.key === key);
  return { id: newId(), type: 'potion', key, name: p.name, kind: p.kind, amount: p.amount, req: p.req, count, stack: true, price: p.price, sell: Math.round(p.price / 4), rarity: 0, color: p.color };
}
export function makeQuestItem(key, name, count = 1) {
  return { id: newId(), type: 'quest', key, name, count, stack: true, rarity: 0, sell: 0, price: 0 };
}
export function makeJunk(level) {
  const names = ['Клок шерсти', 'Сломанный клык', 'Обрывок ткани', 'Тусклый камешек', 'Ржавая пряжка', 'Кость', 'Звериная шкура', 'Кусок хитина'];
  return { id: newId(), type: 'junk', name: pick(names), count: 1, stack: false, rarity: 0, sell: Math.round(3 + level * 1.5), price: 0 };
}

// ---------- Уникальная добыча с боссов ----------
export const BOSS_LOOT = {
  b1: { gen: 'Сумрачного Клыка', vis: { c1: '#3a3c4a', c2: '#20222a', trim: '#9ab0ff', gem: '#9ab0ff' }, wpnName: 'Клык Сумрака' },
  b2: { gen: 'Королевы Арахны', vis: { c1: '#2a3a1a', c2: '#4a6a20', trim: '#a0ff40', gem: '#a0ff40' }, wpnName: 'Жало Арахны' },
  b3: { gen: 'Каменного Колосса', vis: { c1: '#6a6a6a', c2: '#3a2a1a', trim: '#ff9020', gem: '#ff9020' }, wpnName: 'Сердце Колосса' },
  b4: { gen: 'Ледяного Лича', vis: { c1: '#a0c8e8', c2: '#2a4a7a', trim: '#e0f4ff', gem: '#60e0ff' }, wpnName: 'Вечная Мерзлота' },
  b5: { gen: 'Игнириуса', vis: { c1: '#5a0a0a', c2: '#2a0505', trim: '#ffb040', gem: '#ff4010' }, wpnName: 'Пламя Игнириуса' },
};
const SLOT_TITLE = { head: 'Венец', shoulders: 'Наплечники', chest: 'Доспех', hands: 'Длани', legs: 'Поножи', feet: 'Поступь', offhand: 'Оплот', ring: 'Перстень', amulet: 'Талисман' };

export function bossItem(bossId, cls, ilvl, rnd = Math.random, forceSlot = null) {
  const B = BOSS_LOOT[bossId];
  const rarity = rnd() < 0.55 ? 4 : 3;
  const r = rnd();
  const slot = forceSlot || (r < 0.3 ? 'weapon' : r < 0.42 ? 'jewel' : pick(['head', 'shoulders', 'chest', 'hands', 'legs', 'feet'], rnd));
  if (slot === 'weapon') {
    const it = makeWeapon(cls, ilvl, rarity, rnd, { name: B.wpnName, vis: { gem: B.vis.gem, trim: B.vis.trim }, unique: true });
    it.stats.dmg = Math.round(it.stats.dmg * 1.12);
    return it;
  }
  if (slot === 'jewel') {
    const js = rnd() < 0.5 ? 'ring' : 'amulet';
    return makeJewel(js, ilvl, rarity, cls, rnd, { name: `${SLOT_TITLE[js]} ${B.gen}`, unique: true });
  }
  const it = makeArmor(cls, slot, ilvl, rarity, rnd, { name: `${SLOT_TITLE[slot]} ${B.gen}`, unique: true, vis: Object.assign({}, CLASSES[cls].armorType === 'cloth' ? { c2: B.vis.trim, gem: B.vis.gem } : B.vis, { cape: true, capeColor: B.vis.c2 }) });
  it.stats.armor = Math.round(it.stats.armor * 1.15);
  return it;
}
