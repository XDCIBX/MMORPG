// Ландшафт: карта высот, биомы, вода, лава, текстура мини-карты.
import * as THREE from 'three';
import { Noise, clamp, lerp, smoothstep, distToSegment } from '../core/util.js';
import { terrainDetail, waterNormal, terrainLayers } from '../core/textures.js';
import { WORLD_HALF, CITIES, ROADS, BIOMES, BIOME_LIST, BIOME_SEEDS, LAKES, LAVA_POOLS, SECRET_SHOPS, POIS } from '../data/world.js';

import { IS_PHONE } from '../core/device.js';
import { generateHeights, decodeBakedHeights } from './heightmap.js';
import { groundTextures } from '../core/groundtex.js';

const N = IS_PHONE ? 320 : 480; // сегментов по стороне (на телефонах меньше)
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
    // высоты, биомы и дороги считает чистый модуль heightmap.js (его же можно запустить в node)
    const opts = Object.assign({}, (typeof window !== 'undefined' && window.__terrOpts) || {});
    // запечённый рельеф (models/terrain_heights.js): эрозия сотнями тысяч капель посчитана заранее
    const B = typeof window !== 'undefined' && window.__TERRAIN_H && !opts.noBake ? decodeBakedHeights(window.__TERRAIN_H) : null;
    if (B) opts.baked = B;
    const r = generateHeights(N, WORLD_HALF, opts);
    this.baked = !!r.baked;
    this.h = r.h; this.biome = r.biome; this.biomeW = r.biomeW; this.road = r.road;
    this.flatSpots = r.flatSpots;
    this.mountMask = r.mask;
    this.genTiming = r.timing;
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
  colorAt(x, z, out) {
    const i = this.sampleIdx(x, z) * 3, c = this.mesh.geometry.attributes.color.array;
    return out.setRGB(c[i], c[i + 1], c[i + 2]);
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
    const splat = new Float32Array(V * V * 3);
    const rockA = new Float32Array(V * V * 4);
    // цвета слоёв для текстур: дёрн, почва, песок; доли биомов (вулкан, болото, снег); берег, дорога, пятна почвы
    const aG = new Float32Array(V * V * 3), aD = new Float32Array(V * V * 3), aSn = new Float32Array(V * V * 3);
    const aBio = new Float32Array(V * V * 3), aSp2 = new Float32Array(V * V * 3);
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
      let r = 0, gg = 0, b = 0, kr = 0, kg = 0, kb = 0;
      let g0 = 0, g1 = 0, g2 = 0, d0 = 0, d1 = 0, d2c = 0;
      const patch = n.fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
      const dirtPatch = smoothstep(0.62, 0.8, n.fbm(x * 0.015 + 9, z * 0.015, 3) * 0.5 + 0.5);
      for (let bi = 0; bi < nb; bi++) {
        const w = this.biomeW[idx * nb + bi];
        if (w < 0.001) continue;
        const B = BIOME_LIST[bi];
        for (let c = 0; c < 3; c++) tmp[c] = lerp(B.grass[c], B.grass2[c], patch);
        g0 += tmp[0] * w; g1 += tmp[1] * w; g2 += tmp[2] * w;
        d0 += B.dirt[0] * w; d1 += B.dirt[1] * w; d2c += B.dirt[2] * w;
        for (let c = 0; c < 3; c++) tmp[c] = lerp(tmp[c], B.dirt[c], dirtPatch * 0.6);
        // скалы на крутых склонах; чем выше, тем на более пологих выходит камень (выше границы леса)
        const alt = smoothstep(30, 65, h);
        const rockT = smoothstep(0.78 + alt * 0.1, 0.6 + alt * 0.1, ny);
        for (let c = 0; c < 3; c++) tmp[c] = lerp(tmp[c], B.rock[c] * (0.85 + patch * 0.3), rockT);
        r += tmp[0] * w; gg += tmp[1] * w; b += tmp[2] * w;
        kr += B.rock[0] * w; kg += B.rock[1] * w; kb += B.rock[2] * w;
      }
      // снег на высоких пиках
      const hotW = this.biomeW[idx * nb + BIOMES.volcanic.id] + this.biomeW[idx * nb + BIOMES.swamp.id];
      // снеговая линия: в Ледяном пределе низко, в остальных горах — только на вершинах; на крутых гранях снег не держится
      const snowBW = this.biomeW[idx * nb + BIOMES.snow.id];
      const sLine = lerp(64, 36, snowBW);
      const snowT = smoothstep(sLine, sLine + 18, h) * smoothstep(0.74, 0.88, ny) * (1 - Math.min(1, hotW * 1.5));
      rockA[idx * 4] = Math.pow(kr, 2.2); rockA[idx * 4 + 1] = Math.pow(kg, 2.2); rockA[idx * 4 + 2] = Math.pow(kb, 2.2);
      // a: можно ли снег (0 — вулкан/болото) и доля снежного биома: a = allow · (0.5 + 0.5·snow)
      rockA[idx * 4 + 3] = (1 - Math.min(1, hotW * 1.5)) * (0.5 + 0.5 * snowBW);
      r = lerp(r, 0.92, snowT); gg = lerp(gg, 0.94, snowT); b = lerp(b, 0.98, snowT);
      // песок/ил у воды
      const swampW = this.biomeW[idx * nb + BIOMES.swamp.id];
      const volcW = this.biomeW[idx * nb + BIOMES.volcanic.id];
      const shore = smoothstep(1.6, 0.2, h);
      const sand = swampW > 0.4 ? [0.22, 0.2, 0.12] : volcW > 0.4 ? [0.11, 0.09, 0.08] : [0.72, 0.65, 0.46];
      r = lerp(r, sand[0], shore); gg = lerp(gg, sand[1], shore); b = lerp(b, sand[2], shore);
      // дороги
      const rd = this.road[idx];
      if (rd > 0) {
        const rc = volcW > 0.5 ? [0.3, 0.26, 0.24] : [0.52, 0.43, 0.3];
        r = lerp(r, rc[0], rd * 0.9); gg = lerp(gg, rc[1], rd * 0.9); b = lerp(b, rc[2], rd * 0.9);
      }
      // веса слоёв рельефа: дёрн / скала / земля
      {
        const altW = smoothstep(30, 65, h);
        const rockW = Math.max(smoothstep(0.78 + altW * 0.1, 0.58 + altW * 0.1, ny), snowT * 0.3, (this.biomeW[idx * nb + BIOMES.volcanic.id]) * 0.5);
        const dirtW = Math.max(dirtPatch * 0.7, this.road[idx], shore, swampW * 0.4);
        const sum = 1 + rockW * 2 + dirtW * 1.5;
        splat[idx * 3] = 1 / sum; splat[idx * 3 + 1] = rockW * 2 / sum; splat[idx * 3 + 2] = dirtW * 1.5 / sum;
      }
      // цвета заданы в sRGB — переводим в линейное пространство
      col[idx * 3] = Math.pow(r, 2.2); col[idx * 3 + 1] = Math.pow(gg, 2.2); col[idx * 3 + 2] = Math.pow(b, 2.2);
      aG[idx * 3] = Math.pow(g0, 2.2); aG[idx * 3 + 1] = Math.pow(g1, 2.2); aG[idx * 3 + 2] = Math.pow(g2, 2.2);
      aD[idx * 3] = Math.pow(d0, 2.2); aD[idx * 3 + 1] = Math.pow(d1, 2.2); aD[idx * 3 + 2] = Math.pow(d2c, 2.2);
      aSn[idx * 3] = Math.pow(sand[0], 2.2); aSn[idx * 3 + 1] = Math.pow(sand[1], 2.2); aSn[idx * 3 + 2] = Math.pow(sand[2], 2.2);
      aBio[idx * 3] = volcW; aBio[idx * 3 + 1] = swampW; aBio[idx * 3 + 2] = snowBW;
      aSp2[idx * 3] = shore; aSp2[idx * 3 + 1] = this.road[idx]; aSp2[idx * 3 + 2] = dirtPatch;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
    g.setAttribute('aRock', new THREE.BufferAttribute(rockA, 4));
    g.setAttribute('aG', new THREE.BufferAttribute(aG, 3));
    g.setAttribute('aD', new THREE.BufferAttribute(aD, 3));
    g.setAttribute('aSn', new THREE.BufferAttribute(aSn, 3));
    g.setAttribute('aBio', new THREE.BufferAttribute(aBio, 3));
    g.setAttribute('aSp2', new THREE.BufferAttribute(aSp2, 3));
    g.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const detail = terrainDetail();
    const layers = terrainLayers();
    const GT = groundTextures();
    this.terrTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tDetail = { value: detail };
      sh.uniforms.tLayers = { value: layers };
      sh.uniforms.uTime = this.terrTime;
      for (const [k, u] of [['grass', 'G'], ['dirt', 'D'], ['rock', 'R'], ['sand', 'S'], ['gravel', 'V']]) {
        sh.uniforms['t' + u] = { value: GT[k] };
        sh.uniforms['m' + u] = { value: GT[k].userData.mean };
      }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aSplat;\nattribute vec4 aRock;\nattribute vec3 aG; attribute vec3 aD; attribute vec3 aSn; attribute vec3 aBio; attribute vec3 aSp2;\nvarying vec3 vWPos;\nvarying vec3 vSplat;\nvarying vec3 vWNrm;\nvarying vec4 vRock;\nvarying vec3 vG; varying vec3 vD; varying vec3 vSn; varying vec3 vBio; varying vec3 vSp2;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position,1.0)).xyz;\nvSplat = aSplat;\nvWNrm = normal;\nvRock = aRock;\nvG = aG; vD = aD; vSn = aSn; vBio = aBio; vSp2 = aSp2;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vSplat; varying vec3 vWNrm; varying vec4 vRock;
          varying vec3 vG; varying vec3 vD; varying vec3 vSn; varying vec3 vBio; varying vec3 vSp2;
          uniform sampler2D tDetail; uniform sampler2D tLayers; uniform float uTime;
          uniform sampler2D tG; uniform sampler2D tD; uniform sampler2D tR; uniform sampler2D tS; uniform sampler2D tV;
          uniform vec3 mG; uniform vec3 mD; uniform vec3 mR; uniform vec3 mS; uniform vec3 mV;
          float gTerrH; float gRock; float gSnow; float gMacroH; float gRough; float gWet; float gAnti;
          // два масштаба с поворотом — повторы текстуры не видны
          vec4 ts(sampler2D t, vec2 p, float s) {
            vec4 a = texture2D(t, p * s);
            vec4 b = texture2D(t, mat2(0.8, -0.6, 0.6, 0.8) * p * (s * 0.41) + 0.37);
            return mix(a, b, gAnti);
          }
          // рельеф по высоте (bump) без отдельной карты нормалей
          vec3 terrPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
            vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
            if (dot(sx, sx) < 1e-12 || dot(sy, sy) < 1e-12) return surf_norm;
            vec3 vSigmaX = normalize(sx); vec3 vSigmaY = normalize(sy);
            vec3 vN = surf_norm;
            vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
            float fDet = dot(vSigmaX, R1) * faceDirection;
            vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
            vec3 n = abs(fDet) * surf_norm - vGrad;
            float l = length(n);
            return l > 1e-6 ? n / l : surf_norm;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec4 d1 = texture2D(tDetail, vWPos.xz * 0.09);
          vec4 d2 = texture2D(tDetail, vWPos.xz * 0.012);
          float macro = mix(0.84, 1.12, d2.g) * mix(0.93, 1.07, d1.r);
          float distV = length(vViewPosition);
          float farK = smoothstep(110.0, 300.0, distV);
          gAnti = smoothstep(0.25, 0.75, d2.b) * 0.7 + 0.15;
          vec3 an = abs(normalize(vWNrm)); an = pow(an, vec3(3.0)); an /= (an.x + an.y + an.z);
          vec3 nW = normalize(vWNrm);
          float slope = 1.0 - nW.y;
          vec2 wp = vWPos.xz;
          // ---- слои: цвет текстуры, нормированный на её средний, × цвет биома ----
          vec4 tg = ts(tG, wp, 0.62);
          vec4 td = ts(tD, wp, 0.42);
          vec4 tsd = ts(tS, wp, 0.38);
          vec4 tv = ts(tV, wp, 0.55);
          vec4 tr = texture2D(tR, vWPos.zy * 0.2) * an.x + texture2D(tR, vWPos.xz * 0.2) * an.y + texture2D(tR, vWPos.xy * 0.2) * an.z;
          vec4 tr2 = texture2D(tR, vWPos.zy * 0.055 + 0.3) * an.x + texture2D(tR, vWPos.xz * 0.055 + 0.3) * an.y + texture2D(tR, vWPos.xy * 0.055 + 0.3) * an.z;
          tr = mix(tr, tr2, 0.4);
          float hm = texture2D(tLayers, vWPos.xz * 0.011).g * an.y + texture2D(tLayers, vWPos.zy * 0.011).g * an.x + texture2D(tLayers, vWPos.xy * 0.011).g * an.z;
          gMacroH = hm;
          float volc = vBio.x, swamp = vBio.y, snowB = vBio.z;
          vec3 cG = vG * clamp(tg.rgb / mG, 0.0, 2.6);
          cG = mix(cG, vec3(dot(cG, vec3(0.3, 0.59, 0.11))), 0.12);
          vec3 cD = mix(vD, vD * vec3(0.55, 0.52, 0.5), volc) * clamp(td.rgb / mD, 0.0, 2.6);
          vec3 cS = vSn * clamp(tsd.rgb / mS, 0.0, 2.2);
          vec3 cV = mix(vec3(0.13, 0.115, 0.095), vec3(0.06, 0.055, 0.05), volc) * clamp(tv.rgb / mV, 0.0, 2.6);
          // скала: пласты с изгибами, крупные пятна
          float warp = (d2.r - 0.5) * 5.0 + (hm - 0.5) * 4.0 + sin(vWPos.x * 0.021 + vWPos.z * 0.017) * 1.6;
          float st1 = sin(vWPos.y * 1.15 + warp + vWPos.x * 0.03);
          float st2 = sin(vWPos.y * 4.3 + warp * 2.0 - vWPos.z * 0.05);
          float strata = 1.0 + (smoothstep(-0.5, 0.5, st1) - 0.5) * 0.14 + st2 * 0.04;
          vec3 cR = vRock.rgb * clamp(tr.rgb / mR, 0.0, 2.6) * strata * mix(0.8, 1.16, hm);
          // базальт в пепельных землях: без светлых пятен лишайника
          cR = mix(cR, vRock.rgb * mix(0.6, 1.25, tr.a) * strata, volc * 0.75);
          // скала по крутизне — попиксельно, с рваной границей
          float altR = smoothstep(30.0, 65.0, vWPos.y);
          float rk = smoothstep(0.23 - altR * 0.1, 0.37 - altR * 0.1, slope + (tr.a - 0.5) * 0.16 + (d2.g - 0.5) * 0.07);
          rk = max(rk, vSplat.y * 0.6);
          // доли слоёв (вулкан — пепел вместо дёрна; снежный биом — снег сверху)
          float wG = vSplat.x * (1.0 - volc) * (1.0 - snowB);
          float wD = vSplat.z * (1.0 - vSp2.y) + vSplat.x * volc + smoothstep(0.6, 0.78, d2.r + d1.g * 0.15) * 0.35 * (1.0 - volc) + swamp * 0.25;
          float wS = vSp2.x, wV = vSp2.y;
          float wR = rk;
          wG *= 1.0 - rk; wD *= 1.0 - rk; wS *= 1.0 - rk * 0.7;
          // смешение по высоте фактуры: камешки торчат из земли, трава заполняет низины
          float aG2 = wG + tg.a * 0.55, aD2 = wD + td.a * 0.55, aS2 = wS + tsd.a * 0.4, aV2 = wV + tv.a * 0.55, aR2 = wR + tr.a * 0.7;
          float mx = max(max(max(aG2, aD2), max(aS2, aV2)), aR2) - 0.28;
          float bG = max(aG2 - mx, 0.0) * step(0.001, wG), bD = max(aD2 - mx, 0.0) * step(0.001, wD), bS = max(aS2 - mx, 0.0) * step(0.001, wS);
          float bV = max(aV2 - mx, 0.0) * step(0.001, wV), bR = max(aR2 - mx, 0.0) * step(0.001, wR);
          float bs = bG + bD + bS + bV + bR + 1e-4;
          bG /= bs; bD /= bs; bS /= bs; bV /= bs; bR /= bs;
          vec3 near = cG * bG + cD * bD + cS * bS + cV * bV + cR * bR;
          near *= macro;
          gTerrH = tg.a * 0.45 * bG + td.a * 0.85 * bD + tsd.a * 0.5 * bS + tv.a * 1.0 * bV + tr.a * 1.5 * bR;
          gRough = 0.95 * bG + 0.93 * bD + 0.9 * bS + 0.88 * bV + mix(0.8, 0.62, tr.a) * bR;
          // вдали — прежний усреднённый цвет (без ряби мелких текстур)
          vec3 far = diffuseColor.rgb * mix(0.82, 1.14, d2.g) * mix(0.9, 1.1, d1.r);
          vec3 farRock = vRock.rgb * strata * mix(0.78, 1.18, hm);
          far = mix(far, farRock, rk);
          diffuseColor.rgb = mix(near, far, farK);
          gRock = rk;
          // мокрый берег: темнее и с бликом; на дне — каустика
          float wet = smoothstep(0.9, 0.06, vWPos.y) * (1.0 - volc);
          diffuseColor.rgb *= mix(1.0, 0.58, wet);
          if (vWPos.y < 0.0) {
            float dep = -vWPos.y;
            float c1 = texture2D(tDetail, wp * 0.11 + vec2(uTime * 0.021, uTime * 0.013)).b;
            float c2 = texture2D(tDetail, wp * 0.13 - vec2(uTime * 0.017, -uTime * 0.019)).b;
            float caus = smoothstep(0.06, 0.0, abs(c1 - c2)) * smoothstep(5.0, 0.3, dep) * (1.0 - swamp) * (1.0 - volc);
            diffuseColor.rgb = diffuseColor.rgb * mix(1.0, 0.55, smoothstep(0.0, 4.0, dep) * (1.0 - volc)) * mix(vec3(0.85, 0.95, 0.95), vec3(1.0), volc) + vec3(0.5, 0.6, 0.55) * caus * 0.35;
          }
          gWet = wet;
          // снег: на высоких пологих местах и в снежном биоме; рваная кромка, рябь от ветра, искры
          float allowS = smoothstep(0.0, 0.5, vRock.a), swB = clamp(vRock.a * 2.0 - 1.0, 0.0, 1.0);
          float sLine = mix(64.0, 36.0, swB);
          float sn = smoothstep(sLine, sLine + 16.0, vWPos.y + (d2.g - 0.5) * 16.0 + (hm - 0.5) * 8.0) * smoothstep(0.72, 0.86, nW.y + (tr.a - 0.5) * 0.25) * allowS;
          sn = max(sn, snowB * (1.0 - rk) * smoothstep(0.6, 0.85, nW.y + (d1.g - 0.5) * 0.2));
          float rip = sin(dot(wp, vec2(0.9, 0.45)) * 2.6 + (d1.r - 0.5) * 6.0) * 0.5 + 0.5;
          vec3 snowC = vec3(0.67, 0.71, 0.79) * mix(0.86, 1.05, d1.r) * mix(0.93, 1.03, rip);
          diffuseColor.rgb = mix(diffuseColor.rgb, snowC, sn);
          gTerrH = mix(gTerrH, rip * 0.35 + d1.g * 0.2, sn);
          gRough = mix(gRough, 0.55, sn);
          gSnow = sn; gRock = rk * (1.0 - sn);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float dist = length(vViewPosition);
            float fade = 1.0 - smoothstep(25.0, 90.0, dist);
            vec2 dH = vec2(dFdx(gTerrH), dFdy(gTerrH)) * (1.2 + gRock * 2.6) * fade * (1.0 + gSnow * 1.4);
            // крупный рельеф скал не пропадает вдали
            dH += vec2(dFdx(gMacroH), dFdy(gMacroH)) * gRock * 9.0 * (1.0 - smoothstep(350.0, 700.0, dist));
            if (dot(dH, dH) > 1e-10) normal = terrPerturb(-vViewPosition, normal, dH, faceDirection);
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(gRough, 0.28, gWet * 0.8);`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // искры на снегу: отдельные кристаллы вспыхивают под взглядом
          if (gSnow > 0.3) {
            vec3 q = floor(vWPos * 38.0);
            float hh = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float tw = step(0.9965, hh) * gSnow * (1.0 - smoothstep(10.0, 40.0, length(vViewPosition)));
            reflectedLight.directSpecular += vec3(1.6) * tw;
          }`);
    };
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  // Вода: сетка только над водоёмами, глубина в вершинах, волны и рябь в шейдере
  buildWater() {
    const V = this.V;
    const nb = BIOME_LIST.length;
    const map = new Int32Array(V * V).fill(-1);
    const pos = [], depth = [], swamp = [], idx = [];
    const wset = new Set(); this.waterSpots = [];
    const vert = (i, j) => {
      const k = j * V + i;
      if (map[k] >= 0) return map[k];
      map[k] = pos.length / 3;
      pos.push(-WORLD_HALF + i * CELL, 0, -WORLD_HALF + j * CELL);
      depth.push(Math.max(0, -this.h[k]));
      swamp.push(this.biomeW[k * nb + BIOMES.swamp.id]);
      return map[k];
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * V + i;
      const mn = Math.min(this.h[k], this.h[k + 1], this.h[k + V], this.h[k + V + 1]);
      if (mn > 0.3) continue;
      if (this.isLava(-WORLD_HALF + (i + 0.5) * CELL, -WORLD_HALF + (j + 0.5) * CELL)) continue;
      const v00 = vert(i, j), v10 = vert(i + 1, j), v01 = vert(i, j + 1), v11 = vert(i + 1, j + 1);
      idx.push(v00, v01, v10, v10, v01, v11);
      // грубая сетка участков воды — чтобы считать отражение только рядом с водой
      const wx = -WORLD_HALF + i * CELL, wz = -WORLD_HALF + j * CELL;
      const wk = Math.floor(wx / 48) * 4096 + Math.floor(wz / 48);
      if (!wset.has(wk)) { wset.add(wk); this.waterSpots.push([Math.floor(wx / 48) * 48 + 24, Math.floor(wz / 48) * 48 + 24]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('aSwamp', new THREE.Float32BufferAttribute(swamp, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const nm = waterNormal();
    this.waterUniforms = {
      uTime: { value: 0 }, uNormal: { value: nm },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) }, uSunColor: { value: new THREE.Color('#fff2dc') },
      uZenith: { value: new THREE.Color('#3a78c8') }, uHorizon: { value: new THREE.Color('#b9cbe0') },
      uLight: { value: 1 },
      // зеркальное отражение окружения (рендерится в World.renderReflection)
      tReflect: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `
        attribute float aDepth; attribute float aSwamp;
        uniform float uTime;
        varying vec3 vW; varying float vDepth; varying float vSwamp; varying vec2 vWaveN;
        #include <fog_pars_vertex>
        void main(){
          vec3 p = position;
          float amp = smoothstep(0.0, 2.5, aDepth) * (1.0 - aSwamp * 0.8);
          // три пологие волны разного направления
          vec2 d1 = normalize(vec2(1.0, 0.35)), d2 = normalize(vec2(-0.4, 1.0)), d3 = normalize(vec2(0.7, -0.8));
          float w1 = dot(d1, p.xz) * 0.22 + uTime * 1.3;
          float w2 = dot(d2, p.xz) * 0.31 + uTime * 1.7;
          float w3 = dot(d3, p.xz) * 0.53 + uTime * 2.3;
          p.y += (sin(w1) * 0.09 + sin(w2) * 0.06 + sin(w3) * 0.03) * amp;
          vWaveN = (d1 * cos(w1) * 0.09 * 0.22 + d2 * cos(w2) * 0.06 * 0.31 + d3 * cos(w3) * 0.03 * 0.53) * amp;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vW = wp.xyz; vDepth = aDepth; vSwamp = aSwamp;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D uNormal;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uLight;
        uniform sampler2D tReflect; uniform mat4 uReflMat; uniform float uReflOn;
        varying vec3 vW; varying float vDepth; varying float vSwamp; varying vec2 vWaveN;
        #include <fog_pars_fragment>
        vec3 nmap(vec2 uv){ return texture2D(uNormal, uv).xyz * 2.0 - 1.0; }
        void main(){
          // рябь: две прокрутки карты нормалей + крупные волны
          vec3 n1 = nmap(vW.xz * 0.045 + vec2(uTime * 0.011, uTime * 0.007));
          vec3 n2 = nmap(vW.xz * 0.13 - vec2(uTime * 0.017, -uTime * 0.013));
          vec3 n3 = nmap(vW.xz * 0.37 + vec2(-uTime * 0.03, uTime * 0.025));
          vec2 ripple = (n1.xy * 0.5 + n2.xy * 0.35 + n3.xy * 0.2) * (1.0 - vSwamp * 0.6);
          vec3 N = normalize(vec3(-vWaveN.x - ripple.x * 0.28, 1.0, -vWaveN.y - ripple.y * 0.28));
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.6, 0.0, 1.0));
          if (uReflOn > 0.5) {
            // отражение гор, деревьев и неба; рябь искажает картинку
            vec4 rc = uReflMat * vec4(vW.x, 0.0, vW.z, 1.0);
            vec2 ruv = rc.xy / rc.w + (N.xz * 0.22 + ripple * 0.02) * (1.0 - vSwamp * 0.5);
            vec3 rr = texture2D(tReflect, clamp(ruv, vec2(0.002), vec2(0.998))).rgb;
            sky = mix(sky, rr / (1.0 + max(max(rr.r, rr.g), rr.b) * 0.15), smoothstep(0.0, 0.04, ruv.y) * uReflOn * 0.92);
          }
          float sd = max(dot(R, normalize(uSunDir)), 0.0);
          vec3 spec = min(uSunColor * (pow(sd, 600.0) * 1.4 + pow(sd, 80.0) * 0.25) * (1.0 - vSwamp * 0.75), vec3(1.6));
          vec3 shallow = mix(vec3(0.07, 0.25, 0.22), vec3(0.16, 0.19, 0.08), vSwamp);
          vec3 deep = mix(vec3(0.012, 0.05, 0.07), vec3(0.04, 0.055, 0.025), vSwamp);
          float dk = smoothstep(0.0, 5.0, vDepth);
          vec3 body = mix(shallow, deep, dk) * uLight;
          // свет, рассеянный в толще воды на гребнях
          body += vec3(0.03, 0.12, 0.10) * max(0.0, ripple.x + vWaveN.x * 4.0) * (1.0 - dk) * uLight;
          vec3 col = mix(body, sky, fres) + spec;
          // пена у берега
          float foamN = texture2D(uNormal, vW.xz * 0.2 + vec2(uTime * 0.02)).x;
          float shore = smoothstep(0.7, 0.0, vDepth) * smoothstep(0.35, 0.65, foamN + 0.25 * sin(uTime * 1.5 + vDepth * 9.0));
          col = mix(col, vec3(0.9, 0.95, 0.95) * uLight, shore * 0.75 * (1.0 - vSwamp));
          float alpha = mix(0.12, 0.95, smoothstep(0.0, 2.6, vDepth));
          alpha = max(alpha, fres * 0.9);
          alpha = max(alpha, shore * 0.8);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
    });
    Object.assign(mat.uniforms, this.waterUniforms);
    this.water = new THREE.Mesh(g, mat);
    this.water.renderOrder = 1;
    this.water.frustumCulled = false;
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
      const m = new THREE.Mesh(new THREE.CircleGeometry(L.r * 2.2, 64), this.lavaMat);   // берег неровный — лишнее закрывает рельеф
      m.rotation.x = -Math.PI / 2;
      m.position.set(L.x, 0.25, L.z);
      this.lava.add(m);
    }
  }

  isLava(x, z) {
    if (this.getHeight(x, z) > 0.25) return false;
    for (const L of LAVA_POOLS) if (Math.hypot(x - L.x, z - L.z) < L.r * 2.2) return true;
    return false;
  }

  update(dt, t) {
    if (this.terrTime) this.terrTime.value = t;
    this.lavaMat.uniforms.uTime.value = t;
    this.waterUniforms.uTime.value = t;
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
