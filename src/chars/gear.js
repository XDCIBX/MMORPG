// Визуализация снаряжения на гуманоиде: доспехи по слотам и оружие.
import * as THREE from 'three';
import { limbGeo, latheGeo, ellipsoid } from './humanoid.js';
import { metalMat, leatherMat, clothMat, gemMat, woodMat, boneMat, basicMat, glowMat } from './materials.js';

function add(h, list, geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  list.push(m);
  return m;
}

function primaryMat(v) {
  if (v.kind === 'heavy') return metalMat(v.c1, v.tier >= 5 ? 0.25 : 0.35, v.tier >= 6 ? v.gem : null, v.tier >= 6 ? 0.15 : 0);
  if (v.kind === 'leather') return leatherMat(v.c1);
  return clothMat(v.c1, v.tier >= 3 ? 2 : 0);
}
function secondaryMat(v) {
  if (v.kind === 'heavy') return metalMat(v.c2, 0.4);
  if (v.kind === 'leather') return leatherMat(v.c2);
  return clothMat(v.c2, 0);
}
function trimMat(v) { return metalMat(v.trim || '#c9a640', 0.25, v.tier >= 6 ? v.trim : null, v.tier >= 6 ? 0.4 : 0); }

function domeGeo(r, frac = 0.5, seg = 18) {
  return new THREE.SphereGeometry(r, seg, 10, 0, Math.PI * 2, 0, Math.PI * frac);
}

