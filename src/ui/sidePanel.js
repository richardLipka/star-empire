// @ts-check
import { h } from './dom.js';
import { formatDuration } from '../core/time.js';
import { distance } from '../core/vec3.js';
import { measure } from '../galaxy/measure.js';
import { START_DRIVE } from '../fleet/drives.js';
import { renderOverview, renderSummary } from './panels/overviewPanel.js';
import { renderIntel } from './panels/intelSection.js';
import { renderStars } from './panels/starSection.js';
import { renderSandboxTools } from './panels/sandboxTools.js';
import { renderFleetList } from './panels/fleetList.js';
import { renderMeasure } from './panels/measureSection.js';

/**
 * The side panel: composes the sections. Static parts render on selection
 * change; `refresh()` updates the live parts (intelligence, fleets, summary).
 * @param {HTMLElement} root
 * @param {Omit<import('./panels/context.js').PanelContext, 'act'>} deps
 */
export function createSidePanel(root, deps) {
  /** @type {{ selected: string | null, measure: string | null }} */
  let current = { selected: null, measure: null };
  const live = { intel: h('div'), fleets: h('div'), summary: h('div') };

  /** @type {import('./panels/context.js').PanelContext} */
  const c = {
    ...deps,
    act(fn, done) {
      try {
        const r = deps.game.act(fn);
        if (done) deps.toast(done);
        render(current.selected, current.measure);
        return r;
      } catch (e) {
        deps.toast(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
  };

  /** @param {string | null} selected @param {string | null} measureId */
  function render(selected, measureId) {
    current = { selected, measure: measureId };
    if (!selected) {
      root.replaceChildren(...renderOverview(c, live));
    } else {
      const s = c.catalog.get(selected);
      const fromSol = distance(s.pos, c.catalog.sol.pos);
      const trip = measure(c.catalog.sol, s, [START_DRIVE]).trips[0].profile;
      const parts = [
        h('h2', {}, s.name),
        h('p.hint', {}, s.id === 'sol' ? 'Seat of Empire A.' : `${fromSol.toFixed(2)} ly from Sol · light ${formatDuration(fromSol)} · early fusion trip ${formatDuration(trip.totalTime)}`),
        h('h3', {}, 'Intelligence'), live.intel,
        ...renderStars(c, s),
        h('h3', {}, 'Sandbox tools'), renderSandboxTools(c, selected, measureId),
        h('h3', {}, 'Fleets'), live.fleets,
      ];
      if (measureId && measureId !== selected) parts.push(...renderMeasure(s, c.catalog.get(measureId)));
      root.replaceChildren(...parts);
    }
    refresh();
  }

  function refresh() {
    if (current.selected) live.intel.replaceChildren(...renderIntel(c, current.selected));
    else live.summary.replaceChildren(...renderSummary(c));
    live.fleets.replaceChildren(...renderFleetList(c, current.selected));
  }

  return { render, refresh };
}
