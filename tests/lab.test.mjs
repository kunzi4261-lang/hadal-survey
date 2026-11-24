import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeClock,
  correlationAt,
  makeProfile,
  encodeNibble,
  decodeNibble,
  syndrome,
  makeFrames,
} from '../src/lab.mjs';

test('each laboratory can replay an identical synthetic batch from its ID', () => {
  for (const generate of [makeClock, makeProfile, makeFrames]) {
    assert.deepEqual(generate(0xc001d00d), generate(0xc001d00d));
    assert.notDeepEqual(generate(0xc001d00d), generate(0x47deebf1));
  }
});

test('a sliding Pearson correlation locates the injected time delay despite noise and gain differences', () => {
  for (let i = 0; i < 120; i++) {
    const trace = makeClock(Math.imul(i, 0x9e3779b1));
    const coefficients = Array.from({ length: 33 }, (_, shift) => correlationAt(trace, shift));
    assert.ok(coefficients.every((n) => n >= -1 && n <= 1));
    assert.equal(coefficients.indexOf(Math.max(...coefficients)), trace.delay);
    assert.ok(coefficients[trace.delay] > 0.95);
  }
});

test('constant traces return a finite coefficient and illegal shifts are rejected', () => {
  const silent = { reference: Array(64).fill(1), received: Array(64).fill(2) };
  assert.equal(correlationAt(silent, 0), 0);
  for (const shift of [-1, 1.5, 33]) assert.throws(() => correlationAt(silent, shift), RangeError);
});

test('the thermal target is the maximum observed gradient over the same 8 m sampling window', () => {
  for (let i = 0; i < 120; i++) {
    const { peak, gradient, temperatures } = makeProfile(Math.imul(i, 0x9e3779b1));
    const interior = temperatures
      .slice(2, -2)
      .map((_, j) => Math.abs(temperatures[j + 4] - temperatures[j]) / 8);
    assert.equal(peak, interior.indexOf(Math.max(...interior)) + 2);
    assert.equal(gradient[peak], interior[peak - 2]);
    assert.ok(peak > 2 && peak < temperatures.length - 3);
  }
});

test('all 112 single-bit corruptions can be located and restore their original nibble', () => {
  for (let data = 0; data < 16; data++) {
    const valid = encodeNibble(data);
    assert.equal(syndrome(valid), 0);
    assert.equal(decodeNibble(valid), data);
    for (let pos = 1; pos <= 7; pos++) {
      const broken = valid ^ (1 << (pos - 1));
      assert.equal(syndrome(broken), pos);
      const repaired = broken ^ (1 << (syndrome(broken) - 1));
      assert.equal(decodeNibble(repaired), data);
    }
  }
});

test('each incoming frame has exactly one flipped bit and a unique valid repair', () => {
  for (let i = 0; i < 90; i++) {
    const batch = makeFrames(Math.imul(i, 0x9e3779b1));
    assert.equal(batch.length, 3);
    for (const word of batch) {
      const fixes = Array.from({ length: 7 }, (_, p) => word ^ (1 << p)).filter(
        (w) => syndrome(w) === 0,
      );
      assert.notEqual(syndrome(word), 0);
      assert.equal(fixes.length, 1);
      assert.equal(encodeNibble(decodeNibble(fixes[0])), fixes[0]);
    }
  }
});
