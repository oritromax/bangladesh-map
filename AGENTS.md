# AGENTS.md

Guide for AI agents and developers working with this repository or its data.

## What this is
Open atlas of Bangladesh's administrative units: 8 divisions, 64 districts, 507 upazilas and city corporations, and 5,160 unions, paurashavas and city-corporation wards. It has three parts:
- committed data in `data/`
- a static JSON API generated from that data
- an interactive map site

## Key concepts
- **pcode**: every unit's unique ID, the official OCHA/BBS code.
- **level**:
  - 1 division
  - 2 district
  - 3 upazila or city corporation
  - 4 union, paurashava or ward
- **kind**: tells apart the unit types within a level: `upazila` vs `city_corporation`, and `union` vs `paurashava` vs `ward`.
- **Level-4 caveat**: level-4 boundaries come from the 2015 BBS release. Their `parent_pcode` is the *current* upazila they lie in, so the pcode prefix may not match the parent. Always use `parent_pcode` or `ancestry` for hierarchy, never string prefixes. The old parent is kept in `parent_pcode_2015`.
- **Names are not unique** (for example, Kaliganj appears 4 times). Join on pcode, never on name.
- **Bangla names**: complete for levels 1–3. About 96% of unions have one. Paurashavas and wards have none, and `name_bn` is `null` where no source provides one.

## Where things are
- `data/gazetteer/units.csv` and `units.jsonl`: one record per unit. The schema is in `data/schema/unit.schema.json`.
- `data/boundaries/national.topo.json`: TopoJSON objects `divisions` and `districts`.
- `data/boundaries/districts/<district pcode>.topo.json`: TopoJSON objects `upazilas` and `unions` for that district.
- `data/qa/report.json` covers:
  - Bangla-name join coverage
  - unmatched Bangla union names (mostly unions created after 2015)
  - unions re-parented to a newer upazila
  - cross-district overrides
- `sources/manifest.json`: upstream datasets with pinned URLs, licences and sha256 checksums.
- `pipeline/`: the build stages, each reading the previous stage's output.
  1. `fetch.mjs`: downloads the sources and checks their checksums.
  2. `geometry.mjs`: normalises the shapes and assigns each union its parent by spatial overlap.
  3. `units.mjs`: builds the gazetteer, joins Bangla names and writes the QA report.
  4. `boundaries.mjs`: builds the TopoJSON files.
  5. `site.mjs`: assembles `dist/` with the site and the static API.
- `site/`: the map front-end. Plain ES modules, d3-geo and topojson-client. No framework.
- `test/`: data invariant tests.

## Static API (on the deployed site)
- `/api/v1/index.json`: counts, endpoint templates, sources.
- `/api/v1/units/{pcode}.json`: a unit plus its `ancestors`, `children` and `boundary` file.
- `/api/v1/search.json`: every unit as compact rows.
- `/llms.txt`: a summary for LLM agents.

## Commands
- `npm install`
- `npm run build:data`: fetches the sources (about 470 MB, cached in `.cache/`) and regenerates `data/`.
- `npm test`: checks the data invariants. Run it after any change to `data/` or `pipeline/`.
- `npm run dev`: builds `dist/` and serves it locally (`PORT` env var, default 8080).
- `npm run deploy`: builds and deploys to Cloudflare with wrangler.

## Rules for changes
- `data/` is generated output. Change it only by changing `pipeline/` or `sources/` and rebuilding, and commit both together.
- When an upstream source changes, `fetch.mjs` fails on the checksum. Review the upstream change and the QA report diff before re-pinning `sha256`.
- Never add AI attribution to commits, pull requests, code or docs: no `Co-Authored-By` trailers and no "Generated with" footers. Commits are authored by the repository owner.
