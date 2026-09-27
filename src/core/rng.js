// @ts-check
/**
 * Seeded pseudo-random numbers (sfc32). The generator state is a plain
 * array of four uint32s so it can live inside the saved world.
 */

/** @typedef {{ s: [number, number, number, number] }} RngState */

/**
 * 32-bit string hash (cyrb-style). Stable across platforms.
 * @param {string} str
 * @param {number} [seed]
 */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/**
 * @param {number | string} seed
 * @returns {RngState}
 */
export function createRng(seed) {
  const key = String(seed);
  /** @type {RngState} */
  const rng = { s: [hashString(key, 1), hashString(key, 2), hashString(key, 3), hashString(key, 4)] };
  for (let i = 0; i < 12; i++) nextUint32(rng); // warm up
  return rng;
}

/** @param {RngState} rng */
export function nextUint32(rng) {
  const s = rng.s;
  let [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0;
  return t >>> 0;
}

/** Uniform float in [0, 1). @param {RngState} rng */
export const random = (rng) => nextUint32(rng) / 4294967296;

/** Uniform float in [min, max). @param {RngState} rng @param {number} min @param {number} max */
export const range = (rng, min, max) => min + random(rng) * (max - min);

/** Integer in [min, max]. @param {RngState} rng @param {number} min @param {number} max */
export const int = (rng, min, max) => min + Math.floor(random(rng) * (max - min + 1));

/** @template T @param {RngState} rng @param {T[]} items @returns {T} */
export const pick = (rng, items) => items[Math.floor(random(rng) * items.length)];

/**
 * Stateless deterministic value in [0, 1) for a key, e.g. procedural traits of
 * a star: `hashUnit(seed, 'star:1234:habitability')`. Does not advance any generator.
 * @param {number | string} seed
 * @param {string} key
 */
export const hashUnit = (seed, key) => hashString(`${seed}|${key}`) / 4294967296;
