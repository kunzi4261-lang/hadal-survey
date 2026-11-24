import { ZONES, getZone } from './core/world.mjs';
import { isUnlocked, startDive, exportReport } from './core/session.mjs';
import { drawChart, reportCanvas, formatTime } from './chart.mjs';
import { createAudio } from './audio.mjs';
import {
  readState,
  saveState,
  savePhotos,
  addPhoto,
  encodeBackup,
  decodeBackup,
  BOOK_KEY,
  PHOTO_KEY,
} from './logbook.mjs';

const id = (s) => document.getElementById(s),
  host = id('cockpit'),
  base = id('base'),
  sheet = id('sheet'),
  body = id('sheet-body');
const audio = createAudio();
let storage;
try {
  storage = window.localStorage;
} catch {}
let book = readState(storage, matchMedia('(prefers-reduced-motion:reduce)').matches),
  cockpit,
  mounting = false,
  toastTimer,
  warned = false;
let stopInstrument;
const nodes = (tag, cl, text) => {
  const n = document.createElement(tag);
  if (cl) n.className = cl;
  if (text !== undefined) n.textContent = text;
  return n;
};
const btn = (label, fn, cl = 'outline') => {
  const n = nodes('button', cl, label);
  n.type = 'button';
  n.addEventListener('click', fn);
  return n;
};
const wrap = (...children) => {
  const el = nodes('div', 'actionrow');
  el.append(...children);
  return el;
};
const known = () => Object.keys(book.campaign.records).length;
const activeId = () => book.campaign.active?.zoneId;
function clearInstrument() {
  stopInstrument?.();
  stopInstrument = undefined;
}
const title = (k, h) => {
  clearInstrument();
  id('dialog-notice').textContent = '';
  id('dialog-kicker').textContent = k;
  id('dialog-title').textContent = h;
  body.replaceChildren();
  if (!sheet.open) sheet.showModal();
  sheet.setAttribute('aria-labelledby', 'dialog-title');
  sheet.scrollTop = 0;
};
function toast(message) {
  clearTimeout(toastTimer);
  const notice = id(sheet.open ? 'dialog-notice' : 'notice');
  notice.textContent = message;
  toastTimer = setTimeout(() => {
    notice.textContent = '';
  }, 4200);
}
function persist() {
  if (!saveState(book, storage) && !warned) {
    warned = true;
    toast('本机存储不可用。离开前可以从设置导出航次备份。');
  }
}
function prefs() {
  audio.enable(book.settings.sound);
  document.documentElement.dataset.motion = book.settings.reducedMotion ? 'reduce' : 'normal';
}
function primaryZone() {
  return (
    getZone(activeId()) ||
    ZONES.find((z) => isUnlocked(book.campaign, z.id) && !book.campaign.completed[z.id]) ||
    ZONES[0]
  );
}
function renderBase() {
  const completed = Object.keys(book.campaign.completed).length;
  id('archive-count').textContent = String(known()).padStart(2, '0');
  id('progress').textContent = completed + ' / ' + ZONES.length + ' 海区已完成';
  id('hero-launch').replaceChildren(
    document.createTextNode(activeId() ? '继续潜航' : completed === 3 ? '重访陆架' : '开始下潜'),
    nodes('b', '', '↗'),
  );
  const cards = id('zone-cards');
  cards.replaceChildren();
  for (const [i, z] of ZONES.entries()) {
    const unlocked = isUnlocked(book.campaign, z.id),
      report = book.campaign.completed[z.id];
    const card = btn('', () => brief(z), 'zone-card'),
      art = nodes('div', 'zone-art'),
      chart = nodes('canvas');
    chart.width = 600;
    chart.height = 240;
    chart.style.cssText = 'width:100%;height:100%;display:block';
    chart.setAttribute('aria-hidden', 'true');
    art.append(chart, nodes('span', 'chart-label', z.code + ' / ' + z.depth.toLocaleString() + ' M'));
    const meta = nodes('div', 'zone-meta'),
      foot = nodes('div', 'zone-foot');
    meta.append(
      nodes('span', 'chapter-meta', '海区 ' + String(i + 1).padStart(2, '0')),
      nodes('h3', '', z.name),
    );
    foot.append(
      nodes('span', '', z.subtitle),
      nodes(
        'strong',
        '',
        activeId() === z.id
          ? '潜航中 ↗'
          : report
            ? '评级 ' + report.grade + ' ↗'
            : unlocked
              ? '简报 ↗'
              : '待解锁',
      ),
    );
    meta.append(foot);
    card.append(art, meta);
    cards.append(card);
    drawChart(chart, z, report?.trail || [], Boolean(report));
  }
}
function brief(z) {
  title(z.code + ' / ' + z.depth.toLocaleString() + ' M', z.name);
  body.append(nodes('p', 'lead', z.brief));
  const enabled = isUnlocked(book.campaign, z.id),
    other = activeId() && activeId() !== z.id;
  if (!enabled) body.append(nodes('p', 'empty', '完成前一海区的采样并返航后，可进入本海区。'));
  else if (other)
    body.append(
      nodes('p', 'empty', '另一航次正在进行。返航归档后即可切换海区。'),
      wrap(btn('继续当前航次', () => launch(getZone(activeId())), 'solid')),
    );
  else
    body.append(
      nodes('p', '', '任务目标：找到 ' + z.sites.length + ' 处回波，完成近场采样并返回母站。'),
      wrap(btn(activeId() ? '继续驾驶' : '进入驾驶舱', () => launch(z), 'solid')),
    );
  if (book.campaign.completed[z.id]) body.append(wrap(btn('查看已归档航迹', () => reportPage(z))));
}
async function launch(z) {
  if (mounting || cockpit) return;
  if (!isUnlocked(book.campaign, z.id) || (activeId() && activeId() !== z.id)) {
    brief(z);
    return;
  }
  mounting = true;
  try {
    const { mountCockpit } = await import('./cockpit.mjs');
    if (!book.campaign.active && !startDive(book.campaign, z.id)) throw Error('该航次尚未解锁');
    if (sheet.open) sheet.close();
    base.hidden = true;
    host.hidden = false;
    audio.sound('click');
    audio.ambient(true);
    persist();
    cockpit = mountCockpit(host, {
      session: book.campaign,
      settings: book.settings,
      onSave: persist,
      onSound: (name) => audio.sound(name),
      onPhoto: (photo) => {
        const result = addPhoto(book, photo, storage);
        toast(result.message);
        return result.ok;
      },
      onExit: () => leave(),
      onComplete: () => {
        leave();
        reportPage(z);
      },
    });
    if (!cockpit?.destroy) throw Error('驾驶舱启动失败');
  } catch (e) {
    leave();
    toast('驾驶舱没有完成启动。请刷新后继续航次。');
    console.error(e);
  } finally {
    mounting = false;
  }
}
function leave() {
  const old = cockpit;
  cockpit = null;
  old?.destroy();
  host.replaceChildren();
  host.hidden = true;
  base.hidden = false;
  audio.ambient(false);
  persist();
  renderBase();
  id('hero-launch').focus({ preventScroll: true });
}
function download(name, src) {
  const a = nodes('a');
  a.download = name;
  const blob = src instanceof Blob;
  a.href = blob ? URL.createObjectURL(src) : src;
  document.body.append(a);
  a.click();
  a.remove();
  if (blob) setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function questions(z, target) {
  const block = nodes('div', 'record'),
    solved = book.solved.includes(z.id);
  block.append(nodes('small', '', '证据复核'), nodes('h3', '', z.question));
  if (solved) {
    block.append(nodes('p', '', z.debrief));
    target.append(block);
    return;
  }
  const feedback = nodes('p', '');
  feedback.setAttribute('role', 'status');
  const choices = nodes('div', 'actionrow');
  z.answers.forEach((a, i) =>
    choices.append(
      btn(a, () => {
        if (i !== z.correctIndex) {
          feedback.textContent = z.hint;
          return;
        }
        book.solved.push(z.id);
        persist();
        audio.sound('sample');
        reportPage(z);
      }),
    ),
  );
  block.append(choices, feedback);
  target.append(block);
}
function reportPage(z) {
  const report = book.campaign.completed[z.id];
  if (!report) return;
  title('MISSION REPORT / ' + z.code, z.name + ' · 航次报告');
  const canvas = reportCanvas(z, report);
  canvas.className = 'report-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', z.name + ' 的真实航迹与三个采样点');
  body.append(
    canvas,
    nodes(
      'p',
      'lead',
      '潜航 ' +
        formatTime(report.elapsed) +
        '，航行 ' +
        Math.round(report.distance) +
        ' 米。三份记录已归档，评级 ' +
        report.grade +
        '。',
    ),
  );
  questions(z, body);
  const next = ZONES[ZONES.indexOf(z) + 1];
  const actions = wrap(
    btn('回放本次航迹', () => instrumentPage('replay', z)),
    btn('分析模拟信号', () => instrumentPage('lab', z, true)),
    btn('导出航迹图', () =>
      canvas.toBlob((b) => {
        if (b) download(z.code + '-航迹.png', b);
      }),
    ),
    btn('导出数据', () =>
      download(
        z.code + '-航次.json',
        new Blob([exportReport(book.campaign, z.id)], { type: 'application/json' }),
      ),
    ),
  );
  if (next) actions.append(btn('查看下一海区', () => brief(next), 'solid'));
  else actions.append(btn('打开完整档案', () => journal('samples'), 'solid'));
  body.append(actions);
}
async function instrumentPage(kind, zone, fromReport = false) {
  const replay = kind === 'replay';
  title(replay ? 'FLIGHT RECORDER' : 'SIGNAL LAB', replay ? zone.name + ' · 航迹回放' : '船载实验台');
  const panel = nodes('div');
  body.append(panel);
  if (replay || fromReport) body.append(wrap(btn('返回航次报告', () => reportPage(zone))));
  try {
    if (replay) {
      const { mountReplay } = await import('./replay.mjs');
      if (!panel.isConnected || !sheet.open) return;
      const player = mountReplay(panel, zone, book.campaign.completed[zone.id]);
      stopInstrument = () => player.destroy();
    } else {
      const { mountLab } = await import('./lab.mjs');
      if (!panel.isConnected || !sheet.open) return;
      stopInstrument = mountLab(panel, zone.id);
    }
  } catch (error) {
    console.error(error);
    if (panel.isConnected) panel.textContent = '仪器未能启动，请关闭窗口后重试。';
  }
}
function journal(tab = 'samples') {
  title('EXPEDITION ARCHIVE', '科考档案');
  const tabs = nodes('div', 'tabs');
  for (const [key, name] of [
    ['samples', '采样 ' + known() + '/9'],
    ['reports', '航迹 ' + Object.keys(book.campaign.completed).length + '/3'],
    ['photos', '照片 ' + book.photos.length + '/12'],
  ]) {
    const b = btn(name, () => journal(key), '');
    b.setAttribute('aria-pressed', String(key === tab));
    tabs.append(b);
  }
  body.append(tabs);
  if (tab === 'samples') {
    if (!known())
      body.append(
        nodes('p', 'empty', '第一份档案来自蓝石陆架。出航后发出声呐脉冲，靠近回波，完成采样。'),
      );
    for (const z of ZONES)
      for (const s of z.sites) {
        const r = book.campaign.records[s.id];
        if (!r) continue;
        const e = nodes('details', 'record'),
          h = nodes('summary', '', s.name);
        e.append(h, nodes('small', '', z.name + ' / ' + s.method), nodes('p', '', s.description));
        body.append(e);
      }
  } else if (tab === 'reports') {
    if (!Object.keys(book.campaign.completed).length)
      body.append(
        nodes(
          'p',
          'empty',
          '完成海区采样并在母站归档后，这里会保留最近一次完成该海区的航迹、评级和证据复核。',
        ),
      );
    for (const z of ZONES)
      if (book.campaign.completed[z.id]) {
        const r = book.campaign.completed[z.id];
        body.append(
          wrap(
            btn(z.name + ' · ' + r.grade + ' · ' + formatTime(r.elapsed) + '　查看报告 ↗', () =>
              reportPage(z),
            ),
          ),
        );
      }
  } else {
    if (!book.photos.length)
      body.append(nodes('p', 'empty', '驾驶舱中的拍照按钮会把实时海床画面保存到这里。'));
    const grid = nodes('div', 'photos');
    [...book.photos].reverse().forEach((p) => {
      const fig = nodes('figure'),
        img = nodes('img');
      img.src = p.dataUrl;
      img.alt = p.caption;
      img.loading = 'lazy';
      const caption = nodes(
        'figcaption',
        '',
        getZone(p.zone).name + ' · ' + p.depth + ' m · ' + p.caption,
      );
      let confirmRemoval = false;
      const remove = btn('移除', () => {
        if (!confirmRemoval) {
          confirmRemoval = true;
          remove.textContent = '确认移除';
          return;
        }
        const remaining = book.photos.filter((photo) => photo !== p);
        if (!savePhotos({ ...book, photos: remaining }, storage)) {
          toast('移除失败，请检查本机可用空间。');
          return;
        }
        book.photos = remaining;
        journal('photos');
      });
      fig.append(
        img,
        caption,
        wrap(
          btn('下载照片', () => download('hadal-' + p.zone + '.jpg', p.dataUrl)),
          remove,
        ),
      );
      grid.append(fig);
    });
    body.append(grid);
  }
}
function settings() {
  title('ROV SYSTEMS', '设置与存档');
  for (const [key, name] of [
    ['sound', '驾驶舱声音'],
    ['reducedMotion', '减少界面动效'],
  ]) {
    const label = nodes('label', 'setting', name),
      input = nodes('input');
    input.type = 'checkbox';
    input.checked = book.settings[key];
    input.onchange = () => {
      book.settings[key] = input.checked;
      prefs();
      persist();
      if (key === 'sound') audio.sound('click');
    };
    label.append(input);
    body.append(label);
  }
  const controls = nodes('div', 'data-options');
  controls.append(
    nodes('h3', '', '转移航次'),
    nodes('p', '', '备份包含已完成的海区、当前驾驶位置、采样、复核答案和照片。所有数据保存在本机。'),
  );
  const pick = nodes('input');
  pick.type = 'file';
  pick.accept = '.json,application/json';
  pick.hidden = true;
  pick.onchange = async () => {
    const file = pick.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5400000) throw Error();
      const candidate = decodeBackup(await file.text());
      title('RESTORE', '恢复航次备份');
      body.append(
        nodes(
          'p',
          'lead',
          '备份有 ' +
            Object.keys(candidate.campaign.records).length +
            ' 份采样和 ' +
            candidate.photos.length +
            ' 张照片。恢复后会替换本机的航次记录。',
        ),
      );
      body.append(
        wrap(
          btn('取消', settings),
          btn(
            '恢复这份备份',
            () => {
              // Store the new snapshot before switching the active in-memory campaign.
              let oldBook, oldPhotos;
              try {
                oldBook = storage.getItem(BOOK_KEY);
                oldPhotos = storage.getItem(PHOTO_KEY);
                if (!savePhotos(candidate, storage) || !saveState(candidate, storage)) throw Error();
              } catch {
                try {
                  if (oldBook != null) storage.setItem(BOOK_KEY, oldBook);
                  else storage.removeItem(BOOK_KEY);
                  if (oldPhotos != null) storage.setItem(PHOTO_KEY, oldPhotos);
                  else storage.removeItem(PHOTO_KEY);
                } catch {}
                toast('恢复失败，请检查本机可用空间。');
                return;
              }
              book = candidate;
              prefs();
              renderBase();
              settings();
              toast('航次已恢复。');
            },
            'solid',
          ),
        ),
      );
    } catch {
      toast('无法读取这份备份。请选择游戏导出的 JSON 文件。');
    }
    pick.value = '';
  };
  controls.append(
    wrap(
      btn('导出备份', () =>
        download(
          'hadal-survey-backup.json',
          new Blob([encodeBackup(book)], { type: 'application/json' }),
        ),
      ),
      btn('导入备份', () => pick.click()),
    ),
    pick,
  );
  body.append(controls);
}
id('hero-launch').onclick = () => launch(primaryZone());
id('journal-open').onclick = id('journal-foot').onclick = () => journal();
id('settings-open').onclick = settings;
id('sheet-close').onclick = () => sheet.close();
id('lab-open').onclick = () => instrumentPage('lab', primaryZone());
sheet.addEventListener('close', () => {
  if (!sheet.open) clearInstrument();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) {
    const b = sheet.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      sheet.close();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist();
    audio.ambient(false);
  } else if (cockpit) audio.ambient(true);
});
window.addEventListener('pagehide', () => {
  persist();
  audio.ambient(false);
});
prefs();
renderBase();
if (document.querySelector('meta[name="hadal-offline"], meta[name="hadal-portable"]')) {
  id('portable-download').hidden = false;
}
if (document.querySelector('meta[name="hadal-offline"]') && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* The live game also works without a worker. */
  });
}
