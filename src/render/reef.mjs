import { floorHeight } from '../core/world.mjs';
import { Mesh, TAU, random, mix, tint } from './mesh.mjs';

export const waters = {
  shelf: {
    fog: [0.024, 0.235, 0.263],
    sky: [0.1, 0.48, 0.48],
    sand: [0.51, 0.58, 0.48],
    stone: [0.22, 0.37, 0.34],
    accent: [1, 0.48, 0.29],
    seed: 119,
  },
  vent: {
    fog: [0.046, 0.112, 0.142],
    sky: [0.13, 0.24, 0.26],
    sand: [0.32, 0.33, 0.31],
    stone: [0.19, 0.22, 0.23],
    accent: [1, 0.48, 0.12],
    seed: 528,
  },
  trench: {
    fog: [0.018, 0.064, 0.132],
    sky: [0.056, 0.17, 0.29],
    sand: [0.26, 0.3, 0.41],
    stone: [0.15, 0.18, 0.32],
    accent: [0.22, 0.84, 1],
    seed: 904,
  },
};
const steel = [0.35, 0.46, 0.46],
  yellow = [0.98, 0.71, 0.16],
  lamp = [0.42, 1, 0.94],
  white = [0.86, 0.83, 0.69];
const copper = [0.6, 0.32, 0.21],
  dark = [0.14, 0.19, 0.2],
  coral = [0.96, 0.38, 0.3];
const point = (o, x, y, z) => [o[0] + x, o[1] + y, o[2] + z];

function rock(m, p, scale, col, rng, tall = 1) {
  const base = rng() * TAU,
    n = 7,
    rings = [];
  for (let j = 0; j < 4; j++) {
    const radius = [1, 0.94, 0.62, 0.23][j];
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = base + (i * TAU) / n + 0.07 * Math.sin(j + i * 1.2),
        k = (0.8 + 0.35 * rng()) * radius;
      ring.push(
        point(
          p,
          scale * k * Math.cos(a) + j * 0.05 * scale,
          scale * tall * ([-0.18, 0.25, 0.68, 0.94][j] + 0.08 * rng()),
          scale * k * Math.sin(a) * 0.84,
        ),
      );
    }
    rings.push(ring);
  }
  for (let j = 0; j < rings.length; j++)
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      if (j === 3)
        m.tri(
          rings[j][i],
          point(p, 0.15 * scale, scale * tall, 0.05 * scale),
          rings[j][k],
          tint(col, 1.06),
        );
      else
        m.quad(
          rings[j][i],
          rings[j + 1][i],
          rings[j + 1][k],
          rings[j][k],
          tint(col, 0.79 + 0.11 * j + 0.14 * rng()),
        );
    }
}

function fan(m, o, h, angle, rng, color, detailed) {
  // A flattened, branching gorgonian. Secondary diagonals join the boughs into a fan.
  const turn = (x, y, z) =>
    point(
      o,
      (x * Math.cos(angle) - z * Math.sin(angle)) * h,
      y * h,
      (x * Math.sin(angle) + z * Math.cos(angle)) * h,
    );
  const limbs = [];
  const n = detailed ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    let last = turn(0, 0, 0);
    const path = [last];
    for (let s = 1; s <= 4; s++) {
      const a = s / 4;
      const x = u * Math.pow(a, 1.32) * 0.85 + Math.sin(4 * u + a * 5) * 0.025 * a;
      const y = a * (0.59 + 0.4 * Math.sqrt(1 - u * u));
      const next = turn(x, y, 0.1 * Math.sin(i + 2 * a) * a);
      const shade = mix(tint(color, 0.64), color, a);
      m.tube(last, next, (0.035 - 0.021 * a) * h, (0.03 - 0.02 * a) * h, shade, 0.04 + 0.12 * a, 4);
      if (s >= 2) {
        const twig = turn(x + 0.12 * a * (u < 0 ? -1 : 1), y + 0.11, 0.09 * Math.cos(i));
        m.tube(next, twig, 0.017 * h, 0.004 * h, mix(color, [1, 0.82, 0.5], 0.29), 0.18, 4);
      }
      path.push(next);
      last = next;
    }
    limbs.push(path);
  }
  if (detailed)
    for (let i = 1; i < n; i++)
      for (let j = 2; j < 5; j++) {
        m.tube(limbs[i - 1][j], limbs[i][j - 1], 0.0075 * h, 0.006 * h, color, 0.18, 3);
      }
}

