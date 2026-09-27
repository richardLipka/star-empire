// @ts-check
import { createEventBus } from '../core/eventBus.js';
import { createSimulation } from '../sim/simulation.js';
import { createClock } from '../sim/clock.js';

/**
 * Holds the current game and swaps it on "new game" or "load" without the UI
 * having to re-subscribe: the event bus and clock outlive any single simulation.
 *
 * @param {{ modules: import('../sim/module.js').SimModule[], data?: Record<string, any>, scenario?: import('./scenarios.js').Scenario }} config
 */
export function createGameHost({ modules, data = {}, scenario }) {
  const bus = createEventBus();
  /** @type {import('../sim/simulation.js').Simulation} */
  let sim;

  const host = {
    bus,
    get sim() {
      return sim;
    },
    get world() {
      return sim.world;
    },
    /** @param {number} dt */
    advanceBy: (dt) => sim.advanceBy(dt),
    /**
     * Run a world action (order, sandbox tool) with the simulation context.
     * @template T
     * @param {(world: import('../sim/world.js').World, ctx: import('../sim/module.js').SimContext) => T} fn
     * @returns {T}
     */
    act(fn) {
      const result = fn(sim.world, sim.ctx);
      bus.emit('game/changed', {});
      return result;
    },
    /** @param {string | number} seed */
    newGame(seed) {
      sim = createSimulation({ modules, data, seed, bus });
      scenario?.(sim.world, sim.ctx);
      if (scenario?.warmupYears) sim.advanceTo(scenario.warmupYears);
      bus.emit('game/loaded', { world: sim.world });
    },
    /** @param {import('../sim/world.js').World} world */
    loadWorld(world) {
      sim = createSimulation({ modules, data, world, bus });
      clock.setPaused(true);
      bus.emit('game/loaded', { world: sim.world });
    },
  };

  const clock = createClock(host);
  return Object.assign(host, { clock });
}
