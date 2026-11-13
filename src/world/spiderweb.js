// Паутина для логова пауков: круговые сети между опорами, навес-полог,
// войлочные сети на земле, коконы и отдельные нити.
import * as THREE from 'three';
import { M4 } from './builders.js';

const TAU = Math.PI * 2;

// ---------- Текстуры ----------
// Атлас 2×2: четыре разные круговые сети. Для каждой запоминаем углы рамки (в долях клетки),
// к ним потом крепятся нити в мире.
let orbAtlas = null;
function orbWebAtlas() {
  if (orbAtlas) return orbAtlas;
  const C = 1024, S = C * 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const frames = [];
  for (let cell = 0; cell < 4; cell++) {
    let seed = 7919 * (cell + 3);
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const ox = (cell % 2) * C, oy = Math.floor(cell / 2) * C;
    x.save(); x.translate(ox, oy);
    x.beginPath(); x.rect(0, 0, C, C); x.clip();
    // ступица чуть выше центра — как у настоящих кругопрядов
    const hx = C * (0.47 + rnd() * 0.06), hy = C * (0.42 + rnd() * 0.06);
    // рамка: неправильный многоугольник
    const nf = 5 + Math.floor(rnd() * 3);
    const frame = [];
    for (let i = 0; i < nf; i++) {
      const a = (i + 0.2 + rnd() * 0.6) / nf * TAU;
      const r = C * (0.36 + rnd() * 0.1);
      frame.push([hx + Math.cos(a) * r, hy + Math.sin(a) * r * (1.05 + rnd() * 0.1)]);
    }
    for (const p of frame) { p[0] = Math.min(C * 0.96, Math.max(C * 0.04, p[0])); p[1] = Math.min(C * 0.96, Math.max(C * 0.04, p[1])); }
    frames.push(frame.map(p => [p[0] / C, p[1] / C]));
    // пересечение луча из ступицы с рамкой
    const rayHit = (a) => {
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = 1e9;
      for (let i = 0; i < nf; i++) {
        const [ax, ay] = frame[i], [bx, by] = frame[(i + 1) % nf];
        const ex = bx - ax, ey = by - ay;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((ax - hx) * ey - (ay - hy) * ex) / den;
        const u = ((ax - hx) * dy - (ay - hy) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
      }
      return best;
    };
    x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineCap = 'round'; x.lineJoin = 'round';
    x.shadowColor = 'rgba(255,255,255,0.6)'; x.shadowBlur = 3;
    // рамочные нити (толще) — немного выходят за углы
    x.lineWidth = 4.5;
    x.beginPath();
    for (let i = 0; i <= nf; i++) { const p = frame[i % nf]; if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
    x.stroke();
    // спицы
    const ns = 24 + Math.floor(rnd() * 8);
    const spokes = [];
    for (let i = 0; i < ns; i++) {
      const a = (i + (rnd() - 0.5) * 0.35) / ns * TAU;
      spokes.push({ a, L: rayHit(a) });
    }
    x.lineWidth = 2.6;
    for (const s of spokes) {
      if (!isFinite(s.L)) continue;
      x.beginPath(); x.moveTo(hx + Math.cos(s.a) * C * 0.012, hy + Math.sin(s.a) * C * 0.012);
      x.lineTo(hx + Math.cos(s.a) * s.L, hy + Math.sin(s.a) * s.L); x.stroke();
    }
    // ступица: плотная сеточка
    x.lineWidth = 1.8;
    for (let k = 1; k <= 5; k++) {
      x.beginPath();
      for (let i = 0; i <= ns; i++) { const s = spokes[i % ns], r = C * 0.008 * k * (1 + (rnd() - 0.5) * 0.3); const px = hx + Math.cos(s.a) * r, py = hy + Math.sin(s.a) * r; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
    // ловчая спираль: от свободной зоны к краю, между спицами провисает к центру
    x.lineWidth = 2.0;
    const t0 = 0.17, t1 = 0.93, step = 0.022 + rnd() * 0.006;
    const turns = Math.floor((t1 - t0) / step);
    const dew = [];
    for (let k = 0; k < turns; k++) {
      x.beginPath();
      let started = false;
      for (let i = 0; i <= ns; i++) {
        const s = spokes[i % ns];
        const t = t0 + (k + i / ns) * step;
        if (t > t1 || !isFinite(s.L)) { started = false; continue; }
        const px = hx + Math.cos(s.a) * s.L * t, py = hy + Math.sin(s.a) * s.L * t;
        // разрывы
        if (rnd() < 0.025) { started = false; continue; }
        if (!started) { x.moveTo(px, py); started = true; }
        else {
          const sp = spokes[(i - 1 + ns) % ns], tp = t0 + (k + (i - 1) / ns) * step;
          const qx = hx + Math.cos(sp.a) * sp.L * tp, qy = hy + Math.sin(sp.a) * sp.L * tp;
          const mx = (px + qx) / 2, my = (py + qy) / 2;
          // провисание к ступице и чуть вниз
          const cx = mx + (hx - mx) * 0.045, cy = my + (hy - my) * 0.045 + C * 0.0025;
          x.quadraticCurveTo(cx, cy, px, py);
          if (rnd() < 0.05) dew.push([cx, cy]);
        }
      }
      x.stroke();
    }
    // капли росы — блестят на солнце
    x.shadowBlur = 6;
    x.fillStyle = 'rgba(255,255,255,1)';
    for (const [px, py] of dew) { x.beginPath(); x.arc(px, py, 2.2 + rnd() * 2.2, 0, TAU); x.fill(); }
    x.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  orbAtlas = { tex, frames };
  return orbAtlas;
}

// Войлочная паутина (полог, сети на земле): беспорядочные нити, гуще к центру
let tangleTex = null;
function tangleWebTex() {
  if (tangleTex) return tangleTex;
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  let seed = 4242;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  x.lineCap = 'round';
  x.shadowColor = 'rgba(255,255,255,0.5)'; x.shadowBlur = 2;
  const c = S / 2;
  // радиальные несущие нити
  x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const a = i / 18 * TAU + rnd() * 0.2; x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * S * 0.5, c + Math.sin(a) * S * 0.5); x.stroke(); }
  // беспорядочные короткие нити: плотнее у центра
  for (let i = 0; i < 1300; i++) {
    const r = Math.pow(rnd(), 0.7) * S * 0.48, a = rnd() * TAU;
    const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
    const L = 20 + rnd() * 70, b = rnd() * TAU;
    const fade = 1 - r / (S * 0.5);
    x.strokeStyle = `rgba(255,255,255,${(0.12 + 0.4 * fade * fade).toFixed(2)})`;
    x.lineWidth = 0.8 + rnd() * 0.9;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(b) * L * 0.5 + (rnd() - 0.5) * 10, py + Math.sin(b) * L * 0.5 + (rnd() - 0.5) * 10, px + Math.cos(b) * L, py + Math.sin(b) * L);
    x.stroke();
  }
  // молочная дымка там, где нити слиплись
  const g = x.createRadialGradient(c, c, 0, c, c, S * 0.48);
  g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.shadowBlur = 0; x.fillStyle = g; x.fillRect(0, 0, S, S);
  tangleTex = new THREE.CanvasTexture(cv);
  tangleTex.colorSpace = THREE.SRGBColorSpace;
  tangleTex.anisotropy = 8;
  return tangleTex;
}

const mats = {};
function webMat(kind) {
  if (mats[kind]) return mats[kind];
  const tex = kind === 'orb' ? orbWebAtlas().tex : tangleWebTex();
  mats[kind] = new THREE.MeshStandardMaterial({
    map: tex, color: '#eef0e8', emissive: '#8a9088', emissiveMap: tex, emissiveIntensity: kind === 'orb' ? 0.4 : 0.2, opacity: kind === 'orb' ? 0.9 : 0.6,
    roughness: 0.45, metalness: 0, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide,
  });
  return mats[kind];
}
const snagMat = () => mats.snag || (mats.snag = new THREE.MeshStandardMaterial({ color: '#3a332c', roughness: 0.95 }));
const cocoonMat = () => mats.cocoon || (mats.cocoon = new THREE.MeshStandardMaterial({ color: '#d6d4c4', roughness: 0.85, emissive: '#2a2a20', emissiveIntensity: 0.3 }));

// плоскость с UV, указывающими на клетку атласа
function cellPlane(cell) {
  const g = new THREE.PlaneGeometry(1, 1);
  const uv = g.attributes.uv;
  const cu = (cell % 2) * 0.5, cv = (1 - Math.floor(cell / 2)) * 0.5;   // flipY: верхний ряд канвы — верх текстуры
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) * 0.5, cv + uv.getY(i) * 0.5);
  return g;
}

