import { floorHeight } from './core/world.mjs';

const themes = {
  shelf: ['#12343b', '#3b756d', '#b7e4c7'],
  vent: ['#2c2323', '#875d46', '#fac68b'],
  trench: ['#132439', '#456088', '#a7caef'],
};
const contourCache = new Map();

// Intersect contour levels with the same floor field that the pilot flies over.
function contours(zone) {
  if (contourCache.has(zone.id)) return contourCache.get(zone.id);
  const count = 54,
    span = 460,
    step = span / count;
  const levels = [],
    grid = [],
    values = [];
  for (let j = 0; j <= count; j++) {
    grid[j] = [];
    for (let i = 0; i <= count; i++) {
      const v = floorHeight(zone.id, -230 + i * step, 230 - j * step);
      values.push(v);
      grid[j][i] = v;
    }
  }
  const lo = Math.min(...values),
    hi = Math.max(...values);
  for (let k = 1; k < 22; k++) {
    const level = lo + ((hi - lo) * k) / 22,
      path = new Path2D();
    for (let j = 0; j < count; j++)
      for (let i = 0; i < count; i++) {
        const h = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
        const pts = [
            [i, j],
            [i + 1, j],
            [i + 1, j + 1],
            [i, j + 1],
          ],
          cross = [];
        for (let e = 0; e < 4; e++) {
          const n = (e + 1) % 4;
          if (h[e] < level === h[n] < level) continue;
          const t = (level - h[e]) / (h[n] - h[e]);
          cross.push([
            (pts[e][0] + (pts[n][0] - pts[e][0]) * t) / count,
            (pts[e][1] + (pts[n][1] - pts[e][1]) * t) / count,
          ]);
        }
        for (let a = 0; a + 1 < cross.length; a += 2) {
          path.moveTo(...cross[a]);
          path.lineTo(...cross[a + 1]);
        }
      }
    levels.push(path);
  }
  contourCache.set(zone.id, levels);
  return levels;
}

export function drawChart(canvas, zone, trail = [], showSites = false) {
  const ctx = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height;
  const [bg, line, accent] = themes[zone.id];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.scale(w, h);
  contours(zone).forEach((path, i) => {
    ctx.strokeStyle = i % 4 === 0 ? accent : line;
    ctx.globalAlpha = i % 4 === 0 ? 0.52 : 0.8;
    ctx.lineWidth = (i % 4 === 0 ? 1.4 : 0.8) / w;
    ctx.stroke(path);
  });
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#c4e1dc23';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((i * w) / 8, 0);
    ctx.lineTo((i * w) / 8, h);
    ctx.stroke();
  }
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * h) / 5);
    ctx.lineTo(w, (i * h) / 5);
    ctx.stroke();
  }
  const px = (x) => ((x + 230) / 460) * w,
    pz = (z) => ((230 - z) / 460) * h;
  if (trail.length) {
    ctx.strokeStyle = '#ffca70';
    ctx.lineWidth = Math.max(2, w / 220);
    ctx.beginPath();
    trail.forEach((point, index) => {
      const x = px(point.x);
      const z = pz(point.z);
      if (index === 0 || point.recovery) ctx.moveTo(x, z);
      else ctx.lineTo(x, z);
    });
    ctx.stroke();
  }
  if (showSites)
    for (const [i, site] of zone.sites.entries()) {
      const x = px(site.x),
        y = pz(site.z);
      ctx.fillStyle = '#e9f1df';
      ctx.beginPath();
      ctx.arc(x, y, w / 125, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = Math.max(12, Math.floor(w / 55)) + 'px monospace';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + w / 90, y - 2);
    }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(w / 2 - 4, h / 2 - 4, 8, 8);
}

export function reportCanvas(zone, report) {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 820;
  const g = c.getContext('2d');
  g.fillStyle = '#0d222a';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#efbe6e';
  g.font = 'bold 22px monospace';
  g.fillText('HADAL SURVEY   /   DIVE RECORD', 52, 62);
  g.fillStyle = '#e7f1e9';
  g.font = 'bold 48px sans-serif';
  g.fillText(zone.name, 52, 137);
  g.fillStyle = '#b5c4c0';
  g.font = '21px monospace';
  g.fillText(zone.id.toUpperCase() + '   /   ' + zone.depth.toLocaleString() + ' m', 54, 177);
  const map = document.createElement('canvas');
  map.width = 710;
  map.height = 528;
  drawChart(map, zone, report.trail || [], true);
  g.drawImage(map, 54, 216);
  g.fillStyle = '#94beb6';
  g.font = '20px sans-serif';
  g.fillText('航次评级', 810, 264);
  g.fillText('航行距离', 810, 417);
  g.fillText('航行时间', 810, 532);
  g.fillStyle = '#f7c16a';
  g.font = 'bold 76px sans-serif';
  g.fillText(String(report.grade), 810, 349);
  g.fillStyle = '#edf0df';
  g.font = 'bold 36px monospace';
  g.fillText(Math.round(report.distance) + ' m', 810, 467);
  g.fillText(formatTime(report.elapsed), 810, 582);
  g.fillStyle = '#b4c7c1';
  g.font = '20px sans-serif';
  g.fillText('完成采样  ' + zone.sites.length + ' / ' + zone.sites.length, 810, 683);
  g.font = '16px monospace';
  g.fillText('ROV TRACK  /  NORTH UP', 54, 783);
  return c;
}
export function formatTime(s) {
  s = Math.max(0, Math.round(s || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
