// @ts-check
import drives from '../data/drives.json';

/** @typedef {{ id: string, name: string, accelG: number, cruise: number }} DriveTier */

/** @type {DriveTier[]} */
export const DRIVE_TIERS = drives.tiers;

/** Drive available at the start of the game. */
export const START_DRIVE = /** @type {DriveTier} */ (DRIVE_TIERS.find((d) => d.id === drives.start));

/** Accelerations above this (in g) wear down ships and crews. */
export const WEAR_ABOVE_G = drives.wearAboveG;
