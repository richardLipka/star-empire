import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { sandboxScenario } from '../src/app/scenarios.js';
import { fleetState, disbandFleet } from '../src/fleet/module.js';

export const catalog = DATA.catalog;
export const sys = (name) => {
  const s = catalog.systems.find((x) => x.name === name);
  if (!s) throw new Error(`no ${name}`);
  return s.id;
};

/**
 * New sandbox game; `act` runs a world action with the context. Colony
 * disasters, Empire B's AI and the starting warships are off unless asked
 * for, so timing tests are not disturbed.
 */
export function sandbox(seed = 'm3', { risks = false, ai = false, fleets = false } = {}) {
  const sim = createSimulation({ modules: MODULES, data: DATA, seed });
  sim.world.state.colony.risks = risks;
  sandboxScenario(sim.world, sim.ctx);
  if (!ai) sim.world.state.ai.controllers = {}; // Empire B's AI acts only where a test asks for it
  if (!fleets) for (const id of Object.keys(fleetState(sim.world).fleets)) disbandFleet(sim.world, sim.ctx, id); // nor the starting warships
  return { sim, world: sim.world, ctx: sim.ctx, act: (fn) => fn(sim.world, sim.ctx) };
}

/** Advance until `predicate()` is true; returns the time it became true (to the step). */
export function runUntil(sim, predicate, { step = 0.01, max = 500 } = {}) {
  const end = sim.world.time + max;
  while (sim.world.time < end) {
    if (predicate()) return sim.world.time;
    sim.advanceBy(step);
  }
  throw new Error('condition never met');
}