function kelp(m, o, h, rng) {
  const a = rng() * TAU,
    phase = rng() * 7,
    col = mix([0.09, 0.34, 0.24], [0.52, 0.61, 0.24], rng());
  for (let blade = 0; blade < 3; blade++) {
    let prev = o,
      old = point(o, 0.05, 0, 0);
    const direction = a + blade * 1.85;
    for (let j = 1; j <= 7; j++) {
      const t = j / 7,
        w = 0.17 * h * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.cos(t * 23)) + 0.018;
      const drift = h * t * (0.12 + 0.21 * Math.sin(t * 3.4 + phase));
      const c = point(
        o,
        Math.cos(direction) * drift,
        t * h * (0.8 + 0.1 * blade),
        Math.sin(direction) * drift,
      );
      const edge = point(
        c,
        Math.cos(direction + 1.1 + t) * w,
        Math.sin(t * 10) * w * 0.3,
        Math.sin(direction + 1.1 + t) * w,
      );
      m.quad(prev, old, edge, c, tint(col, 0.71 + 0.28 * t));
      const back = point(c, (c[0] - edge[0]) * 0.47, 0.02, (c[2] - edge[2]) * 0.47);
      const prevBack = point(prev, (prev[0] - old[0]) * 0.47, 0.02, (prev[2] - old[2]) * 0.47);
      m.quad(prev, c, back, prevBack, tint(col, 0.9 + 0.31 * t));
      prev = c;
      old = edge;
    }
  }
}

function plateCoral(m, o, h, rng) {
  // Concentric ledges of a plate coral with a thin, growing ivory rim.
  const warm = mix([0.82, 0.2, 0.26], [0.96, 0.48, 0.22], rng()),
    n = 21;
  for (let j = 0; j < 4; j++) {
    const a = j * 2.4,
      s = h * (0.59 - 0.086 * j);
    const center = point(
      o,
      Math.cos(a) * h * (j ? 0.32 : 0),
      h * (0.23 + j * 0.18),
      Math.sin(a) * h * (j ? 0.26 : 0),
    );
    m.tube(point(o, 0, -h * 0.48, 0), center, s * 0.22, s * 0.15, tint(warm, 0.65), 0.05, 7);
    const ring = (i, k) => {
      const w = (i * TAU) / n,
        scallop = 1 + 0.09 * Math.sin(5 * w + j) + 0.04 * Math.cos(3 * w - j);
      return point(
        center,
        s * k * scallop * Math.cos(w),
        s * k * (0.18 + 0.11 * Math.sin(w * 3 + j)),
        s * k * 0.86 * scallop * Math.sin(w),
      );
    };
    for (let i = 0; i < n; i++) {
      const l = ring(i, 0.85),
        r = ring(i + 1, 0.85),
        u = ring(i, 1),
        v = ring(i + 1, 1);
      m.tri(center, r, l, tint(warm, 0.92 + 0.13 * Math.sin(i * 3 + j)), 0.16);
      m.quad(l, r, v, u, mix(warm, [1, 0.84, 0.64], 0.59), 0.25);
      m.tri(point(center, 0, -s * 0.33, 0), u, v, tint(warm, 0.49));
    }
  }
}

function seaPen(m, o, h, rng) {
  const a = rng() * TAU,
    dx = Math.cos(a),
    dz = Math.sin(a);
  const col = mix([0.22, 0.75, 0.8], [0.77, 0.48, 0.84], rng());
  m.tube(o, point(o, 0, h, 0), h * 0.033, h * 0.012, tint(col, 0.74), 0.52, 5);
  for (let j = 1; j < 11; j++)
    for (const side of [-1, 1]) {
      const t = j / 12,
        w = h * 0.21 * Math.sin(Math.PI * t) * side;
      const root = point(o, 0, h * t, 0),
        tip = point(root, dx * w, h * 0.12, dz * w);
      m.tri(root, tip, point(root, dx * w * 0.32, h * 0.12, dz * w * 0.3), col, 0.72);
      m.ellipsoid(tip, [h * 0.015, h * 0.03, h * 0.015], mix(col, white, 0.6), 1, 4, 2);
    }
}

