// Точка входа: рендерер, постобработка, загрузка мира, меню, создание героя, игровой цикл.
import { buildMount } from './chars/horse.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { shockPassDef } from './fx/feel.js';
import { World } from './world/world.js';
import { Game } from './game/game.js';
import { FX } from './fx/particles.js';
import { setMaxAnisotropy, runeCircle } from './core/textures.js';
import { CLASSES, CLASS_LIST } from './data/classes.js';
import { showcaseKit } from './data/items.js';
import { buildPlayerModel } from './game/player.js';
import { loadHero, heroKey } from './chars/hero/model.js';
import { animateGear } from './chars/gear.js';
import { skillIcon } from './ui/icons.js';
import { CITIES } from './data/world.js';
import { BOSSES } from './data/mobs.js';
import { Input } from './core/input.js';
import { IS_TOUCH, IS_PHONE } from './core/device.js';

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.canvas = $('game');
    if (IS_TOUCH) document.body.classList.add('touch');
    this.quality = IS_PHONE ? 0.5 : IS_TOUCH ? 0.6 : (navigator.hardwareConcurrency || 4) >= 6 ? 1 : 0.6;
    try { const q = localStorage.getItem('three_crowns_quality'); if (q) this.quality = +q; } catch (e) { /* */ }
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(this.pixelRatioFor(this.quality));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.outputColorSpace = THREE.SRGBColorSpace;
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.25, 4200);
    this.input = new Input(this.canvas);
    this.input.onClick = (x, y, b) => { if (this.game && this.game.started) this.game.onClick(x, y, b); };
    // постобработка
    // HDR-буфер, если устройство умеет рисовать в float-текстуры (на части телефонов — нет)
    const hdr = r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float');
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: IS_TOUCH ? 2 : 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), hdr ? 0.45 : 0.3, 0.5, hdr ? 1.6 : 0.92);
    this.bloom.enabled = this.quality >= 0.6;
    // мягкие контактные тени (ambient occlusion) — только на мощных ПК
    if (!IS_TOUCH) {
      this.ao = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 10 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
      this.ao.enabled = this.quality >= 1.2;
      // затенение считается в половинном разрешении — в 4 раза дешевле, на глаз не отличить
      const aoSet = this.ao.setSize.bind(this.ao);
      this.ao.setSize = (w, h) => aoSet(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
      this.composer.addPass(this.ao);
    }
    // защита от «битых» пикселей (NaN/бесконечность) и пересветов: иначе свечение
    // раздувает их в мигающие квадраты на земле и горах
    this.sanitize = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        bool ok(vec4 c) { return c.r == c.r && c.g == c.g && c.b == c.b && max(c.r, max(c.g, c.b)) < 6.0e4; }
        void main(){
          vec2 px = vec2(abs(dFdx(vUv.x)), abs(dFdy(vUv.y)));
          vec4 c = texture2D(tDiffuse, vUv);
          vec4 a = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)), b = texture2D(tDiffuse, vUv - vec2(px.x, 0.0));
          vec4 d = texture2D(tDiffuse, vUv + vec2(0.0, px.y)), e = texture2D(tDiffuse, vUv - vec2(0.0, px.y));
          a = ok(a) ? a : vec4(0.0); b = ok(b) ? b : vec4(0.0); d = ok(d) ? d : vec4(0.0); e = ok(e) ? e : vec4(0.0);
          if (!ok(c)) c = (a + b + d + e) * 0.25;
          // одиночный пересвеченный пиксель (блик) не даёт мигающих квадратов в свечении
          float lc = max(c.r, max(c.g, c.b));
          float ln = max(max(max(a.r, a.g), max(b.r, b.g)), max(max(d.r, d.g), max(e.r, e.g)));
          ln = max(ln, max(max(a.b, b.b), max(d.b, e.b)));
          float lim = max(1.2, ln * 2.0);
          if (lc > lim) c.rgb *= lim / lc;
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 16.0), c.a);
        }`,
    });
    // ударная волна искажения от больших взрывов (включается только на время волны)
    this.shockPass = new ShaderPass(shockPassDef());
    this.shockPass.enabled = false;
    this.composer.addPass(this.shockPass);
    this.composer.addPass(this.sanitize);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // цветокоррекция и виньетка (после тонмаппинга)
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uVig: { value: IS_TOUCH ? 0.18 : 0.28 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 1.1);                           // насыщенность
          c = (c - 0.5) * 1.06 + 0.5;                         // контраст
          c *= mix(vec3(0.97, 0.99, 1.05), vec3(1.04, 1.01, 0.95), smoothstep(0.2, 0.8, l)); // тёплые света, холодные тени
          vec2 d = vUv - 0.5;
          c *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
    });
    this.composer.addPass(this.grade);
    this.composer.setPixelRatio(r.getPixelRatio());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    // звук на мобильных включается только после касания
    const unlock = () => { try { if (this.game && this.game.ui) this.game.ui.unlockAudio(); } catch (e) { /* */ } };
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock);
    this.setupMobileShell();
    this.clock = new THREE.Clock();
    this.mode = 'loading';
  }

  // Автоподстройка разрешения: при просадке FPS рендер становится чуть мельче,
  // при запасе — возвращается к исходному
  adaptResolution(raw) {
    if (raw > 0.25) return; // пауза/сворачивание вкладки
    const R = this.dyn || (this.dyn = { ema: 1 / 60, low: 0, high: 0, scale: 1, lock: 0 });
    R.ema += (raw - R.ema) * 0.05;
    R.lock = Math.max(0, R.lock - raw);
    if (R.ema > 1 / 48) { R.low += raw; R.high = 0; } else if (R.ema < 1 / 57) { R.high += raw; R.low = 0; } else { R.low = 0; R.high = 0; }
    let ns = R.scale;
    if (R.low > 1.5 && R.scale > 0.6) { ns = R.scale - 0.1; R.low = 0; R.lock = 10; }
    else if (R.high > 8 && R.scale < 1 && R.lock <= 0) { ns = R.scale + 0.1; R.high = 0; R.lock = 20; }
    if (ns !== R.scale) {
      R.scale = Math.round(ns * 10) / 10;
      const pr = this.pixelRatioFor(this.quality) * R.scale;
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
      this.resize();
    }
  }

  pixelRatioFor(q) {
    const dpr = window.devicePixelRatio || 1;
    if (q >= 1.2) return Math.min(dpr, 1.5);
    if (q >= 1) return Math.min(dpr, 1.25);
    if (q >= 0.6) return Math.min(dpr, IS_TOUCH ? 1.5 : 1);
    return Math.min(dpr, IS_TOUCH ? 1.25 : 1);
  }

  setQuality(q) {
    this.quality = q;
    if (this.dyn) this.dyn.scale = 1;
    try { localStorage.setItem('three_crowns_quality', q); } catch (e) { /* */ }
    this.renderer.setPixelRatio(this.pixelRatioFor(q));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom.enabled = q >= 0.6;
    if (this.ao) this.ao.enabled = q >= 1.2;
    if (this.world) this.world.applyQuality(q);
    this.resize();
  }

  // Полноэкранный режим, подсказка о повороте экрана
  setupMobileShell() {
    const fs = $('btn-fullscreen');
    const canFs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    if (fs) {
      if (!IS_TOUCH || !canFs) fs.classList.add('hidden');
      fs.onclick = () => this.enterFullscreen();
    }
    if (IS_TOUCH && /iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone) $('ios-tip') && $('ios-tip').classList.remove('hidden');
    const check = () => {
      const portrait = IS_TOUCH && window.innerHeight > window.innerWidth;
      $('rotate').classList.toggle('hidden', !portrait);
    };
    window.addEventListener('resize', check);
    check();
  }
  enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    Promise.resolve(req.call(el)).then(() => {
      try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* */ }
    }).catch(() => {});
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.shockPass) this.shockPass.uniforms.uAsp.value = w / Math.max(1, h);
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
    // заранее подгрузить детальную модель героя из сохранения
    if (save && save.player && save.player.cls) loadHero(heroKey(save.player.cls, !!save.player.female)).catch(() => {});
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
    if (!this.menuModel.isHero) {
      const want = this.sel + this.female;
      loadHero(heroKey(this.sel, this.female)).then(() => { if (this.mode === 'create' && this.sel + this.female === want) this.showCreate(); }).catch(() => {});
    }
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
    if (IS_TOUCH && !document.fullscreenElement) this.enterFullscreen();
    this.input.joyEnabled = true;
    if (this.menuModel) { this.menuModel.root.removeFromParent(); this.menuModel = null; }
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    this.game = new Game(this);
    this.game.start(data, save);
    this.game.feel.shock = this.shockPass;
    this.resize();
    try {
      const moon = this.world.moon, mv = moon.visible;
      moon.visible = true;
      if (this.game.effects.warmup) this.game.effects.warmup(this.game.player.pos);
      this.renderer.compile(this.scene, this.camera);
      moon.visible = mv;
    } catch (e) { /* */ }
    window.addEventListener('beforeunload', () => this.game.save());
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
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
      if (this.ao) this.ao.enabled = false;
    } else if (this.mode === 'game' && this.game) {
      if (this.ao) this.ao.enabled = this.quality >= 1.2;
      this.game.update(dt);
      this.adaptResolution(raw);
    }
    this.input.endFrame();
    if (this.world && (this.mode === 'game' || this.mode === 'menu')) this.world.renderReflection(this.renderer, this.camera);
    if (this.mode !== 'loading') this.composer.render();
  }
}

const app = new App();
window.__app = app;
window.__bosses = BOSSES;
window.__horse = { buildMount };
window.__heroMod = { loadHero, heroKey };
app.loop();
app.load().catch(e => { console.error(e); $('load-text').textContent = 'Ошибка загрузки: ' + e.message; });
