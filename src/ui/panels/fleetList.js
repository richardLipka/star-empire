// @ts-check
import { h } from '../dom.js';
import { describeFleet } from '../../perspective/describe.js';
import { orderRedirect } from '../../info/orders.js';
import { nameOf } from './context.js';

const CERTAINTY_NOTE = {
  live: 'seen now',
  confirmed: 'arrival reported',
  expected: 'predicted from its departure report',
  unconfirmed: 'no arrival report yet',
  actual: 'truth',
};

/**
 * Fleets as the current perspective shows them, with redirect for ansible fleets.
 * @param {import('./context.js').PanelContext} c
 * @param {string | null} selected
 */
export function renderFleetList(c, selected) {
  const pic = c.getPicture();
  const name = nameOf(c.catalog);
  if (!pic.fleets.length) return [h('p.hint', {}, 'None known.')];
  return pic.fleets.map((f) => {
    let action = null;
    if (selected && f.empire === c.empire && f.ansible && f.at !== selected && f.dest !== selected) {
      action = h('button.btn', { onclick: () => {
        const ok = c.act((w, ctx) => orderRedirect(w, ctx, { empire: c.empire, fleet: f.id, to: selected }));
        c.toast(ok ? `${f.name} redirected to ${name(selected)} by ansible` : `${f.name} cannot be reached`);
      } }, 'Redirect here');
    } else if (selected && f.empire === c.empire && !f.ansible && !f.at) {
      action = h('span.dim', {}, 'no link in flight');
    }
    return h('div.fleet-row', {},
      h('div', {},
        h('span', { className: `certainty ${f.certainty}` }, `${f.name}${f.ansible ? ' ⌁' : ''}${f.courier ? ' ✉' : ''}`),
        f.empire !== c.empire ? h('span.dim', {}, ` (Empire ${f.empire})`) : null,
        h('div.dim', {}, describeFleet(f, name)),
        h('div.dim.small', {}, CERTAINTY_NOTE[f.certainty]),
      ),
      action,
    );
  });
}
