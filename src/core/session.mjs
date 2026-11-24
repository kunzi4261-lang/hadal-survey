import { getZone, floorHeight } from './world.mjs';
import { BOUNDS, MAX_TRAIL, clamp, createDive, isUnlocked, makeRecord } from './state.mjs';
export { newCampaign, loadCampaign, saveCampaign, exportReport, isUnlocked } from './state.mjs';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dock = { x: 0, z: 0 };
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const axis = (n) => (Number.isFinite(n) ? clamp(n, -1, 1) : 0);
const result = (d, ok, message) => {
  if (d) d.message = message;
  return { ok, message };
};
const scanRange = 14;

export function startDive(c, id) {
  const zone = getZone(id);
  if (!zone || !isUnlocked(c, id)) return false;
  if (c.active) return c.active.zoneId === id;
  c.active = createDive(zone, ++c.dives);
  return true;
}

function closest(d, sites) {
  return sites.reduce(
    (best, s) => (!best || dist(d.vehicle, s) < dist(d.vehicle, best) ? s : best),
    null,
  );
}

function available(d, zone) {
  return zone.sites.filter((s) => !d.sampled.includes(s.id));
}

function near(d, zone) {
  if (d.vehicle.altitude > 14) return null;
  return closest(
    d,
    available(d, zone).filter((s) => d.revealed.includes(s.id) && dist(d.vehicle, s) <= scanRange),
  );
}

function addPoint(d, force = false, event = {}) {
  const previous = d.trail.at(-1);
  if (
    !force &&
    previous &&
    dist(previous, d.vehicle) < 3.5 &&
    Math.abs(d.vehicle.altitude - previous.altitude) < 1 &&
    d.elapsed - previous.t < 3
  )
    return;
  const point = {
    x: +d.vehicle.x.toFixed(2),
    z: +d.vehicle.z.toFixed(2),
    t: +d.elapsed.toFixed(3),
    altitude: +d.vehicle.altitude.toFixed(2),
    ...event,
  };
  if (previous && previous.t === point.t && previous.x === point.x && previous.z === point.z) {
    Object.assign(previous, point);
    return;
  }
  if (d.trail.length >= MAX_TRAIL) {
    // Preserve sample fixes, the launch, and both sides of the most recent cable recoveries.
    const keep = new Set([0, d.trail.length - 1]);
    let recoveries = 0;
    for (let i = d.trail.length - 1; i > 0; i--) {
      if (d.trail[i].sample) keep.add(i);
      if (d.trail[i].recovery && recoveries++ < 16) {
        keep.add(i);
        keep.add(i - 1);
      }
    }
    // When an old recovery is decimated, carry the discontinuity to the next retained fix.
    let gap = false;
    d.trail = d.trail.filter((p, i) => {
      gap ||= Boolean(p.recovery);
      if (!keep.has(i) && i % 2 !== 0) return false;
      if (gap) p.recovery = true;
      gap = false;
      return true;
    });
  }
  d.trail.push(point);
}

function recall(d) {
  addPoint(d, true);
  Object.assign(d.vehicle, { x: 0, z: 0, heading: 0, altitude: 6, pitch: -0.05 });
  Object.assign(d, { vx: 0, vz: 0, speed: 0, battery: 100, scan: null, route: null });
  d.recoveries++;
  addPoint(d, true, { recovery: true });
  return result(d, true, '缆索回收完成。电量已补满，已采集的本航次资料仍在机上。');
}

