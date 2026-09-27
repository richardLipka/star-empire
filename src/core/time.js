// @ts-check
import { DAYS_PER_YEAR, START_YEAR } from './units.js';

/**
 * Format game time (years since start) as a calendar-like date: "2437.214".
 * @param {number} t
 */
export const formatYear = (t) => (START_YEAR + t).toFixed(3);

/**
 * Human duration: "3 d", "7.2 mo", "11.4 y", "1,204 y".
 * @param {number} years
 */
export function formatDuration(years) {
  const a = Math.abs(years);
  if (a < 1 / 12) return `${Math.round(a * DAYS_PER_YEAR)} d`;
  if (a < 1) return `${(a * 12).toFixed(1)} mo`;
  if (a < 100) return `${a.toFixed(1)} y`;
  return `${Math.round(a).toLocaleString('en-US')} y`;
}
