// @ts-check
import { galaxyModule, catalog } from '../galaxy/index.js';
import { empireModule } from '../empire/module.js';
import { wormholeModule } from '../events/wormholes.js';
import { fleetModule } from '../fleet/module.js';
import { infoModule } from '../info/module.js';
import { detectionModule } from '../detection/module.js';
import { colonyModule } from '../colony/module.js';
import { governorsModule } from '../governors/module.js';
import { researchModule } from '../research/module.js';
import { securityModule } from '../security/module.js';
import { loyaltyModule } from '../loyalty/module.js';
import { aiModule } from '../ai/module.js';

/**
 * The ordered list of simulation modules in this build of the game.
 * New gameplay modules are registered here, after their dependencies.
 * @type {import('../sim/module.js').SimModule[]}
 */
export const MODULES = [galaxyModule, empireModule, wormholeModule, fleetModule, infoModule, detectionModule, colonyModule, governorsModule, loyaltyModule, researchModule, securityModule, aiModule];

/** Static content handed to every module as `ctx.data`. */
export const DATA = { catalog };
