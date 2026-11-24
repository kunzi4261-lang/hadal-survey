// Flat-shaded, unindexed triangles. Each vertex has position, normal, RGB and glow.
export const STRIDE = 10;
export const TAU = Math.PI * 2;
export function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const tint = (a, v) => a.map((x) => x * v);
export const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const d = Math.hypot(...a) || 1;
  return a.map((v) => v / d);
};

export class Mesh {
  constructor() {
    this.data = [];
  }
  tri(a, b, c, col, glow = 0) {
    const n = unit(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) this.data.push(...p, ...n, ...col, glow);
  }
  quad(a, b, c, d, color, glow = 0) {
    this.tri(a, b, c, color, glow);
    this.tri(a, c, d, color, glow);
  }
  tube(a, b, r, s, col, glow = 0, n = 7) {
    const axis = unit(sub(b, a)),
      u = unit(cross(axis, Math.abs(axis[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0])),
      v = cross(axis, u);
    const ring = (p, rad, i) =>
      p.map((c, k) => c + rad * (u[k] * Math.cos((i * TAU) / n) + v[k] * Math.sin((i * TAU) / n)));
    for (let i = 0; i < n; i++) {
      const lo = ring(a, r, i),
        next = ring(a, r, i + 1),
        hi = ring(b, s, i),
        top = ring(b, s, i + 1);
      this.quad(lo, next, top, hi, col, glow);
      if (s > 0.001) this.tri(b, hi, top, col, glow);
    }
  }
  ellipsoid(p, size, col, glow = 0, n = 9, rings = 5, noise = 0) {
    const sample = (i, j) => {
      const lon = ((i % n) * TAU) / n,
        lat = (j / rings - 0.5) * Math.PI;
      const k = 1 + noise * Math.sin(lon * 3 + lat * 2) * Math.cos(lon + lat * 6);
      return [
        p[0] + Math.cos(lon) * Math.cos(lat) * size[0] * k,
        p[1] + Math.sin(lat) * size[1],
        p[2] + Math.sin(lon) * Math.cos(lat) * size[2] * k,
      ];
    };
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < n; i++) {
        const a = sample(i, j),
          b = sample(i + 1, j),
          c = sample(i + 1, j + 1),
          d = sample(i, j + 1);
        this.quad(a, d, c, b, col, glow);
      }
  }
  box(p, size, color, angle = 0, glow = 0) {
    const corners = [];
    for (let z of [-1, 1])
      for (let y of [-1, 1])
        for (let x of [-1, 1]) {
          const dx = (x * size[0]) / 2,
            dz = (z * size[2]) / 2;
          corners.push([
            p[0] + dx * Math.cos(angle) + dz * Math.sin(angle),
            p[1] + (y * size[1]) / 2,
            p[2] - dx * Math.sin(angle) + dz * Math.cos(angle),
          ]);
        }
    for (const [a, b, c, d] of [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ])
      this.quad(corners[a], corners[b], corners[c], corners[d], color, glow);
  }
  finish() {
    return new Float32Array(this.data);
  }
}