// -------- Слоты брони --------
const SLOT_BUILDERS = {
  head(h, v, L) {
    const hc = h.headC, r = h.headR;
    const P = primaryMat(v), Tm = trimMat(v);
    if (v.kind === 'heavy') {
      if (v.style === 1) { // закрытый шлем
        const g = latheGeo([[r * 1.12, -r * 1.05], [r * 1.18, -r * 0.4], [r * 1.2, r * 0.3], [r * 1.05, r * 0.85], [r * 0.6, r * 1.18], [0.001, r * 1.3]], 20);
        const m = add(h, L, g, P, hc, 0, 0, 0); m.scale.set(0.95, 1, 1.05);
        add(h, L, new THREE.BoxGeometry(r * 1.3, r * 0.1, r * 0.3), basicMat('#050505', 0.9), hc, 0, r * 0.12, r * 1.08);
        add(h, L, new THREE.BoxGeometry(r * 0.08, r * 1.2, r * 0.12), Tm, hc, 0, r * 0.3, r * 1.14);
        add(h, L, new THREE.TorusGeometry(r * 1.13, r * 0.05, 6, 24), Tm, hc, 0, -r * 0.6, 0).rotation.x = Math.PI / 2;
        if (v.tier >= 3) {
          for (let i = 0; i < 7; i++) {
            const c = add(h, L, new THREE.ConeGeometry(r * 0.14, r * 0.9, 5), clothMat(v.c2), hc, 0, r * 1.2 + Math.sin(i / 6 * Math.PI) * r * 0.25, r * (0.6 - i * 0.28));
            c.rotation.x = -1.1 - i * 0.12;
          }
        }
      } else {
        const dome = add(h, L, domeGeo(r * 1.16, 0.55), P, hc, 0, r * 0.05, -r * 0.02);
        dome.scale.set(0.93, 1.08, 1.04);
        add(h, L, new THREE.TorusGeometry(r * 1.1, r * 0.06, 6, 24), Tm, hc, 0, r * 0.05, -r * 0.02).rotation.x = Math.PI / 2;
        add(h, L, new THREE.BoxGeometry(r * 0.14, r * 0.85, r * 0.1), Tm, hc, 0, -r * 0.05, r * 1.0);
        for (const sx of [-1, 1]) {
          const cg = add(h, L, new THREE.BoxGeometry(r * 0.12, r * 0.9, r * 0.8), P, hc, sx * r * 0.95, -r * 0.4, r * 0.2);
          cg.rotation.z = sx * 0.12;
        }
        add(h, L, new THREE.BoxGeometry(r * 0.1, r * 0.25, r * 1.6), Tm, hc, 0, r * 1.15, -r * 0.1);
        if (v.style === 2 || v.tier >= 4) { // рога
          for (const sx of [-1, 1]) {
            const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * r * 1.1, r * 0.2, 0), new THREE.Vector3(sx * r * 1.3, r * 1.2, -r * 0.3));
            const tg = new THREE.TubeGeometry(curve, 10, r * 0.13, 7);
            const p = tg.attributes.position, tmp = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) { const sg = Math.floor(i / 8) / 10; const c = curve.getPoint(Math.min(1, sg)); tmp.set(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(1 - sg * 0.85).add(c); p.setXYZ(i, tmp.x, tmp.y, tmp.z); }
            tg.computeVertexNormals();
            add(h, L, tg, v.tier >= 6 ? metalMat(v.trim, 0.2) : boneMat('#e9dcc0'), hc, sx * r * 0.85, r * 0.55, 0);
          }
        }
      }
      if (v.gem) add(h, L, new THREE.OctahedronGeometry(r * 0.12), gemMat(v.gem, 2 + v.tier * 0.3), hc, 0, r * 0.75, r * 1.02);
    } else if (v.kind === 'leather') {
      if (v.style === 1) { // шапка с пером
        const cap = add(h, L, domeGeo(r * 1.12, 0.5), P, hc, 0, r * 0.15, -r * 0.05); cap.scale.set(0.95, 0.9, 1.05);
        add(h, L, new THREE.TorusGeometry(r * 1.0, r * 0.07, 6, 22), secondaryMat(v), hc, 0, r * 0.18, -r * 0.05).rotation.x = Math.PI / 2;
        const f = add(h, L, ellipsoid(r * 0.1, r * 0.9, r * 0.03), basicMat(v.gem || '#c03030', 0.6), hc, r * 0.8, r * 0.8, -r * 0.4);
        f.rotation.z = -0.6; f.rotation.x = -0.5;
      } else { // капюшон
        const hood = add(h, L, new THREE.SphereGeometry(r * 1.32, 22, 14, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.72), P, hc, 0, r * 0.05, -r * 0.08);
        hood.scale.set(0.95, 1.08, 1.05);
        hood.rotation.y = 0;
        const tip = add(h, L, new THREE.ConeGeometry(r * 0.5, r * 1.2, 10), P, hc, 0, r * 0.5, -r * 1.2);
        tip.rotation.x = -2.0;
        // ворот-шарф
        add(h, L, new THREE.TorusGeometry(r * 0.85, r * 0.3, 8, 20), secondaryMat(v), hc, 0, -r * 1.25, -r * 0.1).rotation.x = Math.PI / 2;
      }
    } else {
      if (v.style === 0) { // шляпа мага
        const brim = add(h, L, new THREE.CylinderGeometry(r * 2.2, r * 2.3, r * 0.08, 28), P, hc, 0, r * 0.75, -r * 0.05);
        brim.rotation.x = -0.12;
        const pts = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([r * 1.12 * (1 - t) + 0.001, t * r * 3.2]); }
        const cone = add(h, L, latheGeo(pts, 18), P, hc, 0, r * 0.75, -r * 0.1);
        cone.rotation.x = -0.15;
        // загнутый кончик
        const tip = add(h, L, new THREE.ConeGeometry(r * 0.28, r * 1.1, 10), P, cone, 0, r * 3.1, -r * 0.25);
        tip.rotation.x = -1.2;
        add(h, L, new THREE.TorusGeometry(r * 1.08, r * 0.12, 6, 22), clothMat(v.c2), hc, 0, r * 0.95, -r * 0.08).rotation.x = Math.PI / 2 - 0.12;
        if (v.gem) add(h, L, new THREE.OctahedronGeometry(r * 0.2), gemMat(v.gem, 3), hc, 0, r * 1.0, r * 1.05);
      } else if (v.style === 1) { // глубокий капюшон
        const hood = add(h, L, new THREE.SphereGeometry(r * 1.4, 22, 14, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.8), P, hc, 0, r * 0.1, -r * 0.05);
        hood.scale.set(0.98, 1.12, 1.12);
        const tip = add(h, L, new THREE.ConeGeometry(r * 0.55, r * 1.6, 10), P, hc, 0, r * 0.4, -r * 1.45);
        tip.rotation.x = -2.1;
        // тень лица
        add(h, L, ellipsoid(r * 0.95, r * 1.0, r * 0.4), basicMat('#050308', 1), hc, 0, r * 0.05, r * 0.55).renderOrder = -1;
        if (h.spec.eyes && h.spec.eyes.glow) for (const sx of [-1, 1]) add(h, L, ellipsoid(r * 0.09, r * 0.06, r * 0.05), gemMat(h.spec.eyes.color, 4), hc, sx * r * 0.32, r * 0.12, r * 0.97);
        if (v.gem) add(h, L, new THREE.OctahedronGeometry(r * 0.16), gemMat(v.gem, 3), hc, 0, r * 1.15, r * 1.2);
      } else { // обруч
        add(h, L, new THREE.TorusGeometry(r * 0.98, r * 0.06, 6, 24), trimMat(v), hc, 0, r * 0.45, 0).rotation.x = Math.PI / 2 - 0.15;
        if (v.gem) add(h, L, new THREE.OctahedronGeometry(r * 0.18), gemMat(v.gem, 3), hc, 0, r * 0.6, r * 0.98);
      }
    }
    // Спрятать волосы под шлемом/капюшоном
    return { hideHair: v.kind !== 'cloth' || v.style !== 2 };
  },

  chest(h, v, L) {
    const P = primaryMat(v), S = secondaryMat(v), Tm = trimMat(v);
    const d = h.dim, W = d.W, D = d.D, F = d.F;
    const k = v.kind === 'heavy' ? 1.14 : v.kind === 'leather' ? 1.09 : 1.07;
    const prof = F
      ? [[0.12, -0.01], [0.135, 0.06], [0.15, 0.14], [0.152, 0.2], [0.14, 0.25], [0.1, 0.29], [0.06, 0.31]]
      : [[0.13, -0.01], [0.15, 0.06], [0.17, 0.14], [0.18, 0.21], [0.172, 0.26], [0.12, 0.3], [0.06, 0.315]];
    const ch = add(h, L, latheGeo(prof.map(([r, y]) => [r * k, y]), 20), P, h.j.chest);
    ch.scale.set(W, 1, 0.68 * D * (F ? 1.12 : 1));
    if (F) {
      for (const sx of [-1, 1]) add(h, L, ellipsoid(0.068, 0.062, 0.055), P, h.j.chest, sx * 0.062 * W, 0.165, 0.08 * D).rotation.x = -0.25;
    }
    const ab = add(h, L, latheGeo([[0.13 * k, -0.03], [0.135 * k, 0.08], [0.135 * k, 0.16], [0.14 * k, 0.23]], 18), v.kind === 'heavy' ? S : P, h.j.spine);
    ab.scale.set(W * 1.02, 1, 0.76 * D);
    // рукава
    for (const sd of ['L', 'R']) {
      const sm = add(h, L, limbGeo(d.uarm * 0.9, 0.06 * d.T * 1.12, 0.05 * d.T * 1.12, 0.15, 0.4), v.kind === 'heavy' ? clothMat('#3a3530') : P, h.j['shoulder' + sd], 0, -0.01, 0);
      void sm;
      if (v.kind === 'cloth') {
        const bell = add(h, L, latheGeo([[0.075, -d.farm * 1.02], [0.06, -d.farm * 0.6], [0.05, -0.02], [0.05, 0.02]], 14), P, h.j['elbow' + sd]);
        void bell;
        add(h, L, new THREE.TorusGeometry(0.073, 0.012, 6, 16), Tm, h.j['elbow' + sd], 0, -d.farm * 1.0, 0).rotation.x = Math.PI / 2;
      }
    }
    // пояс
    const belt = add(h, L, new THREE.TorusGeometry(0.145 * W, 0.022, 6, 24), v.kind === 'cloth' ? clothMat(v.c2) : leatherMat('#3a2616'), h.j.spine, 0, 0.0, 0);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.78 * D, 1);
    add(h, L, new THREE.BoxGeometry(0.06, 0.05, 0.02), Tm, h.j.spine, 0, 0, 0.115 * D);
    if (v.kind === 'heavy') {
      // ребро жёсткости и ворот
      add(h, L, new THREE.BoxGeometry(0.018, 0.26, 0.02), Tm, h.j.chest, 0, 0.13, 0.13 * D);
      const gorget = add(h, L, new THREE.TorusGeometry(0.075, 0.025, 6, 18), Tm, h.j.chest, 0, 0.3, 0);
      gorget.rotation.x = Math.PI / 2;
      // юбка из пластин
      for (let i = 0; i < 2; i++) {
        const fl = add(h, L, latheGeo([[0.17 * W, -0.06 - i * 0.07], [0.15 * W, 0.0 - i * 0.07]], 18), S, h.j.hips, 0, 0, 0);
        fl.scale.z = 0.8 * D;
      }
      // табард
      const tab = add(h, L, new THREE.BoxGeometry(0.2 * W, 0.42, 0.012), clothMat(v.c2, 2), h.j.hips, 0, -0.2, 0.13 * D);
      tab.rotation.x = 0.06;
      add(h, L, new THREE.BoxGeometry(0.2 * W, 0.38, 0.012), clothMat(v.c2, 2), h.j.hips, 0, -0.18, -0.13 * D).rotation.x = -0.06;
      if (v.gem) add(h, L, new THREE.OctahedronGeometry(0.03), gemMat(v.gem, 2.5), h.j.chest, 0, 0.18, 0.155 * D);
    } else if (v.kind === 'leather') {
      const strap = add(h, L, new THREE.BoxGeometry(0.05, 0.5, 0.012), S, h.j.chest, 0, 0.12, 0.122 * D);
      strap.rotation.z = 0.7;
      const strapB = add(h, L, new THREE.BoxGeometry(0.05, 0.5, 0.012), S, h.j.chest, 0, 0.12, -0.122 * D);
      strapB.rotation.z = -0.7;
      for (const sx of [-1, 1]) add(h, L, new THREE.BoxGeometry(0.05, 0.06, 0.035), S, h.j.spine, sx * 0.1, -0.01, 0.1 * D);
      // кожаная юбка-полы
      const sk = add(h, L, latheGeo([[0.24, -0.32], [0.19, -0.1], [0.155, 0.0]], 18), P, h.j.hips);
      sk.scale.z = 0.8 * D;
      if (v.tier >= 2) add(h, L, new THREE.TorusGeometry(0.13, 0.04, 8, 20), basicMat(v.tier >= 5 ? '#e8e0d0' : '#5a4030', 0.95), h.j.chest, 0, 0.29, -0.01).rotation.x = Math.PI / 2;
    } else {
      // мантия до пят
      const len = d.hipY - 0.06;
      const robe = new THREE.Group();
      h.j.hips.add(robe); L.push(robe);
      const prof = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([0.39 - 0.23 * Math.pow(t, 0.8), -len + t * (len + 0.06)]); }
      const rp = add(h, L, latheGeo(prof, 36), P, robe);
      rp.scale.z = 0.85 * D;
      const hem = add(h, L, latheGeo([[0.395, -len], [0.392, -len + 0.03], [0.378, -len + 0.09]], 36), clothMat(v.c2, 2), robe);
      hem.scale.z = 0.85 * D;
      // мантия деформируется ногами — запоминаем исходную форму
      for (const m of [rp, hem]) { m.geometry = m.geometry.clone(); m.userData.base = Float32Array.from(m.geometry.attributes.position.array); }
      h.robe = robe;
      // кушак
      const sash = add(h, L, new THREE.BoxGeometry(0.06, 0.4, 0.01), clothMat(v.c2), h.j.spine, 0.06, -0.2, 0.12 * D);
      sash.rotation.z = 0.08;
      if (v.gem) add(h, L, new THREE.OctahedronGeometry(0.035), gemMat(v.gem, 3), h.j.chest, 0, 0.2, 0.14 * D);
      // руны на мантии для высоких тиров
      if (v.tier >= 5) {
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          add(h, L, new THREE.OctahedronGeometry(0.018), gemMat(v.gem || v.trim, 2), robe, Math.cos(a) * 0.35, -len + 0.15, Math.sin(a) * 0.3);
        }
      }
    }
    // Плащ для эпических вещей
    if (v.tier >= 4 && v.kind !== 'cloth' || v.cape) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.27, -0.12 * D);
      h.j.chest.add(pivot); L.push(pivot);
      const cg = new THREE.PlaneGeometry(0.48 * W, 1.15, 4, 10);
      const p = cg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        p.setZ(i, -Math.abs(x) * 0.25 * (0.5 - y / 1.15) - 0.02 + (Math.cos(x * 30) * 0.008));
        p.setX(i, x * (1 + (0.5 - y / 1.15 - 0.5) * -0.35));
      }
      cg.translate(0, -0.575, 0);
      cg.computeVertexNormals();
      add(h, L, cg, clothMat(v.capeColor || v.c2), pivot);
      add(h, L, new THREE.CylinderGeometry(0.02, 0.02, 0.5 * W, 8), Tm, pivot, 0, 0, 0.01).rotation.z = Math.PI / 2;
      h.cape = pivot;
    }
    return {};
  },

  shoulders(h, v, L) {
    const P = primaryMat(v), S = secondaryMat(v), Tm = trimMat(v);
    const T = h.dim.T;
    for (const sd of ['L', 'R']) {
      const sx = sd === 'L' ? 1 : -1;
      const sh = h.j['shoulder' + sd];
      if (v.kind === 'heavy') {
        const big = v.style === 2 ? 1.3 : 1.1;
        const pg = new THREE.Group();
        pg.position.set(sx * 0.02, 0.0, 0);
        pg.rotation.z = sx * -0.45;
        sh.add(pg); L.push(pg);
        for (let i = 0; i < 3; i++) {
          const r = (0.105 - i * 0.012) * big * T;
          const d = add(h, L, domeGeo(r, 0.5), i === 0 ? P : S, pg, sx * i * 0.012, -i * 0.04, 0);
          d.scale.set(1, 0.75, 1.05);
          if (i === 0) add(h, L, new THREE.TorusGeometry(r * 0.98, 0.009, 6, 20), Tm, pg, 0, 0, 0).rotation.x = Math.PI / 2;
        }
        if (v.tier >= 3) {
          const n = v.tier >= 6 ? 3 : v.tier >= 5 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const sp = add(h, L, new THREE.ConeGeometry(0.022, 0.12 + i * 0.02, 6), v.tier >= 6 ? Tm : S, pg, (i - (n - 1) / 2) * 0.05, 0.1, -0.01);
            sp.rotation.z = (i - (n - 1) / 2) * 0.3;
          }
        }
        if (v.gem && v.tier >= 4) add(h, L, new THREE.OctahedronGeometry(0.022), gemMat(v.gem, 2.5), pg, 0, 0.06, 0.09);
      } else if (v.kind === 'leather') {
        const d = add(h, L, domeGeo(0.085 * T, 0.5), P, sh, sx * 0.02, 0.0, 0);
        d.rotation.z = sx * -0.5; d.scale.set(1, 0.7, 1.1);
        if (v.tier >= 2) {
          const fur = add(h, L, new THREE.TorusGeometry(0.08, 0.025, 6, 14), basicMat(v.tier >= 5 ? '#ece6dc' : '#6a5440', 0.95), sh, sx * 0.03, 0.0, 0);
          fur.rotation.set(Math.PI / 2, sx * -0.5, 0);
        }
      }
    }
    if (v.kind === 'cloth') {
      // наплечная пелерина
      const m = add(h, L, latheGeo([[0.3, -0.06], [0.27, 0.0], [0.18, 0.06], [0.08, 0.1]], 22), clothMat(v.c2, 2), h.j.chest, 0, 0.22, 0);
      m.scale.set(h.dim.W, 1, 0.75);
      if (v.style === 1) { // высокий воротник некроманта с шипами
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i - 3) * 0.32;
          const sp = add(h, L, new THREE.ConeGeometry(0.025, 0.22, 5), boneMat(), h.j.chest, Math.sin(a) * 0.13, 0.36, Math.cos(a) * 0.1);
          sp.rotation.x = -Math.cos(a) * 0.4; sp.rotation.z = Math.sin(a) * 0.4;
        }
      } else {
        const col = add(h, L, latheGeo([[0.09, 0.0], [0.11, 0.08], [0.14, 0.16]], 16), clothMat(v.c1), h.j.chest, 0, 0.27, -0.01);
        col.scale.z = 0.8;
      }
      if (v.gem) add(h, L, new THREE.OctahedronGeometry(0.025), gemMat(v.gem, 3), h.j.chest, 0, 0.27, 0.11);
    }
    return {};
  },

  hands(h, v, L) {
    const P = primaryMat(v), S = secondaryMat(v), Tm = trimMat(v);
    const d = h.dim;
    for (const sd of ['L', 'R']) {
      const el = h.j['elbow' + sd];
      if (v.kind === 'heavy') {
        add(h, L, latheGeo([[0.058, -d.farm * 1.0], [0.05, -d.farm * 0.55], [0.042, -d.farm * 0.15]], 14), P, el);
        add(h, L, new THREE.TorusGeometry(0.058, 0.008, 6, 16), Tm, el, 0, -d.farm * 0.98, 0).rotation.x = Math.PI / 2;
        add(h, L, ellipsoid(0.04, 0.05, 0.026), S, h.parts['hand' + sd], 0, -0.045, 0.008);
        add(h, L, ellipsoid(0.038, 0.034, 0.026), S, h.parts['hand' + sd], 0, -0.088, 0.022).rotation.x = 0.7;
      } else if (v.kind === 'leather') {
        add(h, L, latheGeo([[0.045, -d.farm * 1.0], [0.044, -d.farm * 0.5]], 14), P, el);
        add(h, L, ellipsoid(0.037, 0.05, 0.023), S, h.parts['hand' + sd], 0, -0.045, 0.006);
      } else {
        for (let i = 0; i < 3; i++) add(h, L, new THREE.TorusGeometry(0.037, 0.008, 6, 14), clothMat(v.c2), el, 0, -d.farm * (0.6 + i * 0.13), 0).rotation.x = Math.PI / 2;
        if (v.gem) add(h, L, new THREE.OctahedronGeometry(0.014), gemMat(v.gem, 3), el, 0, -d.farm * 0.75, 0.04);
      }
    }
    return {};
  },

  legs(h, v, L) {
    const P = primaryMat(v), S = secondaryMat(v), Tm = trimMat(v);
    const d = h.dim, T = d.T;
    for (const sd of ['L', 'R']) {
      const hp = h.j['hip' + sd], kn = h.j['knee' + sd];
      const k = v.kind === 'heavy' ? 1.18 : 1.1;
      add(h, L, limbGeo(d.thigh * 0.95, 0.088 * T * k, 0.058 * T * k, 0.12, 0.25), P, hp, 0, 0, 0);
      add(h, L, limbGeo(d.shin * 0.75, 0.06 * T * 1.06, 0.045 * T * 1.06, 0.25, 0.3), v.kind === 'heavy' ? S : P, kn, 0, 0, 0);
      if (v.kind === 'heavy') {
        const kc = add(h, L, domeGeo(0.05, 0.5), Tm, kn, 0, 0.0, 0.035);
        kc.rotation.x = Math.PI / 2;
      } else if (v.kind === 'leather') {
        add(h, L, ellipsoid(0.045, 0.05, 0.03), S, kn, 0, -0.01, 0.045);
      }
    }
    if (v.kind === 'heavy') {
      for (const sx of [-1, 1]) {
        const ts = add(h, L, new THREE.BoxGeometry(0.13, 0.17, 0.02), S, h.j.hips, sx * 0.12, -0.12, 0.08);
        ts.rotation.set(0.15, sx * 0.5, sx * 0.12);
      }
    }
    return {};
  },

  feet(h, v, L) {
    const P = primaryMat(v), S = secondaryMat(v), Tm = trimMat(v);
    const d = h.dim, T = d.T;
    for (const sd of ['L', 'R']) {
      const kn = h.j['knee' + sd], an = h.j['ankle' + sd];
      if (v.kind === 'heavy') {
        add(h, L, limbGeo(d.shin * 0.85, 0.064 * T * 1.15, 0.05 * T * 1.15, 0.2, 0.3), P, kn, 0, -d.shin * 0.12, 0);
        add(h, L, ellipsoid(0.055, 0.045, 0.125), P, an, 0, -0.04, 0.045);
        add(h, L, new THREE.TorusGeometry(0.055, 0.008, 6, 16), Tm, an, 0, 0.04, 0).rotation.x = Math.PI / 2;
      } else if (v.kind === 'leather') {
        add(h, L, limbGeo(d.shin * 0.55, 0.054 * T * 1.1, 0.048 * T * 1.1, 0.1, 0.4), P, an, 0, d.shin * 0.52, 0);
        add(h, L, new THREE.TorusGeometry(0.058 * T, 0.014, 6, 16), S, an, 0, d.shin * 0.5, 0).rotation.x = Math.PI / 2;
        add(h, L, ellipsoid(0.052, 0.043, 0.12), P, an, 0, -0.043, 0.045);
      } else {
        add(h, L, ellipsoid(0.05, 0.042, 0.12), S, an, 0, -0.043, 0.047);
        for (let i = 0; i < 2; i++) add(h, L, new THREE.TorusGeometry(0.046, 0.007, 6, 14), clothMat(v.c2), an, 0, 0.04 + i * 0.04, 0).rotation.x = Math.PI / 2;
      }
    }
    return {};
  },
};

