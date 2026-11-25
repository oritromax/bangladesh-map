# Bangladesh Map — Plan

Open, static, agent-friendly atlas of Bangladesh's administrative units: division → district → upazila → union (incl. paurashavas and city-corporation wards), with Bangla and English names and an interactive SVG map.

## Decisions
- **Sources (hybrid)**
  - Divisions, districts, upazilas: HDX COD-AB `cod-ab-bgd` v03 (BBS, valid from 2023-05-21, reviewed 2025-06-01). CC BY-IGO.
  - Union-level shapes: older COD-AB (BBS 2015 vintage, valid 2020-11-13), via fieldmaps.io "originals". CC BY-IGO. Marked `vintage: 2015` on every unit.
  - Bangla names: nuhil/bangladesh-geocode (MIT). Joins on pcode: upazilas 495/495, unions 4,390/4,540.
- **Union parentage** comes from where the union sits on the map, inside the current (v03) upazilas, not from its pcode prefix. This handles upazilas created since 2015 (Karnaphuli, Eidgaon, Lalmai, …).
- **Bottom level** keeps all 5,160 units, tagged `kind`: `union` | `paurashava` | `ward`.
- **IDs**
  - Official pcodes only; we invent none.
  - Unions keep their 2015 pcode, so its prefix may not match the current parent. This is documented.
- **Stack**
  - One toolchain: Node.
  - Pipeline uses mapshaper for simplifying shapes and building TopoJSON.
  - Site is plain-JS ES modules with d3-geo and topojson-client. It draws SVG from data, with no hand-drawn SVG.
  - No framework.
- **Hosting**: static, on Cloudflare (Workers static assets, same as kicholtese).
- **Out of scope for now**: election constituencies, population stats (cod-ps-bgd can be added later as a layer).

## Architecture (separation of concerns)
- `sources/`: manifest of upstream datasets (URL, version, license, sha256). Raw downloads stay out of git; the pipeline fetches and verifies them.
- `pipeline/`: one-way steps, each a pure input→output stage.
  1. fetch + checksum
  2. normalize (map each source to one unit record shape)
  3. join names (Bangla by pcode, then by name within the parent for the ~150 unions without a code)
  4. assign union parents by spatial containment
  5. simplify geometry and build per-scope TopoJSON
  6. emit gazetteer, static API, QA report
- `data/`: committed, generated, the source of truth for consumers.
  - `gazetteer/`: one flat file of every unit (CSV and JSONL). Fields: pcode, level, kind, parent_pcode, ancestry, name_en, name_bn, area_sqkm, centroid, vintage, source.
  - `boundaries/`: TopoJSON at three scopes.
    - national: divisions and districts
    - per district: its upazilas
    - per district: its unions, wards and paurashavas
  - `schema/`: JSON Schema for every published file.
  - `qa/`: join and coverage report (unmatched names, parentage conflicts, counts).
- `site/public/api/v1/`: static JSON per unit (`units/{pcode}.json` with its parent, children and boundary file), plus `index.json` and `search.json`. Agents can fetch these over plain HTTP.
- `site/`: the map UI.
  - Click to drill down, breadcrumb trail.
  - Search in Bangla and English.
  - Deep links: `#/BD20/BD2019/...`.
- Agent docs: `AGENTS.md` (repo layout, rebuild command, data contracts) and `llms.txt` on the site.
- Tests:
  - Pipeline invariants: unique pcodes, every unit has exactly one existing parent, expected counts, Bangla coverage thresholds.
  - Schema validation of all outputs.

## Licensing
- Code: MIT.
- Data outputs: CC BY-IGO (attribution: "BBS via OCHA/HDX"). Bangla names credited to nuhil/bangladesh-geocode (MIT).
- Redistribution terms for nuhil's own upstream Bangla sources are unverified. Noted in README.

## Milestones
- [x] Research sources and verify counts and joins (v03 adm3 507, old adm4 5,160, Bangla join rates above)
- [x] Scaffold repo: git init, package.json, AGENTS.md, README, LICENSE, sources manifest (sha256-pinned)
- [x] Pipeline: fetch + normalize
- [x] Pipeline: Bangla name join + QA report
  - Union Bangla names: 4,390 joined by pcode, 2 by name. 148 unmatched, mostly unions created after 2015.
- [x] Pipeline: spatial union parentage + conflict report
  - 417 unions re-parented to a newer upazila.
  - 3 cross-district overlap results overridden by the 2015 code, since districts are unchanged.
- [x] Pipeline: simplify, build TopoJSON
  - National file: 234 KB.
  - Largest district file: 274 KB (91 KB gzipped).
- [x] Emit gazetteer, schemas, static API (5,739 unit endpoints, search index, llms.txt)
- [x] Invariant tests + schema validation (8 tests)
- [x] Site: national map → division → district → upazila → union drill-down
- [x] Site: search (bn/en), deep links (`#<pcode>`), unit info panel, language toggle
- [x] Cloudflare deploy config (wrangler.jsonc, `_headers` with CORS on /api and /data)
- [x] First commit
- [ ] Publish GitHub repo and deploy

## Known limitations / follow-ups
- Union (2015) and upazila (2025) edges don't line up exactly. The misfit is visible at upazila zoom.
- Paurashavas and wards have no Bangla names. No open source was found.
- About 150 unions created after 2015 have no geometry.
- Possible later layers: population (cod-ps-bgd), election constituencies.

## Open questions
- GitHub repo name and visibility (default: `bangladesh-map`, public).
