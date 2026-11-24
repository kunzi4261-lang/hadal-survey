import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readState,
  saveState,
  addPhoto,
  decodeBackup,
  encodeBackup,
  PHOTO_KEY,
} from '../src/logbook.mjs';
import { startDive } from '../src/core/session.mjs';

const photo = {
  zone: 'shelf',
  caption: '珊瑚光标',
  depth: 184,
  dataUrl: 'data:image/jpeg;base64,/9j/2Q==',
};
function memory() {
  const files = new Map();
  return {
    getItem: (key) => files.get(key) ?? null,
    setItem: (key, value) => files.set(key, value),
  };
}

test('campaigns, local photos and preferences round-trip through a portable backup', () => {
  const storage = memory();
  const book = readState(storage, true);
  startDive(book.campaign, 'shelf');
  book.settings.sound = false;
  assert.equal(addPhoto(book, photo, storage).ok, true);
  assert.ok(saveState(book, storage));
  const restored = decodeBackup(encodeBackup(book));
  assert.equal(restored.campaign.active.zoneId, 'shelf');
  assert.deepEqual(restored.photos, [photo]);
  assert.deepEqual(readState(storage, false).settings, { sound: false, reducedMotion: true });
});

test('a full album or failed photo write leaves the existing photographs intact', () => {
  const storage = memory();
  const book = readState(storage);
  const closed = {
    setItem() {
      throw Error('storage is full');
    },
  };
  assert.equal(addPhoto(book, photo, closed).ok, false);
  assert.deepEqual(book.photos, []);
  for (let n = 0; n < 12; n++) assert.equal(addPhoto(book, { ...photo, depth: n }, storage).ok, true);
  assert.equal(addPhoto(book, photo, storage).ok, false);
  assert.equal(JSON.parse(storage.getItem(PHOTO_KEY)).length, 12);
  assert.equal(book.photos[0].depth, 0);
});

test('restoring rejects unsupported versions, oversized documents and non-JPEG photo URLs', () => {
  const raw = JSON.parse(encodeBackup(readState(memory())));
  assert.throws(() => decodeBackup(JSON.stringify({ ...raw, schema: 10 })));
  assert.throws(() =>
    decodeBackup(JSON.stringify({ ...raw, campaign: { ...raw.campaign, records: [] } })),
  );
  assert.throws(() =>
    decodeBackup(JSON.stringify({ ...raw, campaign: { ...raw.campaign, completed: { shelf: {} } } })),
  );
  assert.throws(() => decodeBackup(' '.repeat(5_200_001)));
  assert.throws(() =>
    decodeBackup(
      JSON.stringify({ ...raw, photos: [{ ...photo, dataUrl: 'https://example.org/image' }] }),
    ),
  );
});
