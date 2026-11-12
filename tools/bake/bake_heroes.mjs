// Запекание детальных моделей героев: node tools/bake/bake_heroes.mjs [cls_sex ...]
// Результат: models/hero_<cls>_<m|f>.js (подключается игрой по требованию).
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { CLASSES } from '../../src/data/classes.js';
import { HERO_BONES } from '../../src/chars/hero/rig.js';
import { makeKit, sculptBody, facePaint, gripPoint, hexRGB, EYE } from '../../src/chars/hero/anatomy.js';
import { hairPieces } from '../../src/chars/hero/hair.js';
import { armorPieces } from '../../src/chars/hero/armor.js';
import { meshSDF, simplifyAndFinish, zipMeshes } from './mesher.mjs';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;

const OUT = path.resolve('models');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const QUALITY = Number(process.env.Q || 1); // 1 — финальное, 0.5 — быстрый черновик

const REGION_OF = {
  hips: 'pelvis', spine: 'torso', chest: 'torso', neck: 'neck', head: 'head',
  shoulderL: 'uarmL', shoulderR: 'uarmR', elbowL: 'farmL', elbowR: 'farmR', wristL: 'handL', wristR: 'handR',
  hipL: 'thighL', hipR: 'thighR', kneeL: 'shinL', kneeR: 'shinR', ankleL: 'footL', ankleR: 'footR',
};
const REGIONS = ['head', 'neck', 'torso', 'pelvis', 'uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];

function boundsOf(S, pad = 0.02) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of S.prims) {
    if (p.sub) continue;
    for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p.bb[i]); b[i + 3] = Math.max(b[i + 3], p.bb[i + 3]); }
  }
  return [b[0] - pad, Math.max(-0.01, b[1] - pad), b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad];
}

// AO по полю (тело + деталь)
function aoAt(sdf, p, n) {
  let occ = 0, sc = 1;
  for (const h of [0.012, 0.03, 0.06, 0.11, 0.2]) {
    const d = sdf(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h);
    occ += (h - Math.max(0, d)) * sc;
    sc *= 0.62;
  }
  return Math.max(0, Math.min(1, 1 - occ * 3.4));
}

// Упаковка куска модели в двоичный вид
class Packer {
  constructor() { this.chunks = []; this.size = 0; }
  push(arr) {
    const align = arr.BYTES_PER_ELEMENT;
    const pad = (align - (this.size % align)) % align;
    if (pad) { this.chunks.push(new Uint8Array(pad)); this.size += pad; }
    const off = this.size;
    this.chunks.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    this.size += arr.byteLength;
    return off;
  }
  pushBytes(u8) { const off = this.size; this.chunks.push(u8); this.size += u8.length; return [off, u8.length]; }
  buffer() {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

function packPiece(pk, piece) {
  const { position, normal, index, skinIndex, skinWeight, color, ao } = piece;
  const nv = position.length / 3;
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { const v = position[i * 3 + a]; if (v < bb[a]) bb[a] = v; if (v > bb[a + 3]) bb[a + 3] = v; }
  const q = new Uint16Array(nv * 3);
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) q[i * 3 + a] = Math.round((position[i * 3 + a] - bb[a]) / Math.max(1e-6, bb[a + 3] - bb[a]) * 65535);
  const n8 = new Int8Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) n8[i] = Math.round(normal[i] * 127);
  const sw = new Uint8Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    let s = 0; const w = [];
    for (let k = 0; k < 4; k++) { w[k] = Math.round(skinWeight[i * 4 + k] * 255); s += w[k]; }
    w[0] += 255 - s;
    for (let k = 0; k < 4; k++) sw[i * 4 + k] = w[k];
  }
  // потоки вершин (кратно 4 байтам) и индексы, сжатые meshoptimizer
  const p4 = new Uint16Array(nv * 4);
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) p4[i * 4 + a] = q[i * 3 + a];
  const na = new Int8Array(nv * 4);
  for (let i = 0; i < nv; i++) { for (let a = 0; a < 3; a++) na[i * 4 + a] = n8[i * 3 + a]; na[i * 4 + 3] = Math.round(ao[i] * 127); }
  const enc = (arr, size) => pk.pushBytes(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), nv, size));
  const idx32 = Uint32Array.from(index);
  const meta = {
    name: piece.name, slot: piece.slot, kind: piece.kind, style: piece.style, covers: piece.covers || [], hideHair: piece.hideHair,
    mats: piece.mats, groups: piece.groups, nv, ni: index.length, bb,
    pos: enc(p4, 8), nrm: enc(na, 4), si: enc(Uint8Array.from(skinIndex), 4), sw: enc(sw, 4),
    idx: pk.pushBytes(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx32.buffer), index.length, 4)),
  };
  return meta;
}

