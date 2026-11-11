// Ландшафт: карта высот, биомы, вода, лава, текстура мини-карты.
import * as THREE from 'three';
import { Noise, clamp, lerp, smoothstep, distToSegment } from '../core/util.js';
import { terrainDetail, waterNormal } from '../core/textures.js';
import { WORLD_HALF, CITIES, ROADS, BIOMES, BIOME_LIST, BIOME_SEEDS, LAKES, LAVA_POOLS, SECRET_SHOPS, POIS } from '../data/world.js';

const N = 400; // сегментов по стороне
const SIZE = WORLD_HALF * 2;
const CELL = SIZE / N;

export class Terrain {
  constructor() {
    this.noise = new Noise(1337);
    this.noise2 = new Noise(4242);
    const V = N + 1;
    this.V = V;
    this.h = new Float32Array(V * V);
    this.biome = new Uint8Array(V * V);
    this.biomeW = new Float32Array(V * V * BIOME_LIST.length);
    this.road = new Float32Array(V * V);
    this.compute();
    this.buildMesh();
    this.buildWater();
    this.buildLava();
    this.buildMapCanvas();
  }

  biomeWeightsAt(x, z, out) {
    const n = this.noise2;
    const wx = x + n.fbm(x * 0.004, z * 0.004, 3) * 70;
    const wz = z + n.fbm(x * 0.004 + 50, z * 0.004 + 50, 3) * 70;
    out.fill(0);
    let sum = 0;
    for (const s of BIOME_SEEDS) {
      const d = Math.hypot(wx - s.x, wz - s.z) / s.r;
      const w = Math.exp(-d * d * 2.2);
      out[BIOMES[s.b].id] += w; sum += w;
    }
    if (sum < 1e-4) { out[BIOMES.meadow.id] = 1; return; }
    for (let i = 0; i < out.length; i++) out[i] /= sum;
  }

