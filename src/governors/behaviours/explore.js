// @ts-check
import { createFleet, launchFleet } from '../../fleet/module.js';
import { driveFor } from '../../fleet/drives.js';
import { empireState } from '../../empire/module.js';
import { candidates, isExplored } from '../targets.js';

/**
 * expansion.explore: launch scouts to the nearest unexplored systems (within
 * range, optionally toward a system). A scout carries a relay module, so it
 * can report from where it arrives, then hops on to the next unexplored
 * system until its jumps run out.
 * @type {import('./types.js').Behaviour}
 */
export default {
  usesShipyard: true,
  mission: 'explore',
  plan(world, ctx, book, d) {
    const next = pick(world, ctx, book.system, book.empire, /** @type {any} */ (d.params));
    if (!next) return null;
    return () => {
      const f = createFleet(world, ctx, {
        empire: book.empire, at: book.system, drive: driveFor(empireState(world).presence[book.system]), transmitter: true, role: 'scout',
        mission: { kind: 'explore', target: next, jumpsLeft: d.params.jumps - 1, maxRange: d.params.maxRange, toward: d.params.toward, directive: d.id },
      });
      launchFleet(world, ctx, { fleet: f.id, to: next });
    };
  },
  onArrive(world, ctx, fleet, system) {
    const m = fleet.mission;
    if (m.jumpsLeft <= 0) {
      fleet.mission = { ...m, target: null, done: true };
      return;
    }
    const next = pick(world, ctx, system, fleet.empire, m);
    if (!next) {
      fleet.mission = { ...m, target: null, done: true };
      return;
    }
    fleet.mission = { ...m, target: next, jumpsLeft: m.jumpsLeft - 1 };
    launchFleet(world, ctx, { fleet: fleet.id, to: next });
  },
};

/**
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx
 * @param {string} from @param {string} empire @param {{ maxRange: number, toward: string | null }} p
 */
function pick(world, ctx, from, empire, p) {
  const list = candidates(world, ctx, { from, empire, maxRange: p.maxRange, toward: p.toward, mission: 'explore' });
  return list.find((c) => !isExplored(world, empire, c.id))?.id ?? null;
}
