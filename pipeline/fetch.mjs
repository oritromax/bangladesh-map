// Stage 1: download every upstream source listed in sources/manifest.json into
// .cache/sources/<id>/, verify its pinned sha256, and extract the members we use.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CACHE, ROOT } from './lib/paths.mjs';

const manifest = JSON.parse(readFileSync(join(ROOT, 'sources/manifest.json'), 'utf8'));
const problems = [];

async function download(url, dest) {
  if (existsSync(dest)) return readFileSync(dest);
  console.log(`  downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

function verify(label, buf, expected) {
  const actual = createHash('sha256').update(buf).digest('hex');
  if (expected === actual) return;
  problems.push(expected
    ? `${label}: sha256 mismatch (expected ${expected}, got ${actual}). Upstream changed; review it before re-pinning.`
    : `${label}: no sha256 pinned. Downloaded file hashes to ${actual}.`);
}

for (const src of manifest.sources) {
  const dir = join(CACHE, 'sources', src.id);
  mkdirSync(dir, { recursive: true });
  console.log(`${src.id}`);
  if (src.url) {
    const dest = join(dir, src.file);
    verify(src.id, await download(src.url, dest), src.sha256);
    const missing = src.extract.filter((m) => !existsSync(join(dir, m)));
    if (missing.length) execFileSync('unzip', ['-o', '-j', '-q', dest, ...missing, '-d', dir]);
  } else {
    for (const [file, sha] of Object.entries(src.files)) {
      const dest = join(dir, file.split('/').pop());
      verify(`${src.id}/${file}`, await download(src.base_url + file, dest), sha);
    }
  }
}

if (problems.length) {
  console.error('\nSource verification failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('All sources present and verified.');
