// @ts-check
import { createRng } from '../core/rng.js';
import { createQueue } from '../core/scheduler.js';

/** Bump when the saved world shape changes, and add a migration in save.js. */
export const WORLD_VERSION = 8;

/**
 * The complete, JSON-serializable truth of one game.
 * @typedef {object} World
 * @property {number} version
 * @property {string} seed
 * @property {number} time           game time in years since start
 * @property {number} nextId
 * @property {import('../core/rng.js').RngState} rng
 * @property {import('../core/scheduler.js').EventQueue} queue
 * @property {{ interval: number, nextAt: number, count: number }} tick
 * @property {string[]} modules      ids of registered modules, in order
 * @property {Record<string, any>} state   one slice per module
 */

/**
 * @param {{ seed: string | number, tickInterval: number }} opts
 * @returns {World}
 */
export function createWorld({ seed, tickInterval }) {
  return {
    version: WORLD_VERSION,
    seed: String(seed),
    time: 0,
    nextId: 1,
    rng: createRng(seed),
    queue: createQueue(),
    tick: { interval: tickInterval, nextAt: tickInterval, count: 0 },
    modules: [],
    state: {},
  };
}
