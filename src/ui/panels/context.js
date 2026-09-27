// @ts-check
/**
 * What every side-panel section gets.
 * @typedef {object} PanelContext
 * @property {import('../../galaxy/catalog.js').Catalog} catalog
 * @property {ReturnType<typeof import('../../app/gameHost.js').createGameHost>} game
 * @property {() => import('../../perspective/picture.js').Picture} getPicture
 * @property {() => Map<string, import('../../perspective/starStatus.js').StarStatus>} getStatuses
 * @property {string} empire                        the player's empire
 * @property {(msg: string) => void} toast
 * @property {(fn: (world: any, ctx: any) => any, done?: string) => any} act   run a world action, report errors, re-render
 */

/** @param {import('../../galaxy/catalog.js').Catalog} catalog */
export const nameOf = (catalog) => (/** @type {string} */ id) => catalog.get(id).name;
