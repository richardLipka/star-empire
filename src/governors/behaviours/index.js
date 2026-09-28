// @ts-check
import explore from './explore.js';
import settle from './settle.js';
import courier from './courier.js';
import fleetSend from './fleetSend.js';
import prepare from './prepare.js';
import missions from './missions.js';

/**
 * Behaviour per directive type. Types without an entry are "standing
 * settings" (see settings.js) or not implemented yet: they are accepted,
 * acknowledged and shown, but do nothing.
 * @type {Record<string, import('./types.js').Behaviour>}
 */
export const BEHAVIOURS = {
  'expansion.explore': explore,
  'expansion.settle': settle,
  'logistics.courier': courier,
  'fleet.send': fleetSend,
  'expansion.prepare': prepare,
  'governance.missions': missions,
};

/** mission kind → behaviour that handles arrivals. */
export const MISSIONS = Object.fromEntries(Object.values(BEHAVIOURS).filter((b) => b.mission).map((b) => [b.mission, b]));
