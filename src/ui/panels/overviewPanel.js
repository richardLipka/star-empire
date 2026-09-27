// @ts-check
import { h, kv } from '../dom.js';
import { formatDuration } from '../../core/time.js';
import { infoState } from '../../info/module.js';
import { countStatuses } from '../../perspective/starStatus.js';

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
    [truth ? 'Outposts' : 'Outposts known', String(own.length)],
    [truth ? 'Relays working' : 'Relays believed working', String(pic.relays.length)],
    ['Overdue', String(own.filter((s) => s.overdue).length)],
    ['Oldest news', formatDuration(own.reduce((m, s) => Math.max(m, s.age), 0))],
    ['Explored systems', String((counts.explored ?? 0) + own.length)],
    ['Foreign systems known', String(counts.foreign ?? 0)],
    ['Drive plumes on record', String(pic.sightings.filter((s) => !s.own).length)],
    ['Our orders in flight', String(pic.messages.filter((m) => m.kind === 'directive' || m.kind === 'fleetOrder' || m.kind === 'note').length)],
  ])];
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
  return [
    h('h2', {}, `Empire ${c.empire}`),
    h('p.hint', {}, `Seat at Sol. ${m.systemCount} systems within ${m.radiusLy} ly. Sandbox: relay outposts founded in 2400, one beyond every relay's reach; Empire B next door, unknown to you.`),
    live.summary,
    h('div.tools', {}, h('label', {}, pause, ' Pause when a dispatch arrives')),
    h('h3', {}, 'Controls'),
    kv([
      ['Click', 'select a system'],
      ['Shift+click', 'measure / choose target'],
      ['Double-click', 'centre the view'],
      ['Drag / wheel', 'orbit / zoom'],
      ['Space', 'pause / run'],
      ['Esc', 'deselect'],
    ]),
    h('h3', {}, 'Known fleets'),
    live.fleets,
    h('p.hint.credits', {},
      'Star data: ', h('a', { href: m.url, target: '_blank', rel: 'noopener' }, m.source), ` by ${m.author}, `,
      h('a', { href: m.licenseUrl, target: '_blank', rel: 'noopener' }, m.license), '.'),
  ];
}
