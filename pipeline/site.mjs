// Stage 5: assemble the deployable static site in dist/:
//   site/ sources, data/ (gazetteer, boundaries, schema, qa), vendored libs,
//   and the static JSON API under api/v1/ generated from the gazetteer.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, DIST, ROOT } from './lib/paths.mjs';

rmSync(DIST, { recursive: true, force: true });
cpSync(join(ROOT, 'site'), DIST, { recursive: true });
cpSync(DATA, join(DIST, 'data'), { recursive: true });

mkdirSync(join(DIST, 'vendor'), { recursive: true });
for (const f of ['d3-array/dist/d3-array.min.js', 'd3-geo/dist/d3-geo.min.js', 'topojson-client/dist/topojson-client.min.js']) {
  cpSync(join(ROOT, 'node_modules', f), join(DIST, 'vendor', f.split('/').pop()));
}

// ---- Static API -------------------------------------------------------------
const list = readFileSync(join(DATA, 'gazetteer/units.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const units = new Map(list.map((u) => [u.pcode, u]));
const children = new Map();
for (const u of list) {
  if (!u.parent_pcode) continue;
  if (!children.has(u.parent_pcode)) children.set(u.parent_pcode, []);
  children.get(u.parent_pcode).push(u.pcode);
}
const ref = (p) => { const u = units.get(p); return { pcode: u.pcode, level: u.level, kind: u.kind, name_en: u.name_en, name_bn: u.name_bn }; };

const API = join(DIST, 'api/v1');
mkdirSync(join(API, 'units'), { recursive: true });
for (const u of list) {
  writeFileSync(join(API, 'units', `${u.pcode}.json`), JSON.stringify({
    ...u,
    boundary: `/data/${u.boundary}`,
    ancestors: u.ancestry.map(ref),
    children: (children.get(u.pcode) ?? []).map(ref),
  }));
}

writeFileSync(join(API, 'search.json'), JSON.stringify({
  fields: ['pcode', 'level', 'kind', 'name_en', 'name_bn', 'parent_pcode', 'lon', 'lat'],
  rows: list.map((u) => [u.pcode, u.level, u.kind, u.name_en, u.name_bn, u.parent_pcode, ...u.label_point]),
}));

const manifest = JSON.parse(readFileSync(join(ROOT, 'sources/manifest.json'), 'utf8'));
const qa = JSON.parse(readFileSync(join(DATA, 'qa/report.json'), 'utf8'));
writeFileSync(join(API, 'index.json'), JSON.stringify({
  name: 'Bangladesh administrative units',
  levels: { 1: 'division', 2: 'district', 3: 'upazila / city corporation', 4: 'union / paurashava / ward' },
  counts: qa.counts,
  by_kind: qa.by_kind,
  endpoints: {
    unit: '/api/v1/units/{pcode}.json',
    search: '/api/v1/search.json',
    gazetteer_csv: '/data/gazetteer/units.csv',
    gazetteer_jsonl: '/data/gazetteer/units.jsonl',
    national_boundaries: '/data/boundaries/national.topo.json',
    district_boundaries: '/data/boundaries/districts/{district_pcode}.topo.json',
    schemas: '/data/schema/',
    qa_report: '/data/qa/report.json',
  },
  divisions: list.filter((u) => u.level === 1).map((u) => ref(u.pcode)),
  sources: manifest.sources.map(({ id, title, publisher, page, license, valid_on }) => ({ id, title, publisher, page, license, valid_on })),
}, null, 2));

console.log(`dist/ built: ${list.length} unit endpoints`);
