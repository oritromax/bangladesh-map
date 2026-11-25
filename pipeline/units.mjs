// Stage 3: build the gazetteer (one record per administrative unit) from the
// normalised geometry properties plus Bangla names, and write a QA report.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BUILD, DATA, src } from './lib/paths.mjs';
import { parseCsv, toCsv } from './lib/csv.mjs';

const props = (n) => JSON.parse(readFileSync(`${BUILD}/geo/adm${n}.geojson`, 'utf8')).features.map((f) => f.properties);
const csv = (file) => parseCsv(readFileSync(src('bd-geocode', file), 'utf8')).filter((r) => r.length > 1);

const SOURCES = {
  'cod-ab-v03': { valid_on: '2023-05-21' },
  'cod-ab-2015': { valid_on: '2020-11-13' },
};

function kindOf(level, name) {
  if (level === 1) return 'division';
  if (level === 2) return 'district';
  if (level === 3) return /City Corporation$/.test(name) ? 'city_corporation' : 'upazila';
  if (/Paurashava/.test(name)) return 'paurashava';
  if (/^Ward\b/i.test(name)) return 'ward';
  return 'union';
}

// ---- Units from geometry -------------------------------------------------
const units = new Map();
for (const n of [1, 2, 3, 4]) {
  const source = n === 4 ? 'cod-ab-2015' : 'cod-ab-v03';
  for (const p of props(n)) {
    units.set(p.pcode, {
      pcode: p.pcode,
      level: n,
      kind: kindOf(n, p.name_en),
      name_en: p.name_en,
      name_bn: null,
      parent_pcode: p.parent_pcode ?? null,
      ancestry: [],
      area_sqkm: p.area_sqkm,
      label_point: [p.lon, p.lat],
      boundary: null,
      source,
      valid_on: SOURCES[source].valid_on,
      parent_pcode_2015: p.parent_pcode_2015 ?? null,
    });
  }
}

// Districts are unchanged since 2015, so a spatial parent in another district is a
// boundary-misalignment artefact: fall back to the parent implied by the 2015 pcode.
const legacy = (p) => p.slice(0, 6) + '00' + p.slice(6);
const districtFix = [];
for (const u of units.values()) {
  if (u.level !== 4 || u.parent_pcode.slice(0, 6) === u.parent_pcode_2015.slice(0, 6)) continue;
  if (!units.has(legacy(u.parent_pcode_2015))) throw new Error(`${u.pcode}: no same-district parent`);
  districtFix.push({ pcode: u.pcode, name_en: u.name_en, spatial: u.parent_pcode, used: legacy(u.parent_pcode_2015) });
  u.parent_pcode = legacy(u.parent_pcode_2015);
}

// The 2015 release names some paurashavas just "Paurashava"; the 2011 census
// table (same pcodes) carries their full names.
const censusNames = new Map(JSON.parse(readFileSync(`${BUILD}/census/uscb-2011.json`, 'utf8')).map((r) => [r.pcode, r.name]));
const renamed = [];
for (const u of units.values()) {
  if (u.name_en !== 'Paurashava') continue;
  const full = censusNames.get(u.pcode);
  if (!full) throw new Error(`${u.pcode}: generic paurashava name with no census name`);
  renamed.push({ pcode: u.pcode, from: u.name_en, to: full });
  u.name_en = full;
}

for (const u of units.values()) {
  const chain = [];
  for (let p = u.parent_pcode; p; p = units.get(p)?.parent_pcode) chain.unshift(p);
  u.ancestry = chain;
  const district = u.level >= 3 ? chain[1] : null;
  u.boundary = u.level <= 2
    ? `boundaries/national.topo.json#${u.level === 1 ? 'divisions' : 'districts'}`
    : `boundaries/districts/${district}.topo.json#${u.level === 3 ? 'upazilas' : 'unions'}`;
}