function navigate(d, zone, arg) {
  const site = arg === 'next' ? closest(d, available(d, zone)) : zone.sites.find((s) => s.id === arg);
  let x, z, label;
  if (arg === 'dock' || (arg === 'next' && !site)) {
    x = 0;
    z = 0;
    label = '返航泊位';
  } else if (site) {
    const known = d.revealed.includes(site.id);
    const target = known
      ? site
      : {
          x: Math.round(site.x / 20) * 20,
          z: Math.round(site.z / 20) * 20,
        };
    const distance = dist(target, d.vehicle);
    // Approach a known specimen from this side, leaving it in front of the camera.
    const approach = known && distance > 0 ? Math.min(8, distance) / distance : 0;
    x = target.x + (d.vehicle.x - target.x) * approach;
    z = target.z + (d.vehicle.z - target.z) * approach;
    label = known ? site.name : '待勘测扇区';
  } else if (
    arg &&
    Number.isFinite(arg.x) &&
    Number.isFinite(arg.z) &&
    Math.hypot(arg.x, arg.z) <= BOUNDS
  ) {
    ({ x, z } = arg);
    label = '自定航点';
  } else {
    return result(d, false, '航点无效，请在勘测区内重新选点。');
  }
  d.scan = null;
  d.route = { x, z, label, siteId: site?.id ?? null };
  return result(d, true, '航向已锁定：' + label + '。手动操纵可接管。');
}

function finish(c, d, zone) {
  if (d.sampled.length < zone.sites.length) return result(d, false, '本航次还有观测记录待采集。');
  if (dist(d.vehicle, dock) > 13) return result(d, false, '请返回起始泊位，在 13 米内交付记录。');
  addPoint(d, true);
  const [a, b, e] = zone.sites;
  const shortest = Math.min(
    ...[
      [a, b, e],
      [a, e, b],
      [b, a, e],
    ].map(([p, q, r]) => dist(dock, p) + dist(p, q) + dist(q, r) + dist(r, dock)),
  );
  const detour = Math.max(0, d.distance / shortest - 1);
  const score = Math.round(
    clamp(
      100 -
        24 * detour -
        17 * d.recoveries -
        0.03 * Math.max(0, d.elapsed - 175) -
        0.75 * Math.max(0, d.pings - 8),
      35,
      100,
    ),
  );
  const report = {
    zoneId: zone.id,
    diveNumber: d.diveNumber,
    completedAt: new Date().toISOString(),
    elapsed: +d.elapsed.toFixed(1),
    distance: +d.distance.toFixed(1),
    battery: +d.battery.toFixed(1),
    score,
    grade: score >= 90 ? 'S' : score >= 77 ? 'A' : score >= 62 ? 'B' : 'C',
    pings: d.pings,
    recoveries: d.recoveries,
    scans: d.sampled.length,
    items: [...d.sampled],
    ending: zone.debrief,
    trail: d.trail.map((p) => ({ ...p })),
  };
  c.completed[zone.id] = report;
  c.active = null;
  return result(null, true, '航次完成，' + zone.name + '的观测简报已归档。');
}

export function act(c, type, arg) {
  const d = c.active;
  if (!d) return result(null, false, '当前没有正在进行的航次。');
  const zone = getZone(d.zoneId);
  switch (type) {
    case 'ping': {
      if (d.pingCooldown > 0) return result(d, false, '换能器正在复位，请稍候。');
      const hits = zone.sites.filter(
        (s) => !d.revealed.includes(s.id) && dist(d.vehicle, s) <= zone.sonarRadius,
      );
      d.revealed.push(...hits.map((s) => s.id));
      d.pings++;
      d.ping = 0;
      d.pingCooldown = 3;
      d.battery = Math.max(0, d.battery - 0.42);
      return result(
        d,
        true,
        hits.length
          ? '确认 ' + hits.length + ' 个新回波，坐标已写入声呐图。'
          : '本次没有新增回波。可前往其他扇区探测。',
      );
    }
    case 'navigate':
      return navigate(d, zone, arg);
    case 'cancelNav':
      d.route = null;
      return result(d, true, '已取消导航，切换为手动悬停。');
    case 'lights':
      d.lights = !d.lights;
      return result(d, true, d.lights ? '探照灯已打开。' : '探照灯已关闭。');
    case 'scan': {
      if (d.scan) return result(d, false, '采样正在进行，请保持位置。');
      const s = arg ? zone.sites.find((site) => site.id === arg) : near(d, zone);
      if (!s || !d.revealed.includes(s.id))
        return result(d, false, '先发射声呐确认目标，再靠近到 14 米内采样。');
      if (d.sampled.includes(s.id)) return result(d, false, '这个目标已完成采样。');
      if (d.vehicle.altitude > 14) return result(d, false, '请下降到离底 14 米以内。');
      if (dist(d.vehicle, s) > scanRange) return result(d, false, '距离太远，请靠近到 14 米以内。');
      d.route = null;
      d.scan = { id: s.id, progress: 0 };
      return result(d, true, '正在执行' + s.method + '，请保持位置。');
    }
    case 'recall':
      return recall(d);
    case 'dock':
      return finish(c, d, zone);
    case 'abort':
      c.active = null;
      return result(null, true, '航次已中止，已采集的条目保留在观测档案中。');
    default:
      return result(d, false, '未知操作。');
  }
}

