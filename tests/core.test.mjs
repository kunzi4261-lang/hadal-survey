import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, floorHeight, getZone } from '../src/core/world.mjs';
import {
  newCampaign,
  startDive,
  getView,
  act,
  step,
  saveCampaign,
  loadCampaign,
  isUnlocked,
  exportReport,
} from '../src/core/session.mjs';

function waitUntil(c, condition, label, limit = 1000) {
  for (let i = 0; i < limit; i++) {
    if (condition()) return;
    step(c, 0.1);
  }
  assert.fail(label + ' timed out: ' + JSON.stringify(getView(c)));
}

function doAction(c, type, arg) {
  const response = act(c, type, arg);
  assert.equal(response.ok, true, type + ': ' + response.message);
}

function reach(c, arg) {
  doAction(c, 'navigate', arg);
  waitUntil(c, () => !getView(c).route, 'navigation to ' + arg);
}

function takeSample(c, id) {
  if (!getView(c).sites.find((s) => s.id === id).revealed) {
    reach(c, id);
    waitUntil(c, () => !getView(c).pingCooldown, 'sonar reset');
    doAction(c, 'ping');
  }
  reach(c, id);
  doAction(c, 'scan', id);
  waitUntil(c, () => !getView(c).scan, 'sampling');
  assert.ok(c.records[id]);
}

test('a player can complete every chapter using only navigation, sonar, sampling and docking', () => {
  let c = newCampaign();
  assert.equal(startDive(c, 'vent'), false);
  for (const zone of ZONES) {
    assert.equal(isUnlocked(c, zone.id), true);
    assert.equal(startDive(c, zone.id), true);
    assert.equal(act(c, 'dock').ok, false);
    doAction(c, 'ping');
    assert.ok(getView(c).sites[0].revealed);
    for (const [index, s] of zone.sites.entries()) {
      takeSample(c, s.id);
      if (index === 0) {
        const checkpoint = loadCampaign(saveCampaign(c));
        assert.equal(checkpoint.active.sampled[0], s.id);
        assert.equal(checkpoint.active.vehicle.x, c.active.vehicle.x);
        c = checkpoint;
      }
    }
    assert.equal(act(c, 'dock').ok, false, 'samples must be returned to the dock');
    reach(c, 'dock');
    assert.ok(getView(c).canDock);
    doAction(c, 'dock');
    const report = c.completed[zone.id];
    assert.ok(report.elapsed > 0 && report.distance > 100 && report.pings > 0);
    assert.ok(report.trail.length > 20 && report.trail.length <= 360);
    assert.equal(report.items.length, 3);
    assert.equal(report.grade, 'S');
    assert.equal(report.recoveries, 0);
    assert.equal(getView(c), null);
    const exported = JSON.parse(exportReport(c, zone.id));
    assert.equal(exported.records.length, 3);
    assert.equal(exported.mission, zone.code);
  }
  assert.equal(Object.keys(c.records).length, 9);
  const restored = loadCampaign(saveCampaign(c));
  assert.deepEqual(restored.completed, c.completed);
  assert.deepEqual(restored.records, c.records);
  assert.equal(startDive(restored, 'shelf'), true);
  assert.deepEqual(restored.active.sampled, [], 'a new dive must sample its own observations');
  assert.equal(restored.dives, 4);
});

test('sonar only reveals contacts in range, rejects immediate reuse, and charges the battery', () => {
  const c = newCampaign();
  startDive(c, 'shelf');
  assert.ok(getView(c).sites.every((s) => !s.revealed));
  doAction(c, 'ping');
  assert.deepEqual(
    getView(c).sites.map((s) => s.revealed),
    [true, false, false],
  );
  assert.equal(act(c, 'ping').ok, false);
  assert.equal(c.active.pings, 1);
  assert.ok(c.active.battery < 100);
  waitUntil(c, () => !getView(c).pingCooldown, 'sonar reset');
  doAction(c, 'ping');
  assert.deepEqual(c.active.revealed, ['shelf-coral']);
});

