// Типы монстров, зоны их обитания и боссы.

export const MOB_TYPES = {
  wolf: { name: 'Серый волк', model: 'wolf', fur: '#76716a', fur2: '#c4bcae', belly: '#d2cabe', size: 1, speed: 7.5, aggro: 11, hp: 0.85, dmg: 0.85, drop: ['Волчья шкура', 'Волчий клык'] },
  boar: { name: 'Дикий кабан', model: 'boar', fur: '#4e3828', fur2: '#2e2016', belly: '#5e4634', size: 1, speed: 6.5, aggro: 10, hp: 1.05, dmg: 0.9, drop: ['Кабаний клык'] },
  goblin: { name: 'Гоблин-налётчик', model: 'humanoid', spec: { headType: 'goblin', skin: '#6f9a3c', scale: 0.72, torsoW: 0.9, limb: 0.85, head: 1.25, hair: { style: 'none' }, ears: 'pointy', eyes: { color: '#ffcc20' }, base: { shirt: '#5a4a2a', pants: '#3a2e20', boots: null, sleeves: false } }, weapon: { wtype: 'axe', tier: 0 }, armor: null, speed: 6.8, aggro: 13, hp: 0.9, dmg: 1.0, drop: ['Гоблинское ухо'] },
  spider: { name: 'Лесной паук', model: 'spider', fur: '#2a2a22', fur2: '#6a5a20', size: 1, speed: 7, aggro: 12, hp: 0.95, dmg: 1.0, drop: ['Паучий шёлк', 'Ядовитая железа'] },
  bandit: { name: 'Разбойник', model: 'humanoid', spec: { skin: '#c89070', hair: { style: 'short', color: '#2a1a10' }, beard: 'short', base: { shirt: '#4a3a2a', pants: '#3a3020', boots: '#2a1a10' } }, armor: { kind: 'leather', c1: '#3a2a20', c2: '#2a2018', tier: 1, style: 0 }, weapon: { wtype: 'sword', tier: 1 }, speed: 6.6, aggro: 14, hp: 1.0, dmg: 1.05, drop: ['Воровской жетон'] },
  bear: { name: 'Бурый медведь', model: 'bear', fur: '#5a3a22', fur2: '#8a6a48', belly: '#4a2e1a', size: 1, speed: 6.2, aggro: 11, hp: 1.5, dmg: 1.25, drop: ['Медвежья шкура', 'Медвежий коготь'] },
  skeleton: { name: 'Скелет-страж', model: 'humanoid', spec: { headType: 'skull', limb: 0.62, torsoW: 0.85, eyes: { color: '#60ffe0' }, hair: { style: 'none' }, base: { shirt: null, pants: null, boots: null } }, armor: { kind: 'heavy', c1: '#5a5450', c2: '#3a2a2a', trim: '#6a5a3a', tier: 1, style: 0, partial: true }, weapon: { wtype: 'sword', tier: 1 }, offhand: 'shield', speed: 6, aggro: 13, hp: 1.0, dmg: 1.05, drop: ['Древняя кость'] },
  orcscout: { name: 'Орк-разведчик', model: 'humanoid', spec: { headType: 'orc', skin: '#5a7a3a', scale: 1.08, torsoW: 1.2, limb: 1.25, hair: { style: 'mohawk', color: '#101010' }, eyes: { color: '#e02020' }, base: { shirt: null, pants: '#3a2a1a', boots: '#2a1a10', sleeves: false } }, armor: { kind: 'leather', c1: '#4a3020', c2: '#6a1a10', tier: 2, style: 0, partial: true }, weapon: { wtype: 'axe', tier: 2 }, speed: 6.6, aggro: 15, hp: 1.15, dmg: 1.1, drop: ['Орочий тотем'] },
  troll: { name: 'Речной тролль', model: 'humanoid', spec: { headType: 'orc', skin: '#5a7a80', scale: 1.55, torsoW: 1.3, torsoD: 1.3, limb: 1.5, armLen: 1.2, legLen: 0.85, head: 0.9, hair: { style: 'none' }, tusks: true, eyes: { color: '#ffdd30' }, base: { shirt: null, pants: '#4a3a2a', boots: null, sleeves: false } }, weapon: { wtype: 'hammer', tier: 1 }, speed: 6, aggro: 12, hp: 1.6, dmg: 1.3, drop: ['Клык тролля'] },
  lizard: { name: 'Ящер-топитель', model: 'humanoid', spec: { headType: 'lizard', skin: '#4a7a4a', scale: 1.05, limb: 1.0, hair: { style: 'none' }, tail: true, eyes: { color: '#ffdd00', glow: false }, base: { shirt: null, pants: '#5a4a2a', boots: null, sleeves: false } }, weapon: { wtype: 'sword', tier: 2 }, ranged: 'spear', speed: 6.5, aggro: 15, hp: 1.05, dmg: 1.05, drop: ['Чешуя ящера'] },
  golem: { name: 'Каменный голем', model: 'golem', fur: '#7a746a', fur2: '#ffaa40', size: 1, speed: 5.0, aggro: 10, hp: 1.8, dmg: 1.25, drop: ['Рунный камень'] },
  orc: { name: 'Орк-берсерк', model: 'humanoid', spec: { headType: 'orc', skin: '#4a6a2a', scale: 1.18, torsoW: 1.3, limb: 1.35, hair: { style: 'mohawk', color: '#202020' }, eyes: { color: '#ff3030' }, base: { shirt: null, pants: '#3a2a1a', boots: '#2a1a10', sleeves: false } }, armor: { kind: 'heavy', c1: '#4a4040', c2: '#6a1010', trim: '#3a3030', tier: 3, style: 2, partial: true }, weapon: { wtype: 'greatsword', tier: 3 }, speed: 6.6, aggro: 15, hp: 1.3, dmg: 1.25, drop: ['Знамя Кровавого Клыка'] },
  wraith: { name: 'Стенающий призрак', model: 'wraith', fur: '#2a3040', fur2: '#80d0ff', size: 1, speed: 6.5, aggro: 15, hp: 0.95, dmg: 1.15, ranged: 'shadow', drop: ['Эктоплазма'] },
  minotaur: { name: 'Минотавр', model: 'humanoid', spec: { headType: 'bull', skin: '#5a3a2a', scale: 1.5, torsoW: 1.35, torsoD: 1.2, limb: 1.45, head: 1.25, hair: { style: 'none' }, eyes: { color: '#ff3020' }, base: { shirt: null, pants: '#3a2a1a', boots: null, sleeves: false } }, weapon: { wtype: 'axe', tier: 4 }, speed: 6.4, aggro: 14, hp: 1.6, dmg: 1.35, drop: ['Рог минотавра'] },
  fallen: { name: 'Падший рыцарь', model: 'humanoid', spec: { headType: 'skull', limb: 0.7, eyes: { color: '#ff3030' }, hair: { style: 'none' }, base: { shirt: null, pants: null, boots: null } }, armor: { kind: 'heavy', c1: '#2a2a32', c2: '#4a0a0a', trim: '#6a1010', tier: 5, style: 1 }, weapon: { wtype: 'greatsword', tier: 5 }, speed: 6.2, aggro: 15, hp: 1.4, dmg: 1.3, drop: ['Почерневший герб'] },
  yeti: { name: 'Снежный йети', model: 'humanoid', spec: { headType: 'yeti', skin: '#e8eef4', scale: 1.5, torsoW: 1.4, torsoD: 1.3, limb: 1.6, armLen: 1.25, legLen: 0.8, head: 1.1, hair: { style: 'none' }, eyes: { color: '#60c0ff', glow: true }, base: { shirt: null, pants: null, boots: null, sleeves: false } }, speed: 6.6, aggro: 14, hp: 1.5, dmg: 1.3, drop: ['Мех йети'] },
  fireelem: { name: 'Огненный элементаль', model: 'elemental', fur: '#ff6020', fur2: '#ffd040', size: 1, speed: 6, aggro: 15, hp: 1.1, dmg: 1.25, ranged: 'fire', drop: ['Тлеющее ядро'] },
  demon: { name: 'Демон Бездны', model: 'humanoid', spec: { headType: 'demon', skin: '#8a2a1a', scale: 1.35, torsoW: 1.25, limb: 1.3, hair: { style: 'none' }, tail: true, eyes: { color: '#ffcc00', glow: true }, base: { shirt: null, pants: '#1a0a0a', boots: null, sleeves: false } }, weapon: { wtype: 'scythe', tier: 6 }, wings: true, speed: 6.8, aggro: 16, hp: 1.4, dmg: 1.4, drop: ['Рог демона'] },
  frostgiant: { name: 'Ледяной великан', model: 'humanoid', spec: { skin: '#8ab0d0', scale: 1.9, torsoW: 1.3, torsoD: 1.2, limb: 1.4, hair: { style: 'long', color: '#e0f0ff' }, beard: 'dwarf', eyes: { color: '#a0e0ff', glow: true }, base: { shirt: null, pants: '#4a5a6a', boots: '#3a4a5a', sleeves: false } }, armor: { kind: 'heavy', c1: '#a0c8e8', c2: '#2a4a7a', trim: '#e0f4ff', tier: 6, style: 2, partial: true }, weapon: { wtype: 'hammer', tier: 6 }, speed: 6, aggro: 15, hp: 1.8, dmg: 1.45, drop: ['Вечный лёд'] },
  cultist: { name: 'Культист Лича', model: 'humanoid', spec: { skin: '#a8a8a0', hair: { style: 'none' }, eyes: { color: '#50ff90', glow: true }, base: { shirt: '#1a1a1a', pants: '#1a1a1a', boots: '#101010' } }, armor: { kind: 'cloth', c1: '#141418', c2: '#30a060', tier: 6, style: 1, robe: true }, weapon: { wtype: 'bonestaff', tier: 6 }, ranged: 'shadow', speed: 6.2, aggro: 16, hp: 1.05, dmg: 1.35, drop: ['Тёмный фолиант'] },
  drake: { name: 'Огненный дрейк', model: 'dragon', fur: '#8a2010', fur2: '#ffa030', size: 1.1, speed: 7, aggro: 16, hp: 1.6, dmg: 1.45, ranged: 'fire', drop: ['Чешуя дрейка'] },
};

