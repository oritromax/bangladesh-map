// Stage 4: web-ready TopoJSON.
//   data/boundaries/national.topo.json          objects: divisions, districts
//   data/boundaries/districts/<pcode>.topo.json objects: upazilas, unions
// Each layer is simplified once as a whole (shared borders stay shared), then split.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import mapshaper from 'mapshaper';
import { BUILD, DATA } from './lib/paths.mjs';

const OUT = `${DATA}/boundaries`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/districts`, { recursive: true });

const units = new Map(readFileSync(`${DATA}/gazetteer/units.jsonl`, 'utf8').trim().split('\n')
  .map((l) => JSON.parse(l)).map((u) => [u.pcode, u]));

// Simplification interval (metres) per level, chosen against the size budget in plan.md.
const INTERVAL = { 1: 400, 2: 250, 3: 60, 4: 40 };
const TOPO = 'format=topojson quantization=100000';

async function simplified(level) {
  const input = { [`adm${level}.json`]: readFileSync(`${BUILD}/geo/adm${level}.geojson`, 'utf8') };
  const out = await mapshaper.applyCommands(
    `-i adm${level}.json -simplify interval=${INTERVAL[level]} keep-shapes -clean -o out.json format=geojson precision=0.00001`, input);
  const fc = JSON.parse(out['out.json']);
  for (const f of fc.features) {
    // Parentage comes from the gazetteer (it may override the geometry-stage parent).
    const u = units.get(f.properties.pcode);
    f.properties = { pcode: u.pcode, kind: u.kind, name_en: u.name_en, name_bn: u.name_bn, parent_pcode: u.parent_pcode };
  }
  return fc;
}

async function writeTopo(file, layers) {
  const input = {}, names = [];
  for (const [name, features] of Object.entries(layers)) {
    input[`${name}.json`] = JSON.stringify({ type: 'FeatureCollection', features });
    names.push(`${name}.json`);
  }
  const out = await mapshaper.applyCommands(`-i ${names.join(' ')} combine-files -o out.json ${TOPO}`, input);
  writeFileSync(file, out['out.json']);
}

const [adm1, adm2, adm3, adm4] = await Promise.all([1, 2, 3, 4].map(simplified));
await writeTopo(`${OUT}/national.topo.json`, { divisions: adm1.features, districts: adm2.features });

const district = (f) => units.get(f.properties.pcode).ancestry[1];
for (const d of adm2.features) {
  const code = d.properties.pcode;
  await writeTopo(`${OUT}/districts/${code}.topo.json`, {
    upazilas: adm3.features.filter((f) => f.properties.parent_pcode === code),
    unions: adm4.features.filter((f) => district(f) === code),
  });
}
console.log(`national + ${adm2.features.length} district files written`);