// -------- Оружие (ось +Y, рукоять в начале координат) --------
function bladeShape(len, w, tipLen) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2 * 0.92, len - tipLen);
  s.lineTo(0, len);
  s.lineTo(w / 2 * 0.92, len - tipLen);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}
function extrude(shape, depth, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

export function buildWeapon(type, v) {
  const g = new THREE.Group();
  const L = [];
  const fake = { };
  const blade = metalMat(v.c1 || '#c8ccd2', 0.22, v.tier >= 5 ? v.gem : null, v.tier >= 5 ? 0.35 + (v.tier - 5) * 0.25 : 0);
  const Tm = metalMat(v.trim || '#b08a3a', 0.3);
  const grip = leatherMat('#3a2416');
  const gem = v.gem ? gemMat(v.gem, 2.5 + v.tier * 0.3) : null;
  const A = (geo, mat, x = 0, y = 0, z = 0, parent = g) => add(fake, L, geo, mat, parent, x, y, z);
  switch (type) {
    case 'sword':
    case 'greatsword': {
      const big = type === 'greatsword';
      const bl = big ? 1.25 : 0.82, bw = big ? 0.085 : 0.06, gl = big ? 0.3 : 0.15;
      A(new THREE.CylinderGeometry(0.018, 0.018, gl, 8), grip, 0, gl / 2 - 0.06, 0);
      A(new THREE.SphereGeometry(0.03, 10, 8), Tm, 0, -0.07, 0);
      const cg = A(new THREE.BoxGeometry(big ? 0.34 : 0.22, 0.035, 0.045), Tm, 0, gl - 0.04, 0);
      if (v.tier >= 3) { for (const sx of [-1, 1]) { const c = A(new THREE.ConeGeometry(0.02, 0.07, 6), Tm, sx * (big ? 0.18 : 0.12), gl - 0.02, 0); c.rotation.z = -sx * 1.2; } }
      void cg;
      const b = A(extrude(bladeShape(bl, bw, bw * 1.6), 0.012, 0.005), blade, 0, gl - 0.02, 0);
      void b;
      // дол
      A(new THREE.BoxGeometry(bw * 0.18, bl * 0.75, 0.022), metalMat('#5a5e66', 0.4), 0, gl + bl * 0.4, 0);
      if (gem) A(new THREE.OctahedronGeometry(0.028), gem, 0, gl - 0.04, 0.03);
      if (v.tier >= 6) A(new THREE.BoxGeometry(bw * 0.25, bl * 0.8, 0.026), glowMat(v.gem, 0.8), 0, gl + bl * 0.42, 0);
      break;
    }
    case 'axe': {
      const hl = 0.8;
      A(new THREE.CylinderGeometry(0.02, 0.024, hl, 8), woodMat(), 0, hl / 2 - 0.12, 0);
      const s = new THREE.Shape();
      s.moveTo(0, -0.06); s.quadraticCurveTo(0.12, -0.1, 0.2, -0.18); s.quadraticCurveTo(0.26, 0.0, 0.2, 0.18); s.quadraticCurveTo(0.12, 0.1, 0, 0.06); s.closePath();
      const head = A(extrude(s, 0.02, 0.006), blade, 0, hl - 0.2, 0.02);
      head.rotation.y = -Math.PI / 2;
      if (v.tier >= 3) { const h2 = A(extrude(s, 0.02, 0.006), blade, 0, hl - 0.2, -0.02); h2.rotation.y = Math.PI / 2; }
      A(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), Tm, 0, hl - 0.2, 0);
      if (gem) A(new THREE.OctahedronGeometry(0.03), gem, 0, hl - 0.2, 0.04);
      break;
    }
    case 'hammer': {
      const hl = 0.75;
      A(new THREE.CylinderGeometry(0.022, 0.026, hl, 8), woodMat('#4a3020'), 0, hl / 2 - 0.12, 0);
      const hw = v.tier >= 4 ? 0.34 : 0.28;
      const head = A(new THREE.BoxGeometry(0.15, 0.15, hw), blade, 0, hl - 0.1, 0);
      void head;
      for (const sz of [-1, 1]) A(new THREE.BoxGeometry(0.17, 0.17, 0.03), Tm, 0, hl - 0.1, sz * hw / 2);
      if (gem) { A(new THREE.BoxGeometry(0.155, 0.04, 0.12), gem, 0, hl - 0.1, 0); }
      if (v.tier >= 5) A(new THREE.ConeGeometry(0.03, 0.12, 6), Tm, 0, hl + 0.02, 0);
      break;
    }
    case 'bow':
    case 'longbow': {
      const big = type === 'longbow';
      const half = big ? 0.72 : 0.55;
      const wood = v.tier >= 5 ? metalMat(v.c1, 0.3) : woodMat(v.c1 || '#6a4428');
      for (const sy of [-1, 1]) {
        const curve = new THREE.CubicBezierCurve3(
          new THREE.Vector3(0, sy * 0.08, 0), new THREE.Vector3(0, sy * half * 0.45, 0.06),
          new THREE.Vector3(0, sy * half * 0.85, -0.02), new THREE.Vector3(0, sy * half, -0.16));
        const tg = new THREE.TubeGeometry(curve, 12, 0.016, 6);
        A(tg, wood);
        A(new THREE.SphereGeometry(0.018, 6, 6), Tm, 0, sy * half, -0.16);
      }
      A(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8), grip, 0, 0, 0);
      const str = A(new THREE.CylinderGeometry(0.003, 0.003, half * 2, 4), basicMat('#e8e0d0', 0.5), 0, 0, -0.16);
      str.name = 'string';
      if (gem) { A(new THREE.OctahedronGeometry(0.025), gem, 0, 0.1, 0.03); A(new THREE.OctahedronGeometry(0.025), gem, 0, -0.1, 0.03); }
      break;
    }
    case 'staff':
    case 'wand': {
      const big = type === 'staff';
      const len = big ? 1.75 : 0.42;
      const bottom = big ? -0.65 : -0.08;
      const shaft = A(new THREE.CylinderGeometry(big ? 0.02 : 0.014, big ? 0.026 : 0.016, len, 8), woodMat(v.c1 || '#5a3b22'), 0, bottom + len / 2, 0);
      void shaft;
      for (let i = 0; i < (big ? 3 : 1); i++) A(new THREE.TorusGeometry(0.028, 0.008, 6, 12), Tm, 0, bottom + len * (0.3 + i * 0.25), 0).rotation.x = Math.PI / 2;
      const top = bottom + len;
      // когти-держатель
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2;
        const claw = A(new THREE.TorusGeometry(0.06, 0.009, 6, 10, Math.PI * 0.9), Tm, Math.cos(a) * 0.035, top + 0.05, Math.sin(a) * 0.035);
        claw.rotation.set(0, -a, Math.PI / 2);
      }
      const cr = A(new THREE.OctahedronGeometry(big ? 0.07 : 0.035, 0), gem || gemMat('#66aaff', 2), 0, top + 0.1, 0);
      cr.scale.y = 1.6; cr.name = 'crystal';
      A(new THREE.SphereGeometry(big ? 0.12 : 0.06, 12, 10), glowMat(v.gem || '#66aaff', 0.25), 0, top + 0.1, 0).name = 'halo';
      if (v.tier >= 4 && big) {
        const ring = A(new THREE.TorusGeometry(0.13, 0.006, 6, 24), gemMat(v.gem || '#66aaff', 2), 0, top + 0.1, 0);
        ring.name = 'ring';
      }
      break;
    }
    case 'scythe': {
      const len = 1.8;
      A(new THREE.CylinderGeometry(0.02, 0.024, len, 8), woodMat('#2a1e18'), 0, len / 2 - 0.6, 0);
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.quadraticCurveTo(0.35, 0.18, 0.75, -0.05); s.quadraticCurveTo(0.4, 0.06, 0, -0.08); s.closePath();
      const bladeM = A(extrude(s, 0.012, 0.004), blade, 0, len - 0.62, 0);
      bladeM.rotation.y = -Math.PI / 2; // лезвие смотрит вперёд
      A(new THREE.SphereGeometry(0.05, 10, 8), boneMat(), 0, len - 0.6, 0);
      if (gem) { A(new THREE.OctahedronGeometry(0.03), gem, 0, len - 0.58, 0.05); A(new THREE.SphereGeometry(0.08, 10, 8), glowMat(v.gem, 0.3), 0, len - 0.6, 0); }
      for (let i = 0; i < 3; i++) A(new THREE.TorusGeometry(0.03, 0.008, 6, 12), boneMat(), 0, 0.2 + i * 0.35, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 'bonestaff': {
      const len = 1.6;
      A(new THREE.CylinderGeometry(0.022, 0.026, len, 7), boneMat('#cfc4a6'), 0, len / 2 - 0.6, 0);
      for (let i = 0; i < 5; i++) A(new THREE.SphereGeometry(0.03, 8, 6), boneMat(), 0, -0.4 + i * 0.3, 0);
      const top = len - 0.6;
      const skull = A(new THREE.SphereGeometry(0.075, 14, 12), boneMat('#e2d8bc'), 0, top + 0.08, 0);
      skull.scale.set(0.9, 1, 1);
      A(new THREE.BoxGeometry(0.08, 0.04, 0.06), boneMat('#e2d8bc'), 0, top + 0.02, 0.03);
      for (const sx of [-1, 1]) A(new THREE.SphereGeometry(0.017, 8, 6), gem || gemMat('#55ff88', 3), sx * 0.026, top + 0.09, 0.06);
      A(new THREE.SphereGeometry(0.14, 12, 10), glowMat(v.gem || '#55ff88', 0.18), 0, top + 0.08, 0).name = 'halo';
      for (let i = 0; i < 2; i++) { const hn = A(new THREE.ConeGeometry(0.02, 0.16, 6), boneMat(), (i ? 1 : -1) * 0.07, top + 0.17, 0); hn.rotation.z = (i ? -1 : 1) * 0.6; }
      break;
    }
    // ----- Вторая рука -----
    case 'shield': {
      const round = v.style !== 1;
      if (round) {
        const r = 0.32;
        const body = A(new THREE.CylinderGeometry(r, r, 0.035, 28), v.tier >= 2 ? metalMat(v.c1, 0.35) : woodMat('#6a4a2a'), 0, 0, 0);
        body.rotation.x = Math.PI / 2;
        A(new THREE.TorusGeometry(r, 0.018, 6, 30), Tm, 0, 0, 0);
        const boss = A(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), Tm, 0, 0, 0.018);
        boss.rotation.x = Math.PI / 2;
        A(new THREE.CircleGeometry(r * 0.7, 24), clothMat(v.c2, 0), 0, 0, 0.0185);
      } else {
        const s = new THREE.Shape();
        s.moveTo(0, -0.45); s.quadraticCurveTo(0.3, -0.15, 0.27, 0.28); s.lineTo(-0.27, 0.28); s.quadraticCurveTo(-0.3, -0.15, 0, -0.45);
        A(extrude(s, 0.03, 0.012), metalMat(v.c1, 0.35), 0, 0, 0);
        const inner = new THREE.Shape();
        inner.moveTo(0, -0.36); inner.quadraticCurveTo(0.23, -0.12, 0.21, 0.22); inner.lineTo(-0.21, 0.22); inner.quadraticCurveTo(-0.23, -0.12, 0, -0.36);
        A(new THREE.ShapeGeometry(inner), clothMat(v.c2, 0), 0, 0, 0.03);
        A(new THREE.BoxGeometry(0.06, 0.5, 0.02), Tm, 0, -0.05, 0.035);
        A(new THREE.BoxGeometry(0.4, 0.06, 0.02), Tm, 0, 0.1, 0.035);
      }
      if (gem) A(new THREE.OctahedronGeometry(0.04), gem, 0, 0.05, 0.07);
      break;
    }
    case 'orb': {
      A(new THREE.SphereGeometry(0.08, 16, 12), gem || gemMat('#66aaff', 2.5), 0, 0, 0).name = 'crystal';
      A(new THREE.SphereGeometry(0.13, 14, 10), glowMat(v.gem || '#66aaff', 0.22), 0, 0, 0).name = 'halo';
      const r1 = A(new THREE.TorusGeometry(0.12, 0.006, 6, 24), Tm, 0, 0, 0); r1.name = 'ring';
      const r2 = A(new THREE.TorusGeometry(0.14, 0.005, 6, 24), Tm, 0, 0, 0); r2.rotation.x = Math.PI / 2; r2.name = 'ring2';
      break;
    }
    case 'skull': {
      const sk = A(new THREE.SphereGeometry(0.08, 14, 12), boneMat('#e6dcc0'), 0, 0, 0);
      sk.scale.set(0.85, 1, 1);
      A(new THREE.BoxGeometry(0.08, 0.04, 0.07), boneMat('#e6dcc0'), 0, -0.07, 0.03);
      for (const sx of [-1, 1]) A(new THREE.SphereGeometry(0.018, 8, 6), gem || gemMat('#55ff88', 3), sx * 0.028, 0.0, 0.07);
      A(new THREE.SphereGeometry(0.15, 12, 10), glowMat(v.gem || '#55ff88', 0.15), 0, 0, 0).name = 'halo';
      break;
    }
    case 'quiver': {
      A(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 10), leatherMat(v.c1 || '#5a3a22'), 0, 0, 0);
      A(new THREE.TorusGeometry(0.06, 0.01, 6, 14), Tm, 0, 0.24, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        A(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), woodMat('#8a6a40'), Math.cos(a) * 0.03, 0.33, Math.sin(a) * 0.03);
        const f = A(new THREE.BoxGeometry(0.002, 0.07, 0.025), basicMat(v.gem || '#c03030', 0.7), Math.cos(a) * 0.03, 0.42, Math.sin(a) * 0.03);
        f.rotation.y = a;
      }
      break;
    }
  }
  g.userData.meshes = L;
  return g;
}

