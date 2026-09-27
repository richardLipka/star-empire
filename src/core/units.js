// @ts-check
/**
 * Game units: distance in light-years, time in years, so c = 1 ly/yr
 * and light delay in years equals distance in light-years.
 */

/** Speed of light, ly/yr. */
export const C = 1;

/** Days per Julian year. */
export const DAYS_PER_YEAR = 365.25;

/** Light-years per parsec. */
export const LY_PER_PARSEC = 3.261563777;

/** Standard gravity (9.80665 m/s²) expressed in ly/yr². */
export const G_LY_PER_YR2 = (9.80665 * (365.25 * 86400) ** 2) / 9.4607304725808e15;

/** @param {number} g acceleration in g @returns {number} ly/yr² */
export const gToLyYr2 = (g) => g * G_LY_PER_YR2;

/** Calendar year at game time 0. */
export const START_YEAR = 2400;
