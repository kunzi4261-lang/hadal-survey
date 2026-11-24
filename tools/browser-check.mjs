import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Playwright is used only for browser QA. The deployed game has no dependencies.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const scope = '/hadal-survey/';
const types = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

async function serveBuild() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(scope)) throw Error('outside the game');
      const name = path.resolve(dist, pathname.slice(scope.length) || 'index.html');
      if (path.relative(dist, name).startsWith('..')) throw Error('outside the build');
      const bytes = await readFile(name);
      response.writeHead(200, { 'Content-Type': types[path.extname(name)] }).end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { url: 'http://127.0.0.1:' + server.address().port + scope, server };
}

const local = process.env.HADAL_BASE_URL ? null : await serveBuild();
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }),
    args: ['--disable-background-networking', '--disable-webgl'],
  });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = local?.url || process.env.HADAL_BASE_URL;
    await page.goto(url);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 45_000 });
    assert.equal(await page.locator('.zone-card').count(), 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: /进入实验台/ }).click();
    await page.locator('#sheet-body input, #sheet-body canvas').first().waitFor();
    await page.locator('#sheet-close').click();
    await page.locator('#hero-launch').click();
    await page.locator('.hs-sea').waitFor();
    const action = (name) =>
      page
        .locator('[data-do="' + name + '"]:visible')
        .first()
        .click();
    await action('ping');
    await action('photo');
    await action('pause');
    await action('exit');
    assert.match(await page.locator('#hero-launch').textContent(), /继续潜航/);
    await page.locator('#journal-open').click();
    await page.getByRole('button', { name: /照片 1\/12/ }).click();
    const image = page.locator('.photos img');
    await image.waitFor();
    assert.ok(await image.evaluate((el) => el.decode().then(() => el.naturalWidth > 100)));
    await page.locator('#sheet-close').click();
    await page.reload();
    assert.match(await page.locator('#hero-launch').textContent(), /继续潜航/);
    await page.locator('#settings-open').click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出备份' }).click();
    const backup = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
    assert.equal(backup.campaign.active.zoneId, 'shelf');
    assert.equal(backup.photos.length, 1);
    assert.deepEqual(errors, []);
    console.log(width + 'px · offline reload, lab, sonar, photo, resume and backup passed');
    await context.close();
  }
} finally {
  await browser?.close();
  if (local) await new Promise((resolve) => local.server.close(resolve));
}
