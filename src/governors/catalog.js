// @ts-check
import data from '../data/directives.json';

/**
 * The catalogue of directives governors understand (src/data/directives.json).
 *
 * @typedef {{ id: string, type: 'enum' | 'number' | 'boolean' | 'system' | 'drive', options?: string[], default?: any,
 *             min?: number, max?: number, step?: number, unit?: string, optional?: boolean }} ParamDef
 * @typedef {{ id: string, category: string, implemented: boolean, repeating?: boolean, oneShot?: boolean, params: ParamDef[] }} DirectiveDef
 */

/** Parameters every directive has: priority, condition, expiry. @type {ParamDef[]} */
export const COMMON_PARAMS = /** @type {ParamDef[]} */ (data.common);

/** @type {{ id: string, directives: DirectiveDef[] }[]} */
export const CATEGORIES = data.categories.map((c) => ({
  id: c.id,
  directives: c.directives.map((d) => /** @type {DirectiveDef} */ ({ ...d, category: c.id })),
}));

/** @type {Map<string, DirectiveDef>} */
const byId = new Map(CATEGORIES.flatMap((c) => c.directives.map((d) => [d.id, d])));

/** @param {string} id */
export function directiveDef(id) {
  const d = byId.get(id);
  if (!d) throw new Error(`Unknown directive ${id}`);
  return d;
}

export const ALL_DIRECTIVES = [...byId.values()];

/** Placeholder capacities until the economy exists. */
export const CAPACITY = data.capacity;

/** Priority order: higher first. */
export const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

/**
 * Fill in defaults and check values against the catalogue.
 * @param {string} type @param {Record<string, any>} params
 * @returns {Record<string, any>}
 */
export function normalizeParams(type, params) {
  const def = directiveDef(type);
  /** @type {Record<string, any>} */
  const out = {};
  for (const p of def.params) {
    const v = params[p.id] ?? p.default ?? null;
    if (v == null) {
      if (!p.optional) throw new Error(`Directive ${type} needs parameter ${p.id}`);
      out[p.id] = null;
      continue;
    }
    if (p.type === 'enum' && !p.options?.includes(v)) throw new Error(`Bad value ${v} for ${type}.${p.id}`);
    if (p.type === 'number' && (typeof v !== 'number' || v < /** @type {number} */ (p.min) || v > /** @type {number} */ (p.max))) {
      throw new Error(`Bad value ${v} for ${type}.${p.id}`);
    }
    out[p.id] = v;
  }
  return out;
}
