// @ts-check
import { defineModule } from '../sim/module.js';
import { GameError } from '../core/errors.js';

/**
 * Empires and their presence in star systems. In M3 presence is only an
 * outpost with an optional relay station; colonies arrive in M5.
 *
 * @typedef {object} Empire
 * @property {string} id            faction letter (the display name is a translation)
 * @property {string} capital       system id of the seat of government
 * @property {number} relayRange    ly a relay can reach (technology)
 * @property {number} reportInterval years between routine status reports
 *
 * @typedef {object} Presence
 * @property {string} empire
 * @property {'ok' | 'destroyed' | 'none'} relay
 * @property {number} since         game time of founding
 * @property {'routine' | 'frequent' | 'silent'} reporting  set by the governor's reporting directive
 */

export const empireModule = defineModule({
  id: 'empire',
  dependsOn: ['galaxy'],
  initState: () => ({
    /** @type {Record<string, Empire>} */
    empires: {},
    /** @type {Record<string, Presence>} systemId → presence */
    presence: {},
    /** @type {Record<string, Record<string, number>>} empire → systemId → time of first visit (truth) */
    explored: {},
  }),
});

/**
 * @typedef {{ empires: Record<string, Empire>, presence: Record<string, Presence>, explored: Record<string, Record<string, number>> }} EmpireState
 * @param {import('../sim/world.js').World} world
 * @returns {EmpireState}
 */
export const empireState = (world) => world.state.empire;

/**
 * Record that an empire has been to a system (truth; the capital learns it by report).
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} system @param {number} time
 */
export function markExplored(world, empire, system, time) {
  const table = (empireState(world).explored[empire] ??= {});
  if (table[system] === undefined) table[system] = time;
}

/**
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ id: string, capital: string, relayRange?: number, reportInterval?: number }} opts
 */
export function createEmpire(world, ctx, { id, capital, relayRange = 20, reportInterval = 1 }) {
  const st = empireState(world);
  if (st.empires[id]) throw new Error(`Empire ${id} exists`);
  st.empires[id] = { id, capital, relayRange, reportInterval };
  establishPresence(world, ctx, { empire: id, system: capital, relay: true });
  return st.empires[id];
}

/**
 * Found an outpost (sandbox / scenario action; colonisation proper comes in M5).
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, system: string, relay?: boolean }} opts
 */
export function establishPresence(world, ctx, { empire, system, relay = true }) {
  const st = empireState(world);
  if (!st.empires[empire]) throw new Error(`Unknown empire ${empire}`);
  const existing = st.presence[system];
  if (existing && existing.empire !== empire) throw new GameError('systemHeld', { system, empire: existing.empire });
  st.presence[system] = { empire, relay: relay ? 'ok' : 'none', since: ctx.now, reporting: 'routine' };
  markExplored(world, empire, system, ctx.now);
  ctx.notify('empire/presenceChanged', { system, empire });
  ctx.notify('info/networkChanged', { empire });
}

/**
 * Destroy or rebuild a system's relay. A system without a relay still receives.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, state: 'ok' | 'destroyed' }} opts
 */
export function setRelay(world, ctx, { system, state }) {
  const p = empireState(world).presence[system];
  if (!p) throw new GameError('noPresence', { system });
  p.relay = state;
  ctx.notify('info/networkChanged', { empire: p.empire });
}
