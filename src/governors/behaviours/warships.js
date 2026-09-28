// @ts-check
import { empireState } from '../../empire/module.js';
import { fleetState } from '../../fleet/module.js';
import { materielAt } from '../../colony/module.js';
import { WARSHIP_LEVELS, bestDesign } from '../../ships/catalog.js';
import { designsOf, buildShips } from '../../ships/module.js';

/**
 * military.warships: keep a home guard of warships at this system, of the
 * strongest design the yard can build and afford: none, defensive (2),
 * steady (5) or war footing (10). One ship a year; it does not use the
 * shipyard slot of the expansion orders.
 * @type {import('./types.js').Behaviour}
 */
export default {
  plan(world, ctx, book, d) {
    const want = /** @type {Record<string, number>} */ (WARSHIP_LEVELS)[d.params.level] ?? 0;
    const guard = guardOf(world, book.system, book.empire);
    if ((guard?.ships?.length ?? 0) >= want) return null;
    const unlocks = empireState(world).presence[book.system]?.capabilities?.unlocks ?? [];
    const design = bestDesign(designsOf(world, book.empire), unlocks, materielAt(world, book.system));
    if (design) buildShips(world, ctx, { system: book.system, design, count: 1, into: guard?.id ?? null, mission: { kind: 'guard', home: book.system } });
    return null;
  },
};

/**
 * The home guard docked at a system.
 * @param {import('../../sim/world.js').World} world @param {string} system @param {string} empire
 */
export function guardOf(world, system, empire) {
  return Object.values(fleetState(world).fleets).find((f) => f.empire === empire && f.status === 'docked' && f.at === system && f.mission?.kind === 'guard' && f.mission.home === system) ?? null;
}
