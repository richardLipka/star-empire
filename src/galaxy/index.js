// @ts-check
import rawCatalog from '../data/stars.json';
import { indexCatalog } from './catalog.js';

export { galaxyModule } from './module.js';
export { systemTraits } from './traits.js';
export { measure } from './measure.js';
export { isCatalogueDesignation } from './catalog.js';

/** The bundled catalogue, indexed. */
export const catalog = indexCatalog(/** @type {import('./catalog.js').RawCatalog} */ (/** @type {unknown} */ (rawCatalog)));
