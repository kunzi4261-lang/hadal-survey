import { floorHeight, getZone } from '../core/world.mjs';

const EXTENT = 240;
const COLORS = { line: '#e0e6b4', course: '#ffc17b', buoy: '#b9f095', ship: '#f4ffed' };
const terrainCache = new Map();

function makeTerrain(zone) {
  if (terrainCache.has(zone)) return terrainCache.get(zone);
  const size = 440;
  const sheet = document.createElement('canvas');
  sheet.width = sheet.height = size;
  const ctx = sheet.getContext('2d');
  const heights = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      heights[py * size + px] = floorHeight(
        zone,
        ((px / (size - 1)) * 2 - 1) * EXTENT,
        (1 - (py / (size - 1)) * 2) * EXTENT,
      );
    }
  }
  let lo = Infinity,
    hi = -Infinity;
  for (const h of heights) {
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  const span = Math.max(hi - lo, 1);
  const pixels = ctx.createImageData(size, size);
  for (let i = 0; i < heights.length; i++) {
    const norm = (heights[i] - lo) / span;
    const band = Math.floor(norm * 21);
    const contour =
      (i % size && Math.floor(((heights[i - 1] - lo) / span) * 21) !== band) ||
      (i >= size && Math.floor(((heights[i - size] - lo) / span) * 21) !== band);
    const k = i * 4;
    const light = contour ? (band % 4 === 0 ? 28 : 13) : 0;
    pixels.data[k] = 7 + norm * 17 + light;
    pixels.data[k + 1] = 23 + norm * 34 + light;
    pixels.data[k + 2] = 29 + norm * 29 + light;
    pixels.data[k + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  terrainCache.set(zone, sheet);
  return sheet;
}

function square(ctx, x, y, r, color, filled) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = filled ? color : '#102b2b';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.stroke();
}

// The full chart shows a fixed 480 m square. Mini charts follow the vehicle at a closer scale.
export function drawChart(canvas, view, mini = false, trail = []) {
  const box = canvas.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(box.width),
    h = Math.round(box.height);
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const ctx = canvas.getContext('2d');
  const v = view.vehicle;
  const cx = mini ? v.x : 0,
    cz = mini ? v.z : 0;
  const radius = mini ? 85 : EXTENT;
  const scale = Math.min(w, h) / (radius * 2);
  const xx = (x) => w / 2 + (x - cx) * scale;
  const yy = (z) => h / 2 - (z - cz) * scale;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (mini) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, 2 * Math.PI);
    ctx.clip();
  }
  ctx.fillStyle = '#081621';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(makeTerrain(view.zone), xx(-EXTENT), yy(EXTENT), EXTENT * 2 * scale, EXTENT * 2 * scale);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(167,214,189,.17)';
  ctx.beginPath();
  for (let m = -200; m <= 200; m += 50) {
    ctx.moveTo(xx(m), 0);
    ctx.lineTo(xx(m), h);
    ctx.moveTo(0, yy(m));
    ctx.lineTo(w, yy(m));
  }
  ctx.stroke();
  if (!mini) {
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = '#a2cbc54a';
    ctx.beginPath();
    ctx.arc(xx(0), yy(0), 230 * scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (trail.length) {
    ctx.beginPath();
    ctx.moveTo(xx(trail[0].x), yy(trail[0].z));
    for (let i = 1; i < trail.length; i++) {
      const point = trail[i];
      if (point.recovery) ctx.moveTo(xx(point.x), yy(point.z));
      else ctx.lineTo(xx(point.x), yy(point.z));
    }
    ctx.lineTo(xx(v.x), yy(v.z));
    ctx.strokeStyle = '#80cec19e';
    ctx.stroke();
  }
  if (view.route) {
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = COLORS.course;
    ctx.beginPath();
    ctx.moveTo(xx(v.x), yy(v.z));
    ctx.lineTo(xx(view.route.x), yy(view.route.z));
    ctx.stroke();
    ctx.setLineDash([]);
    square(ctx, xx(view.route.x), yy(view.route.z), 5, COLORS.course, false);
  }
  if (view.ping >= 0 && view.ping < 2) {
    ctx.strokeStyle = 'rgba(167,255,209,' + 0.72 * (1 - view.ping / 2) + ')';
    ctx.lineWidth = 1.5;
    const radiusM = getZone(view.zone).sonarRadius;
    ctx.beginPath();
    ctx.arc(xx(v.x), yy(v.z), view.ping * radiusM * 0.5 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.font = '11px system-ui,sans-serif';
  ctx.textBaseline = 'middle';
  const dx = xx(0),
    dy = yy(0);
  ctx.strokeStyle = '#edf4ff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(dx - 3, dy - 3, 6, 6);
  if (!mini) {
    ctx.fillStyle = '#edf4ff';
    ctx.fillText('回收点', dx + 10, dy + 2);
  }
  for (const site of view.sites.filter((s) => s.revealed || s.sampled)) {
    const x = xx(site.x),
      y = yy(site.z);
    const color = site.sampled ? COLORS.buoy : COLORS.course;
    square(ctx, x, y, mini ? 3 : 5, color, site.sampled);
    if (!mini) {
      ctx.fillStyle = color;
      ctx.fillText(site.name, x + 9, y - 5);
    }
  }
  ctx.translate(xx(v.x), yy(v.z));
  ctx.rotate(v.heading);
  ctx.fillStyle = 'rgba(184,245,213,.13)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, mini ? 23 : 29, -2.1, -1.04);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.ship;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function chartPoint(canvas, event) {
  const box = canvas.getBoundingClientRect(),
    scale = Math.min(box.width, box.height) / (EXTENT * 2);
  const x = (event.clientX - box.left - box.width / 2) / scale,
    z = (box.height / 2 - event.clientY + box.top) / scale;
  if (Math.hypot(x, z) > 230) return null;
  return { x: Math.round(x), z: Math.round(z) };
}
