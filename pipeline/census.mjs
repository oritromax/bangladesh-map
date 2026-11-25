// Stage 3: ingest population sources into a uniform shape, keyed by the
// source's own code converted to our pcode scheme. No joining or deriving here.
//   build/census/uscb-2011.json   level-4 rows of the 2011 census (USCB)
//   build/census/cod-ps-2022.json district and upazila rows of COD-PS 2022
// Row shape: { pcode, name, total, male, female, age: [17 five-year bands, 0-4 … 80+] }
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { BUILD, src } from './lib/paths.mjs';
import { parseCsv } from './lib/csv.mjs';

const OUT = `${BUILD}/census`;
mkdirSync(OUT, { recursive: true });
const BANDS = ['0004', '0509', '1014', '1519', '2024', '2529', '3034', '3539', '4044', '4549', '5054', '5559', '6064', '6569', '7074', '7579', '80PL'];

// ---- USCB 2011 (sheet Age-Sex). Level-4 NSO codes are 8 digits = our pcode without "BD".
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(src('uscb-2011', 'bangladesh_uscb_202107.xlsx'));
const sheet = wb.getWorksheet('Age-Sex');
const header = sheet.getRow(1).values;
const col = (name) => header.indexOf(name);
const uscb = [];
sheet.eachRow((row, i) => {
  const v = row.values;
  const code = String(v[col('NSO_CODE')] ?? '');
  if (i === 1 || !/^\d{8}$/.test(code)) return;
  uscb.push({
    pcode: `BD${code}`,
    name: v[col('NSO_NAME')],
    total: v[col('BTOTL')],
    male: v[col('MTOTL')],
    female: v[col('FTOTL')],
    age: BANDS.map((b) => v[col(`B${b}`)]),
  });
});
writeFileSync(`${OUT}/uscb-2011.json`, JSON.stringify(uscb));

// ---- COD-PS 2022. ADM2 pcodes match ours; ADM3 uses the old 8-char scheme ("00" inserted after char 6).
function codps(file, level) {
  const [head, ...rows] = parseCsv(readFileSync(src('cod-ps-2022', file), 'utf8').replace(/^﻿/, '')).filter((r) => r.length > 1);
  const c = (name) => head.indexOf(name);
  const bands = ['00_04', '05_09', '10_14', '15_19', '20_24', '25_29', '30_34', '35_39', '40_44', '45_49', '50_54', '55_59', '60_64', '65_69', '70_74', '75_79', '80Plus'];
  return rows.map((r) => {
    const code = r[c(`ADM${level}_PCODE`)];
    return {
      level,
      source_code: code,
      pcode: level === 3 ? code.slice(0, 6) + '00' + code.slice(6) : code,
      name: r[c(`ADM${level}_NAME`)],
      total: +r[c('T_TL')],
      male: +r[c('M_TL')],
      female: +r[c('F_TL')],
      age: bands.map((b) => +r[c(`T_${b}`)]),
    };
  });
}
writeFileSync(`${OUT}/cod-ps-2022.json`, JSON.stringify([...codps('bgd_admpop_adm2_2022.csv', 2), ...codps('bgd_admpop_adm3_2022.csv', 3)]));
console.log(`census: ${uscb.length} USCB level-4 rows (total ${uscb.reduce((s, r) => s + r.total, 0)})`);