// Провисающий полог: треугольник/многоугольник между точками, с прогибом к центру
function sagSheet(pts, sag) {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.multiplyScalar(1 / pts.length);
  let R = 0;
  for (const p of pts) R = Math.max(R, Math.hypot(p.x - c.x, p.z - c.z));
  const RINGS = 8, pos = [], uv = [], idx = [];
  const n = pts.length;
  // кольца от центра к краям
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    for (let i = 0; i < n * 6; i++) {
      const f = i / (n * 6) * n, a = Math.floor(f), b = (a + 1) % n, k = f - a;
      const edge = pts[a].clone().lerp(pts[b], k);
      const p = c.clone().lerp(edge, t);
      // прогиб: максимум в центре, по краям — к точкам крепления (рёбра тоже чуть провисают)
      const edgeSag = Math.sin(k * Math.PI) * sag * 0.35;
      p.y -= sag * (1 - t * t) + edgeSag * t;
      pos.push(p.x, p.y, p.z);
      uv.push(0.5 + (p.x - c.x) / (2 * R), 0.5 + (p.z - c.z) / (2 * R));
    }
  }
  const W = n * 6;
  for (let r = 0; r < RINGS; r++) for (let i = 0; i < W; i++) {
    const a = r * W + i, b = r * W + (i + 1) % W, c2 = (r + 1) * W + i, d = (r + 1) * W + (i + 1) % W;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Сухое дерево-опора: изогнутый ствол и несколько сучьев. Возвращает точки, к которым удобно крепить нити.
function snag(B, x, y, z, H, rnd) {
  const pts = [];
  let p = new THREE.Vector3(x, y - 0.3, z);
  let dir = new THREE.Vector3((rnd() - 0.5) * 0.25, 1, (rnd() - 0.5) * 0.25).normalize();
  const segs = 4;
  let r0 = 0.32 + rnd() * 0.12;
  const trunk = [];
  for (let i = 0; i < segs; i++) {
    const L = H / segs, r1 = r0 * 0.72;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(p.clone().addScaledVector(dir, L / 2), q, new THREE.Vector3(1, 1, 1));
    B.add(new THREE.CylinderGeometry(r1, r0, L * 1.04, 7), snagMat(), m);
    p = p.clone().addScaledVector(dir, L);
    trunk.push(p.clone());
    dir = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4)).normalize();
    r0 = r1;
  }
  // корни
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + rnd();
    const d = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    B.add(new THREE.CylinderGeometry(0.04, 0.22, 1.3, 5), snagMat(), new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.15, z).addScaledVector(d, 0.55), q, new THREE.Vector3(1, 1, 1)));
  }
  // сучья
  for (let i = 0; i < 4; i++) {
    const from = trunk[Math.min(segs - 1, 1 + Math.floor(rnd() * (segs - 1)))].clone();
    const a = rnd() * TAU;
    const d = new THREE.Vector3(Math.cos(a), 0.35 + rnd() * 0.6, Math.sin(a)).normalize();
    const L = 1.0 + rnd() * 1.6;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    B.add(new THREE.CylinderGeometry(0.025, 0.1, L, 5), snagMat(), new THREE.Matrix4().compose(from.clone().addScaledVector(d, L / 2), q, new THREE.Vector3(1, 1, 1)));
    pts.push(from.clone().addScaledVector(d, L * 0.85));
  }
  return { trunk, tips: pts, top: trunk[segs - 1] };
}