// Зоны обитания (уровни растут по мере удаления от города)
export const SPAWNS = [
  // --- Окрестности Светлолесья (1–30) ---
  { type: 'wolf', x: -330, z: 470, r: 45, lvl: [1, 4], count: 9 },
  { type: 'wolf', x: -510, z: 300, r: 40, lvl: [2, 5], count: 7 },
  { type: 'boar', x: -290, z: 320, r: 45, lvl: [4, 8], count: 9 },
  { type: 'goblin', x: -580, z: 540, r: 45, lvl: [7, 12], count: 11 },
  { type: 'spider', x: -170, z: 580, r: 50, lvl: [10, 15], count: 10 },
  { type: 'bandit', x: -540, z: 150, r: 50, lvl: [13, 18], count: 10 },
  { type: 'bear', x: -110, z: 470, r: 50, lvl: [17, 22], count: 8 },
  { type: 'skeleton', x: -330, z: 200, r: 40, lvl: [20, 25], count: 10 },
  { type: 'orcscout', x: -40, z: 380, r: 45, lvl: [25, 30], count: 10 },
  { type: 'wolf', x: -620, z: 620, r: 40, lvl: [22, 26], count: 6, elite: true },
  // --- Сизые нагорья вокруг Каменграда (30–70) ---
  { type: 'troll', x: 150, z: 270, r: 50, lvl: [30, 35], count: 9 },
  { type: 'lizard', x: 450, z: 400, r: 60, lvl: [34, 40], count: 11 },
  { type: 'spider', x: 540, z: 500, r: 45, lvl: [38, 42], count: 8 },
  { type: 'golem', x: 480, z: 60, r: 50, lvl: [40, 47], count: 9 },
  { type: 'orc', x: 300, z: -60, r: 50, lvl: [45, 52], count: 11 },
  { type: 'wraith', x: 40, z: -130, r: 60, lvl: [50, 57], count: 11 },
  { type: 'minotaur', x: 560, z: -170, r: 50, lvl: [55, 62], count: 8 },
  { type: 'fallen', x: 190, z: -260, r: 50, lvl: [62, 69], count: 10 },
  // --- Пепельные земли и Ледяной предел у Аврелиона (70–100) ---
  { type: 'yeti', x: -360, z: -380, r: 55, lvl: [70, 76], count: 10 },
  { type: 'fireelem', x: 220, z: -470, r: 55, lvl: [74, 80], count: 10 },
  { type: 'demon', x: 330, z: -620, r: 50, lvl: [79, 86], count: 10 },
  { type: 'frostgiant', x: -470, z: -600, r: 50, lvl: [84, 90], count: 8 },
  { type: 'cultist', x: -160, z: -650, r: 45, lvl: [88, 94], count: 10 },
  { type: 'drake', x: 120, z: -655, r: 50, lvl: [93, 100], count: 9 },
];

