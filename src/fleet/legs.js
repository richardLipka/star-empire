// @ts-check
import { flightProfile, distanceAt, speedAt } from './flight.js';
import { gToLyYr2 } from '../core/units.js';
import { add, distance, lerp, normalize, scale, sub } from '../core/vec3.js';

/**
 * A fleet's trip is a list of legs, each with absolute start and end times.
 *
 * @typedef {import('../core/vec3.js').Vec3} Vec3
 * @typedef {{ accelG: number, cruise: number }} Drive
 *
 * @typedef {{ kind: 'flight', fromPos: Vec3, toPos: Vec3, fromSystem: string | null, toSystem: string,
 *             departAt: number, arriveAt: number, profile: import('./flight.js').FlightProfile }} FlightLeg
 * @typedef {{ kind: 'wormhole', fromSystem: string, toSystem: string, fromPos: Vec3, toPos: Vec3,
 *             departAt: number, arriveAt: number, wormhole: string }} WormholeLeg
 * @typedef {{ kind: 'brake', fromPos: Vec3, toPos: Vec3, dir: Vec3, v0: number, accel: number,
 *             departAt: number, arriveAt: number, distance: number }} BrakeLeg
 * @typedef {FlightLeg | WormholeLeg | BrakeLeg} Leg
 */

/**
 * @param {{ fromPos: Vec3, toPos: Vec3, fromSystem: string | null, toSystem: string, departAt: number, drive: Drive, brake?: boolean }} p
 * @returns {FlightLeg}
 */
export function flightLeg({ fromPos, toPos, fromSystem, toSystem, departAt, drive, brake = true }) {
  const profile = flightProfile({ distance: distance(fromPos, toPos), accelG: drive.accelG, cruise: drive.cruise, brake });
  return { kind: 'flight', fromPos, toPos, fromSystem, toSystem, departAt, arriveAt: departAt + profile.totalTime, profile };
}

/**
 * Brake from speed `v0` (fraction of c) along `dir` to a stop.
 * @param {{ fromPos: Vec3, dir: Vec3, v0: number, accelG: number, departAt: number }} p
 * @returns {BrakeLeg}
 */
export function brakeLeg({ fromPos, dir, v0, accelG, departAt }) {
  const a = gToLyYr2(accelG);
  const gamma = 1 / Math.sqrt(1 - v0 * v0);
  const duration = (gamma * v0) / a;
  const dist = (gamma - 1) / a;
  return { kind: 'brake', fromPos, toPos: add(fromPos, scale(dir, dist)), dir, v0, accel: a, departAt, arriveAt: departAt + duration, distance: dist };
}

/**
 * Distance covered along a leg `dt` years after it started.
 * @param {Leg} leg @param {number} dt
 */
function legProgress(leg, dt) {
  if (leg.kind === 'flight') return distanceAt(leg.profile, dt) / Math.max(leg.profile.distance, 1e-12);
  if (leg.kind === 'brake') {
    const T = leg.arriveAt - leg.departAt;
    const rem = Math.max(0, T - dt);
    const hyper = (Math.sqrt(1 + (leg.accel * rem) ** 2) - 1) / leg.accel;
    return leg.distance > 0 ? (leg.distance - hyper) / leg.distance : 1;
  }
  return dt > 0 ? 1 : 0;
}

/**
 * Position on a list of legs at time `t`.
 * @param {Leg[]} legs @param {number} t @returns {Vec3}
 */
export function positionOnLegs(legs, t) {
  if (legs.length === 0) throw new Error('No legs');
  if (t <= legs[0].departAt) return legs[0].fromPos;
  for (const leg of legs) {
    if (t < leg.arriveAt) {
      if (t < leg.departAt) return leg.fromPos;
      return lerp(leg.fromPos, leg.toPos, legProgress(leg, t - leg.departAt));
    }
  }
  return legs[legs.length - 1].toPos;
}

/**
 * Velocity (vector, fraction of c) on a list of legs at time `t`.
 * @param {Leg[]} legs @param {number} t @returns {Vec3}
 */
export function velocityOnLegs(legs, t) {
  const leg = legs.find((l) => t >= l.departAt && t < l.arriveAt);
  if (!leg || leg.kind === 'wormhole') return [0, 0, 0];
  const dir = normalize(sub(leg.toPos, leg.fromPos));
  if (leg.kind === 'flight') return scale(dir, speedAt(leg.profile, t - leg.departAt));
  const rem = leg.arriveAt - t;
  const v = (leg.accel * rem) / Math.sqrt(1 + (leg.accel * rem) ** 2);
  return scale(dir, v);
}

/** @param {Leg[]} legs @param {number} t */
export const currentLeg = (legs, t) => legs.find((l) => t >= l.departAt && t < l.arriveAt) ?? null;
