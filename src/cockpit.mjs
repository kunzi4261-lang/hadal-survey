import { createScene } from './render/scene.mjs';
import { getZone } from './core/world.mjs';
import { step, act, getView } from './core/session.mjs';
import { drawChart, chartPoint } from './ui/chart.mjs';

const paths = {
  pulse: 'M3 12a9 9 0 0 1 18 0M6.5 12a5.5 5.5 0 0 1 11 0M10 12a2 2 0 0 1 4 0M12 13v7',
  scan: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16',
  lamp: 'm3 8 8-2v12l-8-2zm12-1 5-2m-5 7h6m-6 5 5 2',
  photo: 'M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0',
  pause: 'M7 4h3v16H7zm7 0h3v16h-3z',
  course: 'm3 10 18-7-7 18-2-9z',
  cross: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  dock: 'M12 3v14m-4-9h8M3 14c0 4 5 7 9 7s9-3 9-7m-18 2v-3l3 1m15 2v-3l-3 1',
};
const icon = (name) =>
  '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="' + paths[name] + '"/></svg>';
const mkButton = (id, label, image, key = '') =>
  '<button type="button" data-do="' +
  id +
  '" title="' +
  label +
  (key ? ' (' + key + ')' : '') +
  '">' +
  icon(image) +
  '<span>' +
  label +
  '</span>' +
  (key ? '<kbd>' + key + '</kbd>' : '') +
  '</button>';
