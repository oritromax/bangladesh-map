// App shell: routing (#<pcode>), scene selection, side panel, search, language.
import { KIND_LABEL, loadDistrict, loadIndex, loadNational } from './data.js';
import { createMap } from './map.js';

const $ = (id) => document.getElementById(id);
const state = { lang: localStorage.getItem('lang') || 'bn', focus: null };
const [index, national] = await Promise.all([loadIndex(), loadNational()]);

// ---- Naming and colour ------------------------------------------------------
const name = (u) => (state.lang === 'bn' ? u.name_bn ?? u.name_en : u.name_en);
const other = (u) => (state.lang === 'bn' ? u.name_en : u.name_bn);
const kindLabel = (u) => KIND_LABEL[u.kind][state.lang === 'bn' ? 0 : 1];
const t = (bn, en) => (state.lang === 'bn' ? bn : en);
const num = (n) => n.toLocaleString(state.lang === 'bn' ? 'bn-BD' : 'en-US');

const HUE = { BD10: 174, BD20: 4, BD30: 200, BD40: 140, BD45: 45, BD50: 300, BD55: 160, BD60: 32 };
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tint = (pcode, divisionPcode = pcode.slice(0, 4)) =>
  `hsl(${HUE[divisionPcode]} var(--tint-s) calc(var(--tint-l) + ${hash(pcode) % 14}%))`;

// ---- Scenes -----------------------------------------------------------------
const byPcode = (features, pcode) => features.find((f) => f.properties.pcode === pcode);
const labelsFor = (units, max = 40) => (units.length > max ? [] : units.map((u) => ({ lon: u.lon, lat: u.lat, text: name(u) })));
const otherDistricts = (keep) => ({
  className: 'ctx', interactive: true, features: national.districts.filter((f) => f.properties.pcode !== keep),
});

async function sceneFor(pcode) {
  const chain = pcode ? index.ancestry(pcode) : [];
  const [division, district, upazila] = chain.map((u) => u.pcode);
  const country = { type: 'FeatureCollection', features: national.divisions };

  if (!division) {
    return {
      fit: country,
      layers: [
        { className: 'area', interactive: true, features: national.divisions, fill: (f) => tint(f.properties.pcode) },
        { className: 'mesh', mesh: national.districtMesh },
      ],
      labels: labelsFor(index.children(null)),
    };
  }
  if (!district) {
    const inside = (f) => f.properties.pcode.startsWith(division);
    return {
      fit: byPcode(national.divisions, division),
      layers: [
        { className: 'ctx', interactive: true, features: national.districts.filter((f) => !inside(f)) },
        { className: 'area', interactive: true, features: national.districts.filter(inside), fill: (f) => tint(f.properties.pcode, division) },
        { className: 'outline', features: [byPcode(national.divisions, division)] },
      ],
      labels: labelsFor(index.children(division)),
    };
  }

  status(t('মানচিত্র লোড হচ্ছে…', 'Loading map…'));
  const geo = await loadDistrict(district);
  status(null);
  if (!upazila) {
    return {
      fit: byPcode(national.districts, district),
      layers: [
        otherDistricts(district),
        { className: 'area', interactive: true, features: geo.upazilas, fill: (f) => tint(f.properties.pcode, division) },
        { className: 'outline', features: [byPcode(national.districts, district)] },
      ],
      labels: labelsFor(index.children(district)),
    };
  }
  const upz = byPcode(geo.upazilas, upazila);
  return {
    fit: upz,
    layers: [
      otherDistricts(district),
      { className: 'ctx', interactive: true, features: geo.upazilas.filter((f) => f !== upz) },
      {
        className: 'area', interactive: true,
        features: geo.unions.filter((f) => f.properties.parent_pcode === upazila),
        fill: (f) => (f.properties.pcode === pcode ? 'var(--selected)' : tint(f.properties.pcode, division)),
      },
      { className: 'outline', features: [upz] },
    ],
    labels: labelsFor(index.children(upazila)),
  };
}

// ---- Panel ------------------------------------------------------------------
function li(u, extra = '') {
  const item = document.createElement('li');
  const a = document.createElement('a');
  a.href = `#${u.pcode}`;
  a.textContent = name(u);
  item.append(a);
  if (extra) item.append(Object.assign(document.createElement('small'), { textContent: extra }));
  return item;
}

