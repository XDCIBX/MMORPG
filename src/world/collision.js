// Простая 2D-коллизия (вид сверху): круги и повернутые прямоугольники в пространственной сетке.
const CS = 16;

export class Collision {
  constructor() { this.grid = new Map(); }
  key(i, j) { return i * 100003 + j; }
  _add(obj, minx, minz, maxx, maxz) {
    const i0 = Math.floor(minx / CS), i1 = Math.floor(maxx / CS);
    const j0 = Math.floor(minz / CS), j1 = Math.floor(maxz / CS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(obj);
    }
  }
  addCircle(x, z, r) {
    const o = { t: 0, x, z, r };
    this._add(o, x - r, z - r, x + r, z + r);
    return o;
  }
  // hw/hd — половины ширины/глубины, rot — поворот вокруг Y
  addBox(x, z, hw, hd, rot = 0) {
    const o = { t: 1, x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot) };
    const R = Math.hypot(hw, hd);
    this._add(o, x - R, z - R, x + R, z + R);
    return o;
  }
  // Выталкивает позицию pos {x,z} из препятствий
  resolve(pos, radius) {
    const i0 = Math.floor((pos.x - radius) / CS), i1 = Math.floor((pos.x + radius) / CS);
    const j0 = Math.floor((pos.z - radius) / CS), j1 = Math.floor((pos.z + radius) / CS);
    let hit = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.grid.get(this.key(i, j));
      if (!arr) continue;
      for (const o of arr) {
        if (o.t === 0) {
          const dx = pos.x - o.x, dz = pos.z - o.z;
          const d = Math.hypot(dx, dz), m = o.r + radius;
          if (d < m && d > 1e-5) { pos.x = o.x + dx / d * m; pos.z = o.z + dz / d * m; hit = true; }
        } else {
          // в локальные координаты коробки
          const dx = pos.x - o.x, dz = pos.z - o.z;
          const lx = dx * o.c - dz * o.s;
          const lz = dx * o.s + dz * o.c;
          const cx = Math.max(-o.hw, Math.min(o.hw, lx));
          const cz = Math.max(-o.hd, Math.min(o.hd, lz));
          let ex = lx - cx, ez = lz - cz;
          let d = Math.hypot(ex, ez);
          let nlx, nlz;
          if (d < 1e-5) {
            // внутри — выталкиваем к ближайшей грани
            const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
            if (px < pz) { nlx = Math.sign(lx) * (o.hw + radius); nlz = lz; }
            else { nlx = lx; nlz = Math.sign(lz) * (o.hd + radius); }
          } else if (d < radius) {
            nlx = cx + ex / d * radius; nlz = cz + ez / d * radius;
          } else continue;
          // обратно в мир (обратный поворот)
          pos.x = o.x + nlx * o.c + nlz * o.s;
          pos.z = o.z - nlx * o.s + nlz * o.c;
          hit = true;
        }
      }
    }
    return hit;
  }
}
