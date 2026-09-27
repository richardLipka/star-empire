// @ts-check
import { h } from './dom.js';
import { theme } from '../render/theme.js';

/**
 * Perspective and layer toggles, plus the information-age legend, floating
 * over the top-left of the map.
 * @param {HTMLElement} container
 * @param {{ state: { mode: 'knowledge' | 'truth', network: boolean, ranges: boolean, age: boolean }, onChange: () => void }} deps
 */
export function mountOverlayControls(container, { state, onChange }) {
  /** @param {string} label @param {() => boolean} get @param {() => void} flip @param {string} title */
  const toggle = (label, get, flip, title) => {
    const b = h('button.btn', { title, onclick: () => { flip(); render(); onChange(); } }, label);
    return { b, sync: () => b.setAttribute('aria-pressed', String(get())) };
  };
  const knowledge = toggle('Empire A knows', () => state.mode === 'knowledge', () => (state.mode = 'knowledge'), 'Show only what the capital knows, as old as it is');
  const truth = toggle('Truth', () => state.mode === 'truth', () => (state.mode = 'truth'), 'Sandbox: show the real state, including news still in flight');
  const network = toggle('Network', () => state.network, () => (state.network = !state.network), 'Relay links within range');
  const ranges = toggle('Ranges', () => state.ranges, () => (state.ranges = !state.ranges), 'Relay range spheres: the reach of communication');
  const age = toggle('Info age', () => state.age, () => (state.age = !state.age), 'Colour outposts by the age of their latest report');
  const all = [knowledge, truth, network, ranges, age];

  const gradient = `linear-gradient(90deg, ${theme.factions.A}, ${theme.info.stale})`;
  const legend = h('div.legend', {},
    h('div.legend-row', {}, h('span.swatch-bar', { style: `background:${gradient}` }), h('span.dim', {}, `now → ${theme.staleAfterYears}+ y old`)),
    h('div.legend-row', {}, h('span.swatch', { style: `background:${theme.info.overdue}` }), h('span.dim', {}, 'overdue / stalled')),
    h('div.legend-row', {}, h('span.swatch', { style: `background:${theme.info.report}` }), h('span.dim', {}, 'report'),
      h('span.swatch', { style: `background:${theme.info.order}` }), h('span.dim', {}, 'order')),
    h('div.legend-row', {}, h('span.swatch.diamond', { style: `background:${theme.info.ansible}` }), h('span.dim', {}, 'ansible fleet'),
      h('span.swatch.ring', { style: `border-color:${theme.info.wormhole}` }), h('span.dim', {}, 'wormhole')),
  );

  container.append(h('div.map-overlay.top-left', {},
    h('div.btn-group', {}, knowledge.b, truth.b),
    h('div.btn-group', {}, network.b, ranges.b, age.b),
    legend,
  ));
  function render() {
    for (const t of all) t.sync();
    legend.style.display = state.age && state.mode === 'knowledge' ? '' : 'none';
  }
  render();
}
