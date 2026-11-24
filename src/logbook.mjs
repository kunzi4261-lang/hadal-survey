import { loadCampaign, newCampaign, saveCampaign } from './core/session.mjs';
import { ZONES, getZone } from './core/world.mjs';

export const BOOK_KEY = 'hadal-survey.book.v1',
  PHOTO_KEY = 'hadal-survey.photos.v1';
const MAX_PHOTOS = 12,
  MAX_IMAGE = 390000;
export function validPhoto(p) {
  return (
    p &&
    typeof p.dataUrl === 'string' &&
    p.dataUrl.length < MAX_IMAGE &&
    /^data:image\/jpeg;base64,[a-zA-Z0-9+/]+=*$/u.test(p.dataUrl) &&
    getZone(p.zone) &&
    typeof p.caption === 'string' &&
    Number.isFinite(p.depth)
  );
}
function photosFrom(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(validPhoto)
    .slice(-MAX_PHOTOS)
    .map((p) => ({
      dataUrl: p.dataUrl,
      zone: p.zone,
      caption: p.caption.slice(0, 140),
      depth: Math.round(p.depth),
    }));
}
function fromParts(data = {}, photos = [], reduced = false) {
  const campaign = loadCampaign(data.campaign || newCampaign());
  const solvedIds = Array.isArray(data.solved) ? data.solved : [];
  const solved = ZONES.filter((z) => campaign.completed[z.id] && solvedIds.includes(z.id)).map(
    (z) => z.id,
  );
  return {
    campaign,
    solved,
    photos: photosFrom(photos),
    settings: {
      sound: data.settings?.sound !== false,
      reducedMotion:
        typeof data.settings?.reducedMotion === 'boolean' ? data.settings.reducedMotion : reduced,
    },
  };
}
export function readState(storage, reduced) {
  let main = {},
    photos = [];
  try {
    main = JSON.parse(storage?.getItem(BOOK_KEY) || '{}') || {};
  } catch {}
  try {
    photos = JSON.parse(storage?.getItem(PHOTO_KEY) || '[]');
  } catch {}
  return fromParts(main, photos, reduced);
}
export function saveState(book, storage) {
  try {
    storage.setItem(
      BOOK_KEY,
      JSON.stringify({
        campaign: JSON.parse(saveCampaign(book.campaign)),
        solved: book.solved,
        settings: book.settings,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function savePhotos(book, storage) {
  try {
    storage.setItem(PHOTO_KEY, JSON.stringify(book.photos));
    return true;
  } catch {
    return false;
  }
}
export function addPhoto(book, photo, storage) {
  if (!validPhoto(photo)) return { ok: false, message: '照片未保存，请再试一次。' };
  if (book.photos.length >= MAX_PHOTOS)
    return { ok: false, message: '相册已满。请先在科考档案中导出并移除一张照片。' };
  book.photos.push(photosFrom([photo])[0]);
  if (!savePhotos(book, storage)) {
    book.photos.pop();
    return { ok: false, message: '本机空间不足，照片未保存。请先导出已有照片。' };
  }
  return { ok: true, message: '已存入科考相册。' };
}
export function encodeBackup(book) {
  return JSON.stringify(
    {
      format: 'hadal-survey',
      schema: 1,
      campaign: JSON.parse(saveCampaign(book.campaign)),
      photos: book.photos,
      solved: book.solved,
      settings: book.settings,
    },
    null,
    2,
  );
}
export function decodeBackup(text) {
  if (typeof text !== 'string' || text.length > 5200000) throw Error('文件过大。');
  const data = JSON.parse(text);
  if (
    !data ||
    data.format !== 'hadal-survey' ||
    data.schema !== 1 ||
    data.campaign?.version !== 1 ||
    !isDictionary(data.campaign.records) ||
    !isDictionary(data.campaign.completed) ||
    !Array.isArray(data.photos) ||
    data.photos.length > MAX_PHOTOS ||
    data.photos.some((p) => !validPhoto(p)) ||
    !Array.isArray(data.solved) ||
    !Number.isInteger(data.campaign.dives)
  )
    throw Error('这不是可读取的深蓝回声存档。');
  const restored = fromParts(data, data.photos);
  const campaign = restored.campaign;
  if (
    (data.campaign.active && !campaign.active) ||
    Object.keys(data.campaign.completed).some((key) => !Object.hasOwn(campaign.completed, key)) ||
    Object.keys(data.campaign.records).some((key) => !Object.hasOwn(campaign.records, key))
  ) {
    throw Error('航次记录不完整。');
  }
  return restored;
}

function isDictionary(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
