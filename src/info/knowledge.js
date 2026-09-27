// @ts-check
/**
 * What one empire's capital knows. Every entry says when the information
 * was true (`validAt`), when it arrived (`receivedAt`) and how (`via`).
 *
 * @typedef {'capital' | 'relay' | 'courier' | 'ansible' | 'intercept'} Via
 * @typedef {{ validAt: number, receivedAt: number, via: Via, hops: number, data: any }} Entry
 * A notable piece of news at the capital. `key` names the text (translated
 * by the UI under `dispatch.<key>`); `params` fill it in. Parameters named
 * system, near, observer, from or to hold system ids.
 * @typedef {{ id: string, key: string, params: Record<string, string | number>, validAt: number, receivedAt: number, via: Via, hops: number }} Dispatch
 * @typedef {object} Knowledge
 * @property {Record<string, Entry>} systems      latest report per system
 * @property {Record<string, Entry>} fleets       latest report per own fleet
 * @property {Record<string, number>} explored    systems known to have been visited → time of the visit
 * @property {Dispatch[]} dispatches              notable news, in order of arrival
 */

const MAX_DISPATCHES = 200;

/** @returns {Knowledge} */
export const emptyKnowledge = () => ({ systems: {}, fleets: {}, explored: {}, dispatches: [] });

/** @param {Knowledge} k @param {string} system @param {number} validAt */
export function recordExplored(k, system, validAt) {
  if (k.explored[system] === undefined || k.explored[system] > validAt) k.explored[system] = validAt;
}

/**
 * Keep the newer of the stored and incoming entry.
 * @param {Record<string, Entry>} table @param {string} key @param {Entry} entry
 * @returns {boolean} whether the entry was newer
 */
export function recordEntry(table, key, entry) {
  const old = table[key];
  if (old && old.validAt > entry.validAt) return false;
  table[key] = entry;
  return true;
}

/** @param {Knowledge} k @param {Dispatch} d */
export function logDispatch(k, d) {
  k.dispatches.push(d);
  if (k.dispatches.length > MAX_DISPATCHES) k.dispatches.splice(0, k.dispatches.length - MAX_DISPATCHES);
}
