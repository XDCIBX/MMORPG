// Запекание оружия: node tools/bake/bake_weapons.mjs → models/hero_weapons.js
import fs from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer';
import { weaponDefs, weaponSDF } from '../../src/chars/hero/weapons_sdf.js';
import { meshSDF, simplifyAndFinish } from './mesher.mjs';
await MeshoptEncoder.ready;
const Q = Number(process.env.Q || 1);
const chunks = []; let size = 0;
const pushBytes = (u8) => { const off = size; chunks.push(u8); size += u8.length; return [off, u8.length]; };
const pieces = [];
for (const def of weaponDefs()) {
  const { sdf, matAt } = weaponSDF(def);
  const h = 0.0011 * (def.res || 1) / Q;
  const raw = meshSDF(sdf, def.bounds, h, { log: (m) => console.log(def.type, m) });
  const m = await simplifyAndFinish(sdf, raw, Math.round((def.tris || 6000) * Math.min(1, Q)), { log: (s) => console.log(def.type, s), error: 0.0004 });
  const nv = m.position.length / 3;
  // AO и материал по вершинам
  const ao = new Float32Array(nv), mat = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    const x = m.position[i * 3], y = m.position[i * 3 + 1], z = m.position[i * 3 + 2];
    const nx = m.normal[i * 3], ny = m.normal[i * 3 + 1], nz = m.normal[i * 3 + 2];
    let occ = 0, sc = 1;
    for (const d of [0.006, 0.015, 0.03]) { occ += (d - Math.max(0, sdf(x + nx * d, y + ny * d, z + nz * d))) * sc; sc *= 0.6; }
    ao[i] = Math.max(0.2, Math.min(1, 1 - occ * 9));
    mat[i] = matAt(x - nx * 0.0005, y - ny * 0.0005, z - nz * 0.0005);
  }
  const lists = def.mats.map(() => []);
  for (let t = 0; t < m.index.length; t += 3) {
    const a = mat[m.index[t]], b = mat[m.index[t + 1]], c = mat[m.index[t + 2]];
    lists[a === b || a === c ? a : b === c ? b : Math.max(a, b, c)].push(m.index[t], m.index[t + 1], m.index[t + 2]);
  }
  const idx = [], groups = [];
  lists.forEach((l, g) => { if (l.length) { groups.push([idx.length, l.length, g]); for (const v of l) idx.push(v); } });
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { const v = m.position[i * 3 + a]; bb[a] = Math.min(bb[a], v); bb[a + 3] = Math.max(bb[a + 3], v); }
  const p4 = new Uint16Array(nv * 4), na = new Int8Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    for (let a = 0; a < 3; a++) { p4[i * 4 + a] = Math.round((m.position[i * 3 + a] - bb[a]) / Math.max(1e-6, bb[a + 3] - bb[a]) * 65535); na[i * 4 + a] = Math.round(m.normal[i * 3 + a] * 127); }
    na[i * 4 + 3] = Math.round(ao[i] * 127);
  }
  const idx32 = Uint32Array.from(idx);
  pieces.push({
    name: def.type, slot: 'weapon', mats: def.mats, groups, nv, ni: idx.length, bb,
    pos: pushBytes(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(p4.buffer), nv, 8)),
    nrm: pushBytes(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(na.buffer), nv, 4)),
    idx: pushBytes(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx32.buffer), idx.length, 4)),
  });
}
const bin = new Uint8Array(size); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
const js = `(window.__HERO_DATA=window.__HERO_DATA||{})["weapons"]={h:${JSON.stringify({ key: 'weapons', pieces })},b:"${Buffer.from(bin).toString('base64')}"};\n`;
fs.writeFileSync('models/hero_weapons.js', js);
console.log('hero_weapons.js', (js.length / 1024).toFixed(0), 'КБ');
