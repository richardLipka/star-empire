// @ts-check
import { knowledgeOf } from '../info/module.js';
import { colonySummary } from '../colony/module.js';

/**
 * A system's colony as the current picture sees it: the last report at the
 * capital (knowledge), or the colony itself (truth).
 * @param {import('../sim/world.js').World} world
 * @param {import('./picture.js').Picture} pic
 * @param {string} system
 * @returns {{ colony: import('../colony/module.js').ColonyReport, validAt: number } | null}
 */
export function colonyView(world, pic, system) {
  if (pic.mode === 'truth') {
    const colony = colonySummary(world, system);
    return colony ? { colony, validAt: pic.now } : null;
  }
  const e = knowledgeOf(world, pic.empire).systems[system];
  return e?.data.owner && e.data.colony ? { colony: e.data.colony, validAt: e.validAt } : null;
}

/**
 * Totals over the empire's own colonies as the picture sees them.
 * @param {import('../sim/world.js').World} world @param {import('./picture.js').Picture} pic
 */
export function colonyTotals(world, pic) {
  let population = 0;
  let colonies = 0;
  let troubled = 0;
  for (const s of pic.systems) {
    if (s.owner !== pic.empire) continue;
    const v = colonyView(world, pic, s.id);
    if (!v) continue;
    colonies++;
    population += v.colony.population;
    if (v.colony.food < 1 || v.colony.crops || v.colony.unrest) troubled++;
  }
  return { population, colonies, troubled };
}
