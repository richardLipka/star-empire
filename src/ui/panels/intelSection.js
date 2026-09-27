// @ts-check
import { h, kv } from '../dom.js';
import { formatDuration, formatYear } from '../../core/time.js';
import { createNetwork } from '../../info/network.js';
import { STATUSES } from '../../perspective/starStatus.js';
import { describeSighting } from '../../perspective/describe.js';
import { nameOf } from './context.js';

/** @param {import('../../info/network.js').Route} r */
const relayHops = (r) => {
  const n = r.hops.filter((x) => x.kind === 'radio').length;
  return n <= 1 ? 'direct' : `${n} hops`;
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
  const name = nameOf(c.catalog);

  /** @type {[string, string][]} */
  const rows = [['Status', /** @type {string} */ (STATUSES.find(([k]) => k === status)?.[1])]];
  if (known) {
    rows.push(['Held by', `Empire ${known.owner}`]);
    if (known.owner === pic.empire) rows.push(['Relay', known.relay === 'ok' ? 'working' : known.relay === 'none' ? 'none' : 'down']);
    if (pic.mode === 'knowledge' && id !== pic.capital) {
      rows.push(['Latest news from', formatYear(known.validAt)]);
      rows.push(['Age of news', formatDuration(known.age)]);
      rows.push(['Received', `${formatYear(known.receivedAt)} via ${known.via}${known.hops ? ` (${known.hops} hop${known.hops > 1 ? 's' : ''})` : ''}`]);
    }
  }
  rows.push(['Orders reach it', out ? `${formatDuration(out.delay)} · ${relayHops(out)}` : 'not by light']);
  if (known?.owner === pic.empire) rows.push(['Its reports need', back ? `${formatDuration(back.delay)} · ${relayHops(back)}` : 'no route (silent)']);

  const nodes = [kv(rows)];
  if (known?.overdue) nodes.push(h('p.warn', {}, `Reports overdue: nothing received for ${formatDuration(pic.now - known.receivedAt)}.`));
  const seen = pic.sightings.filter((s) => s.near === id || s.observer === id).slice(-4);
  if (seen.length) nodes.push(h('div.small', {}, h('div.dim', {}, 'Drive plumes near here:'), ...seen.map((s) => h('div', {}, describeSighting(s, name)))));
  nodes.push(h('p.hint', {}, pic.mode === 'knowledge' ? 'As known at the capital now. Switch to Truth to compare.' : 'Truth: the real state right now.'));
  return nodes;
}
