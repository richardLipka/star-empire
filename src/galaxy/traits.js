// @ts-check
import { hashUnit } from '../core/rng.js';

/**
 * Placeholder traits for each system until the star-system module (M7)
 * generates real planets. Deterministic per game seed and system id; Sol is fixed.
 *
 * @typedef {object} SystemTraits
 * @property {number} habitability  0–1, best world in the system for people and food
 * @property {number} richness      0–1, mineral and volatile wealth
 * @property {number} planets       number of major bodies
 */

/** Base habitability by the primary's spectral class. */
const CLASS_HABITABILITY = { O: 0.02, B: 0.04, A: 0.2, F: 0.55, G: 0.75, K: 0.65, M: 0.35, D: 0.03, '?': 0.3 };
/** Typical planet counts by class (M dwarfs and white dwarfs hold fewer large worlds here). */
const CLASS_PLANETS = { O: 2, B: 3, A: 5, F: 7, G: 8, K: 7, M: 4, D: 2, '?': 4 };

/**
 * @param {string | number} seed  game seed
 * @param {import('./catalog.js').StarSystem} system
 * @returns {SystemTraits}
 */
export function systemTraits(seed, system) {
  if (system.id === 'sol') return { habitability: 1, richness: 0.7, planets: 8 };
  const u = (/** @type {string} */ key) => hashUnit(seed, `${system.id}:${key}`);
  const cls = system.stars[0]?.cls ?? '?';
  const multiplePenalty = system.stars.length > 1 ? 0.85 : 1;
  const base = CLASS_HABITABILITY[/** @type {keyof typeof CLASS_HABITABILITY} */ (cls)] ?? 0.3;
  // Skewed: most systems are poor, a few are good.
  const habitability = Math.min(1, base * multiplePenalty * (0.25 + 1.1 * u('hab') ** 1.6));
  const richness = Math.min(1, 0.15 + 0.85 * u('rich') ** 1.3);
  const typical = CLASS_PLANETS[/** @type {keyof typeof CLASS_PLANETS} */ (cls)] ?? 4;
  const planets = Math.max(0, Math.round(typical * (0.3 + 1.2 * u('planets'))));
  return { habitability: round2(habitability), richness: round2(richness), planets };
}

const round2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;
