// @ts-check
import { createEventBus } from '../core/eventBus.js';
import { createSimulation } from '../sim/simulation.js';
import { createClock } from '../sim/clock.js';

/**
 * Holds the current game and swaps it on "new game" or "load" without the UI
 * having to re-subscribe: the event bus and clock outlive any single simulation.
 *
 * @param {{ modules: import('../sim/module.js').SimModule[], data?: Record<string, any> }} config
 */
export function createGameHost({ modules, data = {} }) {
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
    /** @param {string | number} seed */
    newGame(seed) {
      sim = createSimulation({ modules, data, seed, bus });
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
