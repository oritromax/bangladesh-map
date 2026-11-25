// Data access: the unit index (from the static API) and boundary files.
// Everything is keyed by pcode; nothing here knows about the DOM.
const json = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

export const KIND_LABEL = {
  division: ['বিভাগ', 'Division'],
  district: ['জেলা', 'District'],
  upazila: ['উপজেলা', 'Upazila'],
  city_corporation: ['সিটি কর্পোরেশন', 'City corporation'],
  union: ['ইউনিয়ন', 'Union'],
  paurashava: ['পৌরসভা', 'Paurashava'],
  ward: ['ওয়ার্ড', 'Ward'],
};

export async function loadIndex() {
  const { fields, rows } = await json('/api/v1/search.json');
  const units = new Map();
  const children = new Map();
  for (const row of rows) {
    const u = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    units.set(u.pcode, u);
    if (!children.has(u.parent_pcode)) children.set(u.parent_pcode, []);
    children.get(u.parent_pcode).push(u);
  }
  const ancestry = (pcode) => {
    const chain = [];
    for (let u = units.get(pcode); u; u = units.get(u.parent_pcode)) chain.unshift(u);
    return chain;
  };
  return { units, children: (p) => children.get(p) ?? [], ancestry };
}

const asFeatures = (topo, name) => topojson.feature(topo, topo.objects[name]).features;

export async function loadNational() {
  const topo = await json('/data/boundaries/national.topo.json');
  return {
    divisions: asFeatures(topo, 'divisions'),
    districts: asFeatures(topo, 'districts'),
    districtMesh: topojson.mesh(topo, topo.objects.districts, (a, b) => a !== b),
  };
}

const districtCache = new Map();
export function loadDistrict(pcode) {
  if (!districtCache.has(pcode)) {
    districtCache.set(pcode, json(`/data/boundaries/districts/${pcode}.topo.json`).then((topo) => ({
      upazilas: asFeatures(topo, 'upazilas'),
      unions: asFeatures(topo, 'unions'),
    })));
  }
  return districtCache.get(pcode);
}
