import test from 'node:test';
import assert from 'node:assert/strict';
import { floorHeight, ZONES } from '../src/core/world.mjs';
import { cameraFor } from '../src/render/scene.mjs';
import { buildReef } from '../src/render/reef.mjs';
import { populate } from '../src/render/life.mjs';

test('camera altitude, handedness and heading match the dive controls', () => {
  const v = { x: 8, z: 37, heading: 0, pitch: 0, altitude: 4 };
  const north = cameraFor('shelf', v, 1000, 500);
  assert.deepEqual(north.eye, [v.x, floorHeight('shelf', v.x, v.z) + 4, v.z]);
  assert.deepEqual(north.forward, [0, 0, 1]);
  const east = cameraFor('shelf', { ...v, heading: Math.PI / 2, pitch: 0.23 }, 500, 800);
  assert.ok(east.forward[0] > 0.95 && east.forward[1] > 0 && Math.abs(east.forward[2]) < 1e-12);
  const dot = east.up.reduce((sum, x, i) => sum + x * east.forward[i], 0);
  assert.ok(Math.abs(dot) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...east.right) - 1) < 1e-12);
});

test('every expedition can be drawn with the lightweight fallback and authored landmarks', () => {
  for (const zone of ZONES) {
    const vertices = buildReef(zone.id, zone.sites, true);
    assert.ok(vertices.length > 3000);
    assert.equal(vertices.length % 30, 0);
    assert.ok(vertices.every(Number.isFinite));
    const animals = populate(zone.id, zone.sites);
    assert.equal(animals.fish.length % 33, 0);
    assert.equal(animals.motes.length % 6, 0);
    assert.ok(animals.shoal.length > 0);
    assert.ok(animals.fish.every(Number.isFinite));
  }
});
