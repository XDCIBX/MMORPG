// Базовый класс существ (общая анимация действий и смерти).
import * as THREE from 'three';
import { lerp, smoothstep } from '../core/util.js';

export class Creature {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.meshes = [];
    this.time = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.action = null; this.actionT = 0; this.actionDur = 0.5;
    this.deadT = -1;
    this.height = 1;
  }
  m(geo, mat, parent, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
  pivot(parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
  playAction(name, speed = 1) { this.action = name; this.actionT = 0; this.actionDur = (name === 'slam' || name === 'cast2' ? 0.8 : 0.5) / speed; }
  actionP() {
    if (!this.action) return -1;
    return this.actionT;
  }
  die() { this.deadT = 0; }
  revive() { this.deadT = -1; this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); }
  headTop() { return this.height * this.root.scale.y; }
  baseUpdate(dt) {
    this.time += dt;
    if (this.action) {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) this.action = null;
    }
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = smoothstep(0, 0.7, this.deadT);
      this.body.rotation.z = k * Math.PI / 2 * 0.95;
      this.body.position.y = -k * 0.1;
    }
  }
  // кривая атаки: 0..1..0 с пиком в середине
  strike() {
    if (!this.action) return 0;
    const p = this.actionT;
    return p < 0.4 ? -smoothstep(0, 0.4, p) * 0.4 : p < 0.6 ? lerp(-0.4, 1, smoothstep(0.4, 0.6, p)) : 1 - smoothstep(0.6, 1, p);
  }
}

