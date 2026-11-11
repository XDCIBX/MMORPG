// Раскладка суставов героя (совпадает с Humanoid) и поза запекания (A-поза).
// Используется и генератором моделей (node), и игрой.
import * as THREE from 'three';

export const HERO_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];

// Поза, в которой лепится модель: руки отведены, ноги чуть расставлены,
// чтобы поверхности конечностей не сливались с телом.
export const BIND_POSE = {
  shoulderL: [0, 0, 0.62], shoulderR: [0, 0, -0.62],
  elbowL: [-0.12, 0, 0], elbowR: [-0.12, 0, 0],
  hipL: [0, 0, 0.07], hipR: [0, 0, -0.07],
};

export function heroLayout(spec) {
  const s = Object.assign({ female: false, legLen: 1, armLen: 1, torsoW: 1, torsoD: 1, limb: 1, head: 1, neckLen: 1 }, spec);
  const F = s.female;
  const L = s.legLen, A = s.armLen;
  const W = s.torsoW * (F ? 0.88 : 1), D = s.torsoD, T = s.limb * (F ? 0.86 : 1);
  const thigh = 0.44 * L, shin = 0.42 * L;
  const hipY = thigh + shin + 0.12;
  const neckLen = 0.072 * s.neckLen;
  const hr = 0.104 * s.head * (F ? 0.96 : 1);
  const uarm = 0.29 * A, farm = 0.26 * A;
  const J = {
    hips: [null, 0, hipY, 0],
    spine: ['hips', 0, 0.07, 0],
    chest: ['spine', 0, 0.18, 0],
    neck: ['chest', 0, 0.3, 0],
    head: ['neck', 0, neckLen, 0.01],
  };
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    J['shoulder' + sd] = ['chest', sx * 0.19 * W, 0.245, -0.005];
    J['elbow' + sd] = ['shoulder' + sd, 0, -uarm, 0];
    J['wrist' + sd] = ['elbow' + sd, 0, -farm, 0];
    J['hip' + sd] = ['hips', sx * (F ? 0.098 : 0.092) * W, -0.05, 0];
    J['knee' + sd] = ['hip' + sd, 0, -thigh, 0];
    J['ankle' + sd] = ['knee' + sd, 0, -shin, 0];
  }
  const topY = hipY + 0.07 + 0.18 + 0.3 + neckLen + hr * 2.15;
  return { J, dim: { thigh, shin, hipY, uarm, farm, W, D, T, F, hr, neckLen, topY }, headC: [0, hr * 1.02, 0.008] };
}

// Построить иерархию Object3D по раскладке (для запекания — в A-позе)
export function buildRig(layout, pose = null) {
  const root = new THREE.Object3D();
  const o = {};
  for (const n of HERO_BONES) {
    const [parent, x, y, z] = layout.J[n];
    const b = new THREE.Object3D();
    b.name = n;
    b.position.set(x, y, z);
    if (pose && pose[n]) b.rotation.set(...pose[n]);
    (parent ? o[parent] : root).add(b);
    o[n] = b;
  }
  root.updateMatrixWorld(true);
  return { root, bones: o };
}
