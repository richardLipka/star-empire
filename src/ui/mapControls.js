// @ts-check
import { h } from './dom.js';
import { theme } from '../render/theme.js';

/**
 * @typedef {object} MapState
 * @property {'knowledge' | 'truth'} mode
 * @property {boolean} network
 * @property {boolean} ranges
 * @property {'spectral' | 'status' | 'age'} colourBy
 * @property {Set<string> | null} highlight   legend filter: only these keys at full brightness
 *
 * @typedef {{ key: string, label: string, color: string, count: number }} LegendItem
 */

const COLOUR_MODES = /** @type {const} */ ([['spectral', 'Spectral class'], ['status', 'Status'], ['age', 'Info age']]);

/**
 * Perspective, layers, colour mode and legend, floating over the map.
 * @param {HTMLElement} container
 * @param {{ state: MapState, legend: () => LegendItem[], onChange: () => void }} deps
 */
export function mountMapControls(container, { state, legend, onChange }) {
  /** @param {string} label @param {() => boolean} get @param {() => void} set @param {string} title */
  const button = (label, get, set, title) => {
    const b = h('button.btn', { title, onclick: () => { set(); sync(); onChange(); } }, label);
    return { b, get };
  };
  const buttons = [
    button('Empire A knows', () => state.mode === 'knowledge', () => (state.mode = 'knowledge'), 'Only what the capital knows, as old as it is'),
    button('Truth', () => state.mode === 'truth', () => (state.mode = 'truth'), 'Sandbox: the real state, including what nobody has seen'),
    button('Network', () => state.network, () => (state.network = !state.network), 'Relay links within range'),
    button('Ranges', () => state.ranges, () => (state.ranges = !state.ranges), 'Relay range spheres: the reach of communication'),
    ...COLOUR_MODES.map(([key, label]) => button(label, () => state.colourBy === key, () => { state.colourBy = key; state.highlight = null; }, `Colour stars by ${label.toLowerCase()}`)),
  ];
  const list = h('div.legend');
  const hint = h('div.dim.small', {}, 'Click legend entries to highlight them.');

  container.append(h('div.map-overlay.top-left', {},
    h('div.btn-group', {}, buttons[0].b, buttons[1].b),
    h('div.btn-group', {}, buttons[2].b, buttons[3].b),
    h('div.btn-group', {}, h('span.dim.small', {}, 'Colour'), ...buttons.slice(4).map((x) => x.b)),
    list,
    hint,
    symbols(),
  ));

  function sync() {
    for (const { b, get } of buttons) b.setAttribute('aria-pressed', String(get()));
  }

  let lastKey = '';
  function renderLegend() {
    const items = legend();
    const key = `${state.colourBy}|${[...(state.highlight ?? [])].join()}|${items.map((i) => `${i.key}${i.count}`).join()}`;
    if (key === lastKey) return;
    lastKey = key;
    const rows = items.map((item) => {
      const on = !state.highlight || state.highlight.has(item.key);
      return h('button.legend-row', {
        className: `legend-row${on ? '' : ' off'}`,
        onclick: () => {
          const next = new Set(state.highlight ?? []);
          if (!state.highlight) next.add(item.key);
          else if (next.has(item.key)) next.delete(item.key);
          else next.add(item.key);
          state.highlight = next.size ? next : null;
          renderLegend();
          onChange();
        },
      }, h('span.swatch', { style: `background:${item.color}` }), h('span', {}, item.label), h('span.dim', {}, String(item.count)));
    });
    if (state.colourBy === 'age') {
      rows.unshift(h('div.legend-row.static', {}, h('span.swatch-bar', { style: `background:linear-gradient(90deg, ${theme.factions.A}, ${theme.info.stale})` }), h('span.dim', {}, `news: now → ${theme.staleAfterYears}+ y old`)));
      rows.push(h('div.legend-row.static', {}, h('span.swatch', { style: `background:${theme.info.overdue}` }), h('span.dim', {}, 'overdue')));
    }
    list.replaceChildren(...rows);
  }

  sync();
  renderLegend();
  return { renderLegend };
}

function symbols() {
  const row = (/** @type {Node} */ icon, /** @type {string} */ text) => h('div.legend-row.static', {}, icon, h('span.dim', {}, text));
  return h('details.symbols', {},
    h('summary', {}, 'Symbols'),
    row(h('span.swatch.diamond', { style: `background:${theme.factions.A}` }), 'fleet, position known'),
    row(h('span.swatch.diamond.hollow', { style: `border-color:${theme.factions.A}` }), 'fleet, position predicted'),
    row(h('span.swatch.diamond.hollow', { style: `border-color:${theme.info.overdue}` }), 'arrival unconfirmed'),
    row(h('span.swatch.diamond', { style: `background:${theme.info.ansible}` }), 'ansible fleet (live)'),
    row(h('span.swatch', { style: `background:${theme.info.plume}` }), 'drive plume (burn)'),
    row(h('span.swatch', { style: `background:${theme.info.report}` }), 'report in flight'),
    row(h('span.swatch', { style: `background:${theme.info.order}` }), 'order in flight'),
    row(h('span.swatch.ring', { style: `border-color:${theme.info.wormhole}` }), 'wormhole mouth'),
    row(h('span.swatch.ring', { style: `border-color:${theme.factions.A}` }), 'held system (ring)'),
  );
}