function worms(m, o, h, rng, n) {
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU,
      d = rng() * h * 0.9,
      p = point(o, Math.cos(a) * d, -0.12, Math.sin(a) * d);
    const height = h * (0.34 + 0.67 * rng()),
      mid = point(p, 0, height * 0.52, 0),
      tip = point(p, 0.22 * height * Math.cos(a), height, 0.23 * height * Math.sin(a));
    m.tube(p, mid, h * 0.042, h * 0.037, white, 0.025, 5);
    m.tube(mid, tip, h * 0.037, h * 0.032, white, 0.04, 5);
    const plume = point(tip, 0, height * 0.07, 0);
    m.ellipsoid(
      plume,
      [0.085 * h, 0.13 * height, 0.08 * h],
      mix([0.7, 0.06, 0.13], [1, 0.34, 0.18], rng()),
      0.25,
      6,
      3,
    );
  }
}

function jelly(m, o, size, rng) {
  const crown = point(o, 0, size * 2.0, 0);
  const col = mix([0.33, 0.51, 0.98], [0.44, 0.97, 0.92], rng());
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n,
      b = ((i + 1) * TAU) / n;
    const rim = (t) => point(crown, Math.cos(t) * size, -0.12 * size, Math.sin(t) * size);
    const shoulder = (t) =>
      point(crown, 0.66 * Math.cos(t) * size, 0.48 * size, 0.66 * Math.sin(t) * size);
    m.tri(
      shoulder(a),
      point(crown, 0, 0.67 * size, 0),
      shoulder(b),
      tint(col, 0.88 + 0.1 * Math.sin(i)),
      2.78,
    );
    m.quad(rim(a), shoulder(a), shoulder(b), rim(b), tint(col, 0.7 + 0.09 * Math.cos(i)), 2.57);
    m.tube(rim(a), rim(b), 0.034 * size, 0.034 * size, mix(col, white, 0.27), 2.98, 4);
    if (i % 2 === 0) m.tube(shoulder(a), rim(a), 0.022 * size, 0.019 * size, col, 2.89, 4);
    if (i % 2 === 0) {
      let prev = rim(a);
      for (let j = 1; j <= 5; j++) {
        const s = j / 5;
        const pt = point(
          crown,
          size * (Math.cos(a) * (0.86 - 0.4 * s) + 0.12 * Math.sin(8 * s + a)),
          size * (-0.12 - 1.38 * s),
          size * (Math.sin(a) * (0.86 - 0.42 * s) + 0.1 * Math.cos(7 * s + a)),
        );
        m.tube(prev, pt, 0.029 * size, 0.021 * size, tint(col, 0.98), 2.78, 3);
        prev = pt;
      }
    }
  }
}

function chimney(m, o, h, rng) {
  const n = 9,
    base = h * 0.18;
  let last = [];
  for (let j = 0; j <= 6; j++) {
    const t = j / 6,
      cx = h * 0.085 * Math.sin(t * 3.4),
      rad = base * (1.08 - 0.52 * t + 0.2 * Math.cos(11 * t));
    const ring = Array.from({ length: n }, (_, i) =>
      point(
        o,
        cx + rad * Math.cos((TAU * i) / n) * (1 + 0.15 * Math.sin(i * 3)),
        t * h,
        rad * Math.sin((TAU * i) / n),
      ),
    );
    if (j)
      for (let i = 0; i < n; i++) {
        const mineral = 0.14 + 0.4 * rng() + (i === 2 || i === 6 ? 0.33 : 0);
        m.quad(
          last[i],
          ring[i],
          ring[(i + 1) % n],
          last[(i + 1) % n],
          mix([0.14, 0.16, 0.17], [0.79, 0.54, 0.23], mineral),
        );
        if ((j + i) % 3 === 0) {
          const a = last[i],
            b = last[(i + 1) % n],
            c = ring[i];
          m.tri(mix(a, b, 0.2), mix(a, b, 0.6), mix(a, c, 0.45), [0.83, 0.56, 0.26], 0.19);
        }
      }
    last = ring;
  }
  const center = point(o, h * 0.085 * Math.sin(3.4), h - 0.09 * h, 0);
  for (let i = 0; i < n; i++)
    m.tri(center, last[i], last[(i + 1) % n], tint([1, 0.47, 0.09], 0.6 + 0.32 * rng()), 0.79);
}