async function renderPanel(pcode) {
  const u = pcode && index.units.get(pcode);
  const crumbs = [{ pcode: '', label: t('বাংলাদেশ', 'Bangladesh') }, ...(u ? index.ancestry(pcode) : []).map((x) => ({ pcode: x.pcode, label: name(x) }))];
  $('crumbs').replaceChildren(...crumbs.flatMap((c, i) => {
    const a = Object.assign(document.createElement('a'), { href: `#${c.pcode}`, textContent: c.label });
    if (i === crumbs.length - 1) a.setAttribute('aria-current', 'page');
    return i ? [Object.assign(document.createElement('span'), { textContent: '›' }), a] : [a];
  }));

  const facts = [];
  $('note').hidden = true;
  if (!u) {
    $('title').textContent = t('বাংলাদেশ', 'Bangladesh');
    $('subtitle').textContent = t('Bangladesh', 'বাংলাদেশ');
    const n = (k) => [...index.units.values()].filter((x) => x.kind === k).length;
    facts.push([t('বিভাগ', 'Divisions'), n('division')], [t('জেলা', 'Districts'), n('district')],
      [t('উপজেলা', 'Upazilas'), n('upazila')], [t('ইউনিয়ন', 'Unions'), n('union')]);
  } else {
    $('title').textContent = name(u);
    $('subtitle').textContent = [other(u), kindLabel(u)].filter(Boolean).join(' · ');
    const detail = await (await fetch(`/api/v1/units/${pcode}.json`)).json();
    facts.push([t('পি-কোড', 'P-code'), detail.pcode], [t('আয়তন', 'Area'), `${num(detail.area_sqkm)} ${t('বর্গ কিমি', 'km²')}`]);
    for (const year of ['2022', '2011']) {
      const p = detail.population[year];
      if (!p) continue;
      const label = year === '2022' ? t('জনসংখ্যা ২০২২ (প্রাক্কলন)', 'Population 2022 (estimate)') : t('জনসংখ্যা ২০১১ (আদমশুমারি)', 'Population 2011 (census)');
      const partial = p.children_with_data && p.children_with_data.split('/')[0] !== p.children_with_data.split('/')[1];
      facts.push([label, `${num(p.total)}${partial ? '+' : ''}`]);
      facts.push([t('পুরুষ / নারী', 'Male / female'), `${num(p.male)} / ${num(p.female)}`]);
      facts.push([t('ঘনত্ব', 'Density'), `${num(Math.round(p.total / detail.area_sqkm))} ${t('জন/বর্গ কিমি', '/km²')}`]);
    }
    facts.push(['API', Object.assign(document.createElement('a'), { href: `/api/v1/units/${pcode}.json`, textContent: `${pcode}.json` })]);
    if (u.level === 4) {
      $('note').hidden = false;
      $('note').textContent = t('ইউনিয়নের সীমানা বিবিএস ২০১৫ সালের তথ্য অনুযায়ী।', 'Union boundary is from the 2015 BBS release.');
    } else if (Object.values(detail.population).some((p) => p.method === 'sum_of_children')) {
      $('note').hidden = false;
      $('note').textContent = t(
        'জনসংখ্যা বর্তমান অন্তর্ভুক্ত এলাকাগুলোর যোগফল। "+" মানে কিছু এলাকার তথ্য নেই।',
        'Population is the sum of the areas it currently contains. "+" means some areas have no data.');
    }
  }
  $('facts').replaceChildren(...facts.flatMap(([k, v]) => [
    Object.assign(document.createElement('dt'), { textContent: k }),
    (() => { const dd = document.createElement('dd'); dd.append(v); return dd; })(),
  ]));

  const kids = index.children(u ? pcode : null).slice().sort((a, b) => name(a).localeCompare(name(b), state.lang));
  $('children-title').textContent = kids.length ? `${t('অন্তর্ভুক্ত এলাকা', 'Contains')} (${kids.length})` : '';
  $('children').replaceChildren(...kids.map((k) => li(k, kindLabel(k))));
}

