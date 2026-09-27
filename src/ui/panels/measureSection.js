// @ts-check
import { h, kv } from '../dom.js';
import { formatDuration } from '../../core/time.js';
import { measure } from '../../galaxy/measure.js';
import { DRIVE_TIERS, WEAR_ABOVE_G } from '../../fleet/drives.js';

/**
 * @param {import('../../galaxy/catalog.js').StarSystem} a
 * @param {import('../../galaxy/catalog.js').StarSystem} b
 */
export function renderMeasure(a, b) {
  const m = measure(a, b, DRIVE_TIERS);
  const oneG = m.trips.find((t) => t.drive.accelG === 1) ?? m.trips[m.trips.length - 1];
  return [
    h('h3', {}, `Measure: ${a.name} → ${b.name}`),
    kv([['Distance', `${m.distance.toFixed(2)} ly`], ['Light delay', formatDuration(m.lightDelay)]]),
    kv(m.trips.map(({ drive, profile }) => [
      `${drive.accelG} g → ${drive.cruise} c${drive.accelG > WEAR_ABOVE_G ? ' ⚠' : ''}`,
      `${formatDuration(profile.totalTime)} (crew ${formatDuration(profile.properTime)})`,
    ])),
    h('p.hint', {}, `Warning at arrival, braking at ${oneG.drive.accelG} g: ${formatDuration(oneG.profile.warning)}. ⚠ = wear above ${WEAR_ABOVE_G} g.`),
  ];
}
