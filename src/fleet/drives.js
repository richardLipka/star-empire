// @ts-check
import drives from '../data/drives.json';

/** Display names are translations: `drive.<id>`. @typedef {{ id: string, accelG: number, cruise: number }} DriveTier */

/** @type {DriveTier[]} */
export const DRIVE_TIERS = drives.tiers;

/** Drive available at the start of the game. */
export const START_DRIVE = /** @type {DriveTier} */ (DRIVE_TIERS.find((d) => d.id === drives.start));

/**
 * The drive ships built at a system get: the best one known there (set by
 * research on `presence.capabilities`), or the starting drive.
 * @param {{ capabilities?: { drive: string | null } } | undefined} presence
 * @returns {DriveTier}
 */
export function driveFor(presence) {
  const id = presence?.capabilities?.drive;
  return DRIVE_TIERS.find((d) => d.id === id) ?? START_DRIVE;
}

/** Accelerations above this (in g) wear down ships and crews. */
export const WEAR_ABOVE_G = drives.wearAboveG;
