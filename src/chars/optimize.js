// Оптимизация моделей: неподвижные детали с одинаковым материалом под одним
// родителем склеиваются в одну сетку (меньше вызовов отрисовки), суставы и
// анимации остаются нетронутыми.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function prep(mesh) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  mesh.updateMatrix();
  g.applyMatrix4(mesh.matrix);
  return g;
}

// skip — набор объектов, которые нельзя трогать (вместе с потомками)
export function mergeSiblings(root, skip = new Set()) {
  const nodes = [];
  const walk = (o) => { if (skip.has(o)) return; nodes.push(o); for (const c of o.children) walk(c); };
  walk(root);
  let removed = 0;
  for (const p of nodes) {
    const groups = new Map();
    for (const c of p.children) {
      if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || c.children.length || skip.has(c)) continue;
      if (c.name || c.userData.base || c.userData.keep || Array.isArray(c.material)) continue;
      if (c.geometry.morphAttributes && Object.keys(c.geometry.morphAttributes).length) continue;
      const k = [c.material.uuid, c.castShadow, c.receiveShadow, c.renderOrder, c.visible, !!c.userData.shell].join('|');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      let g;
      try { g = mergeGeometries(list.map(prep), false); } catch (e) { g = null; }
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
      m.renderOrder = list[0].renderOrder; m.visible = list[0].visible;
      if (list[0].userData.shell) m.userData.shell = true;
      for (const c of list) { p.remove(c); removed++; }
      p.add(m);
      removed--;
    }
  }
  return removed;
}

// Тени только у близких моделей: дальние не рисуются в карту теней
export function shadowLOD(root, on) {
  if (root.userData.shadowOn === on) return;
  root.userData.shadowOn = on;
  root.traverse(o => { if (o.isMesh) { if (o.userData.castShadow0 === undefined) o.userData.castShadow0 = o.castShadow; o.castShadow = on && o.userData.castShadow0; } });
}

// Перенести неподвижные детали к ближайшему подвижному предку (суставу) и склеить
// по материалу. animated — набор подвижных узлов, skip — не трогать (с потомками).
export function mergeToJoints(root, animated, skip = new Set()) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const inv = new Map();
  const visit = (o, anim, blocked) => {
    if (skip.has(o)) blocked = true;
    if (animated.has(o)) anim = o;
    if (o !== root && o.isMesh && !blocked && !o.isSkinnedMesh && !o.isInstancedMesh && !o.children.length && !o.name &&
      !o.userData.base && !o.userData.keep && !Array.isArray(o.material) && anim &&
      !(o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length)) {
      const k = [anim.uuid, o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, o.visible, !!o.userData.shell].join('|');
      if (!groups.has(k)) groups.set(k, { anim, list: [] });
      groups.get(k).list.push(o);
    }
    for (const c of o.children.slice()) visit(c, anim, blocked);
  };
  visit(root, animated.has(root) ? root : null, false);
  let removed = 0;
  for (const { anim, list } of groups.values()) {
    if (list.length < 2) continue;
    if (!inv.has(anim)) inv.set(anim, new THREE.Matrix4().copy(anim.matrixWorld).invert());
    const ai = inv.get(anim);
    const geos = [];
    for (const m of list) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(ai, m.matrixWorld));
      geos.push(g);
    }
    let g;
    try { g = mergeGeometries(geos, false); } catch (e) { g = null; }
    if (!g) continue;
    g.computeBoundingSphere();
    const mm = new THREE.Mesh(g, list[0].material);
    mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow;
    mm.renderOrder = list[0].renderOrder; mm.visible = list[0].visible;
    if (list[0].userData.shell) mm.userData.shell = true;
    for (const m of list) { m.removeFromParent(); removed++; }
    anim.add(mm);
    removed--;
  }
  return removed;
}
