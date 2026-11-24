import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const localPath = path.posix;
const mime = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };

function assetUrl(filename) {
  const type = mime[localPath.extname(filename)];
  if (!type) throw new Error('Unsupported embedded asset: ' + filename);
  return 'data:' + type + ';base64,' + readFileSync(path.join(root, filename)).toString('base64');
}

function localFile(owner, reference) {
  if (/^(?:[\w+.-]+:|[\\/])/.test(reference)) throw new Error('Expected a relative file: ' + reference);
  const filename = localPath.normalize(localPath.join(localPath.dirname(owner), reference));
  if (filename.startsWith('../')) throw new Error('Reference outside project: ' + reference);
  return filename;
}

function embedStyles(filename) {
  const css = readFileSync(path.join(root, filename), 'utf8');
  return css.replace(
    /url\(\s*(?:(['"])(.*?)\1|([^'")\s]+))\s*\)/gi,
    (whole, quote, quoted, unquoted) => {
      const url = quoted ?? unquoted;
      if (url.startsWith('data:') || url.startsWith('#')) return whole;
      return 'url("' + assetUrl(localFile(filename, url)) + '")';
    },
  );
}

function embedModules(entry) {
  const imports = {};
  // Our ES modules use literal paths in import, export-from and import() declarations.
  // Bare keys let data-URL modules share a single instance, even across dynamic imports.
  function include(filename) {
    const key = 'hadal/' + filename;
    if (Object.hasOwn(imports, key)) return key;
    imports[key] = null;
    const source = readFileSync(path.join(root, filename), 'utf8');
    const rewritten = source.replace(
      /(\bfrom\s+|\bimport\s*(?:\(\s*)?)(['"])([^'"\r\n]+)\2/g,
      (whole, declaration, quote, specifier) => {
        if (!/^\.\.?\/.*\.mjs$/.test(specifier))
          throw new Error('Unexpected import in ' + filename + ': ' + specifier);
        return declaration + quote + include(localFile(filename, specifier)) + quote;
      },
    );
    imports[key] = 'data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64');
    return key;
  }
  const key = include(entry);
  return (
    '<script type="importmap">' +
    JSON.stringify({ imports }) +
    '</script>\n' +
    '<script type="module">import ' +
    JSON.stringify(key) +
    ';</script>'
  );
}

// file: URLs have different download behavior across browsers. Snapshot the initial
// document before deferred app modules run, so the portable copy can save itself.
const downloadCopy = `<script>
  (() => {
    const link = document.getElementById('portable-download');
    if (!link) return;
    const html = '<!doctype html>\\n' + document.documentElement.outerHTML;
    link.addEventListener('click', () => {
      link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    }, { once: true });
  })();
</script>`;

/** Bundle the deployable source entry, independently of the hosted service-worker build. */
export function buildPortable(output = path.join(root, 'dist', 'hadal-survey.html')) {
  const source = readFileSync(path.join(root, 'index.html'), 'utf8');
  const html = source
    .replace('<head>', '<head>\n    <meta name="hadal-portable" content="enabled" />')
    .replace(/<link\b[^>]*>|<img\b[^>]*>|<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*<\/script>/gi, (tag) => {
      const attribute = (name) => tag.match(new RegExp('\\b' + name + '="([^"]+)"', 'i'))?.[1];
      if (tag.startsWith('<script')) {
        if (attribute('type') !== 'module') throw new Error('Expected a module entry in index.html');
        return embedModules(localFile('index.html', attribute('src')));
      }
      if (tag.startsWith('<img'))
        return tag.replace(attribute('src'), assetUrl(localFile('index.html', attribute('src'))));
      const rel = attribute('rel');
      if (rel === 'manifest') return '';
      const filename = localFile('index.html', attribute('href'));
      if (rel === 'stylesheet') return '<style>\n' + embedStyles(filename) + '\n</style>';
      if (rel === 'icon') return tag.replace(attribute('href'), assetUrl(filename));
      throw new Error('Unsupported link in index.html: ' + rel);
    })
    .replace(/href="(?:\.\/)?hadal-survey\.html"/g, 'href=""')
    .replace('</body>', downloadCopy + '\n</body>');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, html);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = buildPortable(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log('Built portable game: ' + output);
}
