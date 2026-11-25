// Invariants on the committed data/ outputs. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const DATA = new URL('../data/', import.meta.url);
const read = (p) => readFileSync(new URL(p, DATA), 'utf8');
const list = read('gazetteer/units.jsonl').trim().split('\n').map((l) => JSON.parse(l));
const units = new Map(list.map((u) => [u.pcode, u]));
const at = (level) => list.filter((u) => u.level === level);

test('expected unit counts per level', () => {
  assert.deepEqual([1, 2, 3, 4].map((l) => at(l).length), [8, 64, 507, 5160]);
});

test('pcodes are unique', () => assert.equal(units.size, list.length));

test('every record matches the schema', () => {
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(JSON.parse(read('schema/unit.schema.json')));
  const bad = list.filter((u) => !validate(u)).slice(0, 3).map((u) => [u.pcode, validate(u) || validate.errors]);
  assert.deepEqual(bad, []);
});

test('hierarchy is a tree: parent exists one level up, ancestry consistent', () => {
  for (const u of list) {
    if (u.level === 1) { assert.equal(u.parent_pcode, null); continue; }
    const p = units.get(u.parent_pcode);
    assert.ok(p, `${u.pcode}: missing parent ${u.parent_pcode}`);
    assert.equal(p.level, u.level - 1, u.pcode);
    assert.deepEqual(u.ancestry, [...p.ancestry, p.pcode], u.pcode);
  }
});

test('every division, district and upazila has children', () => {
  const parents = new Set(list.map((u) => u.parent_pcode));
  assert.deepEqual(list.filter((u) => u.level < 4 && !parents.has(u.pcode)).map((u) => u.pcode), []);
});

test('level-4 units stay in the district of their 2015 pcode', () => {
  assert.deepEqual(at(4).filter((u) => u.ancestry[1] !== u.parent_pcode_2015.slice(0, 6)).map((u) => u.pcode), []);
});

test('Bangla names: complete for levels 1-3, >= 95% for unions', () => {
  assert.deepEqual(list.filter((u) => u.level < 4 && !u.name_bn).map((u) => u.pcode), []);
  const unions = list.filter((u) => u.kind === 'union');
  assert.ok(unions.filter((u) => u.name_bn).length / unions.length >= 0.95);
});

test('every unit appears exactly once in its boundary file', () => {
  const seen = new Map();
  for (const u of list) {
    const [file, object] = u.boundary.split('#');
    assert.ok(existsSync(new URL(file, DATA)), file);
    if (!seen.has(file)) {
      const topo = JSON.parse(read(file));
      seen.set(file, Object.fromEntries(Object.entries(topo.objects).map(([k, o]) => [k, o.geometries.map((g) => g.properties.pcode)])));
    }
    const hits = seen.get(file)[object].filter((p) => p === u.pcode).length;
    assert.equal(hits, 1, `${u.pcode} in ${u.boundary}`);
  }
});

// ---- Population ----------------------------------------------------------------
const population = read('population/population.jsonl').trim().split('\n').map((l) => JSON.parse(l));

test('population records match the schema and reference existing units', () => {
  const validate = new Ajv2020().compile(JSON.parse(read('schema/population.schema.json')));
  assert.deepEqual(population.filter((r) => !validate(r)).slice(0, 3).map((r) => [r.pcode, validate.errors]), []);
  assert.deepEqual(population.filter((r) => !units.has(r.pcode)).map((r) => r.pcode), []);
});

test('population: one record per (pcode, year); male + female = total = sum of age bands', () => {
  assert.equal(new Set(population.map((r) => `${r.pcode}/${r.year}`)).size, population.length);
  for (const r of population) {
    assert.equal(r.male + r.female, r.total, `${r.pcode}/${r.year}`);
    assert.equal(Object.values(r.age).reduce((a, b) => a + b, 0), r.total, `${r.pcode}/${r.year}`);
  }
});

test('population: coverage and national totals', () => {
  const at = (year, level) => population.filter((r) => r.year === year && units.get(r.pcode).level === level);
  assert.ok(at(2011, 4).length >= 5100, '2011 union-level coverage');
  assert.equal(at(2022, 2).length, 64);
  assert.equal(at(2022, 1).reduce((s, r) => s + r.total, 0), 165650475);
  // 2011 divisions sum to the census total minus the source rows with no matching unit (cantonments etc.).
  const qa = JSON.parse(read('qa/population.json'));
  assert.equal(at(2011, 1).reduce((s, r) => s + r.total, 0) + qa['2011'].unmatched_source_population, 144043697);
});

test('generic "Paurashava" names were replaced', () => {
  assert.deepEqual(list.filter((u) => u.name_en === 'Paurashava').map((u) => u.pcode), []);
});
