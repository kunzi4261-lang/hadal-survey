// All three instruments use locally generated, repeatable synthetic data.
const SAMPLE_MS = 2;
const MAX_SHIFT = 32;
const PROFILE_TOP = 2016;
const PROFILE_STEP = 2;
const DATA_POSITIONS = [3, 5, 6, 7];
const PARITIES = [1, 2, 4];
const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function makeClock(seed) {
  const random = randomSource(seed);
  const delay = 6 + Math.floor(random() * 25);
  const packets = Array.from({ length: 5 }, (_, index) => ({
    center: 13 + index * 26 + random() * 10,
    width: 2.5 + random() * 3.6,
    frequency: 0.4 + random() * 0.38,
    strength: (0.6 + random() * 0.36) * (random() < 0.5 ? -1 : 1),
  }));
  const size = 184;
  const clean = Array.from({ length: size }, (_, i) =>
    packets.reduce((sum, p) => {
      const delta = i - p.center;
      return sum + p.strength * Math.exp(-0.5 * (delta / p.width) ** 2) * Math.cos(delta * p.frequency);
    }, 0),
  );
  const gain = 0.72 + random() * 0.18;
  const noise = () => (random() - 0.5) * 0.07;
  return {
    delay,
    reference: clean.map((v) => v + noise()),
    received: clean.map((_, i) => (clean[i - delay] ?? 0) * gain + noise() + 0.035),
  };
}

/** Compare identical-length windows, removing each channel's DC offset. */
export function correlationAt(clock, shift) {
  if (!Number.isInteger(shift) || shift < 0 || shift > MAX_SHIFT)
    throw new RangeError('Shift outside the instrument range');
  const n = clock.reference.length - MAX_SHIFT;
  let x = 0,
    y = 0,
    xx = 0,
    yy = 0,
    xy = 0;
  for (let i = 0; i < n; i++) {
    const a = clock.reference[i],
      b = clock.received[i + shift];
    x += a;
    y += b;
    xx += a * a;
    yy += b * b;
    xy += a * b;
  }
  const norm = Math.sqrt(Math.max(0, (n * xx - x * x) * (n * yy - y * y)));
  return norm ? clamp((n * xy - x * y) / norm, -1, 1) : 0;
}

export function makeProfile(seed) {
  const random = randomSource(seed);
  const center = 17 + random() * 28,
    width = 1.5 + random() * 2.5;
  const background = 2.4 + random(),
    contrast = 2.4 + random() * 3;
  const temperatures = Array.from(
    { length: 63 },
    (_, i) =>
      background +
      contrast / (1 + Math.exp(-(i - center) / width)) +
      i * 0.004 +
      (random() - 0.5) * 0.05,
  );
  // A centred 8 m window suppresses high-frequency noise in the depth derivative.
  const gradient = temperatures.map((_, i) => {
    const a = Math.max(0, i - 2),
      b = Math.min(temperatures.length - 1, i + 2);
    return Math.abs(temperatures[b] - temperatures[a]) / ((b - a) * PROFILE_STEP);
  });
  let peak = 2;
  for (let i = 3; i < gradient.length - 2; i++) if (gradient[i] > gradient[peak]) peak = i;
  return { temperatures, gradient, peak };
}

const bitAt = (word, position) => (word >>> (position - 1)) & 1;
export function syndrome(word) {
  let s = 0;
  for (let i = 1; i <= 7; i++) if (bitAt(word, i)) s ^= i;
  return s;
}
export function encodeNibble(value) {
  let word = 0;
  DATA_POSITIONS.forEach((position, i) => {
    word |= ((value >>> (3 - i)) & 1) << (position - 1);
  });
  const s = syndrome(word);
  for (const check of PARITIES) if (s & check) word |= 1 << (check - 1);
  return word;
}
export function decodeNibble(word) {
  return DATA_POSITIONS.reduce((value, pos) => (value << 1) | bitAt(word, pos), 0);
}
export function makeFrames(seed) {
  const random = randomSource(seed);
  return Array.from({ length: 3 }, () => {
    const payload = Math.floor(random() * 16),
      error = 1 + Math.floor(random() * 7);
    return encodeNibble(payload) ^ (1 << (error - 1));
  });
}

