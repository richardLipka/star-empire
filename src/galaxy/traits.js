// @ts-check
import { systemBodies } from './planets.js';

/**
 * Summary of a system for survey displays and settlement choices, derived
 * from its bodies (see planets.js).
 *
 * @typedef {object} SystemTraits
 * @property {number} habitability  0–1, the best place for people (habitable world 1×quality, terraformable less, domes and stations little)
 * @property {number} richness      0–1, best mineral and volatile wealth
 * @property {number} planets       number of bodies
 */

/**
 * @param {string | number} seed  game seed
 * @param {import('./catalog.js').StarSystem} system
 * @returns {SystemTraits}
 */
export function systemTraits(seed, system) {
  const { bodies } = systemBodies(seed, system);
  let habitability = 0.03; // an orbital base is always possible
  for (const b of bodies) {
    if (b.site === 'habitable') habitability = Math.max(habitability, b.quality);
    else if (b.site === 'terraformable') habitability = Math.max(habitability, 0.25 * b.quality + 0.1);
    else if (b.site === 'hostile') habitability = Math.max(habitability, 0.08);
  }
  const richness = bodies.reduce((m, b) => Math.max(m, b.resources), 0.1);
  return { habitability: round2(habitability), richness: round2(richness), planets: bodies.length };
}

const round2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;
