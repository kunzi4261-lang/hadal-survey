import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReplay, frameAt } from '../src/replay.mjs';
import { getZone, floorHeight } from '../src/core/world.mjs';
import { newCampaign, startDive, act, step, loadCampaign, saveCampaign } from '../src/core/session.mjs';

const zone = getZone('shelf');
const close = (value, target) => assert.ok(Math.abs(value - target) < 0.00001, value + ' ≠ ' + target);

test('timestamps retain long stationary samples and couple depth to the simulated terrain', () => {
  const id = zone.sites[0].id;
  const track = prepareReplay(zone, {
    elapsed: 30,
    trail: [
      { x: 0, z: 0, t: 0, altitude: 6 },
      { x: 8, z: 32, t: 4, altitude: 8 },
      { x: 8, z: 32, t: 18, altitude: 4, sample: id },
      { x: 0, z: 0, t: 30, altitude: 5 },
    ],
  });
  assert.equal(track.recorded, true);
  assert.equal(track.events[0].exact, true);
  assert.equal(track.events[0].time, 18);
  const f = frameAt(track, 11);
  close(f.x, 8);
  close(f.z, 32);
  close(f.altitude, 6);
  close(f.depth, zone.depth - floorHeight(zone.id, 8, 32) - 6);
  close(frameAt(track, -20).time, 0);
  close(frameAt(track, 31).time, 30);
});

test('legacy XY tracks estimate time by distance and label site links as closest passes', () => {
  const track = prepareReplay(zone, {
    elapsed: 50,
    trail: [
      { x: 0, z: 0 },
      { x: 0, z: 10 },
      { x: 0, z: 50 },
    ],
  });
  assert.equal(track.recorded, false);
  close(track.points[1].t, 10);
  close(track.events[0].time, 32);
  assert.equal(track.events[0].exact, false);
  const frame = frameAt(track, 23);
  close(frame.z, 23);
  assert.equal(frame.depth, null);
  close(frame.bed, zone.depth - floorHeight(zone.id, 0, 23));
});

test('a checkpoint resumed from an old version keeps later real times and altitude fixes', () => {
  const c = newCampaign();
  startDive(c, zone.id);
  const legacy = JSON.parse(saveCampaign(c));
  legacy.active.trail = [
    { x: 0, z: 0 },
    { x: 0, z: 4 },
  ];
  legacy.active.vehicle.z = 4;
  legacy.active.elapsed = 12;
  const restored = loadCampaign(legacy);
  step(restored, 0.2, { lift: 1 });
  const track = prepareReplay(zone, restored.active);
  assert.equal(track.recorded, false);
  assert.equal(track.points[0].altitude, null);
  assert.ok(track.points[2].t >= 12);
  assert.ok(frameAt(track, 12.12).altitude > 6);
});

test('a recovery jumps instantly to the dock and contributes no underwater track distance', () => {
  const track = prepareReplay(zone, {
    elapsed: 25,
    trail: [
      { x: 0, z: 0, t: 0 },
      { x: 30, z: 40, t: 10 },
      { x: 0, z: 0, t: 10, recovery: true },
      { x: -12, z: 0, t: 25 },
    ],
  });
  assert.ok(frameAt(track, 9.999).z > 39.9);
  close(frameAt(track, 10).x, 0);
  close(frameAt(track, 10).z, 0);
  close(track.points.at(-1).travel, 62);
});

test('new real fixes, sample events and cable recoveries survive serialization and decimation', () => {
  const c = newCampaign();
  startDive(c, zone.id);
  const site = zone.sites[0];
  assert.ok(act(c, 'ping').ok);
  assert.ok(act(c, 'navigate', site.id).ok);
  for (let i = 0; i < 400 && c.active.route; i++) step(c, 0.1);
  assert.ok(act(c, 'scan', site.id).ok);
  for (let i = 0; i < 60 && c.active.scan; i++) step(c, 0.1);
  const sampled = c.active.trail.find((p) => p.sample === site.id);
  assert.ok(sampled && Number.isFinite(sampled.t));
  act(c, 'recall');
  for (let i = 0; i < 2000; i++) step(c, 0.2, { forward: 1, turn: 0.25 });
  const trail = c.active.trail;
  assert.ok(trail.length <= 360);
  assert.ok(trail.includes(sampled));
  assert.ok(trail.some((p) => p.recovery));
  assert.ok(trail.every((p, i) => Number.isFinite(p.altitude) && (!i || p.t >= trail[i - 1].t)));
  assert.deepEqual(loadCampaign(saveCampaign(c)).active.trail, trail);
});

test('single-point and empty histories remain stationary', () => {
  const empty = prepareReplay(zone, { elapsed: 0, trail: [] });
  assert.equal(empty.hasRoute, false);
  assert.equal(frameAt(empty, 4).time, 0);
  const one = prepareReplay(zone, { elapsed: 8, trail: [{ x: 3, z: -2 }] });
  close(frameAt(one, 6).x, 3);
  close(frameAt(one, 6).z, -2);
});
