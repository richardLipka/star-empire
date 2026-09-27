// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtYear, fmtYearShort } from '../../i18n/format.js';
import { reportedBook, ordersPicture } from '../../perspective/directives.js';
import { books } from '../../governors/module.js';
import { paramSummary } from '../text/params.js';

/**
 * A system's governor: its settings and standing orders as last reported
 * (or, in the Truth view, as they are), and our orders still on their way.
 * @param {import('./context.js').PanelContext} c
 * @param {string} id
 */
export function renderGovernor(c, id) {
  const pic = c.getPicture();
  const truth = pic.mode === 'truth';
  const book = truth ? books(c.game.world)[id] : reportedBook(c.game.world, c.empire, id);
  const nodes = [];
  if (!book || (truth && book.empire !== c.empire)) {
    nodes.push(h('p.hint', {}, t('governor.none')));
  } else {
    if (!truth && 'validAt' in book) nodes.push(h('p.hint', {}, t('governor.asOf', { year: fmtYear(book.validAt), age: fmtDuration(pic.now - book.validAt) })));
    nodes.push(kv([
      [t('governor.posture'), t(`option.posture.${book.settings.posture}`)],
      [t('governor.reporting'), t(`option.mode.${book.settings.reporting}`)],
      [t('governor.relayRepair'), t(`option.repair.${book.settings.relayRepair}`)],
      [t('governor.economyFocus'), t(`option.focus.${book.settings.economyFocus ?? 'balanced'}`)],
    ]));
    const list = Object.values(book.directives ?? {});
    nodes.push(h('div.dim.small', {}, t('governor.inForce')));
    nodes.push(list.length
      ? h('ul.plain', {}, ...list.map((d) => h('li', {}, h('span', {}, t(`directive.${d.type}.name`)), h('div.dim.small', {}, paramSummary(d.type, d.params, c.name)))))
      : h('p.hint', {}, t('governor.noOrders')));
  }
  const coming = ordersPicture(c.game.world, c.game.sim.ctx, c.empire)
    .flatMap((o) => o.targetStatus.filter((x) => x.system === id && x.status === 'inTransit').map((x) => ({ o, x })));
  if (coming.length) {
    nodes.push(h('div.dim.small', {}, t('governor.onTheWay')));
    nodes.push(h('ul.plain', {}, ...coming.map(({ o, x }) => h('li', {}, `${t(`directive.${o.type}.name`)} · `, h('span.dim', {}, t('governor.arrives', { year: fmtYearShort(/** @type {number} */ (x.plannedArrival)) }))))));
  }
  return nodes;
}
