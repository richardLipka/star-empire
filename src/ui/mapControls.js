// @ts-check
import { h } from './dom.js';
import { theme } from '../render/theme.js';
import { t } from '../i18n/index.js';

/**
 * @typedef {object} MapState
 * @property {'knowledge' | 'truth'} mode
 * @property {boolean} network
 * @property {boolean} ranges
 * @property {boolean} security   mark our relay links exposed to foreign listeners
 * @property {'spectral' | 'status' | 'age'} colourBy
 * @property {Set<string> | null} highlight   legend filter: only these keys at full brightness
 *
 * @typedef {{ key: string, label: string, color: string, count: number }} LegendItem
 */

const COLOUR_MODES = /** @type {const} */ (['spectral', 'status', 'age']);

/**
 * Perspective, layers, colour mode and legend, floating over the map.
 * @param {HTMLElement} container
 * @param {{ state: MapState, empire: string, legend: () => LegendItem[], onChange: () => void }} deps
 */
export function mountMapControls(container, { state, empire, legend, onChange }) {
  /** @param {string} label @param {() => boolean} get @param {() => void} set @param {string} title */
  const button = (label, get, set, title) => {
    const b = h('button.btn', { title, onclick: () => { set(); sync(); onChange(); } }, label);
    return { b, get };
  };
  const buttons = [
    button(t('map.knows', { empire }), () => state.mode === 'knowledge', () => (state.mode = 'knowledge'), t('map.knowsTitle')),
    button(t('map.truth'), () => state.mode === 'truth', () => (state.mode = 'truth'), t('map.truthTitle')),
    button(t('map.network'), () => state.network, () => (state.network = !state.network), t('map.networkTitle')),
    button(t('map.ranges'), () => state.ranges, () => (state.ranges = !state.ranges), t('map.rangesTitle')),
    button(t('map.security'), () => state.security, () => (state.security = !state.security), t('map.securityTitle')),
    ...COLOUR_MODES.map((key) => button(t(`map.${key}`), () => state.colourBy === key, () => { state.colourBy = key; state.highlight = null; }, t('map.colourTitle', { mode: t(`map.${key}`) }))),
  ];
  const list = h('div.legend');
  const hint = h('div.dim.small', {}, t('map.legendHint'));

  container.append(h('div.map-overlay.top-left', {},
    h('div.btn-group', {}, buttons[0].b, buttons[1].b),
    h('div.btn-group', {}, buttons[2].b, buttons[3].b, buttons[4].b),
    h('div.btn-group', {}, h('span.dim.small', {}, t('map.colour')), ...buttons.slice(5).map((x) => x.b)),
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
      rows.unshift(h('div.legend-row.static', {}, h('span.swatch-bar', { style: `background:linear-gradient(90deg, ${theme.factions.A}, ${theme.info.stale})` }), h('span.dim', {}, t('map.ageScale', { years: theme.staleAfterYears }))));
      rows.push(h('div.legend-row.static', {}, h('span.swatch', { style: `background:${theme.info.overdue}` }), h('span.dim', {}, t('map.overdue'))));
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
    h('summary', {}, t('map.symbols')),
    row(h('span.swatch.diamond', { style: `background:${theme.factions.A}` }), t('symbol.fleetKnown')),
    row(h('span.swatch.diamond.hollow', { style: `border-color:${theme.factions.A}` }), t('symbol.fleetPredicted')),
    row(h('span.swatch.diamond.hollow', { style: `border-color:${theme.info.overdue}` }), t('symbol.fleetUnconfirmed')),
    row(h('span.swatch.diamond', { style: `background:${theme.info.ansible}` }), t('symbol.ansible')),
    row(h('span.swatch', { style: `background:${theme.info.plume}` }), t('symbol.plume')),
    row(h('span.swatch', { style: `background:${theme.info.report}` }), t('symbol.report')),
    row(h('span.swatch', { style: `background:${theme.info.order}` }), t('symbol.order')),
    row(h('span.swatch.ring', { style: `border-color:${theme.info.wormhole}` }), t('symbol.wormhole')),
    row(h('span.swatch.ring', { style: `border-color:${theme.factions.A}` }), t('symbol.held')),
    row(h('span.swatch-bar', { style: `background:${theme.info.overdue};height:2px` }), t('symbol.exposed')),
  );
}