// ближайшая точка на ломаной ствола
function nearestOnTrunk(trunk, base, p) {
  let best = null, bd = 1e9;
  const pts = [base, ...trunk];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    const q = a.clone().addScaledVector(ab, t), d = q.distanceTo(p);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// ---------- Логово ----------
export function buildSpiderLair(B, extra, x, y, z, rnd, terrain, collision) {
  const gy = (px, pz) => terrain.getHeight(px, pz);
  const lines = [];   // пары точек отдельных нитей
  const line = (a, b, sag = 0) => {
    if (sag <= 0) { lines.push(a, b); return; }
    // провисающая нить из нескольких отрезков
    const n = 6; let prev = a;
    for (let i = 1; i <= n; i++) { const t = i / n; const q = a.clone().lerp(b, t); q.y -= Math.sin(t * Math.PI) * sag; lines.push(prev, q); prev = q; }
  };
  // опоры: сухие деревья кольцом вокруг гнезда
  const anchors = [];
  const NA = 8;
  for (let i = 0; i < NA; i++) {
    const a = i / NA * TAU + (rnd() - 0.5) * 0.4, r = 11 + rnd() * 9;
    const ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r, ay = gy(ax, az);
    const H = 6 + rnd() * 3.5;
    const s = snag(B, ax, ay, az, H, rnd);
    s.base = new THREE.Vector3(ax, ay, az);
    anchors.push(s);
    collision.addCircle(ax, az, 0.5);
  }
  const { frames } = orbWebAtlas();
  const orb = webMat('orb'), tangle = webMat('tangle');
  // круговые сети между соседними опорами
  for (let i = 0; i < NA; i++) {
    const A = anchors[i], Bn = anchors[(i + 1) % NA];
    const pa = A.base, pb = Bn.base;
    const span = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    if (span > 16 || span < 4) continue;
    const W = Math.min(span * 0.8, 9), Hh = Math.min(W * (0.9 + rnd() * 0.2), 7);
    const mid = pa.clone().lerp(pb, 0.5);
    const cy = Math.min(pa.y, pb.y) + 1.0 + Hh / 2 + rnd() * 0.6;
    const yaw = Math.atan2(pb.x - pa.x, pb.z - pa.z) - Math.PI / 2;
    const tilt = (rnd() - 0.5) * 0.25;
    const cell = Math.floor(rnd() * 4);
    const m = M4(mid.x, cy, mid.z, yaw, W, Hh, 1, tilt);
    B.add(cellPlane(cell), orb, m, { noShadow: true });
    // крепления: от каждого угла рамки к ближайшей опоре (или к земле, если угол низко)
    for (const [fu, fv] of frames[cell]) {
      const local = new THREE.Vector3((fu - 0.5), (0.5 - fv), 0).applyMatrix4(new THREE.Matrix4().makeScale(W, Hh, 1));
      const wp = local.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(mid.x, cy, mid.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
      const da = Math.hypot(wp.x - pa.x, wp.z - pa.z), db = Math.hypot(wp.x - pb.x, wp.z - pb.z);
      const S = da < db ? A : Bn;
      if (wp.y - gy(wp.x, wp.z) < 1.6 && rnd() < 0.6) line(wp, new THREE.Vector3(wp.x + (rnd() - 0.5) * 1.5, gy(wp.x, wp.z), wp.z + (rnd() - 0.5) * 1.5));
      else line(wp, nearestOnTrunk(S.trunk, S.base, wp), 0.05);
    }
  }
  // полог над гнездом: войлочная паутина между верхушками и сучьями
  for (let k = 0; k < 2; k++) {
    const i0 = k * 4 + Math.floor(rnd() * 2);
    const tri = [anchors[i0 % NA], anchors[(i0 + 2) % NA], anchors[(i0 + 3) % NA]];
    const pts = tri.map(s => s.top.clone().add(new THREE.Vector3(0, -0.6 - rnd() * 0.8, 0)));
    B.add(sagSheet(pts, 2.2 + rnd()), tangle, new THREE.Matrix4(), { noShadow: true });
    // от углов полога — нити вниз и к соседям
    for (const p of pts) for (let j = 0; j < 3; j++) { const a = rnd() * TAU, d = 2 + rnd() * 4; const q = new THREE.Vector3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d); q.y = gy(q.x, q.z); line(p, q, 0.1); }
  }
  // нити, натянутые между опорами
  for (let i = 0; i < NA; i++) for (let j = i + 1; j < NA; j++) {
    if (rnd() > 0.35) continue;
    const a = anchors[i].tips[Math.floor(rnd() * anchors[i].tips.length)], b = anchors[j].tips[Math.floor(rnd() * anchors[j].tips.length)];
    if (a.distanceTo(b) < 22) line(a, b, a.distanceTo(b) * 0.06);
  }
  // войлочные сети на земле вокруг кладки и у опор
  for (let i = 0; i < 5; i++) {
    const a = rnd() * TAU, r = i < 2 ? 3 + rnd() * 4 : 8 + rnd() * 12;
    const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
    const n = 5, rad = 1.4 + rnd() * 1.4, pts = [];
    for (let q = 0; q < n; q++) {
      const b = q / n * TAU + rnd() * 0.5, rr = rad * (0.75 + rnd() * 0.5);
      const px = cx + Math.cos(b) * rr, pz = cz + Math.sin(b) * rr;
      pts.push(new THREE.Vector3(px, gy(px, pz) + 0.15 + rnd() * 0.5, pz));
    }
    B.add(sagSheet(pts, 0.12), tangle, new THREE.Matrix4(), { noShadow: true });
    for (const p of pts) line(p, new THREE.Vector3(p.x, gy(p.x, p.z), p.z));
  }
  // коконы: замотанные жертвы свисают с сучьев
  for (let i = 0; i < 9; i++) {
    const s = anchors[Math.floor(rnd() * NA)];
    const tip = s.tips[Math.floor(rnd() * s.tips.length)];
    const L = 0.6 + rnd() * 1.4, h = 0.9 + rnd() * 0.7;
    const c = tip.clone().add(new THREE.Vector3(0, -L - h / 2, 0));
    if (c.y - h / 2 < gy(c.x, c.z) + 0.3) continue;
    const rot = (rnd() - 0.5) * 0.3;
    B.add(new THREE.SphereGeometry(0.5, 12, 10), cocoonMat(), M4(c.x, c.y, c.z, rnd() * 6, 0.32 + rnd() * 0.1, h, 0.3 + rnd() * 0.1, rot, rot));
    // обмотка: несколько колец поверх кокона
    for (let k = 0; k < 4; k++) B.add(new THREE.TorusGeometry(0.17, 0.018, 4, 12), cocoonMat(), M4(c.x, c.y - h * 0.35 + k * h * 0.22, c.z, rnd() * 6, 1, 1, 1, Math.PI / 2 + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6));
    line(tip, c.clone().add(new THREE.Vector3(0, h / 2, 0)));
  }
  // все отдельные нити — одним вызовом отрисовки
  const lg = new THREE.BufferGeometry().setFromPoints(lines);
  const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#e8eae0', transparent: true, opacity: 0.4, depthWrite: false }));
  ls.name = 'webstrands';
  extra.push(ls);
}
