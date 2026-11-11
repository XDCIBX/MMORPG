// Ввод: клавиатура и мышь на ПК, сенсорное управление (джойстик, жесты камеры) на телефонах.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.down = new Set();
    this.mouse = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.dragging = false;
    this.onClick = null;
    // сенсорное управление
    this.joy = { x: 0, y: 0, active: false };
    this.touchCam = false;
    this.lastTouchT = -1e9;
    this.initMouse();
    this.initTouch();
  }

  initMouse() {
    const canvas = this.canvas;
    let moved = 0;
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.down.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; this.dragging = false; this.resetTouch(); });
    canvas.addEventListener('mousedown', (e) => {
      if (performance.now() - this.lastTouchT < 800) return; // эмуляция мыши после касания
      this.mouse[e.button] = true; moved = 0;
      if (e.button === 0 || e.button === 2) this.dragging = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging && !this.touchCam) { this.dx += e.movementX; this.dy += e.movementY; moved += Math.abs(e.movementX) + Math.abs(e.movementY); }
    });
    window.addEventListener('mouseup', (e) => {
      const wasDown = this.mouse[e.button];
      this.mouse[e.button] = false;
      if (!this.mouse[0] && !this.mouse[2] && !this.touchCam) this.dragging = false;
      if (wasDown && moved < 6 && e.target === canvas && this.onClick) this.onClick(e.clientX, e.clientY, e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  }

  // Касания по холсту: левая нижняя часть — джойстик, остальное — камера (1 палец — поворот, 2 — масштаб), короткое касание — выбор цели
  initTouch() {
    const canvas = this.canvas;
    this.joyTouch = null;
    this.camTouches = new Map();
    this.pinchDist = 0;
    const joyEl = () => document.getElementById('joystick');
    const knobEl = () => document.getElementById('joy-knob');
    const R = 56;
    const start = (e) => {
      e.preventDefault();
      this.lastTouchT = performance.now();
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY;
        const inJoyZone = x < window.innerWidth * 0.42 && y > window.innerHeight * 0.3;
        if (inJoyZone && this.joyTouch === null && this.joyEnabled) {
          this.joyTouch = { id: t.identifier, cx: x, cy: y };
          this.joy.active = true;
          const j = joyEl();
          if (j) { j.style.left = x + 'px'; j.style.top = y + 'px'; j.classList.add('on'); }
        } else {
          this.camTouches.set(t.identifier, { x, y, sx: x, sy: y, t: performance.now(), moved: 0 });
          if (this.camTouches.size === 2) {
            const [a, b] = [...this.camTouches.values()];
            this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
          }
          this.touchCam = true;
          this.dragging = this.camTouches.size === 1;
        }
      }
    };
    const move = (e) => {
      e.preventDefault();
      this.lastTouchT = performance.now();
      for (const t of e.changedTouches) {
        if (this.joyTouch && t.identifier === this.joyTouch.id) {
          let dx = t.clientX - this.joyTouch.cx, dy = t.clientY - this.joyTouch.cy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = dx / d * R; dy = dy / d * R; }
          this.joy.x = dx / R; this.joy.y = -dy / R;
          const k = knobEl();
          if (k) k.style.transform = `translate(${dx}px, ${dy}px)`;
          continue;
        }
        const c = this.camTouches.get(t.identifier);
        if (!c) continue;
        const mx = t.clientX - c.x, my = t.clientY - c.y;
        c.moved += Math.abs(mx) + Math.abs(my);
        c.x = t.clientX; c.y = t.clientY;
        if (this.camTouches.size === 1) { this.dx += mx * 1.25; this.dy += my * 1.25; }
      }
      if (this.camTouches.size === 2) {
        const [a, b] = [...this.camTouches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.wheel += (this.pinchDist - d) * 4;
        this.pinchDist = d;
      }
    };
    const end = (e) => {
      e.preventDefault();
      this.lastTouchT = performance.now();
      for (const t of e.changedTouches) {
        if (this.joyTouch && t.identifier === this.joyTouch.id) {
          this.joyTouch = null;
          this.joy.x = this.joy.y = 0; this.joy.active = false;
          const j = joyEl(); if (j) { j.classList.remove('on'); j.style.left = ''; j.style.top = ''; }
          const k = knobEl(); if (k) k.style.transform = '';
          continue;
        }
        const c = this.camTouches.get(t.identifier);
        if (!c) continue;
        this.camTouches.delete(t.identifier);
        const short = performance.now() - c.t < 350 && c.moved < 14;
        if (short && e.type === 'touchend' && this.onClick) this.onClick(c.x, c.y, 'tap');
      }
      this.dragging = this.camTouches.size === 1;
      if (this.camTouches.size === 0) this.touchCam = false;
      if (this.camTouches.size < 2) this.pinchDist = 0;
    };
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });
    // запрет масштабирования страницы жестами (iOS)
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
  }
  resetTouch() {
    this.joyTouch = null; this.joy.x = this.joy.y = 0; this.joy.active = false;
    this.camTouches && this.camTouches.clear(); this.touchCam = false;
  }

  // виртуальное нажатие клавиши (кнопки на экране)
  tap(code) { this.down.add(code); }
  key(c) { return this.keys.has(c); }
  pressed(c) { return this.down.has(c); }
  get bothMouse() { return this.mouse[0] && this.mouse[2]; }
  endFrame() { this.down.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
