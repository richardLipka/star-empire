// @ts-check
import { flightLeg } from './legs.js';

/**
 * Plan the fastest trip from a point (or system) to a system, using at most
 * one known wormhole. Ships pass a wormhole instantly.
 *
 * @param {object} p
 * @param {import('../core/vec3.js').Vec3} p.fromPos
 * @param {string | null} p.fromSystem
 * @param {string} p.toSystem
 * @param {number} p.departAt
 * @param {import('./legs.js').Drive} p.drive
 * @param {(id: string) => import('../core/vec3.js').Vec3} p.posOf  system position lookup
 * @param {import('../events/wormholes.js').Wormhole[]} p.wormholes
 * @returns {import('./legs.js').Leg[]}
 */
export function planTrip({ fromPos, fromSystem, toSystem, departAt, drive, posOf, wormholes }) {
  const toPos = posOf(toSystem);
  /** @type {import('./legs.js').Leg[]} */
  let best = fromSystem === toSystem ? [] : [flightLeg({ fromPos, toPos, fromSystem, toSystem, departAt, drive })];
  let bestArrive = best.length ? best[best.length - 1].arriveAt : departAt;

  for (const w of wormholes) {
    for (const [enter, exit] of [[w.a, w.b], [w.b, w.a]]) {
      /** @type {import('./legs.js').Leg[]} */
      const legs = [];
      let t = departAt;
      if (fromSystem !== enter) {
        const leg = flightLeg({ fromPos, toPos: posOf(enter), fromSystem, toSystem: enter, departAt: t, drive });
        legs.push(leg);
        t = leg.arriveAt;
      }
      legs.push({ kind: 'wormhole', fromSystem: enter, toSystem: exit, fromPos: posOf(enter), toPos: posOf(exit), departAt: t, arriveAt: t, wormhole: w.id });
      if (exit !== toSystem) {
        const leg = flightLeg({ fromPos: posOf(exit), toPos, fromSystem: exit, toSystem, departAt: t, drive });
        legs.push(leg);
        t = leg.arriveAt;
      }
      if (t < bestArrive - 1e-9) {
        best = legs;
        bestArrive = t;
      }
    }
  }
  return best;
}
