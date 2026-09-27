// @ts-check
/**
 * Static star catalogue (see src/data/README.md). Not part of the saved
 * world: saves refer to systems by id.
 *
 * @typedef {{ name: string, spect: string, cls: string, absmag: number, lum: number }} CatalogStar
 * @typedef {{ id: string, name: string, pos: import('../core/vec3.js').Vec3, dist: number, stars: CatalogStar[] }} StarSystem
 * @typedef {{ meta: Record<string, any>, systems: StarSystem[] }} RawCatalog
 */

/**
 * @param {RawCatalog} raw
 */
export function indexCatalog(raw) {
  /** @type {Map<string, StarSystem>} */
  const byId = new Map(raw.systems.map((s) => [s.id, s]));
  const sol = byId.get('sol');
  if (!sol) throw new Error('Catalogue has no Sol');
  return {
    meta: raw.meta,
    systems: raw.systems,
    byId,
    sol,
    /** @param {string} id */
    get(id) {
      const s = byId.get(id);
      if (!s) throw new Error(`Unknown system ${id}`);
      return s;
    },
  };
}

/** @typedef {ReturnType<typeof indexCatalog>} Catalog */

/** True for names that are bare catalogue designations (Gl 65, HIP 1234...). */
export const isCatalogueDesignation = (/** @type {string} */ name) => /^(Gl|GJ|HIP|HD|HYG|HR|LHS|G) \d/.test(name);
