// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtPeople } from '../../i18n/format.js';
import { infoState } from '../../info/module.js';
import { countStatuses } from '../../perspective/starStatus.js';
import { securityPicture } from '../../perspective/security.js';
import { colonyTotals } from '../../perspective/colony.js';

/**
 * Empire summary shown when nothing is selected.
 * @param {import('./context.js').PanelContext} c
 */
export function renderSummary(c) {
  const pic = c.getPicture();
  const own = pic.systems.filter((s) => s.owner === c.empire);
  const counts = countStatuses(c.getStatuses());
  const truth = pic.mode === 'truth';
  return [kv([
    [t(truth ? 'panel.outposts' : 'panel.outpostsKnown'), String(own.length)],
    [t(truth ? 'panel.relaysWorking' : 'panel.relaysBelieved'), String(pic.relays.length)],
    ...colonyRows(c, pic),
    [t('panel.overdue'), String(own.filter((s) => s.overdue).length)],
    [t('panel.oldestNews'), fmtDuration(own.reduce((m, s) => Math.max(m, s.age), 0))],
    [t('panel.explored'), String((counts.explored ?? 0) + own.length)],
    [t('panel.foreign'), String(counts.foreign ?? 0)],
    [t('panel.plumes'), String(pic.sightings.filter((s) => !s.own).length)],
    [t('panel.ordersInFlight'), String(pic.messages.filter((m) => m.kind === 'directive' || m.kind === 'fleetOrder' || m.kind === 'note').length)],
    ...securityRows(c, pic),
  ])];
}

/** @param {import('./context.js').PanelContext} c @param {import('../../perspective/picture.js').Picture} pic @returns {[string, string][]} */
function colonyRows(c, pic) {
  const totals = colonyTotals(c.game.world, pic);
  return [
    [t(pic.mode === 'truth' ? 'panel.population' : 'panel.populationKnown'), fmtPeople(totals.population)],
    [t('panel.troubled'), String(totals.troubled)],
  ];
}

/** @param {import('./context.js').PanelContext} c @param {import('../../perspective/picture.js').Picture} pic @returns {[string, string][]} */
function securityRows(c, pic) {
  const sec = securityPicture(c.game.world, c.game.sim.ctx, pic);
  return [
    [t('panel.overheard'), t('panel.overheardRead', { count: sec.overheard, read: sec.read })],
    [t('panel.exposed'), String(sec.exposed.length)],
  ];
}

/**
 * @param {import('./context.js').PanelContext} c
 * @param {{ summary: HTMLElement, fleets: HTMLElement }} live
 */
export function renderOverview(c, live) {
  const m = c.catalog.meta;
  const pause = h('input', {
    type: 'checkbox', checked: infoState(c.game.world).pauseOnDispatch === c.empire,
    onchange: (/** @type {Event} */ e) => c.game.act((w) => (infoState(w).pauseOnDispatch = /** @type {HTMLInputElement} */ (e.target).checked ? c.empire : null)),
  });
  // The translated sentence places the two links; split it around placeholders.
  const credits = t('panel.credits', { source: '§S§', author: m.author, license: '§L§' }).split(/(§S§|§L§)/).map((part) => {
    if (part === '§S§') return h('a', { href: m.url, target: '_blank', rel: 'noopener' }, m.source);
    if (part === '§L§') return h('a', { href: m.licenseUrl, target: '_blank', rel: 'noopener' }, m.license);
    return part;
  });
  return [
    h('h2', {}, t('empire.name', { id: c.empire })),
    h('p.hint', {}, t('panel.overviewHint', { systems: m.systemCount, radius: m.radiusLy })),
    live.summary,
    h('div.tools', {}, h('label', {}, pause, ` ${t('panel.pauseOnDispatch')}`)),
    h('h3', {}, t('panel.controls')),
    kv([
      [t('control.click'), t('control.clickDo')],
      [t('control.shift'), t('control.shiftDo')],
      [t('control.double'), t('control.doubleDo')],
      [t('control.drag'), t('control.dragDo')],
      [t('control.space'), t('control.spaceDo')],
      [t('control.esc'), t('control.escDo')],
    ]),
    h('h3', {}, t('panel.knownFleets')),
    live.fleets,
    h('p.hint.credits', {}, ...credits),
  ];
}
