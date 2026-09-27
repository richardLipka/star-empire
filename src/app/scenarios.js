// @ts-check
import { createEmpire, establishPresence, empireState, markExplored } from '../empire/module.js';
import { knowledgeOf, truthNetwork, systemSnapshot } from '../info/module.js';
import { recordEntry, recordExplored } from '../info/knowledge.js';
import { distance } from '../core/vec3.js';
import { imposeDirective } from '../governors/module.js';

/**
 * Starting situations. A scenario runs once on a new game, after every
 * module's initState, and must be deterministic.
 *
 * @typedef {((world: import('../sim/world.js').World, ctx: import('../sim/module.js').SimContext) => void) & { warmupYears?: number }} Scenario
 *   `warmupYears`: history simulated before the player takes over, so reports
 *   already in flight and knowledge ages are realistic at the start.
 */

/** Outposts of Empire A in the sandbox: a relay chain, a far chain, and one isolated outpost. */
export const SANDBOX_OUTPOSTS = [
  'Alpha Centauri', 'Tau Ceti', '61 Cygni', 'Altair', 'Vega', 'Fomalhaut', 'Deneb Algedi', 'Arcturus',
];
/** Empire B, a human rival next door, unknown to A at the start. */
export const SANDBOX_RIVAL = { capital: 'Epsilon Indi', outposts: ['Gl 832'] };
/** Early probes have visited every system this close to a capital (ly). */
export const PROBED_RADIUS = 9;

/**
 * Sandbox for the information layer.
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
  createEmpire(world, ctx, { id: 'B', capital: byName(SANDBOX_RIVAL.capital) });
  for (const name of SANDBOX_RIVAL.outposts) establishPresence(world, ctx, { empire: 'B', system: byName(name) });

  for (const empire of ['A', 'B']) {
    const emp = empireState(world).empires[empire];
    const k = knowledgeOf(world, empire);
    const home = catalog.get(emp.capital).pos;
    for (const s of catalog.systems) {
      if (distance(s.pos, home) > PROBED_RADIUS) continue;
      markExplored(world, empire, s.id, -50);
      recordExplored(k, s.id, -50);
    }
    const net = truthNetwork(world, ctx, empire);
    for (const [system, p] of Object.entries(empireState(world).presence)) {
      if (p.empire !== empire || system === emp.capital) continue;
      const route = net.route(system, emp.capital);
      const age = route ? route.delay : 100;
      recordEntry(k.systems, system, { validAt: -age, receivedAt: route ? 0 : -1, via: route ? 'relay' : 'courier', hops: route ? route.hops.length : 0, data: systemSnapshot(world, system) });
      recordExplored(k, system, -age);
    }
    imposeDirective(world, ctx, { system: emp.capital, type: 'research.focus', params: { field: SANDBOX_RESEARCH[/** @type {'A' | 'B'} */ (empire)] } });
  }
}

/** Research focus of the capitals at the start (the player changes it from the research screen). */
export const SANDBOX_RESEARCH = { A: 'communication', B: 'engines' };

sandboxScenario.warmupYears = 60;

/** @type {Record<string, Scenario>} */
export const SCENARIOS = { sandbox: sandboxScenario };
