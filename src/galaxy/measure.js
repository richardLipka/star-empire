// @ts-check
import { distance } from '../core/vec3.js';
import { flightProfile } from '../fleet/flight.js';

/**
 * Distance, light delay and trip times between two systems.
 * @param {import('./catalog.js').StarSystem} a
 * @param {import('./catalog.js').StarSystem} b
 * @param {import('../fleet/drives.js').DriveTier[]} drives
 */
export function measure(a, b, drives) {
  const d = distance(a.pos, b.pos);
  return {
    distance: d,
    lightDelay: d, // c = 1 ly/yr
    trips: drives.map((drive) => ({ drive, profile: flightProfile({ distance: d, accelG: drive.accelG, cruise: drive.cruise }) })),
  };
}
