// @ts-check
import { h } from './dom.js';
import { t } from '../i18n/index.js';
import { fmtDuration, fmtYearShort } from '../i18n/format.js';
import { describeDispatch } from './text/describe.js';

const SHOWN = 7;

/**
 * Latest dispatches received at the capital: what happened when, and when we heard.
 * @param {HTMLElement} container
 * @param {{ getDispatches: () => import('../info/knowledge.js').Dispatch[], name: (id: string) => string }} deps
 */
export function mountDispatchLog(container, { getDispatches, name }) {
  const list = h('ol.dispatch-list');
  container.append(h('div.map-overlay.bottom-left', {}, h('div.overlay-title', {}, t('dispatch.title')), list));
  let lastKey = '';
  return {
    render() {
      const items = getDispatches().slice(-SHOWN).reverse();
      const key = items.map((d) => d.id).join();
      if (key === lastKey) return;
      lastKey = key;
      list.replaceChildren(...(items.length ? items.map((d) => {
        const age = fmtDuration(d.receivedAt - d.validAt);
        const via = t(`intel.via.${d.via}`);
        const meta = d.hops ? t('dispatch.metaHops', { age, via, hops: t('intel.hops', { count: d.hops }) }) : t('dispatch.meta', { age, via });
        return h('li', {}, h('span.when', {}, fmtYearShort(d.receivedAt)), h('span', {}, describeDispatch(d, name)), h('span.dim', {}, meta));
      }) : [h('li.dim', {}, t('dispatch.empty'))]));
    },
  };
}