  compute() {
    const V = this.V, n = this.noise;
    const bw = new Float32Array(BIOME_LIST.length);
    const raw = new Float32Array(V * V);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
        const idx = j * V + i;
        this.biomeWeightsAt(x, z, bw);
        let amp = 0, best = 0, bi = 0, mount = 0;
        for (let b = 0; b < bw.length; b++) {
          amp += bw[b] * BIOME_LIST[b].amp;
          if (bw[b] > best) { best = bw[b]; bi = b; }
          this.biomeW[idx * bw.length + b] = bw[b];
        }
        mount = bw[BIOMES.highland.id] + bw[BIOMES.snow.id] + bw[BIOMES.volcanic.id];
        this.biome[idx] = bi;
        let h = 4.5;
        h += (n.fbm(x * 0.0035, z * 0.0035, 5) * 0.5 + 0.5) * amp * 1.1;
        h += Math.max(0, n.ridge(x * 0.006 + 10, z * 0.006 - 7, 4) - 0.3) * amp * 1.1 * mount;
        h += n.fbm(x * 0.03, z * 0.03, 2) * 0.6;
        // Болота — почти плоские с лужами
        const sw = bw[BIOMES.swamp.id];
        h = lerp(h, 0.5 + n.fbm(x * 0.025, z * 0.025, 3) * 1.6, smoothstep(0.3, 0.8, sw));
        // Горы по краю мира
        const m = Math.max(Math.abs(x), Math.abs(z));
        const edge = smoothstep(600, 770, m);
        h += edge * (55 + n.ridge(x * 0.01, z * 0.01, 4) * 60);
        // Озёра и лава
        for (const L of LAKES.concat(LAVA_POOLS)) {
          const d = Math.hypot(x - L.x, z - L.z);
          const t = smoothstep(L.r * 1.35, L.r * 0.35, d);
          if (t > 0) h = lerp(h, -L.depth, t);
        }
        raw[idx] = h;
        // дороги
        let rd = 1e9;
        for (const road of ROADS) {
          for (let k = 0; k < road.length - 1; k++) {
            const d = distToSegment(x, z, road[k][0], road[k][1], road[k + 1][0], road[k + 1][1]);
            if (d < rd) rd = d;
          }
        }
        const wob = n.noise(x * 0.05, z * 0.05) * 1.2;
        this.road[idx] = smoothstep(5.5 + wob, 2.5 + wob, rd);
      }
    }
    // Сглаживание (для дорог и площадок)
    const blur = new Float32Array(V * V);
    const R = 3;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      let s = 0, c = 0;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const ii = clamp(i + di, 0, V - 1), jj = clamp(j + dj, 0, V - 1);
        s += raw[jj * V + ii]; c++;
      }
      blur[j * V + i] = s / c;
    }
    const flatSpots = [];
    for (const c of CITIES) flatSpots.push({ x: c.x, z: c.z, r: c.r + 10, fall: 45, city: true });
    for (const s of SECRET_SHOPS) flatSpots.push({ x: s.x, z: s.z, r: 12, fall: 18 });
    for (const p of POIS) flatSpots.push({ x: p.x, z: p.z, r: p.r * 0.8, fall: 20 });
    for (const f of flatSpots) {
      const ci = Math.round((f.x + WORLD_HALF) / CELL), cj = Math.round((f.z + WORLD_HALF) / CELL);
      f.h = Math.max(f.city ? 3 : 1.2, blur[cj * V + ci]);
    }
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const idx = j * V + i;
      const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
      let h = lerp(raw[idx], Math.max(blur[idx], raw[idx] < 0 ? raw[idx] : 0.6), this.road[idx] * 0.8);
      for (const f of flatSpots) {
        const d = Math.hypot(x - f.x, z - f.z);
        if (d < f.r + f.fall) {
          const t = smoothstep(f.r + f.fall, f.r, d);
          h = lerp(h, f.h, t);
        }
      }
      this.h[idx] = h;
    }
    this.flatSpots = flatSpots;
  }

  getHeight(x, z) {
    const V = this.V;
    let gx = (x + WORLD_HALF) / CELL, gz = (z + WORLD_HALF) / CELL;
    gx = clamp(gx, 0, N - 0.0001); gz = clamp(gz, 0, N - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h00 = this.h[j * V + i], h10 = this.h[j * V + i + 1];
    const h01 = this.h[(j + 1) * V + i], h11 = this.h[(j + 1) * V + i + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  // Видимая высота с учётом воды (для размещения)
  groundOrWater(x, z) { return Math.max(this.getHeight(x, z), 0); }

  sampleIdx(x, z) {
    const i = clamp(Math.round((x + WORLD_HALF) / CELL), 0, N);
    const j = clamp(Math.round((z + WORLD_HALF) / CELL), 0, N);
    return j * this.V + i;
  }
  biomeAt(x, z) { return BIOME_LIST[this.biome[this.sampleIdx(x, z)]]; }
  roadAt(x, z) { return this.road[this.sampleIdx(x, z)]; }
  biomeWeight(x, z, biomeId) { return this.biomeW[this.sampleIdx(x, z) * BIOME_LIST.length + biomeId]; }

  normalAt(x, z) {
    const e = 1.5;
    const hl = this.getHeight(x - e, z), hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e), hu = this.getHeight(x, z + e);
    return new THREE.Vector3(hl - hr, 2 * e, hd - hu).normalize();
  }

  buildMesh() {
    const V = this.V;
    const pos = new Float32Array(V * V * 3);
    const col = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const idx = j * V + i;
      pos[idx * 3] = -WORLD_HALF + i * CELL;
      pos[idx * 3 + 1] = this.h[idx];
      pos[idx * 3 + 2] = -WORLD_HALF + j * CELL;
    }
    const index = new Uint32Array(N * N * 6);
    let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v00 = j * V + i, v10 = v00 + 1, v01 = v00 + V, v11 = v01 + 1;
      index[k++] = v00; index[k++] = v01; index[k++] = v10;
      index[k++] = v10; index[k++] = v01; index[k++] = v11;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    const nrm = g.attributes.normal.array;
    const n = this.noise;
    const tmp = [0, 0, 0];
    const nb = BIOME_LIST.length;
    for (let idx = 0; idx < V * V; idx++) {
      const x = pos[idx * 3], h = pos[idx * 3 + 1], z = pos[idx * 3 + 2];
      const ny = nrm[idx * 3 + 1];
      let r = 0, gg = 0, b = 0;
      const patch = n.fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
      const dirtPatch = smoothstep(0.62, 0.8, n.fbm(x * 0.015 + 9, z * 0.015, 3) * 0.5 + 0.5);
      for (let bi = 0; bi < nb; bi++) {
        const w = this.biomeW[idx * nb + bi];
        if (w < 0.001) continue;
        const B = BIOME_LIST[bi];
        for (let c = 0; c < 3; c++) {
          tmp[c] = lerp(B.grass[c], B.grass2[c], patch);
          tmp[c] = lerp(tmp[c], B.dirt[c], dirtPatch * 0.6);
        }
        // скалы на крутых склонах
        const rockT = smoothstep(0.86, 0.68, ny);
        for (let c = 0; c < 3; c++) tmp[c] = lerp(tmp[c], B.rock[c] * (0.85 + patch * 0.3), rockT);
        r += tmp[0] * w; gg += tmp[1] * w; b += tmp[2] * w;
      }
      // снег на высоких пиках
      const hotW = this.biomeW[idx * nb + BIOMES.volcanic.id] + this.biomeW[idx * nb + BIOMES.swamp.id];
      const snowT = smoothstep(48, 70, h) * smoothstep(0.55, 0.8, ny) * (1 - Math.min(1, hotW * 1.5));
      r = lerp(r, 0.92, snowT); gg = lerp(gg, 0.94, snowT); b = lerp(b, 0.98, snowT);
      // песок/ил у воды
      const swampW = this.biomeW[idx * nb + BIOMES.swamp.id];
      const volcW = this.biomeW[idx * nb + BIOMES.volcanic.id];
      const shore = smoothstep(1.6, 0.2, h);
      const sand = swampW > 0.4 ? [0.22, 0.2, 0.12] : volcW > 0.4 ? [0.35, 0.12, 0.05] : [0.72, 0.65, 0.46];
      r = lerp(r, sand[0], shore); gg = lerp(gg, sand[1], shore); b = lerp(b, sand[2], shore);
      // дороги
      const rd = this.road[idx];
      if (rd > 0) {
        const rc = volcW > 0.5 ? [0.3, 0.26, 0.24] : [0.52, 0.43, 0.3];
        r = lerp(r, rc[0], rd * 0.9); gg = lerp(gg, rc[1], rd * 0.9); b = lerp(b, rc[2], rd * 0.9);
      }
      // цвета заданы в sRGB — переводим в линейное пространство
      col[idx * 3] = Math.pow(r, 2.2); col[idx * 3 + 1] = Math.pow(gg, 2.2); col[idx * 3 + 2] = Math.pow(b, 2.2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
    const detail = terrainDetail();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tDetail = { value: detail };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D tDetail;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec4 d1 = texture2D(tDetail, vWPos.xz * 0.09);
          vec4 d2 = texture2D(tDetail, vWPos.xz * 0.012);
          vec4 d3 = texture2D(tDetail, vWPos.xz * 0.55);
          float det = mix(0.72, 1.22, d1.r) * mix(0.84, 1.14, d2.g) * mix(0.9, 1.08, d3.b);
          diffuseColor.rgb *= det;`);
    };
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
    g.rotateX(-Math.PI / 2);
    const nm = waterNormal();
    nm.repeat.set(160, 160);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1d4f5e, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.84,
      normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2,
      clearcoat: 0.6, clearcoatRoughness: 0.1,
    });
    this.water = new THREE.Mesh(g, mat);
    this.water.position.y = 0;
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
  }

  buildLava() {
    this.lavaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
        void main(){
          vec2 p = vW.xz*0.12;
          float n = fbm(p + vec2(uTime*0.05, uTime*0.03) + fbm(p*1.7 - uTime*0.04));
          float crust = smoothstep(0.42, 0.62, n);
          vec3 hot = mix(vec3(1.0,0.85,0.25), vec3(1.0,0.35,0.05), smoothstep(0.2,0.5,n));
          vec3 col = mix(hot*2.2, vec3(0.08,0.03,0.02), crust);
          gl_FragColor = vec4(col, 1.0);
        }`,
      fog: false,
    });
    this.lava = new THREE.Group();
    for (const L of LAVA_POOLS) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(L.r * 1.25, 48), this.lavaMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(L.x, 0.25, L.z);
      this.lava.add(m);
    }
  }

  isLava(x, z) {
    if (this.getHeight(x, z) > 0.25) return false;
    for (const L of LAVA_POOLS) if (Math.hypot(x - L.x, z - L.z) < L.r * 1.25) return true;
    return false;
  }

  update(dt, t) {
    this.lavaMat.uniforms.uTime.value = t;
    const nm = this.water.material.normalMap;
    nm.offset.x = t * 0.004; nm.offset.y = t * 0.0025;
  }

  buildMapCanvas() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const col = this.mesh.geometry.attributes.color.array;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = -WORLD_HALF + (x + 0.5) / S * SIZE, wz = -WORLD_HALF + (y + 0.5) / S * SIZE;
      const idx = this.sampleIdx(wx, wz);
      const h = this.getHeight(wx, wz);
      const hl = this.getHeight(wx - 3, wz - 3);
      let shade = clamp(1 + (h - hl) * 0.06, 0.6, 1.35);
      let r = col[idx * 3], g = col[idx * 3 + 1], b = col[idx * 3 + 2];
      if (h < 0) {
        const lava = this.isLava(wx, wz);
        const d = clamp(-h / 6, 0, 1);
        if (lava) { r = 0.95; g = 0.35; b = 0.05; } else { r = lerp(0.25, 0.08, d); g = lerp(0.48, 0.25, d); b = lerp(0.58, 0.42, d); }
        shade = 1;
      }
      const i = (y * S + x) * 4;
      img.data[i] = clamp(Math.pow(r * shade, 1 / 2.2) * 255, 0, 255);
      img.data[i + 1] = clamp(Math.pow(g * shade, 1 / 2.2) * 255, 0, 255);
      img.data[i + 2] = clamp(Math.pow(b * shade, 1 / 2.2) * 255, 0, 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // города
    for (const city of CITIES) {
      const px = (city.x + WORLD_HALF) / SIZE * S, py = (city.z + WORLD_HALF) / SIZE * S;
      const pr = city.r / SIZE * S;
      ctx.fillStyle = 'rgba(70,60,50,0.9)';
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d8c79a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(160,140,110,0.9)';
      ctx.beginPath(); ctx.arc(px, py, pr * 0.3, 0, 7); ctx.fill();
    }
    this.mapCanvas = c;
  }
}

export const TERRAIN_CELL = CELL;
