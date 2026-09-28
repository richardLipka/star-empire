// @ts-check
import rules from '../data/loyalty.json';
import { resilience } from '../colony/model.js';

/**
 * Pure rules of loyalty and drift (src/data/loyalty.json, docs/POLITICS.md).
 *
 * @typedef {'loyal' | 'restless' | 'autonomous'} Stage
 * @typedef {object} DriftInput
 * @property {number} distance        ly to the capital (light delay in years)
 * @property {number} sinceContact    years since word came from the capital
 * @property {number} instability     0–1, the colony's
 * @property {number} population
 * @property {boolean} hungry
 * @property {boolean} unrest
 * @property {boolean} prosperous      fed with a surplus
 * @property {string} autonomy         governance.autonomy setting: tight, normal, broad
 * @property {import('../research/effects.js').LoyaltyCaps | undefined} caps
 */

export const RULES = rules;
const NO_CAPS = { push: 1, pull: 0, latency: 1, secession: 1 };

/** @param {number} value @returns {Stage} */
export function stageOf(value) {
  if (value >= RULES.stages.loyal) return 'loyal';
  if (value >= RULES.stages.restless) return 'restless';
  return 'autonomous';
}

/**
 * The forces on a colony's loyalty, per year (each term, for display and tests).
 * @param {DriftInput} x
 */
export function forces(x) {
  const p = RULES.push;
  const caps = x.caps ?? NO_CAPS;
  const scale = caps.push * (/** @type {Record<string, { push: number }>} */ (/** @type {unknown} */ (RULES.autonomy))[x.autonomy]?.push ?? 1);
  const neglectYears = Math.max(0, x.sinceContact - p.neglectGrace);
  const push = {
    latency: p.latencyPerLy * x.distance * caps.latency * scale,
    neglect: p.neglectRate * Math.min(p.neglectCap, neglectYears / 50) * scale,
    instability: p.instability * x.instability * scale,
    hardship: ((x.hungry ? p.hunger : 0) + (x.unrest ? p.unrest : 0)) * scale,
    selfSufficiency: p.selfSufficiency * resilience(x.population) * scale,
  };
  const pull = {
    base: RULES.pull.base,
    prosperity: x.prosperous ? RULES.pull.prosperity : 0,
    technology: caps.pull,
  };
  const sum = (/** @type {Record<string, number>} */ o) => Object.values(o).reduce((a, b) => a + b, 0);
  return { push, pull, net: sum(pull) - sum(push) };
}

/**
 * Yearly chance that an autonomous colony far gone declares independence.
 * @param {number} value @param {import('../research/effects.js').LoyaltyCaps | undefined} caps
 */
export const secessionChance = (value, caps) => (value < RULES.stages.autonomous ? RULES.secession.chance * (caps ?? NO_CAPS).secession : 0);