function updateVehicle(d, zone, dt, keys) {
  const v = d.vehicle;
  let { forward = 0, strafe = 0, lift = 0, turn = 0, look = 0 } = keys;
  forward = axis(forward);
  strafe = axis(strafe);
  lift = axis(lift);
  turn = axis(turn);
  look = axis(look);
  const steering =
    Math.abs(forward) + Math.abs(strafe) + Math.abs(turn) + Math.abs(lift) + Math.abs(look);
  if (steering > 0.04 && d.route) {
    d.route = null;
    d.message = '推进器已切换为手动操纵。';
  }
  if (d.route) {
    const route = d.route;
    const delta = dist(v, route);
    if (delta < 1.4) {
      d.route = null;
      d.vx = 0;
      d.vz = 0;
      const site = zone.sites.find((s) => s.id === route.siteId);
      if (site && d.revealed.includes(site.id)) v.heading = Math.atan2(site.x - v.x, site.z - v.z);
      d.message =
        '已抵达' +
        route.label +
        '。' +
        (site && !d.revealed.includes(site.id)
          ? '发射声呐定位附近目标。'
          : site
            ? '可开始近距采样。'
            : '推进器转为悬停。');
    } else {
      const error = angle(Math.atan2(route.x - v.x, route.z - v.z) - v.heading);
      turn = clamp(error * 2.6, -1, 1);
      forward = clamp(delta / 8, 0.14, 1) * Math.max(0, Math.cos(error));
      lift = clamp((6.3 - v.altitude) * 0.5, -1, 1);
      look = clamp((-0.085 - v.pitch) * 1.8, -1, 1);
    }
  }
  v.heading = angle(v.heading + dt * turn * 1.72);
  v.pitch = clamp(v.pitch + look * dt * 0.91, -0.85, 0.65);
  v.altitude = clamp(v.altitude + lift * dt * 5.2, 2, 32);
  const size = Math.max(1, Math.hypot(forward, strafe));
  const velocity = 12.5 * (d.battery < 12 ? 0.72 : 1);
  const sn = Math.sin(v.heading),
    cs = Math.cos(v.heading);
  const targetX = (velocity * (forward * sn + strafe * cs * 0.76)) / size;
  const targetZ = (velocity * (forward * cs - strafe * sn * 0.76)) / size;
  const smooth = 1 - Math.exp(-dt * 3.5);
  d.vx += (targetX - d.vx) * smooth;
  d.vz += (targetZ - d.vz) * smooth;
  // The ROV compensates for steady drift in hover. Cross-current affects it underway.
  const current = Math.min(1, Math.abs(forward) + Math.abs(strafe)) * zone.current;
  const x = v.x,
    z = v.z;
  v.x += dt * (d.vx + current * Math.sin(v.z * 0.019 + d.elapsed * 0.08));
  v.z += dt * (d.vz + current * Math.cos(v.x * 0.031 + d.elapsed * 0.09));
  const radius = Math.hypot(v.x, v.z);
  if (radius > BOUNDS) {
    v.x *= BOUNDS / radius;
    v.z *= BOUNDS / radius;
  }
  const meters = Math.hypot(v.x - x, v.z - z);
  d.speed = meters / dt;
  d.distance += meters;
  addPoint(d);
}

