// @ts-check
import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { describeFleet, fleetName } from '../text/describe.js';
import { orderRedirect } from '../../info/orders.js';

/**
 * Fleets as the current perspective shows them, with redirect for ansible fleets.
 * @param {import('./context.js').PanelContext} c
 * @param {string | null} selected
 */
export function renderFleetList(c, selected) {
  const pic = c.getPicture();
  if (!pic.fleets.length) return [h('p.hint', {}, t('fleet.none'))];
  return pic.fleets.map((f) => {
    let action = null;
    if (selected && f.empire === c.empire && f.ansible && f.at !== selected && f.dest !== selected) {
      action = h('button.btn', { onclick: () => {
        const ok = c.act((w, ctx) => orderRedirect(w, ctx, { empire: c.empire, fleet: f.id, to: selected }));
        c.toast(t(ok ? 'fleet.redirected' : 'fleet.unreachable', { fleet: fleetName(f), system: c.name(selected) }));
      } }, t('fleet.redirect'));
    } else if (selected && f.empire === c.empire && !f.ansible && !f.at) {
      action = h('span.dim', {}, t('fleet.noLink'));
    }
    return h('div.fleet-row', {},
      h('div', {},
        h('span', { className: `certainty ${f.certainty}` }, `${fleetName(f)}${f.ansible ? ' ⌁' : ''}${f.courier ? ' ✉' : ''}`),
        f.empire === c.empire && f.role !== 'generic' ? h('span.dim', {}, ` · ${t(`fleet.role.${f.role}`)}`) : null,
        h('div.dim', {}, describeFleet(f, c.name)),
        h('div.dim.small', {}, t(`fleet.certainty.${f.certainty}`)),
      ),
      action,
    );
  });
}

/** Map label for a fleet. @param {import('../../perspective/picture.js').PicFleet} f @param {(id: string) => string} name */
export const fleetLabel = (f, name) => `${fleetName(f)}${f.ansible ? ' ⌁' : ''}${f.courier ? ' ✉' : ''} ${describeFleet(f, name)}`;
