// @ts-check
import { defineModule } from '../sim/module.js';
import { empireState } from '../empire/module.js';
import { createFleet, fleetState, disbandFleet } from '../fleet/module.js';
import { driveFor } from '../fleet/drives.js';
import { spend } from '../colony/module.js';
import { DEFAULT_PLAN } from '../combat/model.js';
import { DEFAULT_DESIGNS, designStats, canBuild, hull, validDesign } from './catalog.js';

/**
 * Ship designs and shipbuilding (docs/FLEETS.md).
 *
 * Every empire starts with a few stock designs and can draw its own. A design
 * is an idea at the capital: it reaches a shipyard inside the build order
 * (directive fleet.build), and the yard can build it only with the
 * technologies known there. Ships are paid for in materiel.
 */

export const shipsModule = defineModule({
  id: 'ships',
  dependsOn: ['empire', 'fleet', 'colony'],
  initState: () => ({
    /** @type {Record<string, Record<string, import('./catalog.js').Design>>} empire → its own designs */
    designs: {},
  }),
});

/**
 * Every design an empire has: the stock ones and its own.
 * @param {import('../sim/world.js').World} world @param {string} empire
 * @returns {import('./catalog.js').Design[]}
 */
export const designsOf = (world, empire) => [...DEFAULT_DESIGNS, ...Object.values(world.state.ships?.designs[empire] ?? {})];

/**
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} id
 */
export const designOf = (world, empire, id) => designsOf(world, empire).find((d) => d.id === id) ?? null;

/**
 * Draw a new design (at the capital; it travels with build orders).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, name: string, hull: string, components: string[] }} p
 */
export function addDesign(world, ctx, { empire, name, hull: h, components }) {
  const design = { id: ctx.newId('design'), name, hull: h, components: [...components] };
  if (!validDesign(design)) throw new Error('Invalid design');
  (world.state.ships.designs[empire] ??= {})[design.id] = design;
  return design;
}

/**
 * Build ships of a design at a system, as many as it can pay for (up to
 * `count`), into `into` (a docked fleet of the same empire) or a new fleet.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, design: import('./catalog.js').Design, count: number, into?: string | null, mission?: any, name?: string }} p
 * @returns {{ built: number, fleet: import('../fleet/module.js').Fleet | null }}
 */
export function buildShips(world, ctx, { system, design, count, into = null, mission = null, name }) {
  const p = empireState(world).presence[system];
  if (!p || !canBuild(design, p.capabilities?.unlocks ?? [])) return { built: 0, fleet: null };
  const stats = designStats(design);
  let built = 0;
  while (built < count && spend(world, system, stats.cost)) built++;
  if (!built) return { built: 0, fleet: null };
  let fleet = into ? fleetState(world).fleets[into] : null;
  if (!fleet || fleet.status !== 'docked' || fleet.at !== system || !fleet.ships) {
    const h = hull(design.hull);
    fleet = createFleet(world, ctx, {
      empire: p.empire, at: system, drive: h.drive ?? driveFor(p), transmitter: !h.unmanned, role: h.unmanned ? 'impactor' : 'warship',
      mission, name, ships: [], designs: {}, plan: { ...DEFAULT_PLAN },
    });
  }
  const f = /** @type {import('../fleet/module.js').Fleet} */ (fleet);
  /** @type {Record<string, import('./catalog.js').Design>} */ (f.designs)[design.id] = design;
  for (let i = 0; i < built; i++) /** @type {import('../fleet/module.js').Ship[]} */ (f.ships).push({ d: design.id, hp: stats.hp });
  ctx.notify('ships/built', { fleet: f.id, system, design: design.id, count: built });
  return { built, fleet: f };
}

/**
 * A fleet's ships with their design numbers.
 * @param {import('../fleet/module.js').Fleet} f
 */
export function fleetShips(f) {
  return (f.ships ?? []).map((s) => {
    const design = f.designs?.[s.d] ?? DEFAULT_DESIGNS.find((d) => d.id === s.d);
    return { ...s, design, stats: design ? designStats(design) : null };
  });
}

/**
 * Totals for display: ships by design, firepower, strength.
 * @param {import('../fleet/module.js').Fleet} f
 */
export function fleetSummary(f) {
  /** @type {Record<string, number>} */
  const byDesign = {};
  let strength = 0;
  let armed = false;
  for (const s of fleetShips(f)) {
    byDesign[s.d] = (byDesign[s.d] ?? 0) + 1;
    if (s.stats) {
      strength += s.stats.strength * (s.hp / s.stats.hp);
      armed ||= s.stats.armed;
    }
  }
  return { byDesign, ships: (f.ships ?? []).length, strength: Math.round(strength), armed };
}

/**
 * Merge one docked fleet's ships into another at the same system.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ from: string, into: string }} p
 */
export function mergeFleets(world, ctx, { from, into }) {
  const a = fleetState(world).fleets[from];
  const b = fleetState(world).fleets[into];
  if (!a || !b || a === b || a.empire !== b.empire || a.status !== 'docked' || b.status !== 'docked' || a.at !== b.at || !a.ships || !b.ships) return false;
  b.ships.push(...a.ships);
  b.designs = { ...(b.designs ?? {}), ...(a.designs ?? {}) };
  disbandFleet(world, ctx, from);
  return true;
}
