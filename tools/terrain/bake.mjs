// Запекание рельефа: node tools/terrain/bake.mjs  → models/terrain_heights.js
// Тяжёлая эрозия (сотни тысяч капель) считается здесь один раз, игра только читает результат.
import { writeFileSync } from 'node:fs';
import { generateHeights, encodeBakedHeights } from '../../src/world/heightmap.js';
import { WORLD_HALF } from '../../src/data/world.js';
const N = 480, DROPS = Number(process.env.DROPS || 450000);
const t = Date.now();
const r = generateHeights(N, WORLD_HALF, { bakeOnly: true, drops: DROPS });
const bytes = encodeBakedHeights(r.raw, r.V, WORLD_HALF);
const b64 = Buffer.from(bytes).toString('base64');
writeFileSync(new URL('../../models/terrain_heights.js', import.meta.url), `// Запечённый рельеф мира (tools/terrain/bake.mjs), ${N}×${N}, ${DROPS} капель эрозии\nwindow.__TERRAIN_H="${b64}";\n`);
console.log('baked', N, 'drops', DROPS, 'ms', Date.now() - t, 'KB', Math.round(b64.length / 1024));