function artifact(m, p, kind, rng) {
  const at = (x, y, z) => point(p, x, y, z);
  switch (kind) {
    case 'coral':
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4,
          r = i * 0.68;
        fan(
          m,
          at(Math.cos(a) * r, 0, Math.sin(a) * r),
          i === 0 ? 8 : 2.4 + rng() * 3.8,
          0.24 + 0.9 * Math.sin(i),
          rng,
          mix([0.91, 0.28, 0.24], [1, 0.65, 0.29], rng()),
          true,
        );
      }
      // The retired station's three-channel irradiance logger.
      m.tube(at(-3.1, -0.4, -1.55), at(-3.1, 2.65, -1.55), 0.13, 0.12, steel);
      m.box(at(-3.1, 2.25, -1.55), [1.35, 0.81, 0.49], yellow);
      for (let j = 0; j < 3; j++)
        m.box(at(-3.49 + j * 0.39, 2.25, -1.82), [0.19, 0.32, 0.07], lamp, 0.05, 0.73);
      break;
    case 'chimney':
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4,
          rad = Math.sqrt(i) * 2.36;
        chimney(m, at(rad * Math.cos(a), 0, rad * Math.sin(a)), i === 0 ? 13 : 3.3 + rng() * 6, rng);
      }
      break;
    case 'tubeworm':
      for (let i = 0; i < 5; i++)
        worms(
          m,
          at(Math.cos(i * 2.4) * i * 0.85, 0, Math.sin(i * 2.4) * i * 0.85),
          2.5 + i * 0.24,
          rng,
          16,
        );
      m.tube(at(-2.8, -0.2, -1.8), at(-2.6, 2.6, -1.8), 0.12, 0.13, steel);
      m.box(at(-2.6, 2.05, -1.8), [0.77, 0.53, 0.47], yellow);
      m.tube(at(-2.8, 0.17, -1.8), at(-4, 0.23, -0.6), 0.085, 0.085, copper, 0, 5);
      break;
    case 'jelly':
      for (let i = 0; i < 7; i++) {
        const s = i === 0 ? 2.5 : 1.0 + rng() * 1.1;
        jelly(m, at(Math.sin(i * 2.3) * i * 1.6, 2 + rng() * 3, Math.cos(i * 2.3) * i), s, rng);
      }
      break;
    case 'wreck': {
      // The remaining ribs and keel of a vessel, open enough to see through.
      const curve = (z) => Math.sin(((z + 11) / 22) * Math.PI) * 3.0 + 0.6;
      m.box(at(0, 0.35, 0), [0.7, 0.7, 22], dark);
      for (let z = -10; z <= 10; z += 2)
        for (const side of [-1, 1]) {
          const w = curve(z) * side,
            top = at(w, 2.7 + Math.abs(z) * 0.075, z),
            foot = at(w * 0.63, 0.7, z);
          m.tube(at(0, 0.4, z), foot, 0.22, 0.16, copper, 0, 5);
          m.tube(foot, top, 0.17, 0.15, copper, 0, 5);
          if (z < 9 && (side === -1 || z < 1))
            m.quad(
              foot,
              top,
              at(curve(z + 2) * side, 3, z + 2),
              at(curve(z + 2) * side * 0.63, 0.72, z + 2),
              tint(copper, 0.73 + 0.3 * rng()),
            );
        }
      m.tube(at(0, 0, 2), at(1.2, 8, 2.2), 0.26, 0.14, steel);
      m.tube(at(-2, 6.7, 2), at(3, 6.7, 2), 0.1, 0.1, copper);
      for (let j = 0; j <= 3; j++)
        m.box(at(-0.2, 1 + j * 0.55, -2), [1.9, 0.1, 0.78], tint(steel, 0.81));
      for (const x of [-1.1, 0.7]) m.box(at(x, 1.7, -1.7), [0.1, 2, 0.1], copper);
      break;
    }
    case 'cable':
      for (let i = -15; i < 15; i++) {
        const pos = (k) => at(k * 0.86, 0.35 + 0.13 * Math.cos(k * 0.7), Math.sin(k * 0.27) * 2.7);
        m.tube(pos(i), pos(i + 1), 0.2, 0.2, i % 5 === 0 ? yellow : dark, 0, 6);
      }
      m.box(at(0, 0.9, 0), [3.2, 1.7, 2.2], steel);
      m.box(at(0, 1.75, 0), [2.2, 0.22, 1.8], yellow);
      break;
    case 'observatory':
      m.tube(at(0, 0, 0), at(0, 3.7, 0), 4.7, 4.7, steel, 0, 16);
      m.ellipsoid(at(0, 3.7, 0), [4.8, 3.5, 4.8], [0.22, 0.49, 0.53], 0.17, 16, 6);
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12,
          x = Math.cos(a),
          z = Math.sin(a);
        m.tube(at(x * 5.5, 0, z * 5.5), at(x * 4.1, 4, z * 4.1), 0.22, 0.16, yellow, 0, 6);
        m.ellipsoid(at(x * 4.68, 2.4, z * 4.68), [0.52, 0.42, 0.52], lamp, 0.85, 6, 3);
      }
      m.tube(at(0, 6, 0), at(0, 9, 0), 0.15, 0.12, steel);
      break;
    case 'lander':
    case 'beacon':
    default: {
      const lander = kind === 'lander',
        h = lander ? 3.7 : 5.1;
      m.box(at(0, h * 0.55, 0), [2.3, h * 0.42, 1.8], yellow);
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          m.tube(at(x * 2.3, 0, z * 1.9), at(x * 0.84, h, z * 0.65), 0.13, 0.085, steel);
          m.box(at(x * 2.3, 0.08, z * 1.9), [0.95, 0.18, 0.76], dark);
          m.tube(at(x * 1.1, h - 0.2, z * 0.67), at(-x * 1.1, h - 0.2, z * 0.67), 0.066, 0.066, steel);
        }
      m.tube(at(0, h * 0.7, 0), at(0, h + 1.2, 0), 0.17, 0.11, steel);
      m.ellipsoid(at(0, h + 1.38, 0), [0.3, 0.44, 0.3], lamp, 4, 8, 5);
      if (lander)
        for (const x of [-0.65, 0.1, 0.85])
          m.tube(at(x, h * 0.76, -0.2), at(x, h * 1.05, -0.2), 0.28, 0.28, white);
      break;
    }
  }
}

