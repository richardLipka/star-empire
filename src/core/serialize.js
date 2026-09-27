// @ts-check
/**
 * JSON with sorted object keys, so equal states always produce equal text.
 * @param {unknown} value
 */
export function stableStringify(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = v[k];
      return out;
    }
    return v;
  });
}

/**
 * Short fingerprint of a state (FNV-1a over the stable JSON), for determinism checks.
 * @param {unknown} value
 */
export function stateHash(value) {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
