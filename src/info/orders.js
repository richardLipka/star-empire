// @ts-check
import { empireState } from '../empire/module.js';
import { send, truthNetwork, knowledgeOf } from './module.js';
import { planVoyage } from '../fleet/plan.js';
import { APPROACHES } from '../ships/catalog.js';

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

/**
 * Send an order to one of our fleets (a voyage, or a new battle plan).
 * - A fleet the network reaches (docked at one of our systems, or carrying an
 *   ansible) gets it by light, or at once.
 * - A fleet in flight cannot receive anything: the order goes to the system
 *   where the capital believes it will next dock, and waits there for it.
 *   Plans must be made in advance.
 * The capital remembers a voyage it ordered, so the map can show where the
 * fleet should be even before any report comes back.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, fleet: string, payload: { type: 'voyage', waypoints: import('../fleet/plan.js').Waypoint[], approach: import('../fleet/plan.js').Approach } | { type: 'plan', plan: import('../combat/model.js').Plan } }} p
 * @returns {{ message: import('./module.js').Message, via: 'direct' | 'mailbox', system: string | null, arrives: number | null } | null}
 */
export function orderFleet(world, ctx, { empire, fleet, payload }) {
  const capital = empireState(world).empires[empire].capital;
  const net = truthNetwork(world, ctx, empire);
  const direct = net.route(capital, fleet);
  if (direct) {
    const message = send(world, ctx, { empire, kind: 'fleetOrder', origin: capital, target: fleet, payload });
    predict(world, ctx, empire, fleet, payload, ctx.now + direct.delay);
    return { message, via: 'direct', system: null, arrives: ctx.now + direct.delay };
  }
  const known = knowledgeOf(world, empire).fleets[fleet]?.data;
  const where = known?.status === 'docked' ? known.at : known?.dest;
  if (!where) return null;
  const message = send(world, ctx, { empire, kind: 'fleetOrder', origin: capital, target: where, payload: { ...payload, forFleet: fleet } });
  const arrives = message.planned ? ctx.now + message.planned.delay : null;
  const eta = known?.legs?.length ? known.legs[known.legs.length - 1].arriveAt : null;
  if (arrives != null) predict(world, ctx, empire, fleet, payload, Math.max(arrives, eta ?? arrives));
  return { message, via: 'mailbox', system: where, arrives };
}

/**
 * The capital's own prediction of an ordered voyage, from when the order should take effect.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {string} fleet @param {any} payload @param {number} departAt
 */
function predict(world, ctx, empire, fleet, payload, departAt) {
  if (payload.type !== 'voyage') return;
  const k = knowledgeOf(world, empire);
  const known = k.fleets[fleet]?.data;
  const from = known?.status === 'docked' ? known.at : known?.dest;
  if (!from || !known?.drive) return;
  const { legs } = planVoyage({
    fromPos: ctx.data.catalog.get(from).pos, fromSystem: from, waypoints: payload.waypoints, approach: payload.waypoints.some((/** @type {any} */ w) => w.action === 'strike') ? 'flyby' : payload.approach,
    departAt, drive: known.drive, stealth: APPROACHES.stealth, home: payload.approach === 'flyby' ? from : null,
    posOf: (/** @type {string} */ id) => ctx.data.catalog.get(id).pos, wormholes: [],
  });
  (k.plans ??= {})[fleet] = { legs, issuedAt: ctx.now, departAt };
}
