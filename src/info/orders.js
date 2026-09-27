// @ts-check
import { empireState } from '../empire/module.js';
import { send, truthNetwork } from './module.js';

// Directives to governors (including the fleet.send shortcut) are in src/governors/issue.js.

/**
 * Player orders. All leave from the capital as messages and act only when
 * they arrive.
 */

/**
 * Order a fleet to a new destination. Reaches a fleet in transit only by ansible.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, fleet: string, to: string }} p
 * @returns {import('./module.js').Message | null} null if the fleet cannot be reached
 */
export function orderRedirect(world, ctx, { empire, fleet, to }) {
  const capital = empireState(world).empires[empire].capital;
  if (!truthNetwork(world, ctx, empire).route(capital, fleet)) return null;
  return send(world, ctx, { empire, kind: 'fleetOrder', origin: capital, target: fleet, payload: { type: 'redirect', to } });
}

/**
 * A plain text message between two systems (testing and flavour).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, from: string, to: string, text: string }} p
 */
export function sendNote(world, ctx, { empire, from, to, text }) {
  return send(world, ctx, { empire, kind: 'note', origin: from, target: to, payload: { text } });
}
