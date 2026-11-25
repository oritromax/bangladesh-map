// Stage 2: normalise source geometry into build/geo/adm{1..4}.geojson.
// Each feature keeps only: pcode, name_en, parent_pcode, area_sqkm, lon, lat
// (lon/lat is an interior label point). Unions also get their spatial parent:
// the current (v03) upazila they overlap most.
import { mkdirSync } from 'node:fs';
import mapshaper from 'mapshaper';
import { BUILD, src } from './lib/paths.mjs';

const OUT = `${BUILD}/geo`;
mkdirSync(OUT, { recursive: true });

// Light simplification so later stages stay fast; final web simplification happens in boundaries.mjs.
const PREP = 'interval=10 keep-shapes';
const DERIVED = 'area_sqkm=+(this.area/1e6).toFixed(3), lon=+this.innerX.toFixed(5), lat=+this.innerY.toFixed(5)';

const v03 = (n) => src('cod-ab-v03', `bgd_admin${n}.geojson`);
const run = (cmd) => mapshaper.runCommands(cmd);

for (const n of [1, 2, 3]) {
  const parent = n === 1 ? 'null' : `adm${n - 1}_pcode`;
  await run([
    `-i ${v03(n)} name=adm${n}`,
    `-simplify ${PREP}`,
    `-each "pcode=adm${n}_pcode, name_en=adm${n}_name, parent_pcode=${parent}, ${DERIVED}"`,
    '-filter-fields pcode,name_en,parent_pcode,area_sqkm,lon,lat',
    `-o ${OUT}/adm${n}.geojson`,
  ].join(' '));
  console.log(`adm${n} written`);
}

// Unions: assign the v03 upazila with the largest overlap as parent.
await run([
  `-i ${src('cod-ab-2015', 'bgd_adm4.geojson')} name=adm4`,
  `-simplify ${PREP}`,
  `-each "pcode=ADM4_PCODE, name_en=ADM4_EN, parent_pcode_2015=ADM3_PCODE, ${DERIVED}"`,
  `-i ${OUT}/adm3.geojson name=up`,
  '-join target=adm4 source=up largest-overlap fields=pcode prefix=up_',
  '-each target=adm4 "parent_pcode=up_pcode"',
  '-filter-fields target=adm4 pcode,name_en,parent_pcode,parent_pcode_2015,area_sqkm,lon,lat',
  `-o target=adm4 ${OUT}/adm4.geojson`,
].join(' '));
console.log('adm4 written');
