// @ts-check
import rules from '../data/colonies.json';
import { systemBodies } from '../galaxy/planets.js';
import { baseCapabilities } from '../research/effects.js';

/**
 * Pure rules of colony life (src/data/colonies.json): where people live in a
 * system, how many it can hold, whether it feeds them, what it produces and
 * what can go wrong. No state here: the module applies these every tick.
 *
 * @typedef {'habitable' | 'terraformed' | 'terraformable' | 'hostile' | 'orbital'} SiteKind
 * @typedef {{ kind: SiteKind, body: string | null, name: string | null, quality: number, resources: number, tidalLock: boolean }} Site
 */

export const RULES = rules;

/**
 * The best place for a colony: a habitable world, else the best terraformable
 * one, else a domed hostile surface, else an orbital base, which is always
 * possible (around a giant, in a belt, or around the star alone).
 * @param {string | number} seed @param {import('../galaxy/catalog.js').StarSystem} system
 * @returns {Site}
 */
export function chooseSite(seed, system) {
  const { bodies } = systemBodies(seed, system);
  const best = (/** @type {string} */ kind) => bodies.filter((b) => b.site === kind).sort((a, b) => b.quality - a.quality || b.resources - a.resources)[0];
  const pick = best('habitable') ?? best('terraformable') ?? best('hostile');
  if (pick) return { kind: /** @type {SiteKind} */ (pick.site), body: pick.id, name: pick.name, quality: pick.quality, resources: pick.resources, tidalLock: pick.tidalLock };
  const anchor = [...bodies].sort((a, b) => b.resources - a.resources)[0];
  return { kind: 'orbital', body: anchor?.id ?? null, name: anchor?.name ?? null, quality: 0, resources: anchor ? anchor.resources : 0.2, tidalLock: false };
}

/** @param {import('../research/effects.js').Capabilities | undefined} caps */
const colonyCaps = (caps) => caps?.colony ?? baseCapabilities().colony;

/**
 * @param {Site} site @param {import('../research/effects.js').Capabilities | undefined} caps
 */
export function capacity(site, caps) {
  const base = RULES.sites[site.kind].capacity * (site.kind === 'habitable' || site.kind === 'terraformed' ? Math.max(0.2, site.quality) : 1);
  return base * (colonyCaps(caps).capacity[site.kind] ?? 1);
}

/**
 * 0–1: how well a people weathers disaster (large, established ones better).
 * @param {number} population
 */
export const resilience = (population) => Math.min(1, Math.log10(1 + Math.max(0, population) / 1000) / RULES.resilience.scale);

/**
 * Food produced over food needed (1 = exactly enough).
 * @param {Site} site @param {import('../research/effects.js').Capabilities | undefined} caps
 * @param {string} focus economy focus @param {boolean} cropFailure @param {number} [population]
 */
export function foodRatio(site, caps, focus, cropFailure, population = 0) {
  const s = RULES.sites[site.kind];
  const c = colonyCaps(caps);
  let food = s.food + (s.crops ? 0 : c.foodClosed);
  food *= c.food * (RULES.focus[/** @type {keyof typeof RULES.focus} */ (focus)]?.food ?? 1);
  if (cropFailure) food *= 1 - (1 - RULES.risks.crops.foodLeft) * (1 - RULES.resilience.loss * resilience(population));
  return food;
}

/**
 * Materiel per year.
 * @param {number} population @param {Site} site @param {import('../research/effects.js').Capabilities | undefined} caps @param {string} focus
 */
export function industry(population, site, caps, focus) {
  const f = RULES.focus[/** @type {keyof typeof RULES.focus} */ (focus)] ?? RULES.focus.balanced;
  const rich = 1 - RULES.output.richnessWeight + RULES.output.richnessWeight * 2 * site.resources;
  return RULES.output.industry * (Math.max(0, population) / 1000) ** RULES.output.exponent * RULES.sites[site.kind].industry * rich * colonyCaps(caps).industry * f.industry;
}

/**
 * Research points per year.
 * @param {number} population @param {string} focus
 */
export function research(population, focus) {
  const f = RULES.focus[/** @type {keyof typeof RULES.focus} */ (focus)] ?? RULES.focus.balanced;
  return RULES.output.research * Math.log10(1 + Math.max(0, population) / 1000) * f.research;
}

/**
 * Population change per year (logistic growth when fed, decline when starving).
 * @param {number} population @param {number} cap @param {number} food @param {import('../research/effects.js').Capabilities | undefined} caps
 */
export function growth(population, cap, food, caps) {
  const g = RULES.growth;
  if (food < 1) return -population * g.starvation * (1 - food);
  // Above capacity the decline is gradual (at most the growth rate).
  return population * g.rate * Math.min(1, g.minFactor + g.surplus * (food - 1)) * colonyCaps(caps).growth * Math.max(-1, 1 - population / cap);
}

/**
 * Yearly chance of each kind of disaster.
 * @param {{ population: number, site: Site, society: string, instability: number }} colony
 * @param {string} starClass @param {import('../research/effects.js').Capabilities | undefined} caps
 */
export function riskChances(colony, starClass, caps) {
  const r = RULES.risks;
  const c = colonyCaps(caps).risk;
  const small = 1 + r.prion.smallFactor * Math.exp(-colony.population / r.prion.smallScale);
  const society = /** @type {Record<string, any>} */ (RULES.society)[colony.society] ?? {};
  const exposure = r.radiation.exposure[colony.site.kind] * (colony.site.tidalLock ? 1.2 : 1);
  const steady = 1 - RULES.resilience.chance * resilience(colony.population);
  return {
    prion: Math.min(0.9, r.prion.chance * small * steady * (society.prion ?? 1) * c.prion),
    radiation: Math.min(0.9, (r.radiation.chanceByClass[/** @type {keyof typeof r.radiation.chanceByClass} */ (starClass)] ?? 0.02) * exposure * c.radiation),
    crops: Math.min(0.9, (RULES.sites[colony.site.kind].crops ? r.crops.chanceCrops : r.crops.chanceClosed) * steady * c.crops),
    unrest: Math.min(0.9, r.unrest.chance * colony.instability * c.unrest),
  };
}

/**
 * Fraction lost in a disaster: small colonies suffer the upper end, large
 * peoples much less.
 * @param {[number, number]} range @param {number} population @param {number} roll 0–1
 */
export function lossFraction(range, population, roll) {
  const smallness = Math.exp(-population / 20000);
  const loss = range[0] + (range[1] - range[0]) * Math.min(1, 0.5 * roll + 0.5 * smallness);
  return loss * (1 - RULES.resilience.loss * resilience(population));
}
