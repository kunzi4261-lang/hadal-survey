import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPortable } from './portable.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
const files = ['index.html', 'manifest.webmanifest'];
async function collect(dir) {
  for (const item of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + '/' + item.name;
    if (item.isDirectory()) await collect(rel);
    else if (item.isFile()) files.push(rel);
  }
}
await collect('assets');
await collect('src');
files.sort();
const digest = createHash('sha256');
for (const name of files) {
  let bytes = await readFile(path.join(root, name));
  if (name === 'index.html')
    bytes = Buffer.from(
      bytes.toString().replace('<head>', '<head>\n  <meta name="hadal-offline" content="enabled">'),
    );
  digest.update(name + '\0').update(bytes);
  const target = path.join(out, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
await buildPortable();
const portable = 'hadal-survey.html';
files.push(portable);
digest.update(portable + '\0').update(await readFile(path.join(out, portable)));
const worker = await readFile(new URL('./worker.template.js', import.meta.url), 'utf8');
const version = digest.update(worker).digest('hex').slice(0, 16);
await writeFile(
  path.join(out, 'sw.js'),
  worker.replace('__HADAL_BUILD__', version).replace('/* ASSET_TABLE */ []', JSON.stringify(files)),
);
console.log('Built ' + files.length + ' offline assets · ' + version);
