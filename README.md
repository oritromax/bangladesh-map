# Bangladesh Map · বাংলাদেশের মানচিত্র

An interactive map and open dataset of every administrative unit in Bangladesh, from division down to union. It includes English and Bangla names, official pcodes, boundaries, and population by sex and age (2011 census and 2022 estimates). A static JSON API lets people and AI agents query it directly.

Made by [Nidal Siddique Oritro](https://ioritro.com).

| Level | Units | Count |
|---|---|---|
| 1 | Division | 8 |
| 2 | District | 64 |
| 3 | Upazila / city corporation | 495 + 12 |
| 4 | Union / paurashava / city-corporation ward | 4,566 + 309 + 285 |

## Quick start
Requires Node 20+, `unzip`, and about 2 GB of free RAM for the data build.

```bash
npm install
npm run dev            # serve the committed data at http://localhost:8080
npm run build:data     # re-download sources and regenerate data/
npm test               # data invariant checks
```

## Using the data
- **Files**: see `data/`.
  - The gazetteer comes as CSV and JSONL.
  - Population comes as CSV and JSONL, one row per unit and year.
  - Boundaries are TopoJSON: one national file, plus one file per district.
  - JSON Schemas describe each published file.
  - A QA report covers name-join coverage and re-parented units.
- **HTTP**: the deployed site serves `/api/v1/index.json`, `/api/v1/units/{pcode}.json` and `/llms.txt`.
- **Example**: `GET /api/v1/units/BD20190040.json` returns Debidwar upazila with its ancestors, its 17 unions and its boundary file.

See [AGENTS.md](AGENTS.md) for the full data model, the pipeline and the rules for changing anything.

## Sources and caveats
- **Divisions, districts, upazilas**: BBS boundaries published by OCHA on HDX (COD-AB v03, valid from 2023-05-21).
- **Unions, paurashavas, wards**: the earlier COD-AB release (BBS 2015 boundaries).
  - Their edges don't always line up with the current upazila borders.
  - Each one is assigned to the current upazila it overlaps most.
  - About 150 unions created after 2015 are not in this data.
- **Bangla names**: [nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode), MIT licensed.
- **Population 2011**: the BBS census, from US Census Bureau tables on HDX.
  - Reported for each union, paurashava and ward.
  - Upazila, district and division figures are sums over today's boundaries.
  - About 260,000 people (mostly in cantonments) have no matching area.
  - The same tables supply the full names of 50 paurashavas that the 2015 boundaries call just "Paurashava".
- **Population 2022**: UNFPA estimates (COD-PS) on HDX, for districts and upazilas. They are left out for 30 upazilas whose boundaries changed, and for city corporations.

## Licence
- Code: MIT ([LICENSE](LICENSE)).
- Boundary data: © Bangladesh Bureau of Statistics, via OCHA/HDX, under [CC BY-IGO](https://creativecommons.org/licenses/by/3.0/igo/). Attribution is required when you reuse `data/`.
- Bangla names: nuhil/bangladesh-geocode, under MIT.
- Population 2011: BBS Population and Housing Census 2011, via the US Census Bureau and HDX, under CC BY.
- Population 2022: UNFPA / US Census Bureau, via HDX COD-PS, under CC BY-IGO.
