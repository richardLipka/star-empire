// @ts-check
import { t } from '../../i18n/index.js';
import { fmtNumber } from '../../i18n/format.js';

const SVG = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string | number>} [attrs] @param {string} [title] */
const el = (tag, attrs = {}, title) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (title) {
    const tt = document.createElementNS(SVG, 'title');
    tt.textContent = title;
    e.append(tt);
  }
  return e;
};

const W = 300;
const ROW = 30;
const AXIS = 12;
const PAD = 10;
/** Dot radius by body type. */
const SIZE = { rocky: 2.5, superEarth: 3.2, ocean: 3.2, ice: 2.5, gasGiant: 5.5, iceGiant: 4.5, belt: 0 };

/**
 * A system from its stars outward on one logarithmic scale of distance: a row
 * per star that has bodies (companions such as Proxima get their own), the
 * habitable zone as a band, bodies as dots coloured by what people could do
 * there (the colony's world is ringed).
 * @param {import('../../galaxy/planets.js').StarSystemModel} model
 * @param {{ name: string }[]} stars
 * @param {string | null} colonyBody
 */
export function orrery(model, stars, colonyBody) {
  const rows = [...new Set([0, ...model.bodies.map((b) => b.star)])].sort((a, b) => a - b);
  const zones = rows.map((s) => model.hzByStar[s] ?? model.hz);
  const orbits = model.bodies.map((b) => b.orbit);
  const lo = Math.log10(Math.min(...zones.map((z) => z[0] * 0.5), ...orbits, 0.05));
  const hi = Math.log10(Math.max(...zones.map((z) => z[1] * 2), ...orbits, 1));
  const x = (/** @type {number} */ au) => PAD + ((Math.log10(au) - lo) / (hi - lo)) * (W - 2 * PAD);
  const H = rows.length * ROW + AXIS;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'orrery', role: 'img', 'aria-label': t('survey.orrery') });
  rows.forEach((star, i) => {
    const mid = i * ROW + ROW / 2;
    const [z0, z1] = zones[i];
    svg.append(el('rect', { x: x(z0), y: mid - ROW / 2 + 3, width: Math.max(1, x(z1) - x(z0)), height: ROW - 6, class: 'hz' }, t('survey.hz')));
    svg.append(el('line', { x1: 0, y1: mid, x2: W, y2: mid, class: 'axis' }));
    svg.append(el('circle', { cx: 3, cy: mid, r: 3, class: 'star' }, stars[star]?.name ?? ''));
    if (rows.length > 1) {
      const label = el('text', { x: 9, y: mid - ROW / 2 + 9, class: 'row-label' });
      label.textContent = stars[star]?.name ?? '';
      svg.append(label);
    }
    for (const b of model.bodies.filter((body) => body.star === star)) {
      const title = `${b.name} · ${t(`survey.type.${b.type}`)} · ${t('unit.au', { n: fmtNumber(b.orbit, 3) })}${b.site ? ` · ${t(`survey.site.${b.site}`)}` : ''}`;
      const cls = `body ${b.site ?? 'none'} ${b.type}`;
      if (b.type === 'belt') svg.append(el('rect', { x: x(b.orbit) - 1, y: mid - 8, width: 2, height: 16, class: cls }, title));
      else svg.append(el('circle', { cx: x(b.orbit), cy: mid, r: SIZE[b.type] ?? 2.5, class: cls }, title));
      if (b.id === colonyBody) svg.append(el('circle', { cx: x(b.orbit), cy: mid, r: (SIZE[b.type] || 3) + 3, class: 'colony-ring' }));
    }
  });
  // Decade ticks: 0.01, 0.1, 1, 10, 100 AU.
  const base = rows.length * ROW;
  for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
    const tx = x(10 ** d);
    svg.append(el('line', { x1: tx, y1: base, x2: tx, y2: base + 3, class: 'tick' }));
    const label = el('text', { x: tx, y: base + AXIS - 2, class: 'tick-label' });
    label.textContent = t('unit.au', { n: fmtNumber(10 ** d, 2) });
    svg.append(label);
  }
  return svg;
}
