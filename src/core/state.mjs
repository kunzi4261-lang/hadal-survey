import { ZONES, getZone, floorHeight } from './world.mjs';

export const BOUNDS = 230;
export const MAX_TRAIL = 360;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, lo, hi, fallback = lo) => (Number.isFinite(n) ? clamp(n, lo, hi) : fallback);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointOK = (point) =>
  object(point) &&
  Number.isFinite(point.x) &&
  Number.isFinite(point.z) &&
  Math.hypot(point.x, point.z) <= BOUNDS + 0.05;
const iso = (s, fallback = '1970-01-01T00:00:00.000Z') =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s))
    ? new Date(s).toISOString()
    : fallback;
const counter = (n) => Math.floor(finite(n, 0, 10_000_000));

export function newCampaign() {
  return { version: 1, active: null, completed: {}, records: {}, dives: 0 };
}

export function isUnlocked(campaign, zoneId) {
  const index = ZONES.findIndex((zone) => zone.id === zoneId);
  return index === 0 || (index > 0 && Boolean(campaign.completed[ZONES[index - 1].id]));
}

export function createDive(zone, diveNumber) {
  return {
    zoneId: zone.id,
    diveNumber,
    elapsed: 0,
    distance: 0,
    speed: 0,
    vehicle: { x: 0, z: 0, heading: 0, altitude: 6, pitch: -0.05 },
    battery: 100,
    lights: true,
    ping: -1,
    pingCooldown: 0,
    pings: 0,
    recoveries: 0,
    revealed: [],
    sampled: [],
    route: null,
    scan: null,
    vx: 0,
    vz: 0,
    trail: [{ x: 0, z: 0, t: 0, altitude: 6 }],
    message: '已离开泊位。发出第一次声呐脉冲，寻找前方的回波。',
  };
}

export function makeRecord(zone, site, time) {
  return {
    id: site.id,
    zoneId: zone.id,
    kind: site.kind,
    name: site.name,
    description: site.description,
    x: site.x,
    z: site.z,
    depth: Math.round(zone.depth - floorHeight(zone.id, site.x, site.z)),
    method: site.method,
    signal: site.signal,
    recordedAt: time,
  };
}

function cleanTrail(points, zone, elapsed) {
  if (!Array.isArray(points)) return [{ x: 0, z: 0 }];
  let lastTime = 0;
  const trail = points
    .slice(-MAX_TRAIL)
    .filter(pointOK)
    .map((point) => {
      const clean = { x: point.x, z: point.z };
      if (Number.isFinite(point.t) && point.t >= lastTime && point.t <= elapsed + 0.05) {
        clean.t = point.t;
        lastTime = point.t;
      }
      if (Number.isFinite(point.altitude)) clean.altitude = clamp(point.altitude, 2, 32);
      if (zone.sites.some((site) => site.id === point.sample)) clean.sample = point.sample;
      if (point.recovery === true) clean.recovery = true;
      return clean;
    });
  return trail.length ? trail : [{ x: 0, z: 0 }];
}

function restoreReport(raw, zone) {
  if (
    !object(raw) ||
    raw.zoneId !== zone.id ||
    !['S', 'A', 'B', 'C'].includes(raw.grade) ||
    !Array.isArray(raw.items) ||
    !zone.sites.every((s) => raw.items.includes(s.id))
  )
    return null;
  return {
    zoneId: zone.id,
    grade: raw.grade,
    score: finite(raw.score, 0, 100),
    elapsed: finite(raw.elapsed, 0, 1e8),
    distance: finite(raw.distance, 0, 1e9),
    battery: finite(raw.battery, 0, 100, 100),
    pings: counter(raw.pings),
    recoveries: counter(raw.recoveries),
    scans: zone.sites.length,
    items: zone.sites.map((s) => s.id),
    completedAt: iso(raw.completedAt),
    diveNumber: Math.max(1, counter(raw.diveNumber)),
    trail: cleanTrail(raw.trail, zone, finite(raw.elapsed, 0, 1e8)),
    ending: zone.debrief,
  };
}

function restoreActive(raw, zone, dives) {
  if (!object(raw) || !pointOK(raw.vehicle)) return null;
  const d = createDive(zone, Math.max(1, Math.min(dives, counter(raw.diveNumber))));
  const v = raw.vehicle;
  d.vehicle = {
    x: v.x,
    z: v.z,
    heading: finite(v.heading, -Math.PI, Math.PI),
    altitude: finite(v.altitude, 2, 32, 6),
    pitch: finite(v.pitch, -0.85, 0.65, -0.05),
  };
  d.elapsed = finite(raw.elapsed, 0, 1e8);
  d.distance = finite(raw.distance, 0, 1e9);
  d.battery = finite(raw.battery, 0, 100, 100);
  d.pings = counter(raw.pings);
  d.recoveries = counter(raw.recoveries);
  d.lights = raw.lights !== false;
  d.pingCooldown = finite(raw.pingCooldown, 0, 3);
  for (const key of ['sampled', 'revealed']) {
    if (Array.isArray(raw[key]))
      d[key] = zone.sites.filter((s) => raw[key].includes(s.id)).map((s) => s.id);
  }
  d.revealed = [...new Set([...d.revealed, ...d.sampled])];
  d.trail = cleanTrail(raw.trail, zone, d.elapsed);
  // A resumed vehicle hovers at its saved position until the pilot gives a new order.
  d.message = '已恢复航次。当前位置和取样记录已载入，推进器处于悬停状态。';
  return d;
}

export function saveCampaign(campaign) {
  return JSON.stringify(campaign);
}

/** Only accept known IDs and reconstruct all public-facing text from the catalogue. */
export function loadCampaign(raw) {
  const c = newCampaign();
  let data = raw;
  if (typeof raw === 'string') {
    if (raw.length > 1_000_000) return c;
    try {
      data = JSON.parse(raw);
    } catch {
      return c;
    }
  }
  if (!object(data) || data.version !== 1) return c;
  c.dives = counter(data.dives);
  for (const zone of ZONES) {
    if (!isUnlocked(c, zone.id)) break;
    const report = restoreReport(data.completed?.[zone.id], zone);
    if (report) {
      c.completed[zone.id] = report;
      c.dives = Math.max(c.dives, report.diveNumber);
    }
    for (const s of zone.sites) {
      const record = data.records?.[s.id];
      if (report || (object(record) && record.id === s.id && record.zoneId === zone.id)) {
        c.records[s.id] = makeRecord(zone, s, iso(record?.recordedAt, report?.completedAt));
      }
    }
  }
  const active = data.active;
  const zone = getZone(active?.zoneId);
  if (zone && isUnlocked(c, zone.id)) {
    c.active = restoreActive(active, zone, c.dives);
    if (c.active) {
      c.dives = Math.max(c.dives, c.active.diveNumber);
      for (const s of zone.sites) {
        if (c.active.sampled.includes(s.id) && !c.records[s.id]) {
          c.records[s.id] = makeRecord(zone, s, iso(undefined));
        }
      }
    }
  }
  return c;
}

export function exportReport(campaign, id) {
  const zone = getZone(id),
    report = campaign.completed[id];
  if (!zone || !report) return null;
  return JSON.stringify(
    {
      schema: 'hadal-survey/report-v1',
      mission: zone.code,
      name: zone.name,
      coordinates: { origin: 'docking station', units: 'metres', x: 'east', z: 'north' },
      report,
      records: zone.sites.map((site) => campaign.records[site.id]),
    },
    null,
    2,
  );
}