const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const degrees = (n) => ((((n * 180) / Math.PI) % 360) + 360) % 360;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function mountCockpit(container, options) {
  const {
    session,
    onSave = () => {},
    onExit = () => {},
    onComplete = () => {},
    onSound = () => {},
    onPhoto = () => {},
    settings = {},
  } = options;
  const base = getView(session);
  if (!base) throw new Error('无法挂载没有活动潜航的驾驶舱');
  const zone = getZone(base.zone);
  const shell = document.createElement('section');
  shell.className = 'hs-cockpit';
  shell.setAttribute('aria-label', '探测器驾驶舱');
  const quietMotion =
    settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (quietMotion) shell.classList.add('hs-quiet-motion');
  shell.innerHTML = `
    <canvas class="hs-sea" aria-label="探测器前视海底场景；在画面上拖动可调整朝向"></canvas>
    <div class="hs-vignette" aria-hidden="true"></div>
    <header class="hs-top"><div class="hs-opname"><i></i><strong>HADAL</strong><span>探测器</span></div>
      <div class="hs-compass" aria-hidden="true"><canvas></canvas><b>⌄</b><span></span></div>
      <div class="hs-toptools">${mkButton('chart', '海图', 'map', 'M')}${mkButton('pause', '暂停', 'pause', 'Esc')}</div>
    </header>
    <div class="hs-bearing" hidden><i aria-hidden="true"></i><span></span></div>
    <aside class="hs-task">
      <div class="hs-title"><i></i><b class="hs-zone"></b><span class="hs-count"></span></div>
      <div class="hs-objective"></div><div class="hs-progress" aria-hidden="true"><i></i></div>
      <button class="hs-assist" type="button" data-do="assist">${icon('course')}<span>引导航行</span></button>
    </aside>
    <div class="hs-reticle" aria-hidden="true"><i></i><b></b></div>
    <div class="hs-announcement" role="status" aria-live="polite"></div>
    <aside class="hs-depth"><div class="hs-depth-label">深度 <span>DEPTH</span></div>
      <div class="hs-depth-value"><b></b> <span>m</span></div><div class="hs-meters"><span>离底 <b class="hs-alt"></b> m</span><span>航速 <b class="hs-speed"></b> m/s</span></div>
      <div class="hs-battery"><i><b></b></i><span></span></div>
    </aside>
    <button type="button" class="hs-radar" data-do="chart" aria-label="打开全域海图"><span>N</span><canvas></canvas></button>
    <div class="hs-touch" aria-label="驾驶控制"><div class="hs-touchdrive">
      <button type="button" data-move="w" aria-label="向前推进">▲</button>
      <div><button type="button" data-move="a" aria-label="左转">◀</button><button type="button" data-move="s" aria-label="向后推进">▼</button><button type="button" data-move="d" aria-label="右转">▶</button></div>
    </div><div class="hs-touchlift"><button type="button" data-move="e" aria-label="上浮">上浮</button><button type="button" data-move="q" aria-label="下潜">下潜</button></div></div>
    <footer class="hs-bottom"><div class="hs-keyhelp">W/S 推进　A/D 转向　Q/E 升降　拖动镜头</div>
      <div class="hs-instruments">
        ${mkButton('ping', '声呐', 'pulse', 'F')}${mkButton('scan', '采样', 'scan', 'R')}${mkButton('lights', '照明', 'lamp', 'L')}${mkButton('photo', '拍摄', 'photo', 'P')}
      </div></footer>
    <dialog class="hs-dialog"><div class="hs-modal-head"><div><span class="hs-modal-code" aria-hidden="true">HADAL / ROV</span><h2></h2></div><button type="button" data-do="close" aria-label="关闭面板">${icon('cross')}</button></div>
      <div class="hs-chartpage" hidden><div class="hs-chartbody"><div class="hs-mapframe"><canvas aria-label="俯视海图，点击海图可设置航点"></canvas><span>N ↑</span></div>
      <div class="hs-routes"><h3>航点</h3><div class="hs-points"></div><p class="hs-chartnote"></p></div></div>
      <p class="hs-maplegend"><b>▲</b> 探测器　□ 回收点　<span>◇</span> 回波　<em>◆</em> 已采样</p>
      <p class="hs-dialogstatus" role="status"></p><div class="hs-readings"></div></div>
      <div class="hs-pausepage" hidden><p>当前潜航已暂停。离开驾驶舱后可从本机进度继续。</p><div class="hs-pauseactions">
        <button type="button" data-do="close">继续驾驶 ${icon('arrow')}</button>
        <button type="button" data-do="exit">保存并返回指挥台</button></div>
        <details class="hs-help"><summary>操控与任务说明</summary>
        <p>先用声呐寻找目标，沿回波航行，靠近并降低离底高度后启动采样。完成全部采样后，在回收点对接。</p>
        <dl><dt>推进 / 倒车</dt><dd>W / S 或 ↑ / ↓</dd><dt>左转 / 右转</dt><dd>A / D 或 ← / →</dd><dt>下潜 / 上浮</dt><dd>Q / E</dd><dt>改变视角</dt><dd>拖动场景</dd><dt>引导或停止航行</dt><dd>G</dd><dt>对接回收</dt><dd>完成采样后回到回收点，点击「对接回收」</dd></dl></details>
        <div class="hs-rescue"><button type="button" data-do="recall">应急回收</button><small>立即返回回收点，计入本次潜航的应急次数。</small></div>
      </div></dialog>`;
  container.replaceChildren(shell);
  const $ = (sel) => shell.querySelector(sel);
  const btn = (id) => $('[data-do="' + id + '"]');
  const canvas = $('.hs-sea'),
    scene = createScene(canvas),
    dlg = $('dialog'),
    chart = $('.hs-mapframe canvas');
  const controls = new AbortController(),
    opts = { signal: controls.signal };
  let closed = false,
    paused = false,
    modal = '',
    raf = 0,
    last = 0,
    displayAt = 0,
    mapAt = 0,
    saveAt = 0,
    nowView = base;
  let drag = null,
    dragTurn = 0,
    dragLook = 0,
    noticeTimer,
    priorSamples = base.samples,
    lastMessage = base.message,
    headingShown = null;
  const held = new Set(),
    touches = new Map();
  const sound = (name) => {
    if (settings.sound !== false) onSound(name);
  };
  const say = (msg) => {
    if (!msg || closed) return;
    const el = $('.hs-announcement');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => el.classList.remove('on'), 3200);
  };
  const save = () => onSave(session);
  function clearInput() {
    held.clear();
    touches.clear();
    drag = null;
    dragLook = dragTurn = 0;
    shell.querySelectorAll('[data-move].down').forEach((b) => b.classList.remove('down'));
  }
  function command(type, arg) {
    if (closed || !session.active) return false;
    const result = act(session, type, arg);
    if (!result.ok) {
      say(result.message);
      if (modal === 'chart') $('.hs-dialogstatus').textContent = result.message;
      return false;
    }
    if (type === 'dock') {
      closed = true;
      clearInput();
      cancelAnimationFrame(raf);
      sound('dock');
      save();
      onComplete(session);
      return true;
    }
    nowView = getView(session);
    if (result.message) say(result.message);
    if (type === 'ping' || type === 'scan') sound(type);
    else sound('click');
    save();
    drawHud(nowView);
    return true;
  }
  const render = (view) =>
    scene.render({ ...view, time: quietMotion ? 0 : view.elapsed, ping: quietMotion ? -1 : view.ping });
  function shoot() {
    render(nowView);
    const out = document.createElement('canvas');
    const scale = Math.min(1, 960 / canvas.width, 720 / canvas.height);
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    const nearby = nowView.sites.find((s) => s.id === nowView.nearby && s.revealed);
    const caption = nearby?.name || zone.name;
    try {
      const saved = onPhoto({
        dataUrl: out.toDataURL('image/jpeg', 0.76),
        zone: zone.id,
        caption,
        depth: Math.round(nowView.depth),
      });
      if (saved === false) {
        say('照片未保存，请检查影像档案容量。');
        return;
      }
      sound('shutter');
      say('已将「' + caption + '」收录到影像档案。');
    } catch {
      say('本机影像存储空间不足，照片未能保存。');
    }
  }
  function routeTo(target) {
    if (command('navigate', target)) closePanel();
  }
  function populateRoutes() {
    const points = $('.hs-points');
    points.replaceChildren();
    function add(id, name, detail) {
      const b = document.createElement('button');
      b.type = 'button';
      const title = document.createElement('b'),
        desc = document.createElement('span');
      title.textContent = name;
      desc.textContent = detail;
      b.append(title, desc);
      b.addEventListener('click', () => routeTo(id), opts);
      points.append(b);
    }
    for (const s of nowView.sites.filter((s) => s.revealed || s.sampled))
      add(s.id, s.name, (s.sampled ? '已采样' : '回波') + ' · ' + Math.round(s.distance) + ' m');
    add('dock', '回收点', Math.round(nowView.dockDistance) + ' m');
    const list = $('.hs-readings');
    list.replaceChildren();
    for (const site of nowView.sites.filter((s) => s.sampled)) {
      const record = document.createElement('details'),
        summary = document.createElement('summary'),
        body = document.createElement('p');
      summary.textContent = site.name + ' · ' + site.method;
      body.textContent = site.description;
      record.append(summary, body);
      list.append(record);
    }
    $('.hs-chartnote').textContent = '选择航点或点击地图以启动引导航行。声呐可发现附近的新回波。';
    $('.hs-dialogstatus').textContent = '';
  }
  function openPanel(type) {
    if (closed || modal === type) return;
    clearInput();
    paused = true;
    modal = type;
    save();
    dlg.querySelector('h2').textContent = type === 'chart' ? '航区海图' : '潜航暂停';
    $('.hs-chartpage').hidden = type !== 'chart';
    $('.hs-pausepage').hidden = type !== 'pause';
    if (!dlg.open) dlg.showModal();
    if (type === 'chart') {
      populateRoutes();
      drawChart(chart, nowView, false, session.active?.trail);
    }
  }
  function closePanel() {
    if (!dlg.open) return;
    dlg.close();
    resume();
  }
  function resume() {
    paused = false;
    modal = '';
    last = 0;
    clearInput();
  }
  function assist() {
    if (nowView.canDock) command('dock');
    else if (nowView.route) command('cancelNav');
    else command('navigate', nowView.samples === nowView.total ? 'dock' : 'next');
  }
  function action(id) {
    if (id === 'close') closePanel();
    else if (id === 'chart' || id === 'pause') openPanel(id);
    else if (id === 'exit') {
      save();
      onExit(session);
    } else if (id === 'recall') {
      closePanel();
      command('recall');
    } else if (id === 'photo') shoot();
    else if (id === 'assist') assist();
    else command(id);
  }
  shell.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest('[data-do]');
      if (b) action(b.dataset.do);
    },
    opts,
  );
  dlg.addEventListener(
    'close',
    () => {
      if (!closed) resume();
    },
    opts,
  );
  dlg.addEventListener(
    'cancel',
    (e) => {
      e.preventDefault();
      closePanel();
    },
    opts,
  );
  chart.addEventListener(
    'click',
    (e) => {
      const pt = chartPoint(chart, e);
      if (pt) routeTo(pt);
      else $('.hs-dialogstatus').textContent = '请选择虚线以内的航点。';
    },
    opts,
  );
  const movement = ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  const shortcuts = {
    f: 'ping',
    r: 'scan',
    l: 'lights',
    p: 'photo',
    m: 'chart',
    g: 'assist',
    escape: 'pause',
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (closed || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (dlg.open) {
        if (k === 'm' && modal === 'chart') {
          e.preventDefault();
          closePanel();
        }
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (movement.includes(k)) {
        e.preventDefault();
        held.add(k);
      } else if (shortcuts[k] && !e.repeat) {
        e.preventDefault();
        action(shortcuts[k]);
      }
    },
    opts,
  );
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()), opts);
  window.addEventListener('blur', clearInput, opts);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && !closed) {
        clearInput();
        save();
        if (!modal) openPanel('pause');
      }
    },
    opts,
  );
  window.addEventListener(
    'pagehide',
    () => {
      if (!closed) save();
    },
    opts,
  );
  for (const b of shell.querySelectorAll('[data-move]')) {
    b.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        touches.set(e.pointerId, b.dataset.move);
        b.classList.add('down');
      },
      opts,
    );
    function release(e) {
      touches.delete(e.pointerId);
      b.classList.remove('down');
    }
    b.addEventListener('pointerup', release, opts);
    b.addEventListener('lostpointercapture', release, opts);
  }
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || drag) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    opts,
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      dragTurn = clamp(dragTurn + (e.clientX - drag.x) * 0.006, -1.4, 1.4);
      dragLook = clamp(dragLook - (e.clientY - drag.y) * 0.006, -1, 1);
      drag.x = e.clientX;
      drag.y = e.clientY;
    },
    opts,
  );
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      drag = null;
    },
    opts,
  );
  function steer(dt) {
    const inputs = new Set([...held, ...touches.values()]);
    const active = (...ks) => Number(ks.some((k) => inputs.has(k)));
    const turn = clamp(dragTurn / (Math.max(dt, 0.001) * 2), -1, 1);
    const look = clamp(dragLook / (Math.max(dt, 0.001) * 2), -1, 1);
    dragTurn -= turn * dt * 2;
    dragLook -= look * dt * 2;
    return {
      forward: active('w', 'arrowup') - active('s', 'arrowdown'),
      turn: clamp(active('d', 'arrowright') - active('a', 'arrowleft') + turn, -1, 1),
      lift: active('e') - active('q'),
      look,
    };
  }
  function drawCompass(angle) {
    const cvs = $('.hs-compass canvas'),
      width = cvs.clientWidth;
    if (!width) return;
    const value = Math.round(degrees(angle)) % 360;
    const key = width + ':' + value;
    if (key === headingShown) return;
    headingShown = key;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cvs.width = Math.round(width * dpr);
    cvs.height = Math.round(23 * dpr);
    const pen = cvs.getContext('2d');
    pen.scale(dpr, dpr);
    pen.font = '10px ui-monospace, monospace';
    pen.textAlign = 'center';
    for (let n = Math.floor((value - 50) / 5) * 5; n <= value + 50; n += 5) {
      const x = width / 2 + ((n - value) * width) / 92,
        deg = (n + 360) % 360;
      pen.fillStyle = 'rgba(225,243,236,.76)';
      pen.fillRect(x, 17, 1, deg % 15 === 0 ? 6 : 3);
      if (deg % 15 === 0)
        pen.fillText(
          { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] || String(deg).padStart(3, '0'),
          x,
          12,
        );
    }
    $('.hs-compass span').textContent =
      DIRS[Math.round(value / 45) % 8] + ' ' + String(value).padStart(3, '0') + '°';
  }
  function drawHud(v) {
    $('.hs-zone').textContent = zone.name;
    $('.hs-count').textContent = v.samples + ' / ' + v.total;
    $('.hs-objective').textContent = v.objective;
    const assistText = v.canDock
      ? '对接回收'
      : v.route
        ? '停止引航'
        : v.samples === v.total
          ? '引导返航'
          : '引导至目标航区';
    $('.hs-assist span').textContent = assistText;
    $('.hs-assist').classList.toggle('active', Boolean(v.route) || v.canDock);
    const p = $('.hs-progress i');
    p.style.width = (v.scan ? v.scan.progress * 100 : (v.samples / v.total) * 100) + '%';
    p.classList.toggle('scanning', Boolean(v.scan));
    $('.hs-depth-value b').textContent = Math.round(v.depth).toLocaleString('en-US');
    $('.hs-alt').textContent = v.vehicle.altitude.toFixed(1);
    $('.hs-speed').textContent = v.speed.toFixed(1);
    const soc = clamp(v.battery, 0, 100);
    $('.hs-battery i b').style.width = soc + '%';
    $('.hs-battery span').textContent = Math.round(soc) + '%';
    $('.hs-battery').classList.toggle('low', soc < 22);
    btn('ping').disabled = v.pingCooldown > 0.01;
    btn('ping').querySelector('span').textContent =
      v.pingCooldown > 0.01 ? '声呐 ' + Math.ceil(v.pingCooldown) + 's' : '声呐';
    btn('scan').classList.toggle('ready', Boolean(v.nearby) && !v.scan);
    btn('scan').querySelector('span').textContent = v.scan
      ? '采样 ' + Math.round(v.scan.progress * 100) + '%'
      : '采样';
    btn('lights').setAttribute('aria-pressed', String(v.lights));
    $('.hs-reticle').classList.toggle('lock', Boolean(v.nearby));
    drawCompass(v.vehicle.heading);
    const target =
      v.route ||
      (v.samples === v.total
        ? { x: 0, z: 0, label: '回收点' }
        : v.sites.filter((s) => s.revealed && !s.sampled).sort((a, b) => a.distance - b.distance)[0]);
    const badge = $('.hs-bearing');
    badge.hidden = !target;
    if (target) {
      const dx = target.x - v.vehicle.x,
        dz = target.z - v.vehicle.z;
      const bearing = Math.atan2(dx, dz) - v.vehicle.heading;
      badge.querySelector('i').style.transform = 'rotate(' + bearing + 'rad)';
      badge.querySelector('span').textContent =
        (target.label || target.name || '航点') + ' · ' + Math.round(Math.hypot(dx, dz)) + ' m';
    }
  }
  function frame(ts) {
    if (closed) return;
    if (!paused && !document.hidden) {
      const dt = last ? clamp((ts - last) / 1000, 0, 0.08) : 0;
      last = ts;
      step(session, dt, steer(dt));
      nowView = getView(session);
      if (!nowView) return;
      render(nowView);
      if (nowView.samples > priorSamples) {
        sound('sample');
        save();
        priorSamples = nowView.samples;
      }
      if (nowView.message && nowView.message !== lastMessage) {
        say(nowView.message);
        lastMessage = nowView.message;
      }
      if (ts - displayAt >= 100) {
        drawHud(nowView);
        displayAt = ts;
      }
      if (ts - mapAt >= 150) {
        drawChart(
          $('.hs-radar canvas'),
          quietMotion ? { ...nowView, ping: -1 } : nowView,
          true,
          session.active?.trail,
        );
        mapAt = ts;
      }
      if (ts - saveAt >= 4000) {
        save();
        saveAt = ts;
      }
    } else {
      last = 0;
    }
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener(
    'resize',
    () => {
      headingShown = null;
      if (modal === 'chart') drawChart(chart, nowView, false, session.active?.trail);
    },
    opts,
  );
  drawHud(base);
  render(base);
  raf = requestAnimationFrame(frame);
  return {
    destroy() {
      closed = true;
      clearTimeout(noticeTimer);
      cancelAnimationFrame(raf);
      controls.abort();
      clearInput();
      if (dlg.open) dlg.close();
      scene.dispose();
      shell.remove();
    },
  };
}
