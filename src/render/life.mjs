import { floorHeight } from '../core/world.mjs';
import { random, TAU, mix, tint } from './mesh.mjs';
import { waters } from './reef.mjs';

export function populate(zone, sites) {
  const rng = random(waters[zone].seed + 324);
  const schools = [
    [-3, 20],
    [11, 39],
    [-19, 61],
    [27, 94],
    [-45, 81],
    [54, 121],
    [5, -25],
    [-98, -35],
    [76, -72],
  ];
  const fish = [],
    shoal = [];
  schools.forEach(([cx, cz], index) => {
    const n = zone === 'shelf' ? 23 : zone === 'vent' ? 8 : 7;
    const base = rng() * TAU,
      speed = 0.22 + rng() * 0.12;
    const tintA =
      zone === 'shelf' ? [0.28, 0.58, 0.62] : zone === 'vent' ? [0.39, 0.48, 0.43] : [0.26, 0.47, 0.72];
    const tintB = zone === 'shelf' ? [0.97, 0.77, 0.36] : [0.7, 0.78, 0.78];
    for (let j = 0; j < n; j++) {
      const x = cx + (rng() - 0.5) * 10,
        z = cz + (rng() - 0.5) * 5,
        y = floorHeight(zone, x, z) + 2.7 + rng() * 3.6;
      const home = [x, y, z],
        phase = base + rng() * 0.65,
        s = 0.32 + rng() * 0.4;
      const col = mix(tintA, tintB, index % 3 === 0 ? 0.35 + rng() * 0.58 : rng() * 0.35);
      shoal.push({ home, phase, speed, size: s, col });
      const nose = [s, 0, 0],
        top = [-0.1 * s, 0.29 * s, 0],
        bottom = [-0.15 * s, -0.22 * s, 0],
        tail = [-0.75 * s, 0, 0];
      const left = [0.14 * s, 0, -s * 0.2],
        right = [0.14 * s, 0, s * 0.2];
      function tri(a, b, c, shade) {
        for (const p of [a, b, c]) fish.push(...p, ...home, ...tint(col, shade), phase, speed);
      }
      for (const flank of [left, right]) {
        tri(nose, top, flank, 1.08);
        tri(nose, flank, bottom, 0.89);
        tri(flank, top, tail, 0.97);
        tri(flank, tail, bottom, 0.78);
      }
      tri(tail, [-1.2 * s, 0.28 * s, 0], [-1.21 * s, -0.25 * s, 0], 0.88);
      tri([0, 0.12 * s, 0], [-0.26 * s, 0.45 * s, 0], [-0.38 * s, 0.1 * s, 0], 0.72);
    }
  });
  if (zone === 'shelf') {
    const home = [-6, floorHeight(zone, -6, 20) + 11.2, 18],
      phase = -0.92,
      speed = -0.105;
    const dorsal = [0.18, 0.38, 0.43],
      pale = [0.52, 0.69, 0.67],
      dark = [0.12, 0.27, 0.34];
    const patch = (a, b, c, col) => {
      for (const v of [a, b, c]) fish.push(...v, ...home, ...col, phase, speed);
    };
    const nose = [1.1, 0, 0],
      ridge = [-0.2, 0.36, 0],
      rear = [-1.3, -0.04, 0];
    for (const side of [-1, 1]) {
      const shoulder = [0.49, 0.14, side * 1.3],
        wing = [-0.52, 0.12, side * 3.35],
        mid = [-0.62, 0.04, side * 1.42],
        tip = [-1.22, -0.03, side * 0.62];
      patch(nose, shoulder, ridge, pale);
      patch(ridge, shoulder, mid, dorsal);
      patch(shoulder, wing, mid, dorsal);
      patch(ridge, mid, rear, dark);
      patch(mid, tip, rear, dorsal);
      patch(nose, [1.48, -0.08, side * 0.43], shoulder, pale);
      patch([1.48, -0.08, side * 0.43], [1.42, 0.08, side * 0.67], shoulder, dorsal);
      patch([0.14, 0.07, side * 1.75], [-0.42, 0.13, side * 2.9], [-0.55, 0.12, side * 2.4], pale);
    }
    patch(rear, [-1.15, 0.03, 0.13], [-3.5, -0.23, 0.35], dark);
  }
  const motes = [];
  for (let i = 0; i < 720; i++)
    motes.push(rng() * 64, rng() * 30, rng() * 64, rng(), 0.012 + rng() * 0.025, 0);
  sites
    .filter((s) => s.kind === 'chimney' || s.kind === 'lander' || s.kind === 'wreck')
    .forEach((site) => {
      const smoke = site.kind === 'chimney',
        count = smoke ? 155 : 33;
      for (let i = 0; i < count; i++) {
        const a = rng() * TAU,
          r = rng() * (smoke ? 1.05 : 0.37);
        motes.push(
          site.x + Math.cos(a) * r,
          floorHeight(zone, site.x, site.z) + (smoke ? 12.65 : 1.8),
          site.z + Math.sin(a) * r,
          rng(),
          smoke ? 0.9 + rng() * 2.1 : 0.035 + rng() * 0.11,
          smoke ? 1 : 2,
        );
      }
    });
  for (const s of sites) {
    const h = floorHeight(zone, s.x, s.z);
    if (s.kind === 'beacon' || s.kind === 'lander')
      motes.push(s.x, h + (s.kind === 'beacon' ? 6.48 : 5.08), s.z, 0, 2.2, 3);
    if (s.kind === 'jelly') motes.push(s.x, h + 8.5, s.z, 1.5, 6.5, 4);
    if (s.kind === 'chimney') motes.push(s.x, h + 12.95, s.z, 0.3, 3.2, 5);
  }
  return { fish: new Float32Array(fish), motes: new Float32Array(motes), shoal };
}
