// @ts-check
import { galaxyModule, catalog } from '../galaxy/index.js';

/**
 * The ordered list of simulation modules in this build of the game.
 * New gameplay modules are registered here, after their dependencies.
 * @type {import('../sim/module.js').SimModule[]}
 */
export const MODULES = [galaxyModule];

/** Static content handed to every module as `ctx.data`. */
export const DATA = { catalog };
