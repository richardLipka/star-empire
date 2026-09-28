// @ts-check
import { t, getLocale } from './index.js';
import { DAYS_PER_YEAR, START_YEAR } from '../core/units.js';

/** Locale-aware formatting of game quantities. */

const nf = (/** @type {Intl.NumberFormatOptions} */ o) => new Intl.NumberFormat(getLocale(), o);

/** Calendar year with fraction: "2437.214". @param {number} time game time */
export const fmtYear = (time) => nf({ minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false }).format(START_YEAR + time);

/** Short year: "2437.2". @param {number} time */
export const fmtYearShort = (time) => nf({ minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(START_YEAR + time);

/** Human duration: "3 d", "7.2 mo", "11.4 y", "1,204 y". @param {number} years */
export function fmtDuration(years) {
  const a = Math.abs(years);
  if (a < 1 / 12) return t('unit.days', { n: Math.round(a * DAYS_PER_YEAR) });
  if (a < 1) return t('unit.months', { n: nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(a * 12) });
  if (a < 100) return t('unit.years', { n: nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(a) });
  return t('unit.years', { n: nf({ maximumFractionDigits: 0 }).format(a) });
}

/** "8.60 ly". @param {number} ly */
export const fmtLy = (ly) => t('unit.ly', { n: nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ly) });

/** "53 %". @param {number} x fraction */
export const fmtPercent = (x) => nf({ style: 'percent', maximumFractionDigits: 0 }).format(x);

/** People, compactly (12 bn, 3.4 k) in the current language. @param {number} n */
export const fmtPeople = (n) => nf({ notation: 'compact', maximumFractionDigits: n >= 1000 ? 1 : 0 }).format(Math.round(n));

/** @param {number} x @param {number} [digits] */
export const fmtNumber = (x, digits = 2) => nf({ maximumFractionDigits: digits }).format(x);

/** Luminosity in solar units, compact. @param {number} lum */
export function fmtLum(lum) {
  if (!Number.isFinite(lum)) return '?';
  if (lum >= 10) return nf({ maximumFractionDigits: 0 }).format(lum);
  if (lum >= 0.1) return nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(lum);
  return nf({ notation: 'scientific', maximumFractionDigits: 1 }).format(lum);
}

/** Game speed "1 y/s" from years per real second. @param {number} rate */
export function fmtSpeed(rate) {
  const days = rate * DAYS_PER_YEAR;
  if (days < 6.5) return t('speed.days', { n: Math.round(days) });
  if (days < 25) return t('speed.weeks', { n: Math.round(days / 7) });
  if (rate < 1) return t('speed.months', { n: Math.round(rate * 12) });
  return t('speed.years', { n: Math.round(rate) });
}

/** A short span in seconds: "3.2 ms", "14 s", "12 min". @param {number} s */
export function fmtSeconds(s) {
  if (s < 1) return t('unit.ms', { n: nf({ maximumFractionDigits: s < 0.01 ? 2 : 1 }).format(s * 1000) });
  if (s < 120) return t('unit.s', { n: nf({ maximumFractionDigits: s < 10 ? 1 : 0 }).format(s) });
  return t('unit.min', { n: nf({ maximumFractionDigits: 0 }).format(s / 60) });
}

/** A speed as a fraction of c: "0.12 c". @param {number} v */
export const fmtC = (v) => t('unit.c', { n: nf({ maximumFractionDigits: v < 0.01 ? 4 : 2 }).format(v) });