export const WEAPON_HOLD = {
  sword: '1h', axe: '1h', hammer: '1h', wand: '1h', greatsword: '2h', scythe: '2h',
  bow: 'bow', longbow: 'bow', staff: 'staff', bonestaff: 'staff',
};
export const WEAPON_ANIM = {
  sword: 'slash', axe: 'slash', hammer: 'slam', wand: 'cast', greatsword: 'slam', scythe: 'sweep',
  bow: 'bow', longbow: 'bow', staff: 'cast', bonestaff: 'cast', none: 'thrust',
};

function clearSlot(h, slot) {
  const list = h.attachments[slot];
  if (list) for (const o of list) o.removeFromParent();
  h.attachments[slot] = [];
  if (slot === 'chest') { h.cape = null; h.robe = null; }
}

function setHairVisible(h, v) {
  h.headC.traverse(o => {
    if (o.isMesh && o.material && o.material.color && h.hairMeshes && h.hairMeshes.includes(o)) o.visible = v;
  });
}

export function equipVisual(h, slot, item) {
  clearSlot(h, slot);
  const L = h.attachments[slot];
  if (!h.hairMeshes) {
    // запоминаем меши волос (материал цвета волос), чтобы прятать под шлем
    const hairCol = h.spec.hair && h.spec.hair.color;
    h.hairMeshes = [];
    if (hairCol) {
      const c = new THREE.Color(hairCol);
      h.headC.children.forEach(o => { if (o.isMesh && o.material.color && o.material.color.equals(c) && o.material.roughness === 0.75) h.hairMeshes.push(o); });
    }
  }
  if (slot === 'head') setHairVisible(h, true);
  if (!item) {
    if (slot === 'weapon') h.hold = 'none';
    if (slot === 'offhand') h.offhand = 'none';
    return;
  }
  const v = item.vis;
  if (slot === 'weapon') {
    const w = buildWeapon(item.wtype, v);
    const hold = WEAPON_HOLD[item.wtype];
    h.hold = hold;
    const mount = new THREE.Group();
    if (hold === 'bow') {
      h.j.gripL.add(mount);
      mount.rotation.set(Math.PI / 2, 0, 0);
      mount.add(w);
    } else {
      h.j.gripR.add(mount);
      mount.rotation.set(Math.PI / 2, 0, 0);
      mount.add(w);
      if (hold === 'staff') w.position.y = -0.0;
      if (hold === '2h' && item.wtype === 'scythe') w.position.y = -0.1;
    }
    L.push(mount);
    h.weaponObj = w;
    h.weaponType = item.wtype;
    return;
  }
  if (slot === 'offhand') {
    const o = buildWeapon(item.otype, v);
    const mount = new THREE.Group();
    if (item.otype === 'shield') {
      h.j.gripL.add(mount);
      mount.position.set(0, -0.02, 0);
      mount.rotation.set(Math.PI / 2, 0, 0);
      h.offhand = 'shield';
    } else if (item.otype === 'quiver') {
      h.j.chest.add(mount);
      mount.position.set(0.1, 0.12, -0.15);
      mount.rotation.set(0.25, 0, -0.35);
      h.offhand = 'none';
    } else {
      h.j.gripL.add(mount);
      mount.position.set(0, -0.08, 0.05);
      h.offhand = item.otype === 'orb' ? 'orb' : 'orb';
      mount.userData.float = true;
    }
    mount.add(o);
    L.push(mount);
    h.offhandObj = o;
    return;
  }
  const b = SLOT_BUILDERS[slot];
  if (!b) return;
  const res = b(h, v, L) || {};
  if (slot === 'head' && res.hideHair) setHairVisible(h, false);
}

// Анимация «живого» оружия (вращение колец, пульсация кристаллов)
export function animateGear(h, t) {
  const w = h.weaponObj;
  if (w) {
    for (const m of w.userData.meshes || []) {
      if (m.name === 'ring') { m.rotation.x = t * 1.3; m.rotation.y = t * 0.7; }
      else if (m.name === 'ring2') { m.rotation.z = t * 1.1; }
      else if (m.name === 'halo') m.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
      else if (m.name === 'crystal') m.rotation.y = t * 1.5;
    }
  }
  const o = h.offhandObj;
  if (o) {
    for (const m of o.userData.meshes || []) {
      if (m.name === 'ring') { m.rotation.x = t * 1.6; m.rotation.y = t * 0.9; }
      else if (m.name === 'ring2') m.rotation.z = -t * 1.2;
      else if (m.name === 'halo') m.scale.setScalar(1 + Math.sin(t * 3) * 0.15);
    }
    if (o.parent && o.parent.userData.float) o.position.y = Math.sin(t * 2) * 0.03;
  }
}
