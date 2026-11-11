// Помощники для статической геометрии: объединение мешей по материалам (меньше draw calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Batcher {
  constructor() { this.groups = new Map(); }
  // geo — геометрия в локальных координатах, matrix — мировая матрица
  add(geo, mat, matrix, opts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (opts.uvScale) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * opts.uvScale[0], uv.getY(i) * opts.uvScale[1]);
    }
    g.applyMatrix4(matrix);
    const key = mat.uuid + (opts.noShadow ? '_ns' : '');
    if (!this.groups.has(key)) this.groups.set(key, { mat, list: [], noShadow: !!opts.noShadow });
    this.groups.get(key).list.push(g);
  }
  build(parent) {
    const out = [];
    for (const [, e] of this.groups) {
      // разбиваем на порции, чтобы не было гигантских буферов
      for (let i = 0; i < e.list.length; i += 400) {
        const merged = mergeGeometries(e.list.slice(i, i + 400), false);
        merged.computeBoundingSphere();
        const m = new THREE.Mesh(merged, e.mat);
        m.castShadow = !e.noShadow;
        m.receiveShadow = true;
        parent.add(m);
        out.push(m);
      }
    }
    this.groups.clear();
    return out;
  }
}

// Box с UV, растянутыми по размеру (текстура в мировых метрах, size — размер тайла)
export function boxUV(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // порядок граней: px, nx, py, ny, pz, nz — по 4 вершины
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

export function cylUV(rt, rb, h, seg = 16, tile = 2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * h / tile);
  return g;
}

// Двускатная крыша: гребень вдоль X. w — длина по X, d — глубина, h — высота
export function gableRoof(w, d, h, over = 0.4, thick = 0.15) {
  const parts = [];
  const slopeLen = Math.hypot(d / 2 + over, h);
  const ang = Math.atan2(h, d / 2 + over);
  for (const s of [-1, 1]) {
    const b = boxUV(w + over * 2, thick, slopeLen, 2);
    const m = new THREE.Matrix4().makeRotationX(s * ang);
    m.setPosition(0, h / 2, s * (d / 2 + over) / 2);
    b.applyMatrix4(m);
    parts.push(b);
  }
  return mergeGeometries(parts.map(p => p.toNonIndexed()));
}

// Фронтон (треугольная стена)
export function gableWall(d, h, tile = 2) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, g.attributes.position.getX(i) / tile, g.attributes.position.getY(i) / tile);
  return g;
}

export const M4 = (x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  return m;
};
