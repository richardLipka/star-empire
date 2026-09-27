// @ts-check
import { h } from './dom.js';
import { t } from '../i18n/index.js';
import { fmtDuration, fmtLy } from '../i18n/format.js';
import { distance } from '../core/vec3.js';
import { measure } from '../galaxy/measure.js';
import { START_DRIVE } from '../fleet/drives.js';
import { renderOverview, renderSummary } from './panels/overviewPanel.js';
import { renderIntel } from './panels/intelSection.js';
import { renderStars } from './panels/starSection.js';
import { renderSandboxTools } from './panels/sandboxTools.js';
import { renderFleetList } from './panels/fleetList.js';
import { renderMeasure } from './panels/measureSection.js';
import { renderGovernor } from './panels/governorSection.js';
import { renderColony } from './panels/colonySection.js';
import { renderComposer, renderOrderList } from './panels/ordersTab.js';
import { describeError } from './text/describe.js';

/**
 * The side panel: a "System" tab (overview or the selected system) and an
 * "Orders" tab (directives). Static parts render on selection or tab change;
 * `refresh()` updates the live parts.
 * @param {HTMLElement} root
 * @param {Omit<import('./panels/context.js').PanelContext, 'act' | 'getSelection'>} deps
 */
export function createSidePanel(root, deps) {
  /** @type {{ selected: string | null, measure: string | null }} */
  let current = { selected: null, measure: null };
  let tab = /** @type {'system' | 'orders'} */ ('system');
  const live = { intel: h('div'), fleets: h('div'), summary: h('div'), governor: h('div'), colony: h('div'), orders: h('div') };

  /** @type {import('./panels/context.js').PanelContext} */
  const c = {
    ...deps,
    getSelection: () => current,
    act(fn, done) {
      try {
        const r = deps.game.act(fn);
        if (done) deps.toast(done);
        render(current.selected, current.measure);
        return r;
      } catch (e) {
        deps.toast(describeError(e));
        return null;
      }
    },
  };

  const tabs = () => h('div.tabs', {},
    ...(/** @type {const} */ (['system', 'orders'])).map((id) => h('button.tab', { 'aria-selected': String(tab === id), onclick: () => { tab = id; render(current.selected, current.measure); } }, t(`tab.${id}`))));

  /** @param {string | null} selected @param {string | null} measureId */
  function render(selected, measureId) {
    current = { selected, measure: measureId };
    const parts = [tabs()];
    if (tab === 'orders') {
      parts.push(...renderComposer(c, () => render(current.selected, current.measure)).filter(Boolean), h('h3', {}, t('orders.list')), live.orders);
    } else if (!selected) {
      parts.push(...renderOverview(c, live));
    } else {
      const s = c.catalog.get(selected);
      const fromSol = distance(s.pos, c.catalog.sol.pos);
      const trip = measure(c.catalog.sol, s, [START_DRIVE]).trips[0].profile;
      parts.push(
        h('h2', {}, s.name),
        h('p.hint', {}, s.id === 'sol' ? t('panel.seat', { empire: c.empire }) : t('panel.fromSol', { distance: fmtLy(fromSol), light: fmtDuration(fromSol), trip: fmtDuration(trip.totalTime) })),
        h('h3', {}, t('panel.intelligence')), live.intel,
        h('h3', {}, t('panel.colony')), live.colony,
        h('h3', {}, t('panel.governor')), live.governor,
        ...renderStars(c, s),
        h('h3', {}, t('panel.sandbox')), renderSandboxTools(c, selected, measureId),
        h('h3', {}, t('panel.fleets')), live.fleets,
      );
      if (measureId && measureId !== selected) parts.push(...renderMeasure(s, c.catalog.get(measureId)));
    }
    root.replaceChildren(.../** @type {Node[]} */ (parts));
    refresh();
  }

  function refresh() {
    if (tab === 'orders') {
      live.orders.replaceChildren(...renderOrderList(c));
      return;
    }
    if (current.selected) {
      live.intel.replaceChildren(...renderIntel(c, current.selected));
      live.governor.replaceChildren(...renderGovernor(c, current.selected));
      live.colony.replaceChildren(...renderColony(c, current.selected));
    } else {
      live.summary.replaceChildren(...renderSummary(c));
    }
    live.fleets.replaceChildren(...renderFleetList(c, current.selected));
  }

  return { render, refresh };
}
