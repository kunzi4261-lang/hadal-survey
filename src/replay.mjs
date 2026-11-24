import { drawChart, formatTime } from './chart.mjs';
import { floorHeight } from './core/world.mjs';

const limit = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lerp = (a, b, k) => a + (b - a) * k;
const hasTime = (p) => Number.isFinite(p.t) && p.t >= 0;

// Older saves have coordinates only. Fill each gap between real time anchors by distance.
function assignTimes(points, duration) {
  for (let begin = 0; begin < points.length - 1; ) {
    let end = begin + 1;
    while (!hasTime(points[end]) && end < points.length - 1) end++;
    const endTime = hasTime(points[end]) ? points[end].t : duration;
    const length = points[end].travel - points[begin].travel;
    for (let i = begin + 1; i < end; i++) {
      const k = length > 0 ? (points[i].travel - points[begin].travel) / length : (i - begin) / (end - begin);
      points[i].t = lerp(points[begin].t, endTime, k);
    }
    points[end].t = endTime;
    begin = end;
  }
}

function closestPass(points, site) {
  let best = distance(points[0], site),
    time = points[0].t;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = dx * dx + dz * dz;
    const k = b.recovery || !length ? 1 : limit(((site.x - a.x) * dx + (site.z - a.z) * dz) / length, 0, 1);
    const separation = Math.hypot(lerp(a.x, b.x, k) - site.x, lerp(a.z, b.z, k) - site.z);
    if (separation < best) {
      best = separation;
      time = lerp(a.t, b.t, k);
    }
  }
  return time;
}

export function prepareReplay(zone, report) {
  const input = Array.isArray(report?.trail) ? report.trail : [];
  const points = [];
  let previousTime = 0;
  for (const p of input) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const previous = points.at(-1);
    const timed = hasTime(p) && p.t >= previousTime;
    if (timed) previousTime = p.t;
    points.push({
      x: p.x,
      z: p.z,
      t: timed ? p.t : null,
      altitude: Number.isFinite(p.altitude) ? p.altitude : null,
      sample: p.sample,
      recovery: p.recovery === true,
      travel: previous ? previous.travel + (p.recovery ? 0 : distance(previous, p)) : 0,
    });
  }
  const recorded = points.length > 0 && points.every(hasTime);
  const hasRoute = points.length > 0;
  if (!points.length) points.push({ x: 0, z: 0, altitude: null, t: 0, travel: 0 });
  const duration = Math.max(previousTime, Number.isFinite(report?.elapsed) ? report.elapsed : 0);
  if (!hasTime(points[0])) points[0].t = 0;
  assignTimes(points, duration);
  if (points[0].t > 0) points.unshift({ ...points[0], t: 0, sample: undefined, recovery: false });
  if (points.at(-1).t < duration)
    points.push({ ...points.at(-1), t: duration, sample: undefined, recovery: false });
  const events = hasRoute
    ? zone.sites.map((site, index) => {
        const sample = points.find((p) => p.sample === site.id);
        return {
          site,
          number: index + 1,
          exact: Boolean(sample),
          time: sample?.t ?? closestPass(points, site),
        };
      })
    : [];
  return { zone, duration, recorded, hasRoute, points, events };
}

export function frameAt(track, value) {
  const { points, zone } = track;
  const time = limit(Number.isFinite(value) ? value : 0, 0, track.duration);
  let low = 0,
    high = points.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (points[mid].t <= time) low = mid + 1;
    else high = mid;
  }
  const index = Math.max(0, low - 1),
    a = points[index],
    b = points[index + 1] ?? a;
  const k = b.recovery || b.t === a.t ? 0 : (time - a.t) / (b.t - a.t);
  const x = lerp(a.x, b.x, k),
    z = lerp(a.z, b.z, k);
  const altitude =
    k === 0
      ? a.altitude
      : Number.isFinite(a.altitude) && Number.isFinite(b.altitude)
        ? lerp(a.altitude, b.altitude, k)
        : null;
  const bed = zone.depth - floorHeight(zone.id, x, z);
  return { time, index, x, z, altitude, bed, depth: Number.isFinite(altitude) ? bed - altitude : null };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function makeCanvas(width, height, label) {
  const canvas = element('canvas');
  canvas.width = width;
  canvas.height = height;
  if (label) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
  }
  return canvas;
}

