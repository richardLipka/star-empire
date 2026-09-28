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
 * @property {number} brakeStart    time after departure when braking starts (a flyby: its arrival, never reached)
 * @property {number} warning       years between the braking flash reaching the destination and arrival
 * @property {boolean} brake        false: a flyby, arriving at speed (no braking burn at all)
 * @property {number} arrivalSpeed  fraction of c at arrival (0 when braking)
 */

/**
 * @param {{ distance: number, accelG: number, cruise: number, brake?: boolean }} p
 *   `brake: false` plans a flyby: accelerate, coast, and pass the target at speed.
 * @returns {FlightProfile}
 */
export function flightProfile({ distance, accelG, cruise, brake = true }) {
  if (!(distance >= 0)) throw new Error(`Invalid distance ${distance}`);
  if (!(accelG > 0) || !(cruise > 0 && cruise < 1)) throw new Error('Invalid drive parameters');
  const a = gToLyYr2(accelG);
  const gammaCruise = 1 / Math.sqrt(1 - cruise * cruise);
  const fullBurnTime = (gammaCruise * cruise) / a;
  const fullBurnDist = (gammaCruise - 1) / a;
  if (!brake) return flybyProfile(distance, a, cruise, fullBurnTime, fullBurnDist);

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
    brake: true,
    arrivalSpeed: 0,
  };
}

/**
 * Accelerate (up to cruise) and coast through the target without braking.
 * @param {number} distance @param {number} a @param {number} cruise @param {number} fullBurnTime @param {number} fullBurnDist
 * @returns {FlightProfile}
 */
function flybyProfile(distance, a, cruise, fullBurnTime, fullBurnDist) {
  let burnTime, burnDistance, peakSpeed, coastTime;
  if (fullBurnDist <= distance) {
    burnTime = fullBurnTime;
    burnDistance = fullBurnDist;
    peakSpeed = cruise;
    coastTime = (distance - fullBurnDist) / cruise;
  } else {
    burnDistance = distance;
    burnTime = Math.sqrt((a * distance + 1) ** 2 - 1) / a;
    peakSpeed = (a * burnTime) / Math.sqrt(1 + (a * burnTime) ** 2);
    coastTime = 0;
  }
  const gammaPeak = 1 / Math.sqrt(1 - peakSpeed * peakSpeed);
  return {
    distance, accel: a, peakSpeed, burnTime, burnDistance, coastTime,
    totalTime: burnTime + coastTime,
    properTime: Math.asinh(a * burnTime) / a + coastTime / gammaPeak,
    brakeStart: burnTime + coastTime, // = arrival: it never brakes on this leg (see `brake`)
    warning: 0,
    brake: false,
    arrivalSpeed: peakSpeed,
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
  if (!f.brake) return burnDistance + (t - burnTime) * peakSpeed;
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
  if (t <= 0) return 0;
  if (t >= totalTime) return f.brake ? 0 : peakSpeed;
  const v = (/** @type {number} */ s) => (a * s) / Math.sqrt(1 + (a * s) ** 2);
  if (t <= burnTime) return v(t);
  if (!f.brake) return peakSpeed;
  if (t <= burnTime + coastTime) return peakSpeed;
  return v(totalTime - t);
}
