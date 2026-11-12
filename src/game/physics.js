// Простая физика твёрдых тел для предметов мира: бочки, ящики, тыквы, вёдра.
// Их можно толкать на бегу и верхом, разбрасывать ударами и умениями; они катятся
// по склонам, сталкиваются друг с другом и со стенами.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { styleMats } from '../world/city.js';

const G = 18;
const UP = new THREE.Vector3(0, 1, 0);
const KINDS = {
  barrel: { r: 0.46, rest: 0.5, lie: 0.42, roll: true, cyl: true, fr: 5.5, mass: 1.4 },
  bucket: { r: 0.2, rest: 0.17, lie: 0.19, roll: true, cyl: true, fr: 5, mass: 0.4 },
  crate: { r: 0.42, rest: 0.36, lie: 0.36, roll: false, fr: 7, mass: 1.0 },
  pumpkin: { r: 0.27, rest: 0.23, lie: 0.25, roll: true, ball: true, fr: 1.4, mass: 0.6 },
};

let assets = null;
function buildAssets() {
  if (assets) return assets;
  const M = styleMats('timber');
  const iron = new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.5, metalness: 0.8 });
  const uvScale = (g, u, v) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * u, a.getY(i) * v); return g; };
  // бочка: клёпки с «пузом» и обручи
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.34 + Math.sin(t * Math.PI) * 0.09, -0.5 + t)); }
  const body = uvScale(new THREE.LatheGeometry(prof, 16), 3, 1);
  const lid = (y) => new THREE.CircleGeometry(0.34, 16).rotateX(y > 0 ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0);
  const hoop = (y, r) => new THREE.TorusGeometry(r, 0.022, 5, 18).rotateX(Math.PI / 2).translate(0, y, 0);
  const barrel = mergeGeometries([mergeGeometries([body, lid(0.49), lid(-0.49)]), mergeGeometries([hoop(0.3, 0.405), hoop(-0.3, 0.405), hoop(0.0, 0.435)])], true);
  // ящик: доски и рамка
  const bars = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    bars.push(new THREE.BoxGeometry(0.76, 0.07, 0.07).translate(0, a * 0.345, b * 0.345));
    bars.push(new THREE.BoxGeometry(0.07, 0.76, 0.07).translate(a * 0.345, 0, b * 0.345));
    bars.push(new THREE.BoxGeometry(0.07, 0.07, 0.76).translate(a * 0.345, b * 0.345, 0));
  }
  const crate = mergeGeometries([new THREE.BoxGeometry(0.7, 0.7, 0.7), mergeGeometries(bars)], true);
  // тыква с дольками и хвостиком
  const pg = new THREE.SphereGeometry(0.27, 20, 12);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    const k = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 9) * (1 - Math.abs(y) / 0.27);
    pp.setXYZ(i, x * k, y * 0.82, z * k);
  }
  pg.computeVertexNormals();
  const pumpkin = mergeGeometries([pg, new THREE.CylinderGeometry(0.02, 0.035, 0.1, 6).translate(0, 0.24, 0)], true);
  // ведро
  const bucket = mergeGeometries([
    mergeGeometries([uvScale(new THREE.CylinderGeometry(0.2, 0.15, 0.34, 12, 1, true), 2, 0.5), new THREE.CircleGeometry(0.15, 12).rotateX(Math.PI / 2).translate(0, -0.17, 0)]),
    mergeGeometries([hoop(0.12, 0.2).scale(1, 1, 1), hoop(-0.1, 0.165)]),
  ], true);
  const woodD = M.wood.clone(); woodD.side = THREE.DoubleSide;
  assets = {
    barrel: [barrel, [M.wood, iron]],
    crate: [crate, [M.wood, M.darkWood]],
    pumpkin: [pumpkin, [new THREE.MeshStandardMaterial({ color: '#e07a1a', roughness: 0.55 }), new THREE.MeshStandardMaterial({ color: '#4a5a22', roughness: 0.9 })]],
    bucket: [bucket, [woodD, iron]],
  };
  return assets;
}

export class Physics {
  constructor(game) {
    this.game = game;
    this.bodies = [];
    this.lastP = new THREE.Vector3();
    this.pv = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._v = new THREE.Vector3();
  }

