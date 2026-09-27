// @ts-check
import { distance, dot, normalize, sub } from '../core/vec3.js';
import { empireState } from '../empire/module.js';
import { fleetState } from '../fleet/module.js';

/** Half-angle of a "toward" direction cone. */
const TOWARD_COS = Math.cos((60 * Math.PI) / 180);

/**
 * Candidate systems for a governor at `from`: within range, optionally
 * inside a cone toward another system, and not already targeted by one of
 * our own fleets.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ from: string, empire: string, maxRange: number, toward: string | null, mission: string }} p
 * @returns {{ id: string, distance: number }[]} nearest first
 */
export function candidates(world, ctx, { from, empire, maxRange, toward, mission }) {
  const catalog = ctx.data.catalog;
  const here = catalog.get(from).pos;
  const dir = toward && toward !== from ? normalize(sub(catalog.get(toward).pos, here)) : null;
  const taken = new Set(Object.values(fleetState(world).fleets)
    .filter((f) => f.empire === empire && f.mission?.kind === mission && f.mission.target)
    .map((f) => f.mission.target));
  const out = [];
  for (const s of catalog.systems) {
    if (s.id === from || taken.has(s.id)) continue;
    const d = distance(s.pos, here);
    if (d > maxRange) continue;
    if (dir && dot(normalize(sub(s.pos, here)), dir) < TOWARD_COS) continue;
    out.push({ id: s.id, distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * Has this empire been to the system? Governors share the empire's survey
 * records directly (a simplification until records travel with ships).
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} system
 */
export const isExplored = (world, empire, system) => empireState(world).explored[empire]?.[system] !== undefined;
