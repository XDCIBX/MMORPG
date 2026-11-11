// Кэш материалов для персонажей и снаряжения.
import * as THREE from 'three';
import { metalTex, leatherTex, cloth as clothTex } from '../core/textures.js';

const cache = new Map();
function key(...a) { return a.join('|'); }

export function skinMat(color) {
  const k = key('skin', color);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 }));
  return cache.get(k);
}
export function clothMat(color, pattern = 0) {
  const k = key('cloth', color, pattern);
  if (!cache.has(k)) {
    const t = clothTex('#ffffff', pattern);
    cache.set(k, new THREE.MeshStandardMaterial({ color, map: t, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
  }
  return cache.get(k);
}
export function leatherMat(color) {
  const k = key('leather', color);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, bumpMap: leatherTex(), bumpScale: 1.2 }));
  return cache.get(k);
}
export function metalMat(color, rough = 0.32, emissive = null, ei = 0) {
  const k = key('metal', color, rough, emissive, ei);
  if (!cache.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.88, roughnessMap: metalTex(), envMapIntensity: 1.3 });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    cache.set(k, m);
  }
  return cache.get(k);
}
export function gemMat(color, intensity = 2.5) {
  const k = key('gem', color, intensity);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.15, metalness: 0.2 }));
  return cache.get(k);
}
export function glowMat(color, opacity = 0.7) {
  const k = key('glow', color, opacity);
  if (!cache.has(k)) cache.set(k, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  return cache.get(k);
}
export function basicMat(color, rough = 0.8, metal = 0) {
  const k = key('basic', color, rough, metal);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return cache.get(k);
}
export function woodMat(color = '#5b3b22') {
  const k = key('wood', color);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, bumpMap: leatherTex(), bumpScale: 0.6 }));
  return cache.get(k);
}
export function boneMat(color = '#d8cfb4') {
  const k = key('bone', color);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }));
  return cache.get(k);
}
