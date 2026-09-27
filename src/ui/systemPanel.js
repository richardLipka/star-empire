// @ts-check
import { h, kv } from './dom.js';
import { formatDuration, formatYear } from '../core/time.js';
import { distance } from '../core/vec3.js';
import { measure, systemTraits } from '../galaxy/index.js';
import { DRIVE_TIERS, START_DRIVE, WEAR_ABOVE_G } from '../fleet/drives.js';
import { createNetwork } from '../info/network.js';
import { establishPresence, setRelay, empireState } from '../empire/module.js';
import { orderDispatch, orderRedirect, sendNote } from '../info/orders.js';
import { openWormhole } from '../events/wormholes.js';
import { infoState } from '../info/module.js';

const EMPIRE = 'A';

/**
 * Side panel for the galaxy screen: overview, selected system (with what the
 * capital knows about it), sandbox tools, fleets, and measurement.
 * @param {HTMLElement} root
 * @param {object} deps
 * @param {import('../galaxy/catalog.js').Catalog} deps.catalog
 * @param {ReturnType<typeof import('../app/gameHost.js').createGameHost>} deps.game
 * @param {() => import('../perspective/picture.js').Picture} deps.getPicture
 * @param {(msg: string) => void} deps.toast
 */
export function createSystemPanel(root, { catalog, game, getPicture, toast }) {
  const pct = (/** @type {number} */ x) => `${Math.round(x * 100)} %`;
  const ly = (/** @type {number} */ x) => `${x.toFixed(2)} ly`;
  const name = (/** @type {string} */ id) => catalog.get(id).name;
  const form = { tier: 0, ansible: false, courier: false };
  /** @type {{ selected: string | null, measure: string | null }} */
  let current = { selected: null, measure: null };
  /** Containers refreshed twice a second. */
  const live = { intel: h('div'), fleets: h('div'), summary: h('div') };

  /** @param {(world: any, ctx: any) => any} fn @param {string} done */
  const act = (fn, done) => {
    try {
      const r = game.act(fn);
      if (done) toast(done);
      render(current.selected, current.measure);
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  function knownNetwork() {
    const pic = getPicture();
    return createNetwork({ capital: pic.capital, range: pic.range, relays: pic.relays, fleets: [], posOf: (id) => catalog.get(id).pos });
  }

  function overview() {
    const m = catalog.meta;
    const pause = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: infoState(game.world).pauseOnDispatch,
      onchange: (/** @type {Event} */ e) => game.act((w) => (infoState(w).pauseOnDispatch = /** @type {HTMLInputElement} */ (e.target).checked)) }));
    return [
      h('h2', {}, 'Empire A'),
      h('p.hint', {}, `Seat at Sol. ${m.systemCount} systems within ${m.radiusLy} ly. Sandbox: relay outposts founded in 2400, one of them beyond every relay's reach.`),
      live.summary,
      h('div.tools', {}, h('label', {}, pause, ' Pause when a dispatch arrives')),
      h('h3', {}, 'Controls'),
      kv([
        ['Click', 'select a system'],
        ['Shift+click', 'measure / choose target'],
        ['Double-click', 'centre the view'],
        ['Drag / wheel', 'orbit / zoom'],
        ['Space', 'pause / run'],
      ]),
      h('h3', {}, 'Known fleets'),
      live.fleets,
      credits(),
    ];
  }

  /** @param {import('../galaxy/catalog.js').StarSystem} s */
  function systemDetails(s) {
    const traits = systemTraits(game.world.seed, s);
    const fromSol = distance(s.pos, catalog.sol.pos);
    const trip = measure(catalog.sol, s, [START_DRIVE]).trips[0].profile;
    return [
      h('h2', {}, s.name),
      h('p.hint', {}, s.id === 'sol' ? 'Seat of Empire A.' : `${ly(fromSol)} from Sol · light ${formatDuration(fromSol)} · early fusion trip ${formatDuration(trip.totalTime)}`),
      h('h3', {}, 'Intelligence'),
      live.intel,
      h('h3', {}, 'Sandbox tools'),
      tools(s),
      h('h3', {}, 'Fleets'),
      live.fleets,
      h('h3', {}, s.stars.length > 1 ? `Stars (${s.stars.length})` : 'Star'),
      kv(s.stars.map((st) => [st.name, `${st.spect} · L ${formatLum(st.lum)}`])),
      h('h3', {}, 'Survey estimate'),
      kv([['Habitability', pct(traits.habitability)], ['Resources', pct(traits.richness)], ['Major bodies', String(traits.planets)]]),
    ];
  }

  /** @param {import('../galaxy/catalog.js').StarSystem} s */
  function tools(s) {
    const presence = empireState(game.world).presence[s.id];
    const target = current.measure && current.measure !== s.id ? current.measure : null;
    const rows = [];
    if (!presence) {
      rows.push(h('div.row', {}, h('button.btn', { onclick: () => act((w, c) => establishPresence(w, c, { empire: EMPIRE, system: s.id }), `Outpost founded at ${s.name}`) }, 'Found outpost')));
    } else if (presence.relay === 'ok') {
      rows.push(h('div.row', {}, h('button.btn', { onclick: () => act((w, c) => setRelay(w, c, { system: s.id, state: 'destroyed' }), `Relay at ${s.name} destroyed`) }, 'Destroy relay'), h('span.dim', {}, 'receives, cannot send')));
    } else {
      rows.push(h('div.row', {}, h('button.btn', { onclick: () => act((w, c) => setRelay(w, c, { system: s.id, state: 'ok' }), `Relay at ${s.name} rebuilt`) }, 'Rebuild relay')));
    }
    if (!target) {
      rows.push(h('p.hint', {}, 'Shift+click a second system for messages, fleets and wormholes.'));
      return h('div.tools', {}, ...rows);
    }
    const tName = name(target);
    const drive = /** @type {HTMLSelectElement} */ (h('select', { onchange: (/** @type {Event} */ e) => (form.tier = Number(/** @type {HTMLSelectElement} */ (e.target).value)) },
      ...DRIVE_TIERS.map((d, i) => h('option', { value: i, selected: i === form.tier }, `${d.accelG} g · ${d.cruise} c${d.accelG > WEAR_ABOVE_G ? ' (wear)' : ''}`))));
    const check = (/** @type {'ansible' | 'courier'} */ key, /** @type {string} */ label) => h('label', {},
      h('input', { type: 'checkbox', checked: form[key], onchange: (/** @type {Event} */ e) => (form[key] = /** @type {HTMLInputElement} */ (e.target).checked) }), ` ${label}`);
    rows.push(
      h('div.row', {}, h('button.btn', { onclick: () => act((w, c) => sendNote(w, c, { empire: EMPIRE, from: s.id, to: target, text: `Note from ${s.name}` }), `Note sent ${s.name} → ${tName}`) }, `Send note → ${tName}`)),
      h('div.row', {}, drive, check('ansible', 'ansible'), check('courier', 'courier')),
      h('div.row', {}, h('button.btn', {
        onclick: () => act((w, c) => orderDispatch(w, c, { empire: EMPIRE, from: s.id, to: target, drive: DRIVE_TIERS[form.tier], ansible: form.ansible, courier: form.courier }), `Order sent from Sol: ${s.name} to launch for ${tName}`),
      }, `Order fleet ${s.name} → ${tName}`)),
      h('p.hint', {}, 'The order travels from Sol to this system first; the fleet launches when it arrives.'),
      h('div.row', {}, h('button.btn', { onclick: () => act((w, c) => openWormhole(w, c, { a: s.id, b: target }), `Wormhole opened ${s.name} ↔ ${tName}`) }, `Open wormhole ↔ ${tName}`)),
    );
    return h('div.tools', {}, ...rows);
  }

  /** @param {import('../galaxy/catalog.js').StarSystem} a @param {import('../galaxy/catalog.js').StarSystem} b */
  function measurement(a, b) {
    const m = measure(a, b, DRIVE_TIERS);
    const oneG = m.trips.find((t) => t.drive.accelG === 1) ?? m.trips[m.trips.length - 1];
    return [
      h('h3', {}, `Measure: ${a.name} → ${b.name}`),
      kv([['Distance', ly(m.distance)], ['Light delay', formatDuration(m.lightDelay)]]),
      kv(m.trips.map(({ drive, profile }) => [
        `${drive.accelG} g → ${drive.cruise} c${drive.accelG > WEAR_ABOVE_G ? ' ⚠' : ''}`,
        `${formatDuration(profile.totalTime)} (crew ${formatDuration(profile.properTime)})`,
      ])),
      h('p.hint', {}, `Warning at arrival, braking at ${oneG.drive.accelG} g: ${formatDuration(oneG.profile.warning)}. ⚠ = wear above ${WEAR_ABOVE_G} g.`),
    ];
  }

  function refreshIntel() {
    const id = current.selected;
    if (!id) return;
    const pic = getPicture();
    const known = pic.systems.find((s) => s.id === id);
    const net = knownNetwork();
    const out = net.route(pic.capital, id);
    const back = known?.relay === 'ok' ? net.route(id, pic.capital) : null;
    const rows = /** @type {[string, string][]} */ ([]);
    if (!known) rows.push(['Status', pic.mode === 'truth' ? 'no presence' : 'no reports: not ours, or unknown']);
    else {
      rows.push(['Held by', `Empire ${known.owner}`]);
      rows.push(['Relay', known.relay === 'ok' ? 'working' : 'down']);
      if (pic.mode === 'knowledge' && id !== pic.capital) {
        rows.push(['Latest news from', formatYear(known.validAt)]);
        rows.push(['Age of news', formatDuration(known.age)]);
        rows.push(['Received', `${formatYear(known.receivedAt)} via ${known.via}${known.hops ? ` (${known.hops} hop${known.hops > 1 ? 's' : ''})` : ''}`]);
      }
    }
    rows.push(['Orders reach it', out ? `${formatDuration(out.delay)} · ${relayHops(out)}` : 'not by light']);
    if (known) rows.push(['Its reports need', back ? `${formatDuration(back.delay)} · ${relayHops(back)}` : 'no route (silent)']);
    const nodes = [kv(rows)];
    if (known?.overdue) nodes.push(h('p.warn', {}, `Reports overdue: nothing received for ${formatDuration(pic.now - known.receivedAt)}.`));
    if (pic.mode === 'knowledge') nodes.push(h('p.hint', {}, 'As known at Sol now. Switch to Truth to compare.'));
    live.intel.replaceChildren(...nodes);
  }

  function refreshFleets() {
    const pic = getPicture();
    const sel = current.selected;
    if (!pic.fleets.length) {
      live.fleets.replaceChildren(h('p.hint', {}, 'None known.'));
      return;
    }
    live.fleets.replaceChildren(...pic.fleets.map((f) => {
      const where = f.status === 'docked' ? `at ${name(/** @type {string} */ (f.at))}` : f.status === 'unconfirmed' ? `should be at ${name(/** @type {string} */ (f.dest))}` : `→ ${name(/** @type {string} */ (f.dest))}, ETA ${formatYear(/** @type {number} */ (f.eta)).slice(0, 7)}`;
      const age = f.live ? (f.ansible ? 'live (ansible)' : 'live') : `${formatDuration(f.age)} old`;
      let action = null;
      if (sel && f.ansible && f.at !== sel && f.dest !== sel) {
        action = h('button.btn', { onclick: () => {
          const ok = act((w, c) => orderRedirect(w, c, { empire: EMPIRE, fleet: f.id, to: sel }), '');
          toast(ok ? `${f.name} redirected to ${name(sel)} by ansible` : `${f.name} cannot be reached`);
        } }, 'Redirect here');
      } else if (sel && !f.ansible && f.status !== 'docked') {
        action = h('span.dim', {}, 'no link in flight');
      }
      return h('div.fleet-row', {}, h('span', {}, `${f.name}${f.ansible ? ' ⌁' : ''}${f.courier ? ' ✉' : ''} `, h('span.dim', {}, `${where} · ${age}`)), action);
    }));
  }

  function refreshSummary() {
    const pic = getPicture();
    const own = pic.systems.filter((s) => s.owner === EMPIRE);
    const oldest = own.reduce((m, s) => Math.max(m, s.age), 0);
    live.summary.replaceChildren(kv([
      [pic.mode === 'truth' ? 'Outposts' : 'Outposts known', String(own.length)],
      [pic.mode === 'truth' ? 'Relays working' : 'Relays believed working', String(pic.relays.length)],
      ['Overdue', String(own.filter((s) => s.overdue).length)],
      ['Oldest news', formatDuration(oldest)],
      ['Our orders in flight', String(pic.messages.filter((m) => m.kind !== 'report' && m.kind !== 'fleetReport').length)],
    ]));
  }

  /** @param {string | null} selectedId @param {string | null} measureId */
  function render(selectedId, measureId) {
    current = { selected: selectedId, measure: measureId };
    const parts = [];
    if (!selectedId) parts.push(...overview());
    else {
      const s = catalog.get(selectedId);
      parts.push(...systemDetails(s));
      if (measureId && measureId !== selectedId) parts.push(...measurement(s, catalog.get(measureId)));
    }
    root.replaceChildren(...parts);
    refresh();
  }

  function refresh() {
    if (current.selected) refreshIntel();
    else refreshSummary();
    refreshFleets();
  }

  function credits() {
    const m = catalog.meta;
    return h('p.hint.credits', {},
      'Star data: ',
      h('a', { href: m.url, target: '_blank', rel: 'noopener' }, m.source),
      ` by ${m.author}, `,
      h('a', { href: m.licenseUrl, target: '_blank', rel: 'noopener' }, m.license),
      '.',
    );
  }

  return { render, refresh };
}

/** @param {import('../info/network.js').Route} r */
function relayHops(r) {
  const n = r.hops.filter((x) => x.kind === 'radio').length;
  return n <= 1 ? 'direct' : `${n} hops`;
}

/** @param {number} lum */
function formatLum(lum) {
  if (!Number.isFinite(lum)) return '?';
  if (lum >= 10) return lum.toFixed(0);
  if (lum >= 0.1) return lum.toFixed(2);
  return lum.toExponential(1);
}
