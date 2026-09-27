// @ts-check
import { tech } from './catalog.js';
import { DRIVE_TIERS } from '../fleet/drives.js';

/**
 * What a system can do, given the technologies known there. Stored on the
 * system's presence (`presence.capabilities`) so other modules read it
 * without depending on the research module:
 * - info:      relay range bonus
 * - detection: sensor range and angle bonus; plume visibility of fleets launched here
 * - governors: the drive given to ships built here
 * - research:  research rate multiplier
 *
 * @typedef {{ relayBonus: number, sensorRange: number, sensorAngle: number, plumeVisibility: number, researchRate: number, drive: string | null, unlocks: string[] }} Capabilities
 */

/** @returns {Capabilities} */
export const baseCapabilities = () => ({ relayBonus: 0, sensorRange: 0, sensorAngle: 0, plumeVisibility: 1, researchRate: 1, drive: null, unlocks: [] });

/**
 * @param {Iterable<string>} known technology ids
 * @returns {Capabilities}
 */
export function capabilities(known) {
  const caps = baseCapabilities();
  let driveIndex = -1;
  for (const id of known) {
    for (const e of tech(id).effects) {
      if (e.kind === 'unlock') {
        caps.unlocks.push(e.target);
        if (e.target.startsWith('drive.')) driveIndex = Math.max(driveIndex, DRIVE_TIERS.findIndex((d) => d.id === e.target.slice(6)));
        continue;
      }
      switch (e.target) {
        case 'relay.range': caps.relayBonus += e.value; break;
        case 'sensor.range': caps.sensorRange += e.value; break;
        case 'sensor.angle': caps.sensorAngle += e.value; break;
        case 'research.rate': caps.researchRate *= e.value; break;
        case 'plume.visibility': caps.plumeVisibility *= e.value; break;
        default: break;
      }
    }
  }
  caps.drive = driveIndex >= 0 ? DRIVE_TIERS[driveIndex].id : null;
  caps.unlocks.sort();
  return caps;
}
