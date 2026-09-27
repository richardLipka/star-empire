// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtYear } from '../../i18n/format.js';
import { createNetwork } from '../../info/network.js';
import { describeSighting } from '../text/describe.js';

/** @param {import('../../info/network.js').Route} r */
const relayHops = (r) => {
  const n = r.hops.filter((x) => x.kind === 'radio').length;
  return n <= 1 ? t('intel.direct') : t('intel.hops', { count: n });
};

/**
 * What the current perspective knows about one system.
 * @param {import('./context.js').PanelContext} c
 * @param {string} id
 */
export function renderIntel(c, id) {
  const pic = c.getPicture();
  const status = c.getStatuses().get(id) ?? 'unexplored';
  const known = pic.systems.find((s) => s.id === id);
  const net = createNetwork({ capital: pic.capital, range: pic.range, relays: pic.relays, fleets: [], posOf: (x) => c.catalog.get(x).pos });
  const out = net.route(pic.capital, id);
  const back = known?.owner === pic.empire && known.relay === 'ok' ? net.route(id, pic.capital) : null;

  /** @type {[string, string][]} */
  const rows = [[t('intel.status'), t(`status.${status}`)]];
  if (known) {
    rows.push([t('intel.heldBy'), t('empire.name', { id: known.owner })]);
    if (known.owner === pic.empire) rows.push([t('intel.relay'), t(known.relay === 'ok' ? 'intel.relayOk' : known.relay === 'none' ? 'intel.relayNone' : 'intel.relayDown')]);
    if (pic.mode === 'knowledge' && id !== pic.capital) {
      rows.push([t('intel.latest'), fmtYear(known.validAt)]);
      rows.push([t('intel.age'), fmtDuration(known.age)]);
      const via = t(`intel.via.${known.via}`);
      rows.push([t('intel.received'), t('intel.receivedVia', { year: fmtYear(known.receivedAt), via }) + (known.hops ? ` (${t('intel.hops', { count: known.hops })})` : '')]);
    }
  }
  rows.push([t('intel.ordersReach'), out ? `${fmtDuration(out.delay)} · ${relayHops(out)}` : t('intel.notByLight')]);
  if (known?.owner === pic.empire) rows.push([t('intel.reportsNeed'), back ? `${fmtDuration(back.delay)} · ${relayHops(back)}` : t('intel.silent')]);

  const nodes = [kv(rows)];
  if (known?.overdue) nodes.push(h('p.warn', {}, t('intel.overdue', { years: fmtDuration(pic.now - known.receivedAt) })));
  const seen = pic.sightings.filter((s) => s.near === id || s.observer === id).slice(-4);
  if (seen.length) nodes.push(h('div.small', {}, h('div.dim', {}, t('intel.plumesNear')), ...seen.map((s) => h('div', {}, describeSighting(s, c.name)))));
  nodes.push(h('p.hint', {}, t(pic.mode === 'knowledge' ? 'intel.asKnown' : 'intel.truth')));
  return nodes;
}
