// @ts-check
import { flightLeg, brakeLeg } from './legs.js';
import { normalize, sub } from '../core/vec3.js';

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

/**
 * @typedef {'visit' | 'attack' | 'strike'} WaypointAction
 * @typedef {{ system: string, action: WaypointAction }} Waypoint
 * @typedef {'normal' | 'flyby' | 'stealth'} Approach
 */

/**
 * Plan a voyage through several systems (docs/FLEETS.md).
 * - normal: brake into every waypoint and leave again (the last one: stay);
 * - stealth: the same with gentle burns (drive capped to `stealth`), a much longer trip;
 * - flyby: pass every waypoint at speed without braking, brake beyond it, and
 *   fly on to the next; after the last one, come back to `home` (if given).
 * Returns the legs and, for each waypoint, the index of the leg that reaches it.
 * @param {object} p
 * @param {import('../core/vec3.js').Vec3} p.fromPos
 * @param {string} p.fromSystem
 * @param {Waypoint[]} p.waypoints
 * @param {Approach} p.approach
 * @param {number} p.departAt
 * @param {import('./legs.js').Drive} p.drive
 * @param {{ accelG: number, cruise: number }} p.stealth
 * @param {string | null} p.home
 * @param {(id: string) => import('../core/vec3.js').Vec3} p.posOf
 * @param {import('../events/wormholes.js').Wormhole[]} p.wormholes
 * @returns {{ legs: import('./legs.js').Leg[], reach: number[] }}
 */
export function planVoyage({ fromPos, fromSystem, waypoints, approach, departAt, drive, stealth, home, posOf, wormholes }) {
  /** @type {import('./legs.js').Leg[]} */
  const legs = [];
  /** @type {number[]} */
  const reach = [];
  const d = approach === 'stealth' ? { accelG: Math.min(drive.accelG, stealth.accelG), cruise: Math.min(drive.cruise, stealth.cruise) } : drive;
  let pos = fromPos;
  /** @type {string | null} */
  let at = fromSystem;
  let t = departAt;
  for (const wp of waypoints) {
    if (wp.system === at) {
      reach.push(-1); // already there
      continue;
    }
    if (approach === 'flyby') {
      const leg = flightLeg({ fromPos: pos, toPos: posOf(wp.system), fromSystem: at, toSystem: wp.system, departAt: t, drive: d, brake: false });
      legs.push(leg);
      reach.push(legs.length - 1);
      t = leg.arriveAt;
      if (wp.action === 'strike') return { legs, reach }; // an impactor does not survive its target
      const dir = normalize(sub(leg.toPos, leg.fromPos));
      const brake = brakeLeg({ fromPos: leg.toPos, dir, v0: leg.profile.arrivalSpeed, accelG: d.accelG, departAt: t });
      legs.push(brake);
      pos = brake.toPos;
      at = null;
      t = brake.arriveAt;
    } else {
      const trip = planTrip({ fromPos: pos, fromSystem: at, toSystem: wp.system, departAt: t, drive: d, posOf, wormholes });
      legs.push(...trip);
      reach.push(legs.length - 1);
      pos = posOf(wp.system);
      at = wp.system;
      t = legs.length ? legs[legs.length - 1].arriveAt : t;
    }
  }
  if (approach === 'flyby' && home && at !== home) {
    legs.push(...planTrip({ fromPos: pos, fromSystem: at, toSystem: home, departAt: t, drive, posOf, wormholes }));
  }
  return { legs, reach };
}