  add(kind, x, z) {
    const K = KINDS[kind];
    if (!K) return null;
    const [geo, mats] = buildAssets()[kind];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const y = this.game.world.standY(x, z);
    const b = {
      kind, K, mesh, pos: new THREE.Vector3(x, y + K.rest, z), vel: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 1, 0), roll: Math.random() * 6, yaw: Math.random() * 6, ang: new THREE.Vector3(),
      quat: new THREE.Quaternion(), tipped: false, asleep: true, sleepT: 0, air: false,
    };
    if (K.ball) b.quat.setFromEuler(new THREE.Euler(0, b.yaw, 0));
    this.game.scene.add(mesh);
    this.bodies.push(b);
    this.sync(b);
    return b;
  }

  // Ударная волна: раскидывает предметы от точки
  blast(x, z, r, power = 7) {
    for (const b of this.bodies) {
      const dx = b.pos.x - x, dz = b.pos.z - z, d = Math.hypot(dx, dz);
      if (d > r + 0.6) continue;
      const k = (1 - d / (r + 0.6)) * power / b.K.mass;
      const nx = d > 0.05 ? dx / d : Math.random() - 0.5, nz = d > 0.05 ? dz / d : Math.random() - 0.5;
      b.vel.x += nx * k; b.vel.z += nz * k; b.vel.y += k * 0.55 + 1;
      b.ang.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
      b.tipped = true; b.asleep = false; b.sleepT = 0;
    }
  }

  sync(b) {
    const K = b.K;
    if (K.ball || (!K.cyl && (b.air || b.tumble > 0))) b.mesh.quaternion.copy(b.quat);
    else if (K.cyl) {
      // ось бочки → вращение вокруг неё на угол качения
      this._q.setFromUnitVectors(UP, b.axis);
      this._q2.setFromAxisAngle(UP, b.roll);
      b.mesh.quaternion.copy(this._q).multiply(this._q2);
    } else b.mesh.quaternion.setFromAxisAngle(UP, b.yaw);
    b.mesh.position.copy(b.pos);
  }

  update(dt) {
    const g = this.game, P = g.player, W = g.world;
    if (!P) return;
    dt = Math.min(dt, 0.04);
    // скорость игрока
    this.pv.copy(P.pos).sub(this.lastP).multiplyScalar(1 / Math.max(dt, 1e-3));
    if (this.pv.lengthSq() > 900) this.pv.set(0, 0, 0); // телепорт
    this.lastP.copy(P.pos);
    const pr = P.mounted ? 0.95 : 0.5;
    const near = [];
    for (const b of this.bodies) {
      const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
      b.mesh.visible = d < 120;
      if (d < 70) near.push(b);
      // толчок игроком
      if (d < pr + b.K.r && Math.abs(P.pos.y + P.jumpOffset - (b.pos.y - b.K.rest)) < 1.3) {
        const nx = d > 0.01 ? (b.pos.x - P.pos.x) / d : 1, nz = d > 0.01 ? (b.pos.z - P.pos.z) / d : 0;
        b.pos.x = P.pos.x + nx * (pr + b.K.r); b.pos.z = P.pos.z + nz * (pr + b.K.r);
        const vn = this.pv.x * nx + this.pv.z * nz, bn = b.vel.x * nx + b.vel.z * nz;
        if (vn > bn) {
          const k = (vn - bn) * 1.15 / Math.max(0.7, b.K.mass * 0.8);
          b.vel.x += nx * k; b.vel.z += nz * k;
          if (vn > 3.2) { b.tipped = true; b.vel.y += Math.min(3, vn * 0.2); if (!b.K.cyl && !b.K.ball) b.ang.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2); }
        }
        b.asleep = false; b.sleepT = 0;
      }
    }
    // столкновения предметов между собой
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const a = near[i], b = near[j];
      if (a.asleep && b.asleep) continue;
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const rr = a.K.r + b.K.r, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, ov = (rr - d) / 2;
      a.pos.x -= nx * ov; a.pos.z -= nz * ov; b.pos.x += nx * ov; b.pos.z += nz * ov;
      if (ny > 0.5) b.pos.y += ov * 2; else if (ny < -0.5) a.pos.y += ov * 2;
      const rv = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny + (b.vel.z - a.vel.z) * nz;
      if (rv < 0) {
        const ma = a.K.mass, mb = b.K.mass, jn = -(1.3) * rv / (1 / ma + 1 / mb);
        a.vel.x -= nx * jn / ma; a.vel.y -= ny * jn / ma; a.vel.z -= nz * jn / ma;
        b.vel.x += nx * jn / mb; b.vel.y += ny * jn / mb; b.vel.z += nz * jn / mb;
        if (-rv > 2.5) { a.tipped = b.tipped = true; }
      }
      a.asleep = b.asleep = false; a.sleepT = b.sleepT = 0;
    }
    const p2 = { x: 0, z: 0 };
    for (const b of near) {
      if (b.asleep) continue;
      const K = b.K;
      b.vel.y -= G * dt;
      b.pos.addScaledVector(b.vel, dt);
      // стены, дома, деревья
      p2.x = b.pos.x; p2.z = b.pos.z;
      W.collision.resolve(p2, K.r * 0.9);
      const cx = p2.x - b.pos.x, cz = p2.z - b.pos.z, cl = Math.hypot(cx, cz);
      if (cl > 1e-4) {
        const nx = cx / cl, nz = cz / cl, vn = b.vel.x * nx + b.vel.z * nz;
        if (vn < 0) { b.vel.x -= 1.45 * vn * nx; b.vel.z -= 1.45 * vn * nz; }
        b.pos.x = p2.x; b.pos.z = p2.z;
      }
      // земля
      const gy = W.standY(b.pos.x, b.pos.z);
      const lying = K.cyl ? Math.abs(b.axis.y) : 1;
      const h = K.cyl ? K.lie + (K.rest - K.lie) * lying : K.rest;
      const floor = gy + h;
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if (gy < -0.6) { // в воде: плавает и медленно тонет
        b.vel.multiplyScalar(1 - Math.min(1, dt * 2.5));
        b.vel.y += G * dt * 0.92;
        if (b.pos.y < -0.25) { b.pos.y += (-0.25 - b.pos.y) * Math.min(1, dt * 3); }
        b.air = false;
      } else if (b.pos.y <= floor) {
        const impact = -b.vel.y;
        b.pos.y = floor;
        b.vel.y = impact > 2.2 ? impact * 0.32 : 0;
        if (b.air && impact > 3) { b.ang.multiplyScalar(0.5); }
        b.air = impact > 2.2;
        // уклон: катящиеся предметы скатываются
        const e = 0.35;
        const sx = (W.standY(b.pos.x + e, b.pos.z) - W.standY(b.pos.x - e, b.pos.z)) / (2 * e);
        const sz = (W.standY(b.pos.x, b.pos.z + e) - W.standY(b.pos.x, b.pos.z - e)) / (2 * e);
        const steep = Math.hypot(sx, sz);
        const rolling = K.ball || (K.cyl && b.tipped);
        if (rolling ? steep > 0.04 : steep > 0.45) { const k = G * (rolling ? 0.55 : 0.4) * dt; b.vel.x -= sx * k; b.vel.z -= sz * k; }
        // трение
        const fr = rolling ? (K.ball ? K.fr : 1.1) : K.fr;
        const dec = Math.max(0, 1 - fr * dt) - (sp < 0.5 ? dt * 0.8 : 0);
        b.vel.x *= Math.max(0, dec); b.vel.z *= Math.max(0, dec);
        if (K.cyl) {
          if (b.tipped) {
            // ось ложится горизонтально, поперёк движения; бочка катится
            if (sp > 0.25) {
              this._v.set(b.vel.z, 0, -b.vel.x).normalize();
              if (this._v.dot(b.axis) < 0) this._v.negate();
              b.axis.lerp(this._v, Math.min(1, dt * 7)).normalize();
              const sgn = (b.axis.x * b.vel.z - b.axis.z * b.vel.x) >= 0 ? 1 : -1;
              b.roll += sgn * sp * dt / K.lie;
            } else { b.axis.y *= Math.max(0, 1 - dt * 6); if (b.axis.lengthSq() < 1e-4) b.axis.set(1, 0, 0); b.axis.normalize(); }
          }
        } else if (K.ball) {
          if (sp > 0.02) { this._v.set(b.vel.z, 0, -b.vel.x).normalize(); this._q.setFromAxisAngle(this._v, sp * dt / K.r); b.quat.premultiply(this._q); }
        } else {
          // ящик: после полёта встаёт на грань
          if (b.tumble > 0) {
            b.tumble -= dt;
            const e2 = new THREE.Euler().setFromQuaternion(b.quat, 'YXZ');
            b.yaw = e2.y;
            this._q.setFromAxisAngle(UP, b.yaw);
            b.quat.slerp(this._q, Math.min(1, dt * 10));
          }
          b.yaw += b.ang.y * dt * 0.3; b.ang.multiplyScalar(Math.max(0, 1 - dt * 6));
        }
        if (sp < 0.1 && Math.abs(b.vel.y) < 0.1) { b.sleepT += dt; if (b.sleepT > 0.7) { b.asleep = true; b.vel.set(0, 0, 0); b.tumble = 0; } } else b.sleepT = 0;
      } else {
        b.air = true;
        // кувыркание в воздухе
        if (K.ball || !K.cyl) {
          const al = b.ang.length();
          if (al > 0.01) { this._q.setFromAxisAngle(this._v.copy(b.ang).multiplyScalar(1 / al), al * dt); b.quat.premultiply(this._q); }
          if (!K.ball) { if (!(b.tumble > 0)) b.quat.setFromAxisAngle(UP, b.yaw); b.tumble = 0.35; }
        } else if (b.tipped) {
          this._v.set(b.vel.z, 0, -b.vel.x);
          if (this._v.lengthSq() > 0.01) { this._v.normalize(); if (this._v.dot(b.axis) < 0) this._v.negate(); b.axis.lerp(this._v, Math.min(1, dt * 4)).normalize(); }
          b.roll += dt * 5;
        }
      }
      if (b.pos.x < -790 || b.pos.x > 790 || b.pos.z < -790 || b.pos.z > 790) { b.vel.set(0, 0, 0); b.asleep = true; }
      this.sync(b);
    }
  }
}