// ---- Routing ------------------------------------------------------------------
const map = createMap($('map'), {
  onSelect: (pcode) => { location.hash = pcode; },
  onHover: (pcode, e) => {
    const tip = $('tip');
    if (!pcode) { tip.hidden = true; return; }
    const u = index.units.get(pcode);
    tip.textContent = `${name(u)} · ${kindLabel(u)}`;
    tip.hidden = false;
    if (e) {
      const box = $('map').getBoundingClientRect();
      tip.style.left = `${e.clientX - box.left + 12}px`;
      tip.style.top = `${e.clientY - box.top + 12}px`;
    }
  },
});

function status(msg) {
  $('status').hidden = !msg;
  $('status').textContent = msg ?? '';
}

async function show() {
  const pcode = decodeURIComponent(location.hash.slice(1));
  state.focus = index.units.has(pcode) ? pcode : null;
  $('tip').hidden = true;
  try {
    map.draw(await sceneFor(state.focus));
    await renderPanel(state.focus);
    const u = state.focus && index.units.get(state.focus);
    document.title = `${u ? `${name(u)} — ` : ''}${t('বাংলাদেশের মানচিত্র', 'Bangladesh Map')}`;
  } catch (err) {
    status(t('লোড করা যায়নি। আবার চেষ্টা করুন।', 'Could not load. Please retry.'));
    console.error(err);
  }
}
window.addEventListener('hashchange', show);

// ---- Language -----------------------------------------------------------------
function applyLang() {
  document.documentElement.lang = state.lang;
  for (const b of $('lang').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  $('q').placeholder = t('যেকোনো এলাকা খুঁজুন (বাংলা বা English)', 'Search any area (English or বাংলা)');
  applyTheme();
}
$('lang').addEventListener('click', (e) => {
  const lang = e.target.closest('button')?.dataset.lang;
  if (!lang || lang === state.lang) return;
  state.lang = lang;
  localStorage.setItem('lang', state.lang);
  applyLang();
  show();
});

// ---- Theme and attribution --------------------------------------------------
function applyTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('theme').setAttribute('aria-pressed', String(dark));
  $('theme').title = dark ? t('লাইট মোড', 'Light mode') : t('ডার্ক মোড', 'Dark mode');
}
$('theme').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  applyTheme();
});
$('credits-open').addEventListener('click', () => $('credits').showModal());
$('credits').addEventListener('click', (e) => { if (e.target === $('credits')) $('credits').close(); });

// ---- Search -------------------------------------------------------------------
const all = [...index.units.values()];
const fold = (s) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
let active = -1;

function search(q) {
  const f = fold(q.trim());
  if (!f) return [];
  const score = (u) => {
    const en = fold(u.name_en), bn = u.name_bn ?? '';
    if (en.startsWith(f) || bn.startsWith(q.trim())) return 0;
    if (en.includes(f) || bn.includes(q.trim()) || u.pcode.toLowerCase() === f) return 1;
    return -1;
  };
  return all.map((u) => [score(u), u]).filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].level - b[1].level || a[1].name_en.localeCompare(b[1].name_en))
    .slice(0, 30).map(([, u]) => u);
}

function renderResults(list) {
  const ul = $('results');
  active = -1;
  ul.hidden = !list.length;
  ul.replaceChildren(...list.map((u) => {
    const where = index.ancestry(u.pcode).slice(0, -1).map(name).reverse().join(', ');
    const item = li(u, `${kindLabel(u)}${where ? ` · ${where}` : ''}`);
    item.setAttribute('role', 'option');
    item.addEventListener('click', closeSearch);
    return item;
  }));
}
function closeSearch() { $('results').hidden = true; $('q').value = ''; }

$('q').addEventListener('input', (e) => renderResults(search(e.target.value)));
$('q').addEventListener('keydown', (e) => {
  const items = [...$('results').children];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle('active', i === active));
  } else if (e.key === 'Enter' && items.length) {
    location.hash = items[Math.max(active, 0)].querySelector('a').hash;
    closeSearch();
  } else if (e.key === 'Escape') closeSearch();
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('results').hidden = true; });

applyLang();
show();
