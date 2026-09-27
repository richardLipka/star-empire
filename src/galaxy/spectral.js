// @ts-check
/**
 * Plain-language description of a spectral type such as "G2V" or "DA2".
 */

/** @type {Record<string, { colour: string, temp: string }>} */
const CLASSES = {
  O: { colour: 'blue', temp: '> 30,000 K' },
  B: { colour: 'blue-white', temp: '10,000–30,000 K' },
  A: { colour: 'white', temp: '7,500–10,000 K' },
  F: { colour: 'yellow-white', temp: '6,000–7,500 K' },
  G: { colour: 'yellow', temp: '5,200–6,000 K' },
  K: { colour: 'orange', temp: '3,700–5,200 K' },
  M: { colour: 'red', temp: '2,400–3,700 K' },
  D: { colour: 'white', temp: '4,000–40,000 K' },
  '?': { colour: 'unknown', temp: 'unknown' },
};

/** Spectral classes in display order. */
export const SPECTRAL_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'D', '?'];

/** @type {[RegExp, string][]} luminosity classes; longer numerals must be tested first */
const LUMINOSITY = [
  [/^III/, 'giant'],
  [/^II/, 'bright giant'],
  [/^IV/, 'subgiant'],
  [/^VI/, 'subdwarf'],
  [/^V/, 'main-sequence dwarf'],
  [/^I/, 'supergiant'],
];

/**
 * @param {string} spect catalogue spectral type
 * @param {string} cls   class letter from the catalogue
 */
export function describeSpectral(spect, cls) {
  const info = CLASSES[cls] ?? CLASSES['?'];
  if (cls === 'D') return { cls, kind: 'white dwarf', ...info };
  if (cls === '?') return { cls, kind: 'unclassified star', ...info };
  if (/^sd/.test(spect)) return { cls, kind: `${info.colour} subdwarf`, ...info };
  const rest = spect.replace(/^[a-z]*[OBAFGKM][0-9.]*/, '').trim();
  const lum = LUMINOSITY.find(([re]) => re.test(rest));
  const kind = lum ? `${info.colour} ${lum[1]}` : cls === 'M' || cls === 'K' ? `${info.colour} dwarf` : `${info.colour} star`;
  return { cls, kind, ...info };
}