// Сортировка треугольников по группам (материал/область)
function groupTris(index, triGroup, nGroups) {
  const lists = Array.from({ length: nGroups }, () => []);
  for (let t = 0; t < index.length / 3; t++) lists[triGroup[t]].push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2]);
  const out = [], groups = [];
  for (let g = 0; g < nGroups; g++) {
    if (!lists[g].length) continue;
    groups.push([out.length, lists[g].length, g]);
    for (const v of lists[g]) out.push(v);
  }
  return { index: new Uint32Array(out), groups };
}

async function bakeKey(cls, sex) {
  const C = CLASSES[cls];
  const spec = JSON.parse(JSON.stringify(sex === 'f' ? C.look.female : C.look.male));
  spec.female = sex === 'f';
  const key = cls + '_' + sex;
  log(`== ${key}`);
  const t0 = Date.now();
  const kit = makeKit(spec);
  sculptBody(kit, spec);
  const S = kit.S;
  const bodySdf = (x, y, z) => S.sdf(x, y, z);
  const pk = new Packer();
  const pieces = [];
  const h = 0.0021 / QUALITY;
  // ---- тело ----
  {
    // тело и голова лепятся отдельно (голова — втрое мельче) и сшиваются по шее
    const nw = kit.bones.neck.getWorldPosition(new THREE.Vector3());
    const yc = nw.y + kit.dim.neckLen * 0.42;
    const bb = boundsOf(S);
    const hw = kit.bones.head.getWorldPosition(new THREE.Vector3());
    const rawB = meshSDF(bodySdf, [bb[0], bb[1], bb[2], bb[3], yc, bb[5]], h, { log });
    const mB = await simplifyAndFinish(bodySdf, rawB, Math.round(46000 * QUALITY), { log, lockBorder: true });
    const hh = h * (Number(process.env.HEADRES) || 0.34);
    const rawH = meshSDF(bodySdf, [hw.x - 0.16 * kit.hk, yc, hw.z - 0.16 * kit.hk, hw.x + 0.16 * kit.hk, bb[4], hw.z + 0.18 * kit.hk], hh, { log });
    const mH = await simplifyAndFinish(bodySdf, rawH, Math.round(34000 * QUALITY), { log, lockBorder: true, error: 0.0004 });
    const m = zipMeshes(mB, mH, yc, log);
    const nv = m.position.length / 3;
    const skinIndex = new Uint8Array(nv * 4), skinWeight = new Float32Array(nv * 4), ao = new Float32Array(nv), color = new Float32Array(nv * 3);
    const region = new Uint8Array(nv);
    const p = new THREE.Vector3(), n = new THREE.Vector3(), col = new THREE.Color();
    const skin = hexRGB(spec.skin);
    for (let i = 0; i < nv; i++) {
      p.fromArray(m.position, i * 3); n.fromArray(m.normal, i * 3);
      S.focus(p.x, p.y, p.z, 0.06);
      const w = S.weightsAt(p.x, p.y, p.z, 0.012);
      S.unfocus();
      for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = w.idx[k]; skinWeight[i * 4 + k] = w.wt[k]; }
      region[i] = REGIONS.indexOf(REGION_OF[HERO_BONES[w.idx[0]]]);
      ao[i] = aoAt(bodySdf, p, n);
      col.setRGB(skin[0], skin[1], skin[2]);
      color[i * 3] = col.r; color[i * 3 + 1] = col.g; color[i * 3 + 2] = col.b;
    }
    // область треугольника — по большинству вершин (голова приоритетнее)
    const tg = new Uint8Array(m.index.length / 3);
    for (let t = 0; t < tg.length; t++) {
      const a = region[m.index[t * 3]], b = region[m.index[t * 3 + 1]], c = region[m.index[t * 3 + 2]];
      tg[t] = a === b || a === c ? a : b === c ? b : Math.min(a, b, c);
    }
    const g = groupTris(m.index, tg, REGIONS.length);
    pieces.push(packPiece(pk, { name: 'body', slot: 'body', ...m, index: g.index, groups: g.groups, mats: REGIONS, skinIndex, skinWeight, ao, color: null }));
  }
  // ---- волосы, борода ----
  for (const hp of hairPieces(kit, spec)) pieces.push(await bakePiece(pk, kit, hp, bodySdf, h));
  // ---- броня ----
  if (!process.env.NOARMOR) for (const ap of armorPieces(kit, spec, C.armorType, cls)) pieces.push(await bakePiece(pk, kit, ap, bodySdf, h));
  // ---- раскладка ----
  const L = kit.layout;
  const head = kit.bones.head;
  const eyes = [1, -1].map(sx => {
    const c = [L.headC[0] + sx * EYE.x * kit.hk, L.headC[1] + EYE.y * kit.hk, L.headC[2] + EYE.z * kit.hk];
    return { c, r: EYE.r * kit.hk };
  });
  void head;
  const header = {
    key, v: 1, hairCenter: kit.bones.head.localToWorld(new THREE.Vector3(...L.headC)).toArray(), J: L.J, dim: L.dim, headC: L.headC, bones: HERO_BONES, regions: REGIONS, eyes,
    grip: { L: gripPoint(spec, 1), R: gripPoint(spec, -1) }, pieces,
  };
  const bin = pk.buffer();
  const b64 = Buffer.from(bin).toString('base64');
  const js = `(window.__HERO_DATA=window.__HERO_DATA||{})[${JSON.stringify(key)}]={h:${JSON.stringify(header)},b:"${b64}"};\n`;
  fs.writeFileSync(path.join(OUT, `hero_${key}.js`), js);
  log(`  => hero_${key}.js ${(js.length / 1024 / 1024).toFixed(2)} МБ, ${((Date.now() - t0) / 1000).toFixed(0)}с`);
}