const stations = {
  shelf: {
    tab: '陆架 · 对时',
    title: '水听器时标对齐',
    code: 'HS-01 / HYDROPHONE',
    description:
      '同一次发射抵达了两个通道。向左平移接收波形 B，使五组波包与参考波形 A 重合，再报告 B 的到达延迟。',
  },
  vent: {
    tab: '裂谷 · 测温',
    title: '热液羽流剖面',
    code: 'HS-02 / THERMISTOR',
    description: '探头向海底下降时穿过一层暖水。在图上拖动取样线，找出每下降一米温度变化最大的位置。',
  },
  trench: {
    tab: '海沟 · 纠错',
    title: '中继帧校验与修复',
    code: 'HS-03 / TELEMETRY',
    description:
      '三帧海底电报各有一位传错。根据奇偶校验灯，在每帧选择一位翻转，再解码三位十六进制档案号。',
  },
};

function nextSeed() {
  const bytes = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(bytes)[0];
  return Math.floor(Math.random() * 4294967296);
}
function newSample(id) {
  const seed = nextSeed();
  if (id === 'shelf') return { seed, data: makeClock(seed), value: 0 };
  if (id === 'vent') return { seed, data: makeProfile(seed), value: 2 };
  return { seed, data: makeFrames(seed), flips: [0, 0, 0] };
}
const depthAt = (i) => PROFILE_TOP + i * PROFILE_STEP;
const hex = (n) => n.toString(16).toUpperCase();
const pathOf = (values, point) =>
  values
    .map((v, i) => {
      const [x, y] = point(v, i);
      return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
    })
    .join(' ');
