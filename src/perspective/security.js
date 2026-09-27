// @ts-check
import { toSegment } from '../core/vec3.js';
import { SPILL_LY, interceptsOf } from '../security/module.js';
import { empireState } from '../empire/module.js';

/**
 * Which of our relay links could be overheard, and by whom: foreign systems
 * within the beam spill of the link. In the knowledge view only foreign
 * systems we know of count, and their listening technology is unknown
 * (assumed basic); the truth view uses everything.
 *
 * @param {import('../sim/world.js').World} world
 * @param {{ data: Record<string, any> }} ctx
 * @param {import('./picture.js').Picture} pic
 * @returns {{ exposed: { a: string, b: string, listeners: string[] }[], overheard: number, read: number }}
 */
export function securityPicture(world, ctx, pic) {
  const presence = empireState(world).presence;
  const posOf = (/** @type {string} */ id) => ctx.data.catalog.get(id).pos;
  const foreign = pic.systems.filter((s) => s.owner !== pic.empire).map((s) => s.id);
  const reachOf = (/** @type {string} */ listener) => (pic.mode === 'truth' ? presence[listener]?.capabilities?.interceptRange ?? 0 : 0);
  const exposed = [];
  for (const [a, b] of pic.links) {
    const spill = SPILL_LY * Math.max(presence[a]?.capabilities?.beamSpill ?? 1, presence[b]?.capabilities?.beamSpill ?? 1);
    const listeners = foreign.filter((l) => toSegment(posOf(l), posOf(a), posOf(b)).distance <= spill + reachOf(l));
    if (listeners.length) exposed.push({ a, b, listeners });
  }
  const log = interceptsOf(world, pic.empire);
  return { exposed, overheard: log.length, read: log.filter((i) => i.readable).length };
}
