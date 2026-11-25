// SVG rendering of a "scene": a list of layers fitted to a focus geometry.
// The map knows nothing about the hierarchy; app.js decides what to draw.
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

export function createMap(svg, { onSelect, onHover }) {
  let size = { w: 0, h: 0 };
  let last = null;

  const measure = () => {
    const r = svg.getBoundingClientRect();
    size = { w: Math.max(r.width, 1), h: Math.max(r.height, 1) };
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  };

  // scene: { fit: GeoJSON, layers: [{ features?, mesh?, className, fill?(f), interactive? }], labels: [{ lon, lat, text }] }
  function draw(scene) {
    last = scene;
    measure();
    const pad = Math.min(size.w, size.h) * 0.06;
    const projection = d3.geoMercator().fitExtent([[pad, pad], [size.w - pad, size.h - pad]], scene.fit);
    const path = d3.geoPath(projection);
    const root = el('g');

    for (const layer of scene.layers) {
      const g = el('g', { class: layer.className });
      if (layer.mesh) g.append(el('path', { d: path(layer.mesh) }));
      for (const f of layer.features ?? []) {
        const p = el('path', { d: path(f) });
        if (layer.fill) p.style.fill = layer.fill(f);
        if (layer.interactive) {
          const pcode = f.properties.pcode;
          p.dataset.pcode = pcode;
          p.setAttribute('tabindex', '0');
          p.setAttribute('role', 'button');
          p.setAttribute('aria-label', f.properties.name_en);
          p.addEventListener('click', () => onSelect(pcode));
          p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(pcode); } });
          p.addEventListener('pointermove', (e) => onHover(pcode, e));
          p.addEventListener('pointerleave', () => onHover(null));
          p.addEventListener('focus', () => onHover(pcode));
          p.addEventListener('blur', () => onHover(null));
        }
        g.append(p);
      }
      root.append(g);
    }

    const labels = el('g', { class: 'labels' });
    for (const l of scene.labels ?? []) {
      const [x, y] = projection([l.lon, l.lat]);
      const t = el('text', { x, y });
      t.textContent = l.text;
      labels.append(t);
    }
    root.append(labels);
    svg.replaceChildren(root);
  }

  new ResizeObserver(() => last && draw(last)).observe(svg);
  return { draw };
}
