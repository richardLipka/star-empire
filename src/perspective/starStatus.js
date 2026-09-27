// @ts-check
/**
 * What a perspective says about each star system, for the "Status" map view.
 *
 * @typedef {'capital' | 'relay' | 'outpost' | 'relayDown' | 'foreign' | 'explored' | 'unexplored'} StarStatus
 */

/** Display order and labels. */
export const STATUSES = /** @type {const} */ ([
  ['capital', 'Capital'],
  ['relay', 'Outpost with relay'],
  ['outpost', 'Outpost, no relay'],
  ['relayDown', 'Relay down'],
  ['foreign', 'Held by another empire'],
  ['explored', 'Explored, empty'],
  ['unexplored', 'Unexplored'],
]);

/**
 * @param {import('./picture.js').Picture} pic
 * @param {{ id: string }[]} systems all catalogue systems
 * @returns {Map<string, StarStatus>}
 */
export function classifySystems(pic, systems) {
  /** @type {Map<string, StarStatus>} */
  const out = new Map();
  const explored = new Set(pic.explored);
  const held = new Map(pic.systems.map((s) => [s.id, s]));
  for (const { id } of systems) {
    const s = held.get(id);
    if (s && s.owner !== pic.empire) out.set(id, 'foreign');
    else if (s && id === pic.capital) out.set(id, 'capital');
    else if (s) out.set(id, s.relay === 'ok' ? 'relay' : s.relay === 'destroyed' ? 'relayDown' : 'outpost');
    else out.set(id, explored.has(id) ? 'explored' : 'unexplored');
  }
  return out;
}

/** @param {Map<string, StarStatus>} statuses */
export function countStatuses(statuses) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const s of statuses.values()) counts[s] = (counts[s] ?? 0) + 1;
  return counts;
}