function tick(c, d, zone, dt, keys) {
  d.elapsed += dt;
  d.pingCooldown = Math.max(0, d.pingCooldown - dt);
  if (d.ping >= 0) {
    d.ping += dt;
    if (d.ping > 5) d.ping = -1;
  }
  updateVehicle(d, zone, dt, keys);
  d.battery = Math.max(0, d.battery - dt * (0.052 + (d.lights ? 0.018 : 0) + d.speed * 0.005));
  if (d.battery === 0) {
    recall(d);
    return;
  }
  if (!d.scan) return;
  const s = zone.sites.find((site) => site.id === d.scan.id);
  if (!s || dist(d.vehicle, s) > scanRange + 1 || d.vehicle.altitude > 14.5) {
    d.scan = null;
    d.message = '已离开采样范围，采样中止。';
    return;
  }
  d.scan.progress += dt / s.seconds;
  if (d.scan.progress < 1) return;
  d.sampled.push(s.id);
  addPoint(d, true, { sample: s.id });
  c.records[s.id] ??= makeRecord(zone, s, new Date().toISOString());
  d.scan = null;
  d.message =
    '已归档「' +
    s.name +
    '」。' +
    (d.sampled.length === zone.sites.length
      ? '本区资料齐全，可导航返回泊位。'
      : s.signal + '已写入观测档案。');
}

/** Advance in bounded steps; switching back to a dormant tab never spends minutes of battery. */
export function step(c, delta, input = {}) {
  const d = c.active;
  if (!d || !Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(0.4, delta);
  const count = Math.ceil(dt / 0.05);
  const zone = getZone(d.zoneId);
  for (let i = 0; i < count; i++) tick(c, d, zone, dt / count, input || {});
}

export function getView(c) {
  const d = c.active;
  if (!d) return null;
  const zone = getZone(d.zoneId),
    nearest = near(d, zone),
    remaining = available(d, zone);
  const sites = zone.sites.map((s) => ({
    ...s,
    revealed: d.revealed.includes(s.id),
    sampled: d.sampled.includes(s.id),
    distance: dist(d.vehicle, s),
  }));
  const dockDistance = dist(d.vehicle, dock);
  let objective;
  if (d.scan) objective = '保持稳定，完成' + zone.sites.find((s) => s.id === d.scan.id).method;
  else if (!remaining.length)
    objective = dockDistance <= 13 ? '在泊位交付本航次记录' : '资料齐全，返回起始泊位';
  else if (nearest) objective = '近距采样：' + nearest.name;
  else if (d.route) objective = '前往' + d.route.label;
  else if (remaining.some((s) => d.revealed.includes(s.id)))
    objective = '靠近已定位的回波，在 14 米内采样';
  else objective = d.pings ? '前往待勘测扇区，再次发射声呐' : '发射声呐，定位周围的观测目标';
  return {
    zone: zone.id,
    vehicle: { ...d.vehicle },
    elapsed: d.elapsed,
    speed: d.speed,
    depth: zone.depth - floorHeight(zone.id, d.vehicle.x, d.vehicle.z) - d.vehicle.altitude,
    battery: d.battery,
    distance: d.distance,
    pings: d.pings,
    recoveries: d.recoveries,
    ping: d.ping,
    pingCooldown: d.pingCooldown,
    lights: d.lights,
    sites,
    scan: d.scan ? { ...d.scan } : null,
    nearby: nearest?.id ?? null,
    route: d.route ? { ...d.route } : null,
    canDock: !remaining.length && dockDistance <= 13,
    dockDistance,
    samples: d.sampled.length,
    total: zone.sites.length,
    objective,
    message: d.message,
    sonarRadius: zone.sonarRadius,
  };
}
