// @ts-check
/**
 * What one empire's capital knows. Every entry says when the information
 * was true (`validAt`), when it arrived (`receivedAt`) and how (`via`).
 *
 * @typedef {'capital' | 'relay' | 'courier' | 'ansible'} Via
 * @typedef {{ validAt: number, receivedAt: number, via: Via, hops: number, data: any }} Entry
 * @typedef {{ id: string, kind: string, subject: string, text: string, validAt: number, receivedAt: number, via: Via, hops: number }} Dispatch
 * @typedef {{ systems: Record<string, Entry>, fleets: Record<string, Entry>, dispatches: Dispatch[] }} Knowledge
 */

const MAX_DISPATCHES = 200;

/** @returns {Knowledge} */
export const emptyKnowledge = () => ({ systems: {}, fleets: {}, dispatches: [] });

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
