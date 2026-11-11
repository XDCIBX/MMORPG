// Точка входа: рендерер, постобработка, загрузка мира, меню, создание героя, игровой цикл.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World } from './world/world.js';
import { Game } from './game/game.js';
import { FX } from './fx/particles.js';
import { setMaxAnisotropy, runeCircle } from './core/textures.js';
import { CLASSES, CLASS_LIST } from './data/classes.js';
import { showcaseKit } from './data/items.js';
import { buildPlayerModel } from './game/player.js';
import { animateGear } from './chars/gear.js';
import { skillIcon } from './ui/icons.js';
import { CITIES } from './data/world.js';
import { BOSSES } from './data/mobs.js';

const $ = (id) => document.getElementById(id);

// ---------- Ввод ----------
class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.down = new Set();
    this.mouse = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.dragging = false;
    this.onClick = null;
    let sx = 0, sy = 0, moved = 0;
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.down.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; this.dragging = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse[e.button] = true; sx = e.clientX; sy = e.clientY; moved = 0;
      if (e.button === 0 || e.button === 2) { this.dragging = true; }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) { this.dx += e.movementX; this.dy += e.movementY; moved += Math.abs(e.movementX) + Math.abs(e.movementY); }
    });
    window.addEventListener('mouseup', (e) => {
      const wasDown = this.mouse[e.button];
      this.mouse[e.button] = false;
      if (!this.mouse[0] && !this.mouse[2]) this.dragging = false;
      if (wasDown && moved < 6 && e.target === canvas && this.onClick) this.onClick(e.clientX, e.clientY, e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    void sx; void sy;
  }
  key(c) { return this.keys.has(c); }
  pressed(c) { return this.down.has(c); }
  get bothMouse() { return this.mouse[0] && this.mouse[2]; }
  endFrame() { this.down.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}

class App {
  constructor() {
    this.canvas = $('game');
    this.quality = (navigator.hardwareConcurrency || 4) >= 6 ? 1 : 0.6;
    try { const q = localStorage.getItem('three_crowns_quality'); if (q) this.quality = +q; } catch (e) { /* */ }
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.quality >= 1 ? 1.5 : 1));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.outputColorSpace = THREE.SRGBColorSpace;
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4200);
    this.input = new Input(this.canvas);
    this.input.onClick = (x, y, b) => { if (this.game && this.game.started) this.game.onClick(x, y, b); };
    // постобработка
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.5, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(r.getPixelRatio());
    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.mode = 'loading';
  }

  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('three_crowns_quality', q); } catch (e) { /* */ }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q >= 1 ? 1.5 : 1));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom.enabled = q >= 0.6;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.menuCam) { this.menuCam.aspect = w / h; this.menuCam.updateProjectionMatrix(); }
    FX.setScale(h * this.renderer.getPixelRatio() * 0.5 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  async load() {
    const prog = (t, k) => { $('load-text').textContent = t; $('load-fill').style.width = (k * 100) + '%'; };
    this.world = new World(this.scene, this.renderer, this.quality);
    await this.world.build(prog);
    FX.init(this.scene, this.quality);
    this.resize();
    prog('Подготовка шейдеров…', 0.9);
    await new Promise(r => setTimeout(r, 30));
    this.camera.position.set(CITIES[0].x + 60, 40, CITIES[0].z + 60);
    this.camera.lookAt(CITIES[0].x, 5, CITIES[0].z);
    this.world.update(0.016, new THREE.Vector3(CITIES[0].x, 0, CITIES[0].z), this.camera.position);
    this.renderer.compile(this.scene, this.camera);
    prog('Готово', 1);
    await new Promise(r => setTimeout(r, 200));
    $('screen-loading').classList.add('hidden');
    this.showMenu();
  }

  // ---------- Главное меню (облёт города) ----------
  showMenu() {
    this.mode = 'menu';
    $('screen-menu').classList.remove('hidden');
    let save = null;
    try { save = JSON.parse(localStorage.getItem('three_crowns_save_v1')); } catch (e) { /* */ }
    this.save = save;
    $('btn-continue').disabled = !save;
    if (save) $('save-info').textContent = `${save.player.name} — ${CLASSES[save.player.cls].name}, ${save.player.level} уровень`;
    $('btn-continue').onclick = () => { $('screen-menu').classList.add('hidden'); this.startGame(save.player, save); };
    $('btn-new').textContent = 'Новый герой';
    let armed = false;
    $('btn-new').onclick = () => {
      if (save && !armed) { armed = true; $('btn-new').textContent = 'Нажмите ещё раз: сохранение сотрётся'; return; }
      $('screen-menu').classList.add('hidden'); this.showCreate();
    };
  }

  // ---------- Создание персонажа ----------
  buildMenuScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#0b0a12');
    s.fog = new THREE.Fog('#0b0a12', 8, 26);
    const cam = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
    cam.position.set(0, 1.45, 5.4);
    cam.lookAt(0, 1.0, 0);
    this.menuCam = cam;
    s.add(new THREE.HemisphereLight('#8090c0', '#201810', 0.7));
    const key = new THREE.DirectionalLight('#ffe2b8', 2.4);
    key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    s.add(key);
    const rim = new THREE.DirectionalLight('#6aa0ff', 3.5); rim.position.set(-4, 3, -4); s.add(rim);
    const rim2 = new THREE.DirectionalLight('#ff9a50', 1.5); rim2.position.set(4, 1, -3); s.add(rim2);
    // подиум
    const stone = new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 0.8, metalness: 0.1 });
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 48), stone);
    pod.position.y = -0.15; pod.receiveShadow = true; s.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.04, 8, 64), new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.9, roughness: 0.3, emissive: '#6a4a10', emissiveIntensity: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.0; s.add(ring);
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: runeCircle(), color: '#e8c46a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    rune.rotation.x = -Math.PI / 2; rune.position.y = 0.01; s.add(rune);
    this.menuRune = rune;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#141218', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.3; floor.receiveShadow = true; s.add(floor);
    // частицы-искры
    const pg = new THREE.BufferGeometry();
    const pp = [];
    for (let i = 0; i < 300; i++) pp.push((Math.random() - 0.5) * 14, Math.random() * 6, (Math.random() - 0.5) * 10 - 3);
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    this.menuSparks = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffcf7a', size: 0.04, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.add(this.menuSparks);
    const pm = new THREE.PMREMGenerator(this.renderer);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.35;
    this.menuScene = s;
  }

  showCreate() {
    if (!this.menuScene) this.buildMenuScene();
    this.mode = 'create';
    $('screen-create').classList.remove('hidden');
    const list = $('class-list');
    list.innerHTML = '';
    const icons = { dwarf: '⚒', warrior: '⚔', archer: '➶', mage: '✦', necro: '☠' };
    this.sel = this.sel || 'warrior';
    this.female = this.female || false;
    for (const C of CLASS_LIST) {
      const b = document.createElement('div');
      b.className = 'class-btn' + (C.id === this.sel ? ' sel' : '');
      b.innerHTML = `<div class="ico">${icons[C.id]}</div><div><div class="nm">${C.name}</div><div class="rl">${C.role}</div></div>`;
      b.onclick = () => { this.sel = C.id; this.showCreate(); };
      list.appendChild(b);
    }
    const C = CLASSES[this.sel];
    $('cr-name').textContent = C.name;
    $('cr-role').textContent = `${C.role} · ${C.armorType === 'heavy' ? 'Латы' : C.armorType === 'leather' ? 'Кожаная броня' : 'Тканевые одеяния'} · ${C.resource}`;
    $('cr-desc').textContent = C.desc;
    $('cr-branches').innerHTML = Object.values(C.branches).map(B => `<div class="branch-card"><b style="color:${B.color}">${B.name}</b><div>${B.desc}</div></div>`).join('');
    $('cr-skills').innerHTML = '';
    for (const s of C.skills.filter(s => !s.branch)) {
      const d = document.createElement('div');
      d.className = 'sk';
      d.style.backgroundImage = `url(${skillIcon(s)})`; d.style.backgroundSize = 'cover';
      d.innerHTML = `<span class="glyph" style="font-size:20px">${s.icon}</span>`;
      d.title = `${s.name} (ур. ${s.lvl}): ${s.desc}`;
      $('cr-skills').appendChild(d);
    }
    $('sex-m').classList.toggle('sel', !this.female);
    $('sex-f').classList.toggle('sel', this.female);
    $('sex-m').onclick = () => { this.female = false; this.showCreate(); };
    $('sex-f').onclick = () => { this.female = true; this.showCreate(); };
    $('btn-back').onclick = () => { $('screen-create').classList.add('hidden'); this.showMenu(); };
    $('btn-start').onclick = () => {
      const name = ($('cr-input').value || '').trim() || (this.female ? 'Аэлита' : 'Ратибор');
      $('screen-create').classList.add('hidden');
      try { localStorage.removeItem('three_crowns_save_v1'); } catch (e) { /* */ }
      this.startGame({ name, cls: this.sel, female: this.female }, null);
    };
    // модель на подиуме — в витринном снаряжении
    if (this.menuModel) this.menuModel.root.removeFromParent();
    const kit = showcaseKit(this.sel, this.sel === 'dwarf' ? 38 : 34, 3);
    this.menuModel = buildPlayerModel(this.sel, this.female, kit);
    this.menuModel.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.menuModel.root.rotation.y = this.menuYaw || 0.4;
    this.menuScene.add(this.menuModel.root);
    this.menuModel.playAction(['slash', 'buff', 'cast2', 'bow', 'cast'][CLASS_LIST.indexOf(C) % 5] === 'bow' && this.sel !== 'archer' ? 'buff' : (this.sel === 'archer' ? 'bow' : this.sel === 'mage' || this.sel === 'necro' ? 'cast2' : 'buff'));
    const h = this.menuModel.headTop();
    this.menuCam.position.set(0, h * 0.62, h * 2.15 + 1.2);
    this.menuCam.lookAt(0, h * 0.5, 0);
  }

  startGame(data, save) {
    this.mode = 'game';
    if (this.menuModel) { this.menuModel.root.removeFromParent(); this.menuModel = null; }
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    this.game = new Game(this);
    this.game.start(data, save);
    this.resize();
    window.addEventListener('beforeunload', () => this.game.save());
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.mode === 'menu') {
      const c = CITIES[0];
      const a = t * 0.05;
      this.camera.position.set(c.x + Math.cos(a) * 85, 34 + Math.sin(t * 0.1) * 4, c.z + Math.sin(a) * 85);
      this.camera.lookAt(c.x, 6, c.z);
      this.world.update(dt, new THREE.Vector3(c.x, 0, c.z), this.camera.position);
      FX.update(dt);
      this.renderPass.scene = this.scene; this.renderPass.camera = this.camera;
    } else if (this.mode === 'create') {
      if (this.menuModel) {
        this.menuYaw = (this.menuYaw || 0.4) + dt * 0.35;
        this.menuModel.root.rotation.y = this.menuYaw;
        this.menuModel.update(dt, { speed: 0 });
        animateGear(this.menuModel, t);
        if (!this.menuModel.action && Math.random() < dt * 0.15) this.menuModel.playAction(['slash', 'buff', 'cast', 'cast2'][Math.floor(Math.random() * 4)]);
      }
      this.menuRune.rotation.z += dt * 0.2;
      this.menuSparks.rotation.y += dt * 0.03;
      this.renderPass.scene = this.menuScene; this.renderPass.camera = this.menuCam;
    } else if (this.mode === 'game' && this.game) {
      this.game.update(dt);
    }
    this.input.endFrame();
    if (this.mode !== 'loading') this.composer.render();
  }
}

const app = new App();
window.__app = app;
window.__bosses = BOSSES;
app.loop();
app.load().catch(e => { console.error(e); $('load-text').textContent = 'Ошибка загрузки: ' + e.message; });
