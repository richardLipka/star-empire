// @ts-check
import { gToLyYr2 } from '../core/units.js';

/**
 * Relativistic constant-acceleration flight: accelerate at proper acceleration
 * `a` to the cruise speed, coast, then brake at `a`. Times are in the rest
 * frame of the stars (Earth frame) unless named `proper…` (ship frame).
 * If the trip is too short to reach cruise speed, the ship turns over at
 * the midpoint.
 *
 * Hyperbolic motion from rest: x(t) = (√(1 + (a t)²) − 1) / a,
 * v(t) = a t / √(1 + (a t)²), proper time τ(t) = asinh(a t) / a.
 */

/**
 * @typedef {object} FlightProfile
 * @property {number} distance      ly
 * @property {number} accel         ly/yr²
 * @property {number} peakSpeed     fraction of c actually reached
 * @property {number} burnTime      years spent in each burn (accelerate, and again braking)
 * @property {number} burnDistance  ly covered in each burn
 * @property {number} coastTime     years
 * @property {number} totalTime     years, departure to arrival
 * @property {number} properTime    years experienced by the crew
 * @property {number} brakeStart    time after departure when braking starts
 * @property {number} warning       years between the braking flash reaching the destination and arrival
 */

/**
 * @param {{ distance: number, accelG: number, cruise: number }} p
 * @returns {FlightProfile}
 */
export function flightProfile({ distance, accelG, cruise }) {
  if (!(distance >= 0)) throw new Error(`Invalid distance ${distance}`);
  if (!(accelG > 0) || !(cruise > 0 && cruise < 1)) throw new Error('Invalid drive parameters');
  const a = gToLyYr2(accelG);
  const gammaCruise = 1 / Math.sqrt(1 - cruise * cruise);
  const fullBurnTime = (gammaCruise * cruise) / a;
  const fullBurnDist = (gammaCruise - 1) / a;

  let burnTime, burnDistance, peakSpeed, coastTime;
  if (2 * fullBurnDist <= distance) {
    burnTime = fullBurnTime;
    burnDistance = fullBurnDist;
    peakSpeed = cruise;
    coastTime = (distance - 2 * fullBurnDist) / cruise;
  } else {
    burnDistance = distance / 2;
    burnTime = Math.sqrt((a * burnDistance + 1) ** 2 - 1) / a;
    peakSpeed = (a * burnTime) / Math.sqrt(1 + (a * burnTime) ** 2);
    coastTime = 0;
  }
  const burnProper = Math.asinh(a * burnTime) / a;
  const gammaPeak = 1 / Math.sqrt(1 - peakSpeed * peakSpeed);
  const totalTime = 2 * burnTime + coastTime;
  return {
    distance,
    accel: a,
    peakSpeed,
    burnTime,
    burnDistance,
    coastTime,
    totalTime,
    properTime: 2 * burnProper + coastTime / gammaPeak,
    brakeStart: burnTime + coastTime,
    warning: burnTime - burnDistance,
  };
}

/**
 * Distance travelled (ly) at time `t` after departure.
 * @param {FlightProfile} f
 * @param {number} t
 */
export function distanceAt(f, t) {
  const { accel: a, burnTime, burnDistance, coastTime, peakSpeed, totalTime, distance } = f;
  if (t <= 0) return 0;
  if (t >= totalTime) return distance;
  const hyper = (/** @type {number} */ s) => (Math.sqrt(1 + (a * s) ** 2) - 1) / a;
  if (t <= burnTime) return hyper(t);
  if (t <= burnTime + coastTime) return burnDistance + (t - burnTime) * peakSpeed;
  return distance - hyper(totalTime - t); // braking mirrors the acceleration
}

/**
 * Speed (fraction of c) at time `t` after departure.
 * @param {FlightProfile} f
 * @param {number} t
 */
export function speedAt(f, t) {
  const { accel: a, burnTime, coastTime, peakSpeed, totalTime } = f;
  if (t <= 0 || t >= totalTime) return 0;
  const v = (/** @type {number} */ s) => (a * s) / Math.sqrt(1 + (a * s) ** 2);
  if (t <= burnTime) return v(t);
  if (t <= burnTime + coastTime) return peakSpeed;
  return v(totalTime - t);
}
