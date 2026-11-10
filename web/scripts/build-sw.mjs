// Stamp the service worker in `dist/` with what this build actually emits.
//
// `public/sw.js` is the logic; it names two placeholders, the cache version and
// the precache list. This script fills both in after `vite build`, so the
// worker always quotes the hashed asset names of the build sitting next to it:
//
//   VERSION  = 12 hex chars of sha256 over every shell file's name and bytes,
//              so any rename or any changed byte moves the cache name;
//   PRECACHE = the shell (index, engine, offline sheet, manifest, favicon)
//              plus every hashed asset under `assets/`.
//
// Both placeholders are written so the untouched file still parses: a build
// that forgets this step caches the index only, it does not break.
//
// Run: node scripts/build-sw.mjs (already part of `npm run build`).

import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const WORKER = join(DIST, 'sw.js');
const SHELL = ['index.html', 'engine.wasm', 'offline.html', 'manifest.webmanifest',
  'favicon.ico', 'icon-192.png', 'icon-512.png'];
const VERSION_LINE = /const VERSION = '[^']*';/;
const PRECACHE_LINE = /const PRECACHE = \/\* __SW_PRECACHE__ \*\/ \[[^;]*\];/;

/** Every file under `dir`, as POSIX paths relative to `dist/`. */
async function walk(dir, base = '') {
  const entries = await readdir(dir);
  const found = [];
  for (const name of entries.sort()) {
    const rel = base === '' ? name : `${base}/${name}`;
    const info = await stat(join(dir, name));
    if (info.isDirectory()) found.push(...await walk(join(dir, name), rel));
    else found.push(rel);
  }
  return found;
}

/** The files the worker should hold, in the order it should fetch them. */
async function shell(files) {
  const present = new Set(files);
  const top = SHELL.filter((name) => present.has(name)).map((name) => `/${name}`);
  const assets = files
    .filter((rel) => rel.startsWith('assets/') && /\.(?:js|css|woff2?)$/.test(rel))
    .map((rel) => `/${rel}`);
  return top.concat(assets.sort());
}

/** One short hash for the whole shell: a rename or a new byte moves it. */
async function version(urls) {
  const hash = createHash('sha256');
  let bytes = 0;
  for (const url of urls) {
    const body = await readFile(join(DIST, url.slice(1)));
    bytes += body.length;
    hash.update(`${url} ${createHash('sha256').update(body).digest('hex')}\n`);
  }
  return { tag: hash.digest('hex').slice(0, 12), bytes };
}

/** Rewrite both placeholder lines; refuse when the template has drifted. */
function stamp(source, urls, tag) {
  const precache = `const PRECACHE = /* __SW_PRECACHE__ */ ${JSON.stringify(urls, null, 2)};`;
  if (!VERSION_LINE.test(source) || !PRECACHE_LINE.test(source)) {
    throw new Error('sw.js: placeholders missing, the template changed');
  }
  return source
    .replace(VERSION_LINE, `const VERSION = '${tag}';`)
    .replace(PRECACHE_LINE, precache);
}

async function main() {
  const files = await walk(DIST).catch(() => {
    throw new Error(`no ${DIST}: run \`vite build\` first`);
  });
  if (!files.includes('index.html')) throw new Error('dist/index.html missing: run `vite build` first');
  if (!files.includes('engine.wasm')) console.log('build-sw: no engine.wasm (relay build), shell without the engine');
  const urls = await shell(files);
  const { tag, bytes } = await version(urls);
  const source = await readFile(WORKER, 'utf8');
  await writeFile(WORKER, stamp(source, urls, tag), 'utf8');
  console.log(`build-sw: ${urls.length} files, version ${tag}, ${(bytes / 1024).toFixed(0)} KiB precached`);
  for (const url of urls) console.log(`  ${url}`);
  return 0;
}

main().catch((error) => {
  console.error(`build-sw: ${error.message}`);
  process.exit(1);
});
