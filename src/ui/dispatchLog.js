// @ts-check
import { h } from './dom.js';
import { formatDuration, formatYear } from '../core/time.js';

const SHOWN = 7;

/**
 * Latest dispatches received at the capital: what happened when, and when we heard.
 * @param {HTMLElement} container
 * @param {{ getDispatches: () => import('../info/knowledge.js').Dispatch[] }} deps
 */
export function mountDispatchLog(container, { getDispatches }) {
  const list = h('ol.dispatch-list');
  container.append(h('div.map-overlay.bottom-left', {}, h('div.overlay-title', {}, 'Dispatches'), list));
  let lastKey = '';
  return {
    render() {
      const items = getDispatches().slice(-SHOWN).reverse();
      const key = items.map((d) => d.id).join();
      if (key === lastKey) return;
      lastKey = key;
      list.replaceChildren(...(items.length ? items.map((d) => h('li', {},
        h('span.when', {}, formatYear(d.receivedAt).slice(0, 7)),
        h('span', {}, d.text),
        h('span.dim', {}, ` · ${formatDuration(d.receivedAt - d.validAt)} old · ${d.via}${d.hops ? `, ${d.hops} hop${d.hops > 1 ? 's' : ''}` : ''}`),
      )) : [h('li.dim', {}, 'Nothing yet. Orders and reports travel at light speed.')]));
    },
  };
}
