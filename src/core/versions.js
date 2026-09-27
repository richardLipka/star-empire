// @ts-check
/**
 * Change counters for derived caches. When state that a cache depends on
 * changes, the code that changes it bumps the counter; the cache compares.
 * Not saved: caches start empty after loading anyway.
 */

/** @type {WeakMap<object, Map<string, number>>} */
const counters = new WeakMap();

/** @param {object} world @param {string} key */
export function bump(world, key) {
  let m = counters.get(world);
  if (!m) counters.set(world, (m = new Map()));
  m.set(key, (m.get(key) ?? 0) + 1);
}

/** @param {object} world @param {string} key */
export const version = (world, key) => counters.get(world)?.get(key) ?? 0;

/** The communication network (relays, presence, docked fleets, relay technology). */
export const NETWORK = 'network';
