import { buildReef, waters } from './reef.mjs';
import { populate } from './life.mjs';

const rgb = (c) => 'rgb(' + c.map((v) => Math.round(255 * Math.max(0, Math.min(1, v)))).join(',') + ')';

// A perspective painter for systems without WebGL. It uses the same terrain and
// site meshes at a lower level of detail, so navigation and observations agree.
export function makeSoftware(ctx) {
  let key = '',
    data,
    shoal;
  return function draw(f, c, width, height) {
    const k = f.zone + '|' + f.sites.map((s) => s.id + ':' + s.x + ':' + s.z + ':' + s.kind).join('/');
    if (k !== key) {
      data = buildReef(f.zone, f.sites, true);
      shoal = populate(f.zone, f.sites).shoal;
      key = k;
    }
    const palette = waters[f.zone],
      fog = palette.fog,
      halfW = width / 2,
      halfH = height / 2;
    const fx = halfW * c.scale[0],
      fy = halfH * c.scale[1];
    const endZ = f.zone === 'shelf' ? 136 : 104;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, rgb(palette.sky));
    sky.addColorStop(0.68, rgb(fog));
    sky.addColorStop(1, rgb(fog.map((x) => x * 0.72)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    const objects = [];
    const [ex, ey, ez] = c.eye,
      [rx, , rz] = c.right,
      [ux, uy, uz] = c.up,
      [zx, zy, zz] = c.forward;
    function camera(x, y, z) {
      const dx = x - ex,
        dy = y - ey,
        dz = z - ez;
      return [rx * dx + rz * dz, ux * dx + uy * dy + uz * dz, zx * dx + zy * dy + zz * dz];
    }
    // Near-plane clipping keeps the floor intact even when skimming the seabed.
    const near = 0.25;
    for (let i = 0; i < data.length; i += 30) {
      const dx = data[i] - ex,
        dy = data[i + 1] - ey,
        dz = data[i + 2] - ez;
      if (dx * dx + dz * dz > endZ * endZ) continue;
      const z0 = dx * zx + dy * zy + dz * zz;
      if (z0 < -16) continue;
      const a = camera(data[i], data[i + 1], data[i + 2]),
        b = camera(data[i + 10], data[i + 11], data[i + 12]),
        d = camera(data[i + 20], data[i + 21], data[i + 22]);
      if (a[2] < near && b[2] < near && d[2] < near) continue;
      let pts = [a, b, d];
      if (a[2] < near || b[2] < near || d[2] < near) {
        const clipped = [];
        for (let j = 0; j < 3; j++) {
          const v = pts[j],
            next = pts[(j + 1) % 3];
          if (v[2] >= near) clipped.push(v);
          if (v[2] >= near !== next[2] >= near) {
            const t = (near - v[2]) / (next[2] - v[2]);
            clipped.push([v[0] + t * (next[0] - v[0]), v[1] + t * (next[1] - v[1]), near]);
          }
        }
        pts = clipped;
      }
      const xy = pts.map((p) => [halfW + (fx * p[0]) / p[2], halfH - (fy * p[1]) / p[2]]);
      if (
        xy.every((p) => p[0] < 0) ||
        xy.every((p) => p[0] > width) ||
        xy.every((p) => p[1] < 0) ||
        xy.every((p) => p[1] > height)
      )
        continue;
      const area = Math.abs(
        (xy[1][0] - xy[0][0]) * (xy[2][1] - xy[0][1]) - (xy[2][0] - xy[0][0]) * (xy[1][1] - xy[0][1]),
      );
      if (area < 0.7) continue;
      const dist = Math.hypot(dx, dy, dz),
        z = (a[2] + b[2] + d[2]) / 3;
      const beam = f.lights
        ? Math.max(0, (z0 / Math.max(0.01, dist) - 0.64) / 0.36) * Math.exp(-dist * 0.045)
        : 0;
      const light =
        (f.zone === 'shelf' ? 0.57 : 0.44) +
        0.41 * Math.max(0, -0.46 * data[i + 3] + 0.8 * data[i + 4] - 0.33 * data[i + 5]) +
        beam * 0.85 +
        (data[i + 9] % 2) * 0.66;
      const tr = Math.exp(-dist * (f.zone === 'shelf' ? 0.026 : 0.034));
      const glow = f.ping >= 0 ? Math.max(0, 1 - Math.abs(dist - f.ping * 31) * 0.65) * 0.53 : 0;
      const col = fog.map(
        (v, j) => v + (data[i + 6 + j] * light - v) * tr + glow * [0.12, 0.82, 0.67][j],
      );
      objects.push({ xy, z, color: rgb(col) });
    }
    objects.sort((a, b) => b.z - a.z);
    for (const obj of objects) {
      const [a, ...rest] = obj.xy;
      ctx.fillStyle = obj.color;
      ctx.beginPath();
      ctx.moveTo(...a);
      for (const p of rest) ctx.lineTo(...p);
      ctx.closePath();
      ctx.fill();
    }
    for (const fish of shoal) {
      const t = f.time * fish.speed + fish.phase,
        h = fish.home;
      const p = camera(
        h[0] + Math.sin(t) * 6,
        h[1] + Math.sin(t * 1.7 + fish.phase) * 0.4,
        h[2] + Math.cos(t) * 4,
      );
      if (p[2] < 1 || p[2] > 42) continue;
      const x = halfW + (fx * p[0]) / p[2],
        y = halfH - (fy * p[1]) / p[2],
        s = (fy * fish.size) / p[2];
      ctx.globalAlpha = Math.exp(-p[2] * 0.034);
      ctx.fillStyle = rgb(fish.col);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.96, y);
      ctx.lineTo(x, y - s * 0.26);
      ctx.lineTo(x - s * 0.75, y);
      ctx.lineTo(x - s, y - s * 0.23);
      ctx.lineTo(x - s, y + s * 0.23);
      ctx.lineTo(x - s * 0.75, y);
      ctx.lineTo(x, y + s * 0.23);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
}
