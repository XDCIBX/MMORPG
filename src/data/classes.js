// Классы персонажей, их умения и ветки развития (с 40 уровня).

// Типы умений:
//  melee — удар по цели вблизи; proj — снаряд; aoeSelf — область вокруг себя; aoeTarget — область у цели;
//  line — линия перед собой; cone — конус; buff — усиление на себя; heal — лечение; shield — щит-поглощение;
//  charge — рывок к цели; leap — прыжок назад; blink — телепорт вперёд; summon — призыв; chain — цепная молния;
//  multi — веер снарядов; rain — волны урона в области; pull — затягивание в область.

export const BRANCH_LEVEL = 40;

export const CLASSES = {
  dwarf: {
    id: 'dwarf', name: 'Гном', role: 'Танк', resource: 'Ярость', resColor: '#d0452c',
    desc: 'Коренастый страж подгорных кланов. Держит удар, как скала, и сокрушает врагов боевым молотом. Лучший защитник отряда.',
    mainStat: 'str', armorType: 'heavy', weapons: ['hammer', 'axe'], offhand: ['shield'],
    base: { hp: 150, hpLvl: 22, res: 100, resLvl: 0, resRegen: 5, str: 12, agi: 6, int: 4, sta: 14, crit: 0.05, speed: 6.4 },
    melee: true, range: 2.7, atkSpeed: 1.9,
    look: {
      male: { skin: '#d9a07a', scale: 0.86, legLen: 0.72, armLen: 0.9, torsoW: 1.32, torsoD: 1.25, limb: 1.35, head: 1.15, neckLen: 0.5, hair: { style: 'braids', color: '#a0522d' }, beard: 'dwarf', eyes: { color: '#4a3020' } },
      female: { skin: '#e0ae88', scale: 0.84, legLen: 0.74, armLen: 0.9, torsoW: 1.22, torsoD: 1.15, limb: 1.22, head: 1.12, neckLen: 0.6, hair: { style: 'braids', color: '#c46a2a' }, eyes: { color: '#3a5a2a' }, female: true },
    },
    branches: {
      guardian: { name: 'Хранитель Горы', desc: 'Непробиваемый бастион. +25% здоровья, +20% брони. Умения защиты и контроля.', color: '#8fa8c8', passive: { hpMul: 1.25, armorMul: 1.2 } },
      berserker: { name: 'Рунный берсерк', desc: 'Ярость предков в рунах. +20% урона, +10% крита. Сокрушительные атаки по области.', color: '#ff7a2a', passive: { dmgMul: 1.2, crit: 0.1 } },
    },
    skills: [
      { id: 'd_strike', name: 'Удар молота', icon: '⚒', color: '#e09040', lvl: 1, type: 'melee', dmg: 1.4, cost: 12, cd: 3, anim: 'slam', fx: 'impact', desc: 'Мощный удар оружием по цели.' },
      { id: 'd_bash', name: 'Удар щитом', icon: '⛨', color: '#a0b4d0', lvl: 3, type: 'melee', dmg: 0.9, cost: 15, cd: 10, anim: 'bash', stun: 2, fx: 'shieldflash', desc: 'Оглушает цель на 2 сек.' },
      { id: 'd_cry', name: 'Боевой клич', icon: '📯', color: '#d06030', lvl: 6, type: 'buff', cost: 10, cd: 18, anim: 'buff', taunt: 14, buff: { armorMul: 1.3, dur: 8 }, fx: 'shout', desc: 'Притягивает внимание всех врагов вокруг и повышает броню на 30%.' },
      { id: 'd_quake', name: 'Землетрясение', icon: '⛰', color: '#b08850', lvl: 10, type: 'aoeSelf', radius: 7, dmg: 1.6, cost: 30, cd: 12, anim: 'slam', slow: 3, fx: 'quake', desc: 'Сотрясает землю, нанося урон и замедляя врагов вокруг.' },
      { id: 'd_skin', name: 'Каменная кожа', icon: '🗿', color: '#9a9a9a', lvl: 15, type: 'buff', cost: 20, cd: 30, anim: 'buff', buff: { dmgTaken: 0.5, dur: 8 }, fx: 'stoneskin', desc: 'Кожа становится камнем: входящий урон -50% на 8 сек.' },
      { id: 'd_charge', name: 'Натиск', icon: '➹', color: '#e0b050', lvl: 22, type: 'charge', range: 22, dmg: 1.2, cost: 15, cd: 14, anim: 'bash', stun: 1, fx: 'charge', desc: 'Врывается к цели и оглушает её.' },
      { id: 'd_bastion', branch: 'guardian', name: 'Гранитный бастион', icon: '🛡', color: '#8fb0e0', lvl: 40, type: 'shield', cost: 25, cd: 25, anim: 'buff', shield: 0.3, dur: 12, fx: 'bastion', desc: 'Каменный щит поглощает урон до 30% от здоровья.' },
      { id: 'd_rockfall', branch: 'guardian', name: 'Обвал', icon: '☄', color: '#a08060', lvl: 50, type: 'aoeTarget', range: 25, radius: 6, dmg: 2.6, cost: 35, cd: 14, anim: 'cast2', stun: 1.5, fx: 'rockfall', desc: 'Обрушивает камни на врагов, оглушая их.' },
      { id: 'd_heart', branch: 'guardian', name: 'Сердце Горы', icon: '❤', color: '#ff9060', lvl: 65, type: 'heal', heal: 0.4, cost: 30, cd: 45, anim: 'buff', fx: 'mountainheart', desc: 'Восстанавливает 40% здоровья.' },
      { id: 'd_runespin', branch: 'berserker', name: 'Рунный вихрь', icon: '🌀', color: '#ff8a30', lvl: 40, type: 'aoeSelf', radius: 5.5, dmg: 2.3, cost: 30, cd: 9, anim: 'sweep', fx: 'runespin', desc: 'Вращение с пылающими рунами вокруг себя.' },
      { id: 'd_runehammer', branch: 'berserker', name: 'Громовой молот', icon: '⚡', color: '#80c8ff', lvl: 50, type: 'proj', range: 26, dmg: 3.0, cost: 25, cd: 8, anim: 'cast', projectile: 'hammer', fx: 'lightning_hit', desc: 'Бросает рунный молот, разящий молнией.' },
      { id: 'd_ancestral', branch: 'berserker', name: 'Ярость предков', icon: '🔥', color: '#ff4020', lvl: 65, type: 'buff', cost: 40, cd: 50, anim: 'buff', buff: { dmgMul: 1.5, hasteMul: 1.3, dur: 12 }, fx: 'ancestral', desc: '+50% урона и +30% скорости атаки на 12 сек.' },
    ],
  },
  warrior: {
    id: 'warrior', name: 'Воин', role: 'Ближний бой', resource: 'Ярость', resColor: '#d0452c',
    desc: 'Закалённый в бесчисленных битвах мастер меча. Сочетает мощь латного доспеха и смертоносную технику клинка.',
    mainStat: 'str', armorType: 'heavy', weapons: ['sword', 'greatsword'], offhand: [],
    base: { hp: 125, hpLvl: 18, res: 100, resLvl: 0, resRegen: 6, str: 13, agi: 9, int: 4, sta: 11, crit: 0.07, speed: 6.8 },
    melee: true, range: 2.9, atkSpeed: 1.7,
    look: {
      male: { skin: '#d6a07c', scale: 1.0, legLen: 1.0, armLen: 1.0, torsoW: 1.12, torsoD: 1.05, limb: 1.12, head: 1.0, hair: { style: 'short', color: '#2a1d14' }, beard: 'short', eyes: { color: '#3a5a7a' } },
      female: { skin: '#e2b593', scale: 0.96, legLen: 1.02, armLen: 1.0, torsoW: 1.0, torsoD: 1.0, limb: 1.05, head: 1.0, hair: { style: 'ponytail', color: '#6a3a1a' }, eyes: { color: '#4a7a5a' }, female: true },
    },
    branches: {
      paladin: { name: 'Паладин', desc: 'Воин Света. +15% здоровья, святые удары и лечение.', color: '#ffe08a', passive: { hpMul: 1.15, healMul: 1.25 } },
      blademaster: { name: 'Мастер клинка', desc: 'Виртуоз стали. +15% крита, +15% скорости атаки, кровотечения.', color: '#e04050', passive: { crit: 0.15, hasteMul: 1.15 } },
    },
    skills: [
      { id: 'w_cleave', name: 'Рассекающий удар', icon: '⚔', color: '#e0e0e0', lvl: 1, type: 'melee', dmg: 1.45, cost: 12, cd: 3, anim: 'slash', fx: 'slash', desc: 'Широкий удар клинком.' },
      { id: 'w_charge', name: 'Рывок', icon: '➹', color: '#e0b050', lvl: 3, type: 'charge', range: 22, dmg: 0.8, cost: 10, cd: 12, anim: 'thrust', stun: 1, fx: 'charge', desc: 'Стремительный рывок к цели с оглушением.' },
      { id: 'w_whirl', name: 'Вихрь клинков', icon: '🌀', color: '#c0d0ff', lvl: 6, type: 'aoeSelf', radius: 5, dmg: 1.3, cost: 25, cd: 8, anim: 'sweep', fx: 'whirl', desc: 'Удар по всем врагам вокруг.' },
      { id: 'w_roar', name: 'Боевой рёв', icon: '📯', color: '#ff7040', lvl: 10, type: 'buff', cost: 15, cd: 25, anim: 'buff', buff: { dmgMul: 1.25, dur: 10 }, fx: 'shout', desc: '+25% урона на 10 сек.' },
      { id: 'w_shock', name: 'Раскол земли', icon: '⛰', color: '#c09050', lvl: 15, type: 'line', range: 12, width: 3, dmg: 1.9, cost: 30, cd: 12, anim: 'slam', slow: 3, fx: 'fissure', desc: 'Раскалывает землю перед собой.' },
      { id: 'w_execute', name: 'Казнь', icon: '☠', color: '#ff3030', lvl: 22, type: 'melee', dmg: 2.8, cost: 30, cd: 10, anim: 'slam', execute: 0.3, fx: 'execute', desc: 'Двойной урон по целям с < 30% здоровья.' },
      { id: 'w_holyblade', branch: 'paladin', name: 'Святой клинок', icon: '✦', color: '#ffe080', lvl: 40, type: 'melee', dmg: 2.6, cost: 20, cd: 6, anim: 'slash', lifesteal: 0.25, fx: 'holyblade', desc: 'Удар святой силой, исцеляющий на 25% урона.' },
      { id: 'w_divine', branch: 'paladin', name: 'Свет небес', icon: '☀', color: '#fff0a0', lvl: 50, type: 'heal', heal: 0.4, cost: 25, cd: 30, anim: 'cast2', fx: 'holylight', desc: 'Исцеляет 40% здоровья.' },
      { id: 'w_judgement', branch: 'paladin', name: 'Божий суд', icon: '⚜', color: '#ffd040', lvl: 65, type: 'aoeTarget', range: 25, radius: 6, dmg: 3.4, cost: 35, cd: 15, anim: 'cast2', fx: 'judgement', desc: 'Столп света обрушивается на врагов.' },
      { id: 'w_bladestorm', branch: 'blademaster', name: 'Буря клинков', icon: '🌪', color: '#ff6070', lvl: 40, type: 'rain', self: true, radius: 6, dmg: 3.0, waves: 3, cost: 35, cd: 15, anim: 'sweep', fx: 'whirl', desc: 'Три вихревых удара по всем вокруг.' },
      { id: 'w_rend', branch: 'blademaster', name: 'Глубокая рана', icon: '🩸', color: '#d02030', lvl: 50, type: 'melee', dmg: 1.6, cost: 20, cd: 8, anim: 'slash', dot: { dmg: 3.0, dur: 8, color: '#d02030' }, fx: 'rend', desc: 'Удар с сильным кровотечением.' },
      { id: 'w_phantom', branch: 'blademaster', name: 'Призрачные клинки', icon: '🗡', color: '#a0c0ff', lvl: 65, type: 'aoeTarget', range: 25, radius: 5, dmg: 4.2, cost: 40, cd: 18, anim: 'cast2', fx: 'phantomblades', desc: 'Призрачные мечи обрушиваются с небес.' },
    ],
  },
  archer: {
    id: 'archer', name: 'Лучник', role: 'Дальний бой', resource: 'Энергия', resColor: '#e0c040',
    desc: 'Зоркий охотник лесных рубежей. Поражает врагов издалека, прежде чем те успевают приблизиться.',
    mainStat: 'agi', armorType: 'leather', weapons: ['bow', 'longbow'], offhand: ['quiver'],
    base: { hp: 100, hpLvl: 13, res: 100, resLvl: 0, resRegen: 11, str: 6, agi: 14, int: 6, sta: 9, crit: 0.1, speed: 7.0 },
    melee: false, range: 28, atkSpeed: 1.6, projectile: 'arrow',
    look: {
      male: { skin: '#e0b090', scale: 0.99, legLen: 1.04, armLen: 1.0, torsoW: 1.0, torsoD: 0.95, limb: 0.98, head: 1.0, hair: { style: 'long', color: '#7a5030' }, eyes: { color: '#3a7a4a' } },
      female: { skin: '#ecc4a4', scale: 0.95, legLen: 1.06, armLen: 1.0, torsoW: 0.95, torsoD: 0.95, limb: 0.95, head: 1.0, hair: { style: 'long', color: '#d8b060' }, eyes: { color: '#3a8a6a' }, female: true },
    },
    branches: {
      ranger: { name: 'Следопыт', desc: 'Друг зверей и леса. Призывает духа-волка, опутывает врагов лозами.', color: '#60c060', passive: { hpMul: 1.1, dmgMul: 1.05 } },
      sniper: { name: 'Снайпер', desc: 'Один выстрел — одна цель. +30% критического урона, +5 к дальности.', color: '#a080ff', passive: { critDmg: 0.3, rangeAdd: 5 } },
    },
    skills: [
      { id: 'a_aimed', name: 'Прицельный выстрел', icon: '➶', color: '#e0d090', lvl: 1, type: 'proj', range: 30, dmg: 1.45, cost: 15, cd: 2.5, anim: 'bow', projectile: 'arrow', fx: 'arrowhit', desc: 'Точный выстрел в цель.' },
      { id: 'a_multi', name: 'Мультивыстрел', icon: '⋔', color: '#f0e0a0', lvl: 3, type: 'multi', range: 26, count: 5, spread: 0.5, dmg: 0.9, cost: 25, cd: 8, anim: 'bow', projectile: 'arrow', fx: 'arrowhit', desc: 'Веер из пяти стрел.' },
      { id: 'a_poison', name: 'Отравленная стрела', icon: '☣', color: '#70e040', lvl: 6, type: 'proj', range: 30, dmg: 0.7, cost: 20, cd: 10, anim: 'bow', projectile: 'poisonarrow', dot: { dmg: 2.6, dur: 8, color: '#70e040' }, fx: 'poison', desc: 'Яд наносит урон в течение 8 сек.' },
      { id: 'a_leap', name: 'Отскок', icon: '↶', color: '#a0e0ff', lvl: 10, type: 'leap', dist: 11, cost: 15, cd: 12, anim: 'hit', fx: 'dust', desc: 'Отпрыгивает назад от врагов.' },
      { id: 'a_rain', name: 'Град стрел', icon: '☔', color: '#d0c0a0', lvl: 15, type: 'rain', range: 30, radius: 6, dmg: 2.4, waves: 4, cost: 35, cd: 15, anim: 'bow', fx: 'arrowrain', desc: 'Ливень стрел накрывает область.' },
      { id: 'a_pierce', name: 'Пронзающая стрела', icon: '➳', color: '#ffffff', lvl: 22, type: 'line', range: 36, width: 2, dmg: 2.6, cost: 30, cd: 12, anim: 'bow', fx: 'piercearrow', desc: 'Стрела пронзает всех врагов на линии.' },
      { id: 'a_wolf', branch: 'ranger', name: 'Зов зверя', icon: '🐺', color: '#80d0ff', lvl: 40, type: 'summon', summon: 'spiritwolf', count: 1, max: 1, dur: 90, cost: 40, cd: 45, anim: 'buff', fx: 'summonnature', desc: 'Призывает духа-волка, сражающегося рядом.' },
      { id: 'a_vines', branch: 'ranger', name: 'Шипастые лозы', icon: '🌿', color: '#50c040', lvl: 50, type: 'aoeTarget', range: 28, radius: 6, dmg: 1.8, root: 4, cost: 30, cd: 16, anim: 'cast', fx: 'vines', desc: 'Лозы опутывают и ранят врагов (обездвиживание 4 сек).' },
      { id: 'a_storm', branch: 'ranger', name: 'Стрела бури', icon: '⚡', color: '#90d0ff', lvl: 65, type: 'chain', range: 30, dmg: 4.0, jumps: 4, cost: 35, cd: 12, anim: 'bow', projectile: 'stormarrow', fx: 'lightning_hit', desc: 'Стрела, бьющая цепной молнией.' },
      { id: 'a_heart', branch: 'sniper', name: 'Выстрел в сердце', icon: '🎯', color: '#ff5050', lvl: 40, type: 'proj', range: 42, dmg: 5.2, cost: 35, cd: 12, cast: 1.2, anim: 'bow', projectile: 'bigarrow', fx: 'crit', desc: 'Долгое прицеливание и сокрушительный выстрел.' },
      { id: 'a_explosive', branch: 'sniper', name: 'Взрывная стрела', icon: '💥', color: '#ff9030', lvl: 50, type: 'proj', range: 32, dmg: 2.9, splash: 5, cost: 30, cd: 10, anim: 'bow', projectile: 'firearrow', fx: 'explosion', desc: 'Стрела взрывается, задевая врагов вокруг.' },
      { id: 'a_volley', branch: 'sniper', name: 'Теневой залп', icon: '☄', color: '#b080ff', lvl: 65, type: 'rain', range: 32, radius: 7, dmg: 5.0, waves: 5, cost: 45, cd: 20, anim: 'bow', fx: 'shadowrain', desc: 'Тёмные стрелы с небес на большую область.' },
    ],
  },
  mage: {
    id: 'mage', name: 'Маг', role: 'Магия стихий', resource: 'Мана', resColor: '#3a7ae0',
    desc: 'Повелитель стихий, изучивший древние трактаты Аврелиона. Хрупок телом, но разрушителен в бою.',
    mainStat: 'int', armorType: 'cloth', hat: 0, weapons: ['staff', 'wand'], offhand: ['orb'],
    base: { hp: 88, hpLvl: 11, res: 130, resLvl: 13, resRegen: 3, str: 4, agi: 6, int: 15, sta: 8, crit: 0.08, speed: 6.6 },
    melee: false, range: 25, atkSpeed: 1.6, projectile: 'magic',
    look: {
      male: { skin: '#e3b896', scale: 1.0, legLen: 1.02, armLen: 1.0, torsoW: 0.95, torsoD: 0.95, limb: 0.92, head: 1.0, hair: { style: 'long', color: '#c8c8d0' }, beard: 'short', eyes: { color: '#60b0ff', glow: true } },
      female: { skin: '#f0cdb2', scale: 0.95, legLen: 1.05, armLen: 1.0, torsoW: 0.92, torsoD: 0.92, limb: 0.9, head: 1.0, hair: { style: 'long', color: '#2a1a40' }, eyes: { color: '#60b0ff', glow: true }, female: true },
    },
    branches: {
      light: { name: 'Светлый маг', desc: 'Магия чистого Света. Лучи, исцеление и щиты. +20% к лечению.', color: '#fff2b0', passive: { healMul: 1.2, hpMul: 1.1 }, robe: { c1: '#f2efe6', c2: '#d4a83a', gem: '#ffe680' } },
      dark: { name: 'Тёмный маг', desc: 'Запретная магия Тени. Проклятия, похищение жизни, Бездна. +15% урона.', color: '#a050ff', passive: { dmgMul: 1.15 }, robe: { c1: '#1c1424', c2: '#6a2a9a', gem: '#b050ff' } },
    },
    skills: [
      { id: 'm_fireball', name: 'Огненный шар', icon: '🔥', color: '#ff7020', lvl: 1, type: 'proj', range: 28, dmg: 1.5, cost: 10, cd: 1.6, anim: 'cast', projectile: 'fireball', fx: 'explosion', desc: 'Пылающий шар огня.' },
      { id: 'm_frost', name: 'Ледяная стрела', icon: '❄', color: '#80d0ff', lvl: 3, type: 'proj', range: 28, dmg: 1.25, cost: 12, cd: 4, anim: 'cast', projectile: 'frostbolt', slow: 3, fx: 'frost', desc: 'Ранит и замедляет цель.' },
      { id: 'm_nova', name: 'Кольцо мороза', icon: '✳', color: '#a0e8ff', lvl: 6, type: 'aoeSelf', radius: 7, dmg: 1.0, root: 3, cost: 25, cd: 14, anim: 'cast2', fx: 'frostnova', desc: 'Замораживает врагов вокруг на 3 сек.' },
      { id: 'm_blink', name: 'Скачок', icon: '✧', color: '#c0a0ff', lvl: 10, type: 'blink', dist: 13, cost: 15, cd: 12, anim: 'cast', fx: 'blink', desc: 'Мгновенный телепорт вперёд.' },
      { id: 'm_chain', name: 'Цепная молния', icon: '⚡', color: '#a0c8ff', lvl: 15, type: 'chain', range: 26, dmg: 1.9, jumps: 4, cost: 30, cd: 8, anim: 'cast', fx: 'lightning_hit', desc: 'Молния перескакивает между врагами.' },
      { id: 'm_meteor', name: 'Метеор', icon: '☄', color: '#ff5020', lvl: 22, type: 'aoeTarget', range: 30, radius: 7, dmg: 3.6, cast: 1.2, cost: 45, cd: 18, anim: 'cast2', fx: 'meteor', desc: 'Призывает метеор с небес.' },
      { id: 'm_lance', branch: 'light', name: 'Копьё света', icon: '✦', color: '#fff0a0', lvl: 40, type: 'line', range: 32, width: 2.2, dmg: 2.9, cost: 30, cd: 7, anim: 'cast', fx: 'lightbeam', desc: 'Луч света пронзает врагов на линии.' },
      { id: 'm_bless', branch: 'light', name: 'Благословение', icon: '✚', color: '#ffe080', lvl: 50, type: 'heal', heal: 0.45, shield: 0.2, dur: 10, cost: 40, cd: 30, anim: 'cast2', fx: 'holylight', desc: 'Исцеляет 45% здоровья и даёт щит.' },
      { id: 'm_solar', branch: 'light', name: 'Солнечный гнев', icon: '☀', color: '#ffd040', lvl: 65, type: 'aoeTarget', range: 30, radius: 9, dmg: 5.2, cast: 1.0, cost: 60, cd: 25, anim: 'cast2', fx: 'solar', desc: 'Сфера солнечного пламени испепеляет область.' },
      { id: 'm_shadow', branch: 'dark', name: 'Теневая стрела', icon: '☾', color: '#a050ff', lvl: 40, type: 'proj', range: 28, dmg: 2.4, cost: 20, cd: 4, anim: 'cast', projectile: 'shadowbolt', dot: { dmg: 1.6, dur: 6, color: '#a050ff' }, fx: 'shadowhit', desc: 'Тень разъедает цель изнутри.' },
      { id: 'm_drain', branch: 'dark', name: 'Похищение жизни', icon: '♥', color: '#e02060', lvl: 50, type: 'proj', range: 26, dmg: 2.6, lifesteal: 1.0, cost: 30, cd: 10, anim: 'cast', projectile: 'drain', fx: 'drain', desc: 'Высасывает жизнь врага, исцеляя вас.' },
      { id: 'm_void', branch: 'dark', name: 'Разлом Бездны', icon: '◉', color: '#7020c0', lvl: 65, type: 'pull', range: 30, radius: 9, dmg: 5.0, waves: 4, cost: 60, cd: 25, anim: 'cast2', fx: 'voidrift', desc: 'Чёрная дыра затягивает и разрывает врагов.' },
    ],
  },
  necro: {
    id: 'necro', name: 'Некромант', role: 'Призыватель', resource: 'Мана', resColor: '#40c080',
    desc: 'Изгнанник, познавший тайны смерти. Поднимает мёртвых и обращает силы тлена против живых.',
    mainStat: 'int', armorType: 'cloth', hat: 1, weapons: ['bonestaff', 'scythe'], offhand: ['skull'],
    base: { hp: 92, hpLvl: 12, res: 125, resLvl: 12, resRegen: 3, str: 5, agi: 6, int: 14, sta: 9, crit: 0.06, speed: 6.5 },
    melee: false, range: 24, atkSpeed: 1.7, projectile: 'bone',
    look: {
      male: { skin: '#b9b8ad', scale: 1.02, legLen: 1.06, armLen: 1.04, torsoW: 0.9, torsoD: 0.88, limb: 0.82, head: 1.0, neckLen: 1.2, hair: { style: 'long', color: '#101010' }, eyes: { color: '#50ff90', glow: true }, lips: '#3a3040' },
      female: { skin: '#c4c2b8', scale: 0.97, legLen: 1.07, armLen: 1.03, torsoW: 0.88, torsoD: 0.88, limb: 0.82, head: 1.0, neckLen: 1.2, hair: { style: 'long', color: '#e8e8e8' }, eyes: { color: '#50ff90', glow: true }, female: true, lips: '#40304a' },
    },
    branches: {
      legion: { name: 'Повелитель Легиона', desc: 'Армия нежити под вашим началом. Прислужники +40% урона и здоровья, до 5 скелетов.', color: '#70ff90', passive: { minionMul: 1.4, maxMinions: 5 } },
      reaper: { name: 'Жнец Душ', desc: 'Сама Смерть с косой. +20% урона умений, 5% вампиризма.', color: '#40e0d0', passive: { dmgMul: 1.2, lifesteal: 0.05 } },
    },
    skills: [
      { id: 'n_bone', name: 'Костяная стрела', icon: '🦴', color: '#e0e0c0', lvl: 1, type: 'proj', range: 26, dmg: 1.35, cost: 9, cd: 1.6, anim: 'cast', projectile: 'bonespear', fx: 'bonehit', desc: 'Острый осколок кости.' },
      { id: 'n_raise', name: 'Поднять скелета', icon: '💀', color: '#d0ffd0', lvl: 3, type: 'summon', summon: 'skeleton', count: 1, max: 3, dur: 90, cost: 25, cd: 5, anim: 'cast2', fx: 'summondark', desc: 'Поднимает скелета-воина (до 3).' },
      { id: 'n_curse', name: 'Проклятие тлена', icon: '☠', color: '#80ff40', lvl: 6, type: 'proj', range: 26, dmg: 0.5, cost: 18, cd: 12, anim: 'cast', projectile: 'curse', dot: { dmg: 2.2, dur: 10, color: '#80ff40' }, curse: { vuln: 1.25, weak: 0.75, dur: 10 }, fx: 'poison', desc: 'Цель получает +25% урона и слабеет.' },
      { id: 'n_tap', name: 'Похищение жизни', icon: '♥', color: '#e02040', lvl: 10, type: 'proj', range: 24, dmg: 1.6, lifesteal: 0.6, cost: 20, cd: 8, anim: 'cast', projectile: 'drain', fx: 'drain', desc: 'Крадёт здоровье врага.' },
      { id: 'n_plague', name: 'Чумной взрыв', icon: '☣', color: '#90ff50', lvl: 15, type: 'aoeTarget', range: 26, radius: 6, dmg: 2.4, cost: 35, cd: 12, anim: 'cast2', fx: 'plague', desc: 'Взрыв чумного газа.' },
      { id: 'n_army', name: 'Армия мёртвых', icon: '⚰', color: '#a0ffa0', lvl: 22, type: 'summon', summon: 'skeleton', count: 4, max: 99, dur: 25, cost: 50, cd: 60, anim: 'cast2', fx: 'summondark', desc: 'Из-под земли встают 4 скелета на 25 сек.' },
      { id: 'n_golem', branch: 'legion', name: 'Костяной голем', icon: '🗿', color: '#e0e0c0', lvl: 40, type: 'summon', summon: 'bonegolem', count: 1, max: 1, dur: 120, cost: 60, cd: 60, anim: 'cast2', fx: 'summondark', desc: 'Огромный голем из костей.' },
      { id: 'n_frenzy', branch: 'legion', name: 'Нечестивое неистовство', icon: '✹', color: '#40ff60', lvl: 50, type: 'minionbuff', cost: 30, cd: 30, anim: 'buff', buff: { dmgMul: 1.6, dur: 12 }, fx: 'frenzy', desc: 'Прислужники +60% урона и полностью исцелены.' },
      { id: 'n_knight', branch: 'legion', name: 'Рыцарь Смерти', icon: '♞', color: '#60ffb0', lvl: 65, type: 'summon', summon: 'deathknight', count: 1, max: 1, dur: 60, cost: 70, cd: 90, anim: 'cast2', fx: 'summondark', desc: 'Призывает могучего Рыцаря Смерти.' },
      { id: 'n_harvest', branch: 'reaper', name: 'Жатва душ', icon: '☽', color: '#40e0d0', lvl: 40, type: 'aoeSelf', radius: 6, dmg: 2.6, healPerHit: 0.04, cost: 30, cd: 8, anim: 'sweep', fx: 'harvest', desc: 'Круговой взмах, исцеляющий за каждого задетого.' },
      { id: 'n_deathscythe', branch: 'reaper', name: 'Коса Смерти', icon: '⚚', color: '#30d0c0', lvl: 50, type: 'line', range: 30, width: 3, dmg: 3.4, cost: 35, cd: 10, anim: 'sweep', fx: 'scytheline', desc: 'Призрачная коса проносится по линии.' },
      { id: 'n_avatar', branch: 'reaper', name: 'Аватар Смерти', icon: '☠', color: '#20ffe0', lvl: 65, type: 'buff', cost: 50, cd: 60, anim: 'buff', buff: { dmgMul: 1.6, lifesteal: 0.2, dur: 15 }, fx: 'avatar', desc: '+60% урона и 20% вампиризма на 15 сек.' },
    ],
  },
};

export const CLASS_LIST = Object.values(CLASSES);

export function xpNeeded(level) { return Math.round(70 * Math.pow(level, 1.62) + 130); }
export function mobXp(level) { return Math.round(22 + 9 * Math.pow(level, 1.6)); }

export function skillsFor(cls, level, branch) {
  return CLASSES[cls].skills.filter(s => s.lvl <= level && (!s.branch || s.branch === branch));
}