function drawTrack(ctx, points, end, partial, color, width, px, py) {
  const draw = (p, move) => ctx[move ? 'moveTo' : 'lineTo'](px(p.x), py(p.z));
  ctx.beginPath();
  for (let i = 0; i <= end; i++) draw(points[i], !i || points[i].recovery);
  if (partial) draw(partial, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function prepareMap(track, canvas) {
  const size = canvas.width,
    base = makeCanvas(size, size);
  const extent = [...track.points, ...track.zone.sites, { x: 0, z: 0 }];
  const bounds = (key) => {
    const values = extent.map((p) => p[key]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [west, east] = bounds('x'),
    [south, north] = bounds('z');
  const span = limit(Math.max(east - west, north - south) * 1.38, 135, 460);
  const left = limit((west + east - span) / 2, -230, 230 - span);
  const top = limit((south + north + span) / 2, -230 + span, 230);
  const px = (x) => ((x - left) * size) / span,
    py = (z) => ((top - z) * size) / span;
  const terrain = makeCanvas(1000, 1000),
    g = base.getContext('2d');
  drawChart(terrain, track.zone);
  const scale = terrain.width / 460;
  g.drawImage(
    terrain,
    (left + 230) * scale,
    (230 - top) * scale,
    span * scale,
    span * scale,
    0,
    0,
    size,
    size,
  );
  drawTrack(g, track.points, track.points.length - 1, null, '#e7eed77a', 3, px, py);
  g.lineWidth = 2;
  g.strokeStyle = '#d8ebe3';
  g.fillStyle = '#d8ebe3';
  g.strokeRect(px(0) - 5, py(0) - 5, 10, 10);
  g.font = '18px sans-serif';
  g.fillText('泊位', px(0) + 11, py(0) + 17);
  for (const [i, site] of track.zone.sites.entries()) {
    const x = px(site.x),
      y = py(site.z);
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
    g.font = 'bold 19px Consolas, monospace';
    g.fillText(String(i + 1).padStart(2, '0'), x + 9, y - 6);
  }
  const metres = span < 220 ? 25 : 50,
    bar = (size * metres) / span;
  g.fillStyle = '#10262bdf';
  g.fillRect(11, size - 43, bar + 23, 35);
  g.strokeStyle = '#c3ddd5';
  g.beginPath();
  g.moveTo(22, size - 19);
  g.lineTo(22, size - 15);
  g.lineTo(22 + bar, size - 15);
  g.lineTo(22 + bar, size - 19);
  g.stroke();
  g.font = '15px Consolas, monospace';
  g.fillStyle = '#d8ebe3';
  g.fillText(metres + ' m', 22, size - 23);
  const ctx = canvas.getContext('2d');
  return (current) => {
    ctx.drawImage(base, 0, 0);
    drawTrack(ctx, track.points, current.index, current, '#ffca70', 4, px, py);
    const x = px(current.x),
      y = py(current.z);
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#0c2028';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffca70';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffca70';
    ctx.fill();
  };
}

function prepareProfile(track, canvas) {
  const w = canvas.width,
    h = canvas.height,
    pad = { left: 67, right: 12, top: 17, bottom: 17 };
  const base = makeCanvas(w, h),
    ctx = base.getContext('2d');
  const frames = Array.from({ length: 211 }, (_, i) => frameAt(track, (track.duration * i) / 210));
  const depths = frames.flatMap((f) => (f.depth == null ? [f.bed] : [f.bed, f.depth]));
  const top = Math.floor((Math.min(...depths) - 1) / 2) * 2;
  const bottom = Math.ceil((Math.max(...depths) + 1) / 2) * 2;
  const x = (t) => pad.left + (track.duration ? t / track.duration : 0) * (w - pad.left - pad.right);
  const y = (d) => pad.top + ((d - top) / (bottom - top)) * (h - pad.top - pad.bottom);
  ctx.fillStyle = '#0b1d23';
  ctx.fillRect(0, 0, w, h);
  ctx.font = '15px Consolas, monospace';
  ctx.fillStyle = '#a5b7b5';
  ctx.textBaseline = 'middle';
  for (const value of [top, (top + bottom) / 2, bottom]) {
    ctx.fillText(Math.round(value) + 'm', 4, y(value));
    ctx.strokeStyle = '#2b4248';
    ctx.beginPath();
    ctx.moveTo(pad.left, y(value));
    ctx.lineTo(w - pad.right, y(value));
    ctx.stroke();
  }
  for (const [key, color] of [
    ['bed', '#8ad5c8'],
    ['depth', '#ffca70'],
  ]) {
    ctx.beginPath();
    let previous = null;
    for (const frame of frames) {
      if (frame[key] == null) {
        previous = null;
        continue;
      }
      const crossesGap =
        previous && track.points.slice(previous.index + 1, frame.index + 1).some((p) => p.recovery);
      if (!previous || crossesGap) ctx.moveTo(x(frame.time), y(frame[key]));
      else ctx.lineTo(x(frame.time), y(frame[key]));
      previous = frame;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.3;
    ctx.stroke();
  }
  const target = canvas.getContext('2d');
  return (frame) => {
    target.drawImage(base, 0, 0);
    const px = x(frame.time),
      py = y(frame.depth ?? frame.bed);
    target.strokeStyle = '#d8e9dfaa';
    target.beginPath();
    target.moveTo(px, pad.top - 5);
    target.lineTo(px, h - pad.bottom + 5);
    target.stroke();
    target.fillStyle = frame.depth == null ? '#8ad5c8' : '#ffca70';
    target.beginPath();
    target.arc(px, py, 4.5, 0, Math.PI * 2);
    target.fill();
  };
}

/** Mount a self-contained report player. The caller owns its dialog and calls destroy on exit. */
export function mountReplay(container, zone, report) {
  const track = prepareReplay(zone, report);
  const root = element('section', 'hs-replay');
  root.setAttribute('aria-label', '航迹回放');
  container.append(root);
  if (!track.hasRoute) {
    root.append(element('p', 'rp-note', '这份简报没有保存航迹。'));
    return {
      destroy() {
        root.remove();
      },
    };
  }
  root.innerHTML = `
    <div class="rp-grid">
      <figure class="rp-map"><figcaption><span>航迹图</span><span aria-label="正北朝上">N ↑</span></figcaption></figure>
      <div class="rp-side">
        <figure class="rp-profile"><figcaption>沿途深度剖面 <span class="rp-legends"><i>海床</i><i class="rp-vehicle-key">潜器</i></span></figcaption></figure>
        <dl class="rp-telemetry"><div><dt>相对泊位坐标</dt><dd class="rp-coords"></dd></div><div><dt class="rp-depth-label">潜器深度</dt><dd class="rp-depth"></dd></div></dl>
        <div class="rp-fixes" aria-label="观测点回放"></div>
      </div>
    </div>
    <div class="rp-transport">
      <div class="rp-ruler"><label>航次时间 <input type="range" min="0" step="0.1" value="0" aria-label="航迹时间轴"></label><span class="rp-time"></span></div>
      <div class="rp-actions"><button type="button" class="rp-play"></button><label class="rp-rate">速度 <select aria-label="回放速度"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label><span class="rp-note"></span></div>
    </div>`;
  const get = (selector) => root.querySelector(selector);
  const canvas = makeCanvas(660, 660, zone.name + '航迹图，圆点标示当前潜器位置');
  const profile = makeCanvas(530, 128, '沿时间轴绘制的深度剖面，深度向下增加');
  get('.rp-map').append(canvas);
  get('.rp-profile').append(profile);
  if (!track.points.some((p) => Number.isFinite(p.altitude))) get('.rp-vehicle-key').hidden = true;
  const mapFrame = prepareMap(track, canvas),
    profileFrame = prepareProfile(track, profile);
  const play = get('.rp-play'),
    slider = get('input'),
    rate = get('select');
  const status = get('.rp-time'),
    coords = get('.rp-coords'),
    depth = get('.rp-depth'),
    depthLabel = get('.rp-depth-label');
  const listeners = new AbortController(),
    listen = (target, name, fn) => target.addEventListener(name, fn, { signal: listeners.signal });
  let time = 0,
    speed = 1,
    playing = false,
    last = null,
    raf = null;
  slider.max = String(track.duration);
  slider.disabled = play.disabled = !track.duration;
  get('.rp-note').textContent = track.recorded ? '航行记录含时间戳' : '缺失的时间按航程比例估算';
  const fixes = track.events.map((event) => {
    const button = element('button', 'rp-fix');
    button.type = 'button';
    button.append(
      element('span', 'rp-number', String(event.number).padStart(2, '0')),
      element('span', null, event.site.name),
      element('small', null, event.exact ? '采样完成' : '最近经过'),
      element('time', null, formatTime(event.time)),
    );
    button.setAttribute(
      'aria-label',
      '定位' + event.site.name + (event.exact ? '采样时刻 ' : '最近经过位置 ') + formatTime(event.time),
    );
    get('.rp-fixes').append(button);
    listen(button, 'click', () => {
      setPlaying(false);
      render(event.time);
    });
    return { button, event };
  });
  const formatCoord = (v, plus, minus) => (v < -0.5 ? minus : plus) + ' ' + Math.abs(Math.round(v));
  function render(at) {
    const frame = frameAt(track, at);
    time = frame.time;
    mapFrame(frame);
    profileFrame(frame);
    slider.value = String(time);
    slider.setAttribute('aria-valuetext', formatTime(time) + '，总时长 ' + formatTime(track.duration));
    status.textContent = formatTime(time) + ' / ' + formatTime(track.duration);
    coords.textContent = formatCoord(frame.x, 'E', 'W') + ' · ' + formatCoord(frame.z, 'N', 'S') + ' m';
    depthLabel.textContent = frame.depth == null ? '海床深度' : '潜器深度';
    depth.textContent = (frame.depth ?? frame.bed).toFixed(1) + ' m';
    for (const { button, event } of fixes) {
      if (Math.abs(event.time - time) < 0.5) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
  }
  function advance(now) {
    if (!playing) return;
    if (last != null) render(time + ((now - last) * speed) / 1000);
    last = now;
    if (time >= track.duration) setPlaying(false);
    else raf = requestAnimationFrame(advance);
  }
  function setPlaying(value) {
    playing = value && track.duration > 0;
    play.textContent = playing ? 'Ⅱ  暂停' : '▶  播放';
    play.setAttribute('aria-label', playing ? '暂停回放' : '播放回放');
    last = null;
    if (raf != null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (playing) {
      if (time >= track.duration) render(0);
      raf = requestAnimationFrame(advance);
    }
  }
  listen(play, 'click', () => setPlaying(!playing));
  listen(rate, 'change', () => {
    speed = Number(rate.value);
    last = null;
  });
  listen(slider, 'input', () => {
    setPlaying(false);
    render(Number(slider.value));
  });
  listen(slider, 'keydown', (event) => {
    const delta = event.shiftKey ? 10 : 1;
    const destinations = {
      ArrowLeft: time - delta,
      ArrowRight: time + delta,
      Home: 0,
      End: track.duration,
    };
    if (event.key === ' ') {
      event.preventDefault();
      setPlaying(!playing);
    } else if (Object.hasOwn(destinations, event.key)) {
      event.preventDefault();
      setPlaying(false);
      render(destinations[event.key]);
    }
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) setPlaying(false);
  });
  setPlaying(false);
  render(0);
  return {
    destroy() {
      setPlaying(false);
      listeners.abort();
      root.remove();
    },
  };
}
