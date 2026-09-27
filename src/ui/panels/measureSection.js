// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtLy } from '../../i18n/format.js';
import { measure } from '../../galaxy/measure.js';
import { DRIVE_TIERS, WEAR_ABOVE_G } from '../../fleet/drives.js';

/**
 * @param {import('../../galaxy/catalog.js').StarSystem} a
 * @param {import('../../galaxy/catalog.js').StarSystem} b
 */
export function renderMeasure(a, b) {
  const m = measure(a, b, DRIVE_TIERS);
  const oneG = m.trips.find((x) => x.drive.accelG === 1) ?? m.trips[m.trips.length - 1];
  return [
    h('h3', {}, t('panel.measure', { from: a.name, to: b.name })),
    kv([[t('measure.distance'), fmtLy(m.distance)], [t('measure.light'), fmtDuration(m.lightDelay)]]),
    kv(m.trips.map(({ drive, profile }) => [
      t('measure.trip', { g: drive.accelG, c: drive.cruise }) + (drive.accelG > WEAR_ABOVE_G ? ' ⚠' : ''),
      t('measure.tripValue', { total: fmtDuration(profile.totalTime), crew: fmtDuration(profile.properTime) }),
    ])),
    h('p.hint', {}, t('measure.warning', { g: oneG.drive.accelG, warning: fmtDuration(oneG.profile.warning), wear: WEAR_ABOVE_G })),
  ];
}
