// @ts-check
import { t } from '../../i18n/index.js';
import { TECHS, AREAS, tech, leadsTo } from '../../research/catalog.js';
import { layoutWeb, edgePath } from './layout.js';

const SVG = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string | number>} [attrs] */
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/**
 * The technology web as SVG. Built once; `update(picture)` only changes
 * classes, so hover and selection survive refreshes.
 *
 * Visual language:
 * - bands: one per area, tinted with the area colour;
 * - shape: theory = pill (rounded), application = sharp rectangle;
 * - state: known = filled; reported = half-filled; available = bright outline;
 *   needs condition = dotted outline; blocked = red dashed and struck; locked = dim;
 * - edges: prerequisite → technology; dashed when crossing areas;
 * - hover: the whole chain of prerequisites and consequences lights up.
 * @param {{ onSelect: (id: string) => void }} deps
 */
export function createTechWeb({ onSelect }) {
  const layout = layoutWeb(TECHS, AREAS);
  const color = new Map(AREAS.map((a) => [a.id, a.color]));
  const svg = el('svg', { class: 'tech-web', width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}` });

  const bands = el('g');
  layout.bands.forEach((b, i) => {
    bands.append(el('rect', { x: 0, y: b.y, width: layout.width, height: b.h, class: `band ${i % 2 ? 'odd' : 'even'}` }));
    bands.append(el('rect', { x: 0, y: b.y, width: 4, height: b.h, fill: /** @type {string} */ (color.get(b.area)) }));
    const label = el('text', { x: 14, y: b.y + 20, class: 'band-label', fill: /** @type {string} */ (color.get(b.area)) });
    label.textContent = t(`tech.area.${b.area}.name`);
    bands.append(label);
  });
  for (const c of layout.columns) {
    const label = el('text', { x: c.x + 4, y: 20, class: 'col-label' });
    label.textContent = t('research.tier', { n: c.tier });
    bands.append(label);
  }

  const edges = el('g', { class: 'edges' });
  /** @type {{ from: string, to: string, path: SVGElement }[]} */
  const edgeList = [];
  for (const x of TECHS) {
    for (const r of x.requires) {
      const cross = tech(r).area !== x.area;
      const path = el('path', { d: edgePath(/** @type {any} */ (layout.nodes.get(r)), /** @type {any} */ (layout.nodes.get(x.id))), class: `edge${cross ? ' cross' : ''}` });
      if (cross) path.setAttribute('stroke', /** @type {string} */ (color.get(tech(r).area)));
      edges.append(path);
      edgeList.push({ from: r, to: x.id, path });
    }
  }

  const nodesG = el('g');
  /** @type {Map<string, SVGElement>} */
  const nodeEls = new Map();
  for (const x of TECHS) {
    const b = /** @type {import('./layout.js').Box} */ (layout.nodes.get(x.id));
    const g = el('g', { class: `node ${x.kind}`, transform: `translate(${b.x},${b.y})` });
    g.style.setProperty('--area', /** @type {string} */ (color.get(x.area)));
    g.append(el('rect', { width: b.w, height: b.h, rx: x.kind === 'theory' ? b.h / 2 : 3, class: 'shape' }));
    g.append(el('rect', { width: b.w / 2, height: b.h, rx: x.kind === 'theory' ? b.h / 2 : 3, class: 'half' }));
    const label = el('text', { x: x.kind === 'theory' ? 14 : 8, y: b.h / 2 + 4, class: 'label' });
    label.textContent = t(`tech.${x.id}.name`);
    g.append(label);
    const title = el('title');
    title.textContent = `${t(`tech.${x.id}.name`)}: ${t(`tech.${x.id}.desc`)}`;
    g.append(title);
    g.addEventListener('click', () => onSelect(x.id));
    g.addEventListener('mouseenter', () => highlight(x.id));
    g.addEventListener('mouseleave', () => highlight(null));
    nodesG.append(g);
    nodeEls.set(x.id, g);
  }
  svg.append(bands, edges, nodesG);

  /** Ancestors and descendants of a technology. @param {string} id */
  function chain(id) {
    const out = new Set([id]);
    const up = [id];
    while (up.length) for (const r of tech(/** @type {string} */ (up.pop())).requires) if (!out.has(r)) { out.add(r); up.push(r); }
    const down = [id];
    while (down.length) for (const d of leadsTo(/** @type {string} */ (down.pop()))) if (!out.has(d)) { out.add(d); down.push(d); }
    return out;
  }

  /** @param {string | null} id */
  function highlight(id) {
    const on = id ? chain(id) : null;
    svg.classList.toggle('focused', !!on);
    for (const [tid, g] of nodeEls) g.classList.toggle('lit', !!on?.has(tid));
    for (const e of edgeList) e.path.classList.toggle('lit', !!on?.has(e.from) && !!on?.has(e.to));
  }

  let selected = /** @type {string | null} */ (null);
  return {
    element: svg,
    /** @param {import('../../perspective/research.js').ResearchPicture} pic @param {string | null} areaFilter */
    update(pic, areaFilter) {
      for (const [id, g] of nodeEls) {
        const v = pic.techs[id];
        g.setAttribute('class', `node ${tech(id).kind} ${v.state}${v.candidate ? ' candidate' : ''}${id === selected ? ' selected' : ''}${areaFilter && tech(id).area !== areaFilter ? ' filtered' : ''}`);
      }
    },
    /** @param {string | null} id */
    select(id) {
      selected = id;
    },
    /** Scroll position of a technology (for bringing it into view). @param {string} id */
    boxOf: (/** @type {string} */ id) => layout.nodes.get(id),
  };
}
