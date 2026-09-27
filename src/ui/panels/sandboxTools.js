// @ts-check
import { h } from '../dom.js';
import { DRIVE_TIERS, WEAR_ABOVE_G } from '../../fleet/drives.js';
import { establishPresence, setRelay, empireState } from '../../empire/module.js';
import { orderDispatch, sendNote } from '../../info/orders.js';
import { openWormhole } from '../../events/wormholes.js';
import { createFleet, launchFleet } from '../../fleet/module.js';
import { nameOf } from './context.js';

/** Form state survives re-renders. */
const form = { tier: 0, ansible: false, courier: false };

/**
 * Sandbox tools: change the world directly (outposts, relays, wormholes, a rival fleet)
 * or give orders the proper way (they travel from the capital at light speed).
 * @param {import('./context.js').PanelContext} c
 * @param {string} id selected system
 * @param {string | null} target measured system
 */
export function renderSandboxTools(c, id, target) {
  const name = nameOf(c.catalog);
  const presence = empireState(c.game.world).presence[id];
  const rows = [];
  if (!presence) {
    rows.push(h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => establishPresence(w, x, { empire: c.empire, system: id }), `Outpost founded at ${name(id)}`) }, 'Found outpost')));
  } else if (presence.empire === c.empire && presence.relay === 'ok') {
    rows.push(h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => setRelay(w, x, { system: id, state: 'destroyed' }), `Relay at ${name(id)} destroyed`) }, 'Destroy relay'), h('span.dim', {}, 'receives, cannot send')));
  } else if (presence.empire === c.empire) {
    rows.push(h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => setRelay(w, x, { system: id, state: 'ok' }), `Relay at ${name(id)} rebuilt`) }, 'Rebuild relay')));
  } else {
    rows.push(h('p.hint', {}, `Held by Empire ${presence.empire} (truth).`));
  }
  if (!target || target === id) {
    rows.push(h('p.hint', {}, 'Shift+click a second system for messages, fleets and wormholes.'));
    return h('div.tools', {}, ...rows);
  }
  const t = name(target);
  const drive = h('select', { onchange: (/** @type {Event} */ e) => (form.tier = Number(/** @type {HTMLSelectElement} */ (e.target).value)) },
    ...DRIVE_TIERS.map((d, i) => h('option', { value: i, selected: i === form.tier }, `${d.accelG} g · ${d.cruise} c${d.accelG > WEAR_ABOVE_G ? ' (wear)' : ''}`)));
  const check = (/** @type {'ansible' | 'courier'} */ key) => h('label', {},
    h('input', { type: 'checkbox', checked: form[key], onchange: (/** @type {Event} */ e) => (form[key] = /** @type {HTMLInputElement} */ (e.target).checked) }), ` ${key}`);
  rows.push(
    h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => sendNote(w, x, { empire: c.empire, from: id, to: target, text: `Note from ${name(id)}` }), `Note sent ${name(id)} → ${t}`) }, `Send note → ${t}`)),
    h('div.row', {}, drive, check('ansible'), check('courier')),
    h('div.row', {}, h('button.btn', {
      onclick: () => c.act((w, x) => orderDispatch(w, x, { empire: c.empire, from: id, to: target, drive: DRIVE_TIERS[form.tier], ansible: form.ansible, courier: form.courier }), `Order sent from the capital: ${name(id)} to launch for ${t}`),
    }, `Order fleet ${name(id)} → ${t}`)),
    h('p.hint', {}, 'The order travels from the capital to this system first; the fleet launches when it arrives.'),
    h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => openWormhole(w, x, { a: id, b: target }), `Wormhole opened ${name(id)} ↔ ${t}`) }, `Open wormhole ↔ ${t}`)),
    h('div.row', {}, h('button.btn', {
      title: 'A rival fleet launches now, unseen until its plume points at one of your systems',
      onclick: () => c.act((w, x) => {
        const f = createFleet(w, x, { empire: 'B', at: id, drive: DRIVE_TIERS[form.tier] });
        launchFleet(w, x, { fleet: f.id, to: target });
      }, `Empire B fleet launched ${name(id)} → ${t} (you will not be told)`),
    }, `Empire B fleet → ${t}`)),
  );
  return h('div.tools', {}, ...rows);
}