test('a manual order takes over a route, sampling requires both proximity and time', () => {
  const c = newCampaign();
  startDive(c, 'shelf');
  assert.equal(act(c, 'scan', 'shelf-coral').ok, false);
  doAction(c, 'ping');
  assert.equal(act(c, 'scan', 'shelf-coral').ok, false);
  doAction(c, 'navigate', 'next');
  step(c, 0.2, { turn: 1 });
  assert.equal(getView(c).route, null);
  reach(c, 'shelf-coral');
  doAction(c, 'scan');
  step(c, 0.25);
  assert.ok(getView(c).scan.progress > 0 && getView(c).scan.progress < 1);
  // Move away deliberately. It should interrupt the exposure rather than award a record.
  for (let i = 0; i < 8; i++) step(c, 0.25, { forward: -1 });
  assert.equal(getView(c).scan, null);
  assert.equal(Object.keys(c.records).length, 0);
  takeSample(c, 'shelf-coral');
  assert.equal(act(c, 'scan', 'shelf-coral').ok, false);
});

test('empty battery triggers safe recovery and preserves samples without completing the chapter', () => {
  const c = newCampaign();
  startDive(c, 'shelf');
  doAction(c, 'ping');
  takeSample(c, 'shelf-coral');
  c.active.battery = 0.00001;
  step(c, 0.05);
  assert.equal(c.active.recoveries, 1);
  assert.equal(getView(c).dockDistance, 0);
  assert.equal(getView(c).samples, 1);
  assert.equal(act(c, 'dock').ok, false);
  assert.ok(getView(c).battery > 99);
  doAction(c, 'abort');
  assert.ok(c.records['shelf-coral']);
  assert.equal(isUnlocked(c, 'vent'), false);
});

test('boundary, time spikes and malformed input leave the vehicle and trail finite', () => {
  const c = newCampaign();
  startDive(c, 'shelf');
  assert.equal(act(c, 'navigate', { x: 300, z: 0 }).ok, false);
  assert.equal(act(c, 'navigate', { x: NaN, z: 0 }).ok, false);
  step(c, 600, { forward: Infinity, lift: NaN });
  assert.ok(c.active.elapsed < 0.41);
  for (let i = 0; i < 6500; i++) step(c, 0.1, { forward: 1, turn: 0.04, lift: 1 });
  assert.ok(Math.hypot(c.active.vehicle.x, c.active.vehicle.z) <= 230.00001);
  assert.equal(c.active.vehicle.altitude, 32);
  assert.ok(c.active.trail.length <= 360);
  assert.ok(Number.isFinite(getView(c).depth));
  assert.ok(c.active.distance > 1000);
});

test('corrupt saves fail closed and stored text never replaces authored field notes', () => {
  for (const bad of ['{', '{"version":2}', null, [], 'x'.repeat(1_000_001)]) {
    assert.deepEqual(loadCampaign(bad), newCampaign());
  }
  const c = newCampaign();
  startDive(c, 'shelf');
  doAction(c, 'ping');
  takeSample(c, 'shelf-coral');
  let raw = JSON.parse(saveCampaign(c));
  raw.records['shelf-coral'].description = '<untrusted>';
  raw.active.revealed.push('nonexistent');
  raw.active.sampled.push('nonexistent');
  raw.active.vehicle.altitude = 9999;
  raw.active.route = { x: -22, z: 14, label: 'untrusted' };
  const fixed = loadCampaign(raw);
  assert.equal(fixed.records['shelf-coral'].description, getZone('shelf').sites[0].description);
  assert.deepEqual(fixed.active.revealed, ['shelf-coral']);
  assert.equal(fixed.active.vehicle.altitude, 32);
  assert.equal(fixed.active.route, null);
  raw = JSON.parse(saveCampaign(c));
  raw.active.zoneId = 'trench';
  assert.equal(loadCampaign(raw).active, null, 'locked zone cannot be resumed');
  assert.equal(exportReport(c, 'shelf'), null);
  assert.ok(
    ZONES.every((z) => Number.isFinite(floorHeight(z.id, 229, -180)) && z.answers[z.correctIndex]),
  );
});
