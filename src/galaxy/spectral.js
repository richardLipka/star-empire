// @ts-check
/**
 * Structured description of a spectral type such as "G2V" or "DA2".
 * The UI translates: `spectral.colour.<cls>`, `spectral.lum.<lum>`.
 */

/** Temperature ranges in kelvin by class. @type {Record<string, [number, number] | null>} */
const TEMPERATURE = {
  O: [30000, 50000], B: [10000, 30000], A: [7500, 10000], F: [6000, 7500],
  G: [5200, 6000], K: [3700, 5200], M: [2400, 3700], D: [4000, 40000], '?': null,
};

/** Spectral classes in display order. */
export const SPECTRAL_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'D', '?'];

/** @type {[RegExp, string][]} luminosity classes; longer numerals must be tested first */
const LUMINOSITY = [
  [/^III/, 'giant'],
  [/^II/, 'brightGiant'],
  [/^IV/, 'subgiant'],
  [/^VI/, 'subdwarf'],
  [/^V/, 'dwarf'],
  [/^I/, 'supergiant'],
];

/**
 * @typedef {'giant' | 'brightGiant' | 'subgiant' | 'subdwarf' | 'dwarf' | 'supergiant' | 'whiteDwarf' | 'star' | 'unknown'} LuminosityKind
 * @param {string} spect catalogue spectral type
 * @param {string} cls   class letter from the catalogue
 * @returns {{ cls: string, lum: LuminosityKind, temp: [number, number] | null }}
 */
export function describeSpectral(spect, cls) {
  const temp = TEMPERATURE[cls] ?? null;
  if (cls === 'D') return { cls, lum: 'whiteDwarf', temp };
  if (cls === '?' || !(cls in TEMPERATURE)) return { cls: '?', lum: 'unknown', temp: null };
  if (/^sd/.test(spect)) return { cls, lum: 'subdwarf', temp };
  const rest = spect.replace(/^[a-z]*[OBAFGKM][0-9.]*/, '').trim();
  const found = LUMINOSITY.find(([re]) => re.test(rest));
  const lum = /** @type {LuminosityKind} */ (found ? found[1] : cls === 'M' || cls === 'K' ? 'dwarf' : 'star');
  return { cls, lum, temp };
}
