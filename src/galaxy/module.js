// @ts-check
import { defineModule } from '../sim/module.js';

/**
 * Interstellar space. In M2 it only records which catalogue the game uses;
 * ships and messages moving between systems arrive in later milestones.
 */
export const galaxyModule = defineModule({
  id: 'galaxy',
  initState(_world, ctx) {
    const catalog = /** @type {import('./catalog.js').Catalog} */ (ctx.data.catalog);
    if (!catalog) throw new Error('galaxy module needs data.catalog');
    return {
      catalog: { source: catalog.meta.source, radiusLy: catalog.meta.radiusLy, systemCount: catalog.systems.length },
    };
  },
});
