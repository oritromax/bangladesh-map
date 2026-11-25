// Stage 5: population per unit, on current boundaries.
//   2011 (census, USCB): reported for level 4; levels 1-3 are sums of their
//        current children, so they follow today's hierarchy, not 2011's.
//   2022 (COD-PS estimate): reported for districts; divisions are sums of districts;
//        upazilas only where the upazila's union composition is unchanged since 2015
//        (otherwise the old-boundary figure would be wrong for the current upazila).
// Writes data/population/population.{csv,jsonl} and data/qa/population.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BUILD, DATA } from './lib/paths.mjs';
import { toCsv } from './lib/csv.mjs';

const BANDS = ['00_04', '05_09', '10_14', '15_19', '20_24', '25_29', '30_34', '35_39', '40_44', '45_49', '50_54', '55_59', '60_64', '65_69', '70_74', '75_79', '80_plus'];
const units = readFileSync(`${DATA}/gazetteer/units.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const byPcode = new Map(units.map((u) => [u.pcode, u]));
const children = new Map();
for (const u of units) {
  if (!children.has(u.parent_pcode)) children.set(u.parent_pcode, []);
  children.get(u.parent_pcode).push(u.pcode);
}
const read = (f) => JSON.parse(readFileSync(`${BUILD}/census/${f}`, 'utf8'));

const record = (pcode, year, method, source, r) => ({
  pcode, year, method, source, total: r.total, male: r.male, female: r.female,
  age: Object.fromEntries(BANDS.map((b, i) => [b, r.age[i]])),
});
const sum = (rows) => ({
  total: rows.reduce((s, r) => s + r.total, 0),
  male: rows.reduce((s, r) => s + r.male, 0),
  female: rows.reduce((s, r) => s + r.female, 0),
  age: BANDS.map((b) => rows.reduce((s, r) => s + r.age[b], 0)),
});

// Roll reported rows up the hierarchy (level 3 → 1), recording child coverage.
function rollUp(rows, year, source, fromLevel) {
  for (let level = fromLevel; level >= 1; level--) {
    for (const u of units.filter((x) => x.level === level && !rows.has(x.pcode))) {
      const kids = (children.get(u.pcode) ?? []).map((p) => rows.get(p)).filter(Boolean);
      if (!kids.length) continue;
      rows.set(u.pcode, { ...record(u.pcode, year, 'sum_of_children', source, sum(kids)), children_with_data: `${kids.length}/${children.get(u.pcode).length}` });
    }
  }
}

// ---- 2011 -----------------------------------------------------------------------
const qa = {};
const y2011 = new Map();
const unmatched2011 = [];
for (const r of read('uscb-2011.json')) {
  if (byPcode.get(r.pcode)?.level === 4) y2011.set(r.pcode, record(r.pcode, 2011, 'reported', 'uscb-2011', r));
  else unmatched2011.push({ pcode: r.pcode, name: r.name, total: r.total });
}
rollUp(y2011, 2011, 'uscb-2011', 3);
qa['2011'] = {
  reported_level4: units.filter((u) => u.level === 4 && y2011.has(u.pcode)).length,
  level4_without_data: units.filter((u) => u.level === 4 && !y2011.has(u.pcode)).map((u) => ({ pcode: u.pcode, name_en: u.name_en })),
  unmatched_source_rows: unmatched2011,
  unmatched_source_population: unmatched2011.reduce((s, r) => s + r.total, 0),
};

// ---- 2022 -----------------------------------------------------------------------
const legacy = (p) => p.slice(0, 6) + '00' + p.slice(6);
const changed = new Set();
for (const u of units.filter((x) => x.level === 4 && legacy(x.parent_pcode_2015) !== x.parent_pcode)) {
  changed.add(u.parent_pcode);
  changed.add(legacy(u.parent_pcode_2015));
}
const y2022 = new Map();
const skipped2022 = [], unmatched2022 = [];
for (const r of read('cod-ps-2022.json')) {
  const u = byPcode.get(r.pcode);
  if (!u || u.level !== r.level) { unmatched2022.push({ source_code: r.source_code, name: r.name, total: r.total }); continue; }
  if (r.level === 3 && changed.has(r.pcode)) { skipped2022.push({ pcode: r.pcode, name_en: u.name_en, reason: 'union composition changed since 2015' }); continue; }
  y2022.set(r.pcode, record(r.pcode, 2022, 'reported', 'cod-ps-2022', r));
}
rollUp(y2022, 2022, 'cod-ps-2022', 1);
qa['2022'] = {
  reported_districts: units.filter((u) => u.level === 2 && y2022.has(u.pcode)).length,
  reported_upazilas: units.filter((u) => u.level === 3 && y2022.has(u.pcode)).length,
  skipped_changed_upazilas: skipped2022,
  level3_without_data: units.filter((u) => u.level === 3 && !y2022.has(u.pcode)).map((u) => ({ pcode: u.pcode, name_en: u.name_en })),
  unmatched_source_rows: unmatched2022,
};

// ---- Output -----------------------------------------------------------------------
const all = [...y2011.values(), ...y2022.values()]
  .map((r) => ({ children_with_data: null, ...r }))
  .sort((a, b) => byPcode.get(a.pcode).level - byPcode.get(b.pcode).level || a.pcode.localeCompare(b.pcode) || a.year - b.year);
mkdirSync(`${DATA}/population`, { recursive: true });
writeFileSync(`${DATA}/population/population.jsonl`, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(`${DATA}/population/population.csv`, toCsv(
  ['pcode', 'year', 'method', 'source', 'children_with_data', 'total', 'male', 'female', ...BANDS.map((b) => `age_${b}`)],
  all.map((r) => [r.pcode, r.year, r.method, r.source, r.children_with_data, r.total, r.male, r.female, ...BANDS.map((b) => r.age[b])]),
));
writeFileSync(`${DATA}/qa/population.json`, JSON.stringify(qa, null, 2) + '\n');

const national = (m) => units.filter((u) => u.level === 1).reduce((s, u) => s + (m.get(u.pcode)?.total ?? 0), 0);
console.log(JSON.stringify({
  rows: all.length,
  '2011': { national: national(y2011), reported_level4: qa['2011'].reported_level4, unmatched_rows: unmatched2011.length, unmatched_population: qa['2011'].unmatched_source_population },
  '2022': { national: national(y2022), districts: qa['2022'].reported_districts, upazilas: qa['2022'].reported_upazilas, skipped_changed: skipped2022.length, unmatched_rows: unmatched2022.length },
}));