const svgLine = (x1, y1, x2, y2, cls = 'lab-gridline') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
const svgText = (x, y, label, anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="lab-tick">${label}</text>`;
const linePath = (d, cls) =>
  `<path d="${d}" class="${cls}" fill="none" vector-effect="non-scaling-stroke"/>`;
const plotW = 600,
  plotH = 184;

function clockPlot(sample, width) {
  const { reference, received } = sample.data,
    n = reference.length - MAX_SHIFT;
  const x = (i) => 41 + i * ((width - 60) / (n - 1)),
    y = (v) => 84 - v * 60;
  let grid = '';
  for (const t of [0, 50, 100, 150, 200, 250, 300])
    grid += svgLine(x(t / SAMPLE_MS), 12, x(t / SAMPLE_MS), 155) + svgText(x(t / SAMPLE_MS), 175, t);
  for (const v of [-1, 0, 1]) grid += svgLine(41, y(v), width - 19, y(v)) + svgText(31, y(v) + 4, v, 'end');
  const point = (v, i) => [x(i), y(v)];
  return (
    grid +
    linePath(pathOf(reference.slice(0, n), point), 'lab-track-a') +
    linePath(pathOf(received.slice(sample.value, sample.value + n), point), 'lab-track-b')
  );
}

function profilePlot(sample, width) {
  const { temperatures } = sample.data,
    i = sample.value;
  const tMin = Math.floor(Math.min(...temperatures)),
    tMax = Math.ceil(Math.max(...temperatures));
  const x = (t) => 57 + ((t - tMin) / (tMax - tMin)) * (width - 90),
    y = (j) => 15 + (j / (temperatures.length - 1)) * 140;
  let grid = '';
  for (let j = 0; j <= 4; j++) {
    const depth = Math.round((j * (temperatures.length - 1)) / 4);
    grid += svgLine(57, y(depth), width - 33, y(depth)) + svgText(49, y(depth) + 4, depthAt(depth), 'end');
    const t = tMin + ((tMax - tMin) * j) / 4;
    grid += svgLine(x(t), 15, x(t), 155) + svgText(x(t), 176, Number(t.toFixed(2)));
  }
  return (
    grid +
    linePath(
      pathOf(temperatures, (t, j) => [x(t), y(j)]),
      'lab-thermal',
    ) +
    svgLine(57, y(i), width - 33, y(i), 'lab-cursor') +
    `<circle cx="${x(temperatures[i])}" cy="${y(i)}" r="5" class="lab-probe"/>`
  );
}

function correctedWord(sample, i) {
  return sample.data[i] ^ (sample.flips[i] ? 1 << (sample.flips[i] - 1) : 0);
}
function parityLights(s) {
  return PARITIES.map(
    (p) => `<span class="${s & p ? 'lab-bad' : 'lab-good'}">P${p} ${s & p ? '奇' : '偶'}</span>`,
  ).join('');
}
function frameRows(sample) {
  return sample.data
    .map((word, frame) => {
      const buttons = Array.from({ length: 7 }, (_, index) => {
        const pos = index + 1,
          value = bitAt(correctedWord(sample, frame), pos),
          active = sample.flips[frame] === pos;
        return `<button type="button" class="lab-bit" data-frame="${frame}" data-bit="${pos}" aria-pressed="${active}" aria-label="帧 ${frame + 1}，第 ${pos} 位，当前值 ${value}"><small>${pos}</small><b>${value}</b></button>`;
      }).join('');
      return `<div class="lab-frame"><div class="lab-frame-head"><strong>帧 0${frame + 1}</strong><div class="lab-parity" aria-label="当前各组校验结果">${parityLights(syndrome(correctedWord(sample, frame)))}</div></div><div class="lab-bits">${buttons}</div></div>`;
    })
    .join('');
}

function analogPanel(id, sample) {
  const shelf = id === 'shelf',
    min = shelf ? 0 : 2,
    max = shelf ? MAX_SHIFT : sample.data.temperatures.length - 3;
  const legend = shelf
    ? '<span class="lab-key-a">A 参考</span><span class="lab-key-b">B 接收</span>'
    : '<span class="lab-key-temp">温度曲线</span><span class="lab-key-b">取样深度</span>';
  const label = shelf ? 'B 通道提前量' : '探头深度';
  return `<div class="lab-screen"><div class="lab-screen-line"><span>${shelf ? '归一化振幅 / 时间 (ms)' : '深度 (m) / 温度 (°C)'}</span><div class="lab-legend">${legend}</div></div><svg class="lab-graph" viewBox="0 0 ${plotW} ${plotH}" role="img" aria-label="${shelf ? '两路脉冲的幅度随时间变化' : '温度随深度变化，点按或拖动可移动取样线'}"></svg></div><div class="lab-readings"></div><div class="lab-control"><label>${label}<input type="range" min="${min}" max="${max}" step="1" value="${sample.value}"></label><div class="lab-nudge"><button type="button" data-action="minus" aria-label="${label}减小一步">−</button><button type="button" data-action="plus" aria-label="${label}增加一步">＋</button></div></div>`;
}
function framePanel(sample) {
  return `<div class="lab-frame-grid">${frameRows(sample)}</div><details class="lab-guide"><summary>如何读三盏校验灯？</summary><p>每组应有偶数个 1。「奇」表示该组出错。把所有亮出「奇」的组号相加，就是传错的位置。例如 P1、P4 为奇，应翻转第 5 位。</p><p>P1 包含位 1、3、5、7。P2 包含位 2、3、6、7。P4 包含位 4、5、6、7。数据按位 3、5、6、7 的顺序读取。</p></details>`;
}
const reading = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
function judgment(id, sample) {
  if (id === 'shelf') {
    const error = Math.abs(sample.value - sample.data.delay) * SAMPLE_MS;
    return {
      ok: error <= SAMPLE_MS,
      text: `B 比 A 晚到 ${sample.data.delay * SAMPLE_MS} ms。你的校时残差为 ${error} ms，允许误差 ${SAMPLE_MS} ms。`,
    };
  }
  if (id === 'vent') {
    const peak = sample.data.peak,
      error = Math.abs(peak - sample.value) * PROFILE_STEP;
    return {
      ok: error <= PROFILE_STEP,
      text: `实测最大梯度为 ${sample.data.gradient[peak].toFixed(3)} °C/m，位于 ${depthAt(peak)} m。你的定位相差 ${error} m，允许误差 ${PROFILE_STEP} m。`,
    };
  }
  const words = sample.data.map((_, i) => correctedWord(sample, i));
  const valid = words.filter((w) => !syndrome(w)).length;
  const archive = words.map((w) => hex(decodeNibble(w))).join('');
  return {
    ok: valid === 3,
    text:
      valid === 3
        ? `3 / 3 帧均通过偶校验。按数据位顺序拼接，恢复的档案号为 0x${archive}。`
        : `${valid} / 3 帧通过偶校验。检查仍有「奇」灯的帧，各帧只能保留一次翻转。`,
  };
}

/** Mount a disposable, local-only instrument workbench inside a host panel. */
export function mountLab(container, zoneId = 'shelf') {
  const doc = container.ownerDocument,
    root = doc.createElement('section');
  const samples = new Map();
  let id = Object.hasOwn(stations, zoneId) ? zoneId : 'shelf';
  let pointerId = null;
  root.className = 'hs-lab';
  root.innerHTML = `<div class="lab-intro">合成仪器数据 · 可重复测量 · 独立于航次评级</div><nav class="lab-nav" aria-label="选择仪器">${Object.entries(
    stations,
  )
    .map(([key, value]) => `<button type="button" data-station="${key}">${value.tab}</button>`)
    .join('')}</nav><div class="lab-panel"></div>`;
  container.append(root);
  const panel = root.querySelector('.lab-panel');
  const sample = () => samples.get(id);
  function feedback(result) {
    const out = panel.querySelector('.lab-result');
    out.dataset.grade = result ? (result.ok ? 'pass' : 'retry') : '';
    out.textContent = result ? `${result.ok ? '测量通过' : '待复核'} · ${result.text}` : '';
  }
  function refresh() {
    const s = sample();
    if (id === 'trench') {
      const cards = panel.querySelectorAll('.lab-frame');
      cards.forEach((card, frame) => {
        const word = correctedWord(s, frame);
        card.querySelector('.lab-parity').innerHTML = parityLights(syndrome(word));
        card.querySelectorAll('[data-bit]').forEach((button) => {
          const pos = Number(button.dataset.bit),
            v = bitAt(word, pos);
          button.setAttribute('aria-pressed', String(s.flips[frame] === pos));
          button.setAttribute('aria-label', `帧 ${frame + 1}，第 ${pos} 位，当前值 ${v}`);
          button.querySelector('b').textContent = v;
        });
      });
    } else {
      const shelf = id === 'shelf',
        i = s.value,
        input = panel.querySelector('input');
      const amount = shelf ? `${i * SAMPLE_MS} ms` : `${depthAt(i)} m`;
      drawGraph();
      panel.querySelector('.lab-readings').innerHTML = shelf
        ? reading('提前量', amount) + reading('相关系数 ρ', correlationAt(s.data, i).toFixed(3))
        : reading('取样深度', amount) +
          reading('温度', `${s.data.temperatures[i].toFixed(2)} °C`) +
          reading('局部梯度', `${s.data.gradient[i].toFixed(3)} °C/m`);
      input.value = i;
      input.setAttribute('aria-valuetext', amount);
    }
    feedback(s.result);
  }
  function drawGraph(resizeOnly = false) {
    const svg = panel.querySelector('.lab-graph');
    if (!svg) return;
    const width = svg.clientWidth < 460 ? 360 : plotW;
    const view = `0 0 ${width} ${plotH}`;
    if (resizeOnly && svg.getAttribute('viewBox') === view) return;
    svg.setAttribute('viewBox', view);
    svg.innerHTML = id === 'shelf' ? clockPlot(sample(), width) : profilePlot(sample(), width);
  }
  function show() {
    if (pointerId !== null && root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
    pointerId = null;
    if (!samples.has(id)) samples.set(id, newSample(id));
    const s = sample(),
      station = stations[id];
    root.dataset.zone = id;
    root
      .querySelectorAll('[data-station]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.station === id)));
    panel.innerHTML = `<div class="lab-meta"><span>${station.code}</span><span>批号 ${hex(s.seed).padStart(8, '0')}</span></div><h3>${station.title}</h3><p class="lab-description">${station.description}</p>${id === 'trench' ? framePanel(s) : analogPanel(id, s)}<p class="lab-method">${id === 'shelf' ? '每步平移 2 ms。相关系数越接近 +1，两路信号的形状越吻合。' : id === 'vent' ? '以取样线为中心，比较上下各 4 m 的温差，估算局部梯度。' : '上排标位号，下排显示当前比特值。再次点按已选位可撤销翻转。'}</p><div class="lab-actions"><button type="button" data-action="submit">${id === 'trench' ? '解码电报' : '提交测量'}</button><button type="button" data-action="new">换一批样本</button></div><p class="lab-result" role="status"></p>`;
    refresh();
  }
  function setValue(value) {
    const input = panel.querySelector('input');
    if (!input) return;
    const next = clamp(Math.round(value), Number(input.min), Number(input.max));
    if (sample().value === next) return;
    sample().value = next;
    sample().result = null;
    refresh();
  }
  function onClick(event) {
    const b = event.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.station) {
      id = b.dataset.station;
      show();
      return;
    }
    if (b.dataset.bit) {
      const s = sample(),
        frame = Number(b.dataset.frame),
        bit = Number(b.dataset.bit);
      s.flips[frame] = s.flips[frame] === bit ? 0 : bit;
      s.result = null;
      refresh();
      return;
    }
    switch (b.dataset.action) {
      case 'plus':
        setValue(sample().value + 1);
        break;
      case 'minus':
        setValue(sample().value - 1);
        break;
      case 'submit':
        sample().result = judgment(id, sample());
        feedback(sample().result);
        panel.querySelector('.lab-result').scrollIntoView({ block: 'nearest', behavior: 'instant' });
        break;
      case 'new':
        samples.set(id, newSample(id));
        show();
        panel.querySelector('[data-action="new"]').focus({ preventScroll: true });
        break;
    }
  }
  function onInput(event) {
    if (event.target.matches('input[type=range]')) setValue(Number(event.target.value));
  }
  function probeAt(event) {
    const svg = panel.querySelector('.lab-graph'),
      transform = svg?.getScreenCTM();
    if (!transform) return;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const y = pt.matrixTransform(transform.inverse()).y;
    setValue(((y - 15) / 140) * (sample().data.temperatures.length - 1));
  }
  function onDown(event) {
    if (id !== 'vent' || !event.target.closest('.lab-graph') || event.button !== 0 || !event.isPrimary)
      return;
    pointerId = event.pointerId;
    root.setPointerCapture(pointerId);
    probeAt(event);
  }
  function onMove(event) {
    if (pointerId === event.pointerId) probeAt(event);
  }
  function onUp(event) {
    if (pointerId === event.pointerId) pointerId = null;
  }
  const handlers = {
    click: onClick,
    input: onInput,
    pointerdown: onDown,
    pointermove: onMove,
    pointerup: onUp,
    pointercancel: onUp,
    lostpointercapture: onUp,
  };
  for (const [type, fn] of Object.entries(handlers)) root.addEventListener(type, fn);
  show();
  const resize = globalThis.ResizeObserver && new ResizeObserver(() => drawGraph(true));
  resize?.observe(root);
  return () => {
    resize?.disconnect();
    for (const [type, fn] of Object.entries(handlers)) root.removeEventListener(type, fn);
    samples.clear();
    root.remove();
  };
}
