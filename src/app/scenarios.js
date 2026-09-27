// @ts-check
import { createEmpire, establishPresence, empireState } from '../empire/module.js';
import { knowledgeOf, truthNetwork, systemSnapshot } from '../info/module.js';
import { recordEntry } from '../info/knowledge.js';

/**
 * Starting situations. A scenario runs once on a new game, after every
 * module's initState, and must be deterministic.
 *
 * @typedef {((world: import('../sim/world.js').World, ctx: import('../sim/module.js').SimContext) => void) & { warmupYears?: number }} Scenario
 *   `warmupYears`: history simulated before the player takes over, so reports
 *   already in flight and knowledge ages are realistic at the start.
 */

/** Outposts of the M3 sandbox: a relay chain, a far chain, and one isolated outpost. */
export const SANDBOX_OUTPOSTS = [
  'Alpha Centauri', 'Tau Ceti', '61 Cygni', 'Altair', 'Vega', 'Fomalhaut', 'Deneb Algedi', 'Arcturus',
];

/**
 * Sandbox for the information layer: Empire A at Sol with relay outposts.
 * The capital starts with the last reports that had arrived by year 0; the
 * isolated outpost is known only from its century-old founding records.
 * @type {Scenario}
 */
export function sandboxScenario(world, ctx) {
  const catalog = ctx.data.catalog;
  const byName = (/** @type {string} */ n) => {
    const s = catalog.systems.find((/** @type {{ name: string }} */ x) => x.name === n);
    if (!s) throw new Error(`Scenario system ${n} not in catalogue`);
    return s.id;
  };
  createEmpire(world, ctx, { id: 'A', capital: 'sol' });
  for (const name of SANDBOX_OUTPOSTS) establishPresence(world, ctx, { empire: 'A', system: byName(name) });

  const k = knowledgeOf(world, 'A');
  const net = truthNetwork(world, ctx, 'A');
  for (const [system, p] of Object.entries(empireState(world).presence)) {
    if (p.empire !== 'A' || system === 'sol') continue;
    const route = net.route(system, 'sol');
    const age = route ? route.delay : 100;
    recordEntry(k.systems, system, { validAt: -age, receivedAt: route ? 0 : -1, via: route ? 'relay' : 'courier', hops: route ? route.hops.length : 0, data: systemSnapshot(world, system) });
  }
}

sandboxScenario.warmupYears = 60;

/** @type {Record<string, Scenario>} */
export const SCENARIOS = { sandbox: sandboxScenario };
