// @ts-check
/**
 * Keys for the "Politics" and "Economy" map views, from a picture: what the
 * perspective knows (reported loyalty and population, old as they are) or
 * the truth. Labels are translations: `legend.politics.<key>`,
 * `legend.economy.<key>`; foreign polities are keyed `faction:<id>`.
 *
 * @typedef {'capital' | 'loyal' | 'restless' | 'autonomous' | 'unreported' | `faction:${string}`} PoliticsKey
 * @typedef {'billions' | 'millions' | 'thousands' | 'few' | 'hungry' | 'unreported' | 'foreign'} EconomyKey
 */

export const POLITICS_KEYS = ['capital', 'loyal', 'restless', 'autonomous', 'unreported'];
export const ECONOMY_KEYS = ['billions', 'millions', 'thousands', 'few', 'hungry', 'unreported', 'foreign'];

/**
 * @param {import('./picture.js').Picture} pic
 * @returns {Map<string, PoliticsKey>} held systems only
 */
export function classifyPolitics(pic) {
  /** @type {Map<string, PoliticsKey>} */
  const out = new Map();
  for (const s of pic.systems) {
    if (s.owner !== pic.empire) out.set(s.id, `faction:${s.owner}`);
    else if (s.id === pic.capital) out.set(s.id, 'capital');
    else out.set(s.id, /** @type {PoliticsKey} */ (s.loyalty?.stage ?? 'unreported'));
  }
  return out;
}

/** @param {number} n @returns {EconomyKey} */
export const populationTier = (n) => (n >= 1e9 ? 'billions' : n >= 1e6 ? 'millions' : n >= 1e3 ? 'thousands' : 'few');

/**
 * @param {import('./picture.js').Picture} pic
 * @returns {Map<string, EconomyKey>} held systems only
 */
export function classifyEconomy(pic) {
  /** @type {Map<string, EconomyKey>} */
  const out = new Map();
  for (const s of pic.systems) {
    if (s.owner !== pic.empire && pic.mode === 'knowledge') out.set(s.id, 'foreign');
    else if (s.population == null) out.set(s.id, 'unreported');
    else if (s.troubled) out.set(s.id, 'hungry');
    else out.set(s.id, populationTier(s.population));
  }
  return out;
}

/** @param {Map<string, string>} keys */
export function countKeys(keys) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const k of keys.values()) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}
