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
 * - security:  cipher strength of messages sent from here, decryption level and
 *              listening reach of this system, beam spill of its relay
 * - colonies:  capacity per site kind, food, growth, industry, risk factors,
 *              colonisation modes (colony.mode.*), terraforming (planet.*)
 *
 * @typedef {{ relayBonus: number, sensorRange: number, sensorAngle: number, plumeVisibility: number, researchRate: number,
 *             cipher: number, decrypt: number, interceptRange: number, beamSpill: number, drive: string | null, unlocks: string[],
 *             colony: ColonyCaps }} Capabilities
 * @typedef {{ capacity: Record<string, number>, food: number, foodClosed: number, growth: number, industry: number, risk: Record<string, number> }} ColonyCaps
 */

/** @returns {Capabilities} */
export const baseCapabilities = () => ({
  relayBonus: 0, sensorRange: 0, sensorAngle: 0, plumeVisibility: 1, researchRate: 1,
  cipher: 0, decrypt: 0, interceptRange: 0, beamSpill: 1, drive: null, unlocks: [],
  colony: {
    capacity: { habitable: 1, terraformed: 1, terraformable: 1, hostile: 1, orbital: 1 },
    food: 1, foodClosed: 0, growth: 1, industry: 1,
    risk: { prion: 1, radiation: 1, crops: 1, unrest: 1 },
  },
});

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
        case 'crypto.cipher': caps.cipher += e.value; break;
        case 'crypto.decrypt': caps.decrypt += e.value; break;
        case 'intercept.range': caps.interceptRange += e.value; break;
        case 'beam.spill': caps.beamSpill *= e.value; break;
        case 'colony.food': caps.colony.food *= e.value; break;
        case 'colony.closedFood': caps.colony.foodClosed += e.value; break;
        case 'colony.growth': caps.colony.growth *= e.value; break;
        case 'colony.industry': caps.colony.industry *= e.value; break;
        default:
          if (e.target.startsWith('colony.capacity.')) caps.colony.capacity[e.target.slice(16)] *= e.value;
          else if (e.target.startsWith('risk.')) caps.colony.risk[e.target.slice(5)] *= e.value;
          break;
      }
    }
  }
  caps.drive = driveIndex >= 0 ? DRIVE_TIERS[driveIndex].id : null;
  caps.unlocks.sort();
  return caps;
}
