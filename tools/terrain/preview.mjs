// Предпросмотр рельефа без браузера: node tools/terrain/preview.mjs out.bin [N]
// Пишет высоты float32 и маску гор; картинку рисует render.py.
import { writeFileSync } from 'node:fs';
import { generateHeights } from '../../src/world/heightmap.js';
import { WORLD_HALF } from '../../src/data/world.js';
const out = process.argv[2] || 'terrain.bin';
const N = Number(process.argv[3] || 480);
const opts = process.env.EROSION ? { erosion: JSON.parse(process.env.EROSION) } : {};
if (process.env.THERMAL === '0') opts.thermal = false;
if (process.env.DROPS) opts.drops = Number(process.env.DROPS);
const t = Date.now();
const r = generateHeights(N, WORLD_HALF, opts);
console.log('N', N, 'ms', Date.now() - t, JSON.stringify(r.timing));
let mn = 1e9, mx = -1e9;
for (const v of r.h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
console.log('height range', mn.toFixed(1), mx.toFixed(1));
writeFileSync(out, Buffer.concat([Buffer.from(new Float32Array([N + 1, WORLD_HALF]).buffer), Buffer.from(r.h.buffer), Buffer.from(r.biome.buffer)]));