export const BOSSES = [
  { id: 'b1', name: 'Сумрачный Клык', title: 'Вожак Теневой стаи', type: 'wolf', model: 'wolf', x: -655, z: 650, lvl: 25, scale: 2.7, hp: 16, dmg: 2.2, fur: '#25252e', fur2: '#0a0a10', eye: '#80a0ff', respawn: 300, abilities: ['howl', 'leap', 'slam'] },
  { id: 'b2', name: 'Королева Арахна', title: 'Матерь Гнезда', type: 'spider', model: 'spider', x: 565, z: 475, lvl: 42, scale: 3.2, hp: 19, dmg: 2.3, fur: '#1a2210', fur2: '#90ff30', eye: '#a0ff40', respawn: 300, abilities: ['poisonpool', 'summon', 'slam'] },
  { id: 'b3', name: 'Каменный Колосс', title: 'Страж Древней Кузни', type: 'golem', model: 'golem', x: 605, z: -40, lvl: 60, scale: 3.4, hp: 22, dmg: 2.5, fur: '#6a645a', fur2: '#ff8a20', eye: '#ff9020', respawn: 300, abilities: ['slam', 'rockfall', 'stomp'] },
  { id: 'b4', name: 'Малгорот, Ледяной Лич', title: 'Владыка Склепа', type: 'cultist', model: 'lich', x: -625, z: -470, lvl: 82, scale: 1.7, hp: 25, dmg: 2.6, fur: '#a0d8ff', fur2: '#40e0ff', eye: '#60e0ff', respawn: 300, abilities: ['frostnova', 'summon', 'blizzard'] },
  { id: 'b5', name: 'Игнириус Древний', title: 'Пламя Изначальное', type: 'drake', model: 'dragon', x: 420, z: -695, lvl: 100, scale: 4.2, hp: 32, dmg: 3.0, fur: '#6a0a06', fur2: '#ffb030', eye: '#ffd040', respawn: 300, abilities: ['firebreath', 'meteor', 'slam'] },
];

export function mobHp(level) { return Math.round(70 + level * 34 + Math.pow(level, 1.5) * 2.2); }
export function mobDmg(level) { return Math.round(5 + level * 2.6 + Math.pow(level, 1.3) * 0.25); }
export function mobArmor(level) { return Math.round(level * 6); }