// ---- Bangla names ---------------------------------------------------------
// bd-geocode columns differ per file; positions documented in its README.
const nameSets = [
  { file: 'divisions.csv', en: 1, bn: 2, code: 4 },
  { file: 'districts.csv', en: 2, bn: 3, code: 7 },
  { file: 'upazilas.csv', en: 2, bn: 3, code: 5 },
  { file: 'city_corporations.csv', en: 3, bn: 4, code: 6 },
];
for (const s of nameSets) {
  for (const r of csv(s.file)) {
    const u = units.get(r[s.code]);
    if (u && r[s.bn]) u.name_bn = r[s.bn];
  }
}

// Unions: by pcode, then by normalised English name within the same (current) upazila.
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '').replace(/union$/, '');
const upazilaCode = new Map(csv('upazilas.csv').map((r) => [r[0], r[5]]));
const unionMatch = { by_pcode: 0, by_name: 0, unmatched: [] };
const pending = [];
for (const r of csv('unions.csv')) {
  const [, upzId, en, bn, , code] = r;
  const u = code && units.get(code);
  if (u && !u.name_bn) { u.name_bn = bn; unionMatch.by_pcode++; }
  else pending.push({ upazila: upazilaCode.get(upzId), en, bn, code });
}
for (const p of pending) {
  const candidates = [...units.values()].filter((u) =>
    u.level === 4 && !u.name_bn && u.parent_pcode === p.upazila && norm(u.name_en) === norm(p.en));
  if (candidates.length === 1) { candidates[0].name_bn = p.bn; unionMatch.by_name++; }
  else unionMatch.unmatched.push({ ...p, candidates: candidates.length });
}

// ---- Output ---------------------------------------------------------------
const all = [...units.values()].sort((a, b) => a.level - b.level || a.pcode.localeCompare(b.pcode));
mkdirSync(`${DATA}/gazetteer`, { recursive: true });
mkdirSync(`${DATA}/qa`, { recursive: true });

writeFileSync(`${DATA}/gazetteer/units.jsonl`, all.map((u) => JSON.stringify(u)).join('\n') + '\n');
const header = ['pcode', 'level', 'kind', 'name_en', 'name_bn', 'parent_pcode', 'ancestry', 'area_sqkm', 'lon', 'lat', 'boundary', 'source', 'valid_on', 'parent_pcode_2015'];
writeFileSync(`${DATA}/gazetteer/units.csv`, toCsv(header, all.map((u) => [
  u.pcode, u.level, u.kind, u.name_en, u.name_bn, u.parent_pcode, u.ancestry.join('|'), u.area_sqkm,
  u.label_point[0], u.label_point[1], u.boundary, u.source, u.valid_on, u.parent_pcode_2015,
])));

// QA: counts, Bangla coverage, and unions whose spatial parent disagrees with their 2015 code.
const count = (f) => all.filter(f).length;
const byKind = {};
for (const u of all) {
  byKind[u.kind] ??= { total: 0, with_bn: 0 };
  byKind[u.kind].total++;
  if (u.name_bn) byKind[u.kind].with_bn++;
}
const moved = all.filter((u) => u.level === 4 && legacy(u.parent_pcode_2015) !== u.parent_pcode).map((u) => ({
  pcode: u.pcode, name_en: u.name_en, parent_pcode_2015: u.parent_pcode_2015, parent_pcode: u.parent_pcode,
  parent_name: units.get(u.parent_pcode).name_en,
}));
const report = {
  counts: { 1: count((u) => u.level === 1), 2: count((u) => u.level === 2), 3: count((u) => u.level === 3), 4: count((u) => u.level === 4) },
  by_kind: byKind,
  union_bn_join: { by_pcode: unionMatch.by_pcode, by_name: unionMatch.by_name, unmatched_count: unionMatch.unmatched.length },
  reparented_unions: moved.length,
  cross_district_overrides: districtFix,
  renamed_paurashavas: renamed,
  unmatched_bn_unions: unionMatch.unmatched,
  reparented: moved,
};
writeFileSync(`${DATA}/qa/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ counts: report.counts, union_bn_join: report.union_bn_join, reparented_unions: moved.length, cross_district_overrides: districtFix.length, renamed_paurashavas: renamed.length }));