// Деталь (волосы/броня): своя SDF, веса от тела
async function bakePiece(pk, kit, ap, bodySdf, h) {
  const S = kit.S;
  log(`  - ${ap.name}`);
  const hh = h * (ap.res || 1.25);
  const raw = meshSDF(ap.sdf, ap.bounds, hh, { log });
  if (!raw.index.length) { log('    пусто!'); }
  const m = await simplifyAndFinish(ap.sdf, raw, Math.round((ap.tris || 9000) * QUALITY), { log });
  const nv = m.position.length / 3;
  const skinIndex = new Uint8Array(nv * 4), skinWeight = new Float32Array(nv * 4), ao = new Float32Array(nv);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const both = (x, y, z) => Math.min(bodySdf(x, y, z), ap.sdf(x, y, z));
  const allow = ap.bones ? new Set(ap.bones.map(b => S.boneIdx.get(b))) : null;
  const matOf = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    p.fromArray(m.position, i * 3); n.fromArray(m.normal, i * 3);
    let w;
    if (ap.weights) w = ap.weights(p);
    else {
      S.focus(p.x, p.y, p.z, 0.2);
      w = S.weightsAt(p.x, p.y, p.z, ap.sigma || 0.02, allow);
      S.unfocus();
    }
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = w.idx[k]; skinWeight[i * 4 + k] = w.wt[k]; }
    ao[i] = aoAt(both, p, n) * (ap.aoMul ? ap.aoMul(p) : 1);
    matOf[i] = ap.matAt ? ap.matAt(p, n) : 0;
  }
  const tg = new Uint8Array(m.index.length / 3);
  for (let t = 0; t < tg.length; t++) {
    const a = matOf[m.index[t * 3]], b = matOf[m.index[t * 3 + 1]], c = matOf[m.index[t * 3 + 2]];
    tg[t] = a === b || a === c ? a : b === c ? b : Math.max(a, b, c);
  }
  const mats = ap.mats || ['P'];
  const g = groupTris(m.index, tg, mats.length);
  return packPiece(pk, { ...ap, ...m, index: g.index, groups: g.groups, mats, skinIndex, skinWeight, ao, color: null });
}

const keys = process.argv.slice(2);
const all = [];
for (const cls of Object.keys(CLASSES)) for (const sx of ['m', 'f']) all.push([cls, sx]);
for (const [cls, sx] of all) {
  if (keys.length && !keys.includes(cls + '_' + sx)) continue;
  await bakeKey(cls, sx);
}