export function buildReef(zone, sites, coarse = false) {
  const p = waters[zone] || waters.shelf,
    rng = random(p.seed),
    m = new Mesh();
  const ground = (x, z) => [x, floorHeight(zone, x, z), z];
  const delta = coarse ? 14 : 6,
    radius = coarse ? 252 : 300;
  function vertex(x, z) {
    const ax = floorHeight(zone, x - 0.5, z) - floorHeight(zone, x + 0.5, z),
      az = floorHeight(zone, x, z - 0.5) - floorHeight(zone, x, z + 0.5);
    const norm = Math.hypot(ax, 1, az);
    const shade = 0.94 + 0.047 * Math.sin(x * 0.13 + z * 0.2) + 0.055 * Math.cos(x * 0.17 - z * 0.08);
    return [...ground(x, z), ax / norm, 1 / norm, az / norm, ...tint(p.sand, shade), 0];
  }
  for (let z = -radius; z < radius; z += delta)
    for (let x = -radius; x < radius; x += delta) {
      const a = vertex(x, z),
        b = vertex(x + delta, z),
        c = vertex(x + delta, z + delta),
        d = vertex(x, z + delta);
      m.data.push(...a, ...d, ...c, ...a, ...c, ...b);
    }
  // Flank the starting transect with near-field silhouettes; leave the navigable centre open.
  const anchors = [
    [-9, 13],
    [10, 17],
    [-13, 30],
    [17, 38],
    [-23, 55],
    [28, 61],
  ];
  const offsets = sites.flatMap((s) =>
    [
      [-7, 4],
      [6, 2],
      [1, 9],
    ].map(([x, z]) => [s.x + x, s.z + z]),
  );
  const patches = [...anchors, ...offsets];
  for (let i = 0; i < (coarse ? 56 : 165); i++) patches.push([(rng() - 0.5) * 460, (rng() - 0.5) * 460]);
  for (let i = 0; i < patches.length; i++) {
    const [x, z] = patches[i],
      pos = ground(x, z);
    const scale = 1.1 + rng() * 3.2;
    rock(m, pos, scale, tint(p.stone, 0.83 + 0.35 * rng()), rng, 0.4 + rng() * 0.59);
    if (!coarse && i < 75) rock(m, ground(x + scale * 1.05, z - 1.1), scale * 0.49, p.stone, rng, 0.57);
    if (zone === 'shelf') {
      if (i % 3 === 1 || i === 0)
        fan(
          m,
          ground(x - 1.65, z + 0.9),
          1.3 + rng() * 2.5,
          rng() * Math.PI,
          rng,
          mix(coral, [1, 0.67, 0.31], rng()),
          false,
        );
      kelp(m, ground(x + 2, z - 1.3), 1.7 + rng() * 2.8, rng);
      if (i < 15 || i % 3 === 0)
        plateCoral(m, point(pos, -0.8, scale * 0.56, 0.32), 1.7 + scale * 0.5, rng);
      if (!coarse)
        for (let k = 0; k < 3; k++)
          kelp(m, ground(x + rng() * 4 - 2, z + rng() * 3 + 1), 1.1 + rng() * 2.2, rng);
    } else if (zone === 'vent') {
      if (i % 3 === 0) chimney(m, ground(x + 1.4, z - 0.4), 2 + rng() * 4.2, rng);
      if (i % 2 === 0) worms(m, ground(x - 1.3, z - 1), 1.2 + rng() * 0.55, rng, coarse ? 3 : 7);
    } else {
      if (i < 16 || i % 2 === 0) seaPen(m, ground(x + 1.6, z - 1.1), 2.7 + rng() * 2.7, rng);
      if (i % 3 === 0)
        fan(
          m,
          ground(x + 1.9, z - 0.9),
          1.1 + rng() * 2.5,
          rng() * Math.PI,
          rng,
          mix([0.23, 0.63, 0.78], [0.71, 0.39, 0.83], rng()),
          false,
        );
      if (i % 4 === 0) jelly(m, point(pos, -1.8, 4 + rng() * 5, 0.6), 0.45 + rng() * 0.64, rng);
    }
  }
  if (zone === 'shelf') {
    for (const [x, z, s] of [
      [-4.5, 6.9, 2.5],
      [5.6, 8.5, 3],
      [7.3, 7, 1.9],
      [-9.1, 11.8, 2.9],
    ]) {
      const o = ground(x, z);
      rock(m, o, s * 0.8, p.stone, rng, 0.48);
      plateCoral(m, point(o, 0, s * 0.23, 0), s, rng);
      fan(m, point(o, 0.5, 0, 0.3), s * 1.04, 0.3, rng, [0.98, 0.35, 0.38], false);
    }
  }
  if (zone === 'vent') {
    for (const [x, z, h] of [
      [-5.8, 9, 2],
      [5.7, 11, 1.6],
      [6.8, 12, 1.9],
      [-9.8, 17, 1.7],
      [3.4, 20, 1.3],
    ]) {
      worms(m, ground(x, z), h, rng, coarse ? 6 : 14);
    }
  }
  if (zone === 'trench') {
    for (const [x, z, h] of [
      [-4.9, 8, 4.1],
      [6.5, 11, 3],
      [4.8, 8.3, 2.4],
      [-7.3, 12, 2.8],
      [-6.1, 11, 2],
    ]) {
      seaPen(m, ground(x, z), h, rng);
    }
  }
  const cliffs = [
    [-45, 58, 15],
    [-60, 78, 21],
    [60, 79, 17],
    [75, 111, 21],
    [-92, 145, 25],
    [-37, -65, 16],
    [72, -58, 18],
    [130, 20, 18],
  ];
  for (const [x, z, s] of cliffs) {
    rock(m, ground(x, z), s, p.stone, rng, zone === 'trench' ? 2.1 : 1.2);
    rock(m, ground(x + s * 0.9, z + 5), s * 0.7, tint(p.stone, 0.88), rng, 1.04);
  }
  for (const site of sites) artifact(m, ground(site.x, site.z), site.kind, rng);
  // Twin guide lamps and a low docking skid are visible on the return leg.
  for (let side of [-1, 1]) {
    const o = ground(side * 3.7, -3);
    m.tube(o, point(o, 0, 3.6, 0), 0.2, 0.16, steel, 0, 6);
    m.tube(point(o, 0, 2.8, 0), point(o, 0, 3, 0), 0.22, 0.22, yellow, 0, 6);
    m.ellipsoid(point(o, 0, 3.7, 0), [0.26, 0.25, 0.26], lamp, 0.95, 6, 4);
    m.box(point(o, 0, 0.13, 1), [1.3, 0.26, 5.2], steel);
  }
  return m.finish();
}
