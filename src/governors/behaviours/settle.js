// @ts-check
import { createFleet, launchFleet, disbandFleet } from '../../fleet/module.js';
import { START_DRIVE } from '../../fleet/drives.js';
import { empireState, establishPresence } from '../../empire/module.js';
import { systemTraits } from '../../galaxy/traits.js';
import { reportFleetEvent } from '../../info/module.js';
import { candidates, isExplored } from '../targets.js';

/**
 * expansion.settle: send settler ships to found outposts. "Nearest" takes any
 * free system; "most habitable" and "richest" need a survey first (explored).
 * A settler learns on arrival whether someone else got there first.
 * @type {import('./types.js').Behaviour}
 */
export default {
  usesShipyard: true,
  mission: 'settle',
  plan(world, ctx, book, d) {
    const target = pick(world, ctx, book, d.params);
    if (!target) return null;
    return () => {
      const f = createFleet(world, ctx, {
        empire: book.empire, at: book.system, drive: START_DRIVE, transmitter: true, role: 'settler',
        mission: { kind: 'settle', target, buildRelay: d.params.buildRelay, directive: d.id },
      });
      launchFleet(world, ctx, { fleet: f.id, to: target });
    };
  },
  onArrive(world, ctx, fleet, system) {
    const m = fleet.mission;
    if (m.target !== system || m.done) return;
    const held = empireState(world).presence[system];
    if (held) {
      // Someone got there first; the settler reports it (it carries a transmitter) and waits.
      fleet.mission = { ...m, done: true, failed: true };
      reportFleetEvent(world, ctx, fleet, system, 'settleFailed');
      return;
    }
    reportFleetEvent(world, ctx, fleet, system, 'settled');
    establishPresence(world, ctx, { empire: fleet.empire, system, relay: m.buildRelay });
    disbandFleet(world, ctx, fleet.id);
  },
};

/**
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx
 * @param {import('../module.js').Book} book @param {Record<string, any>} p
 */
function pick(world, ctx, book, p) {
  const presence = empireState(world).presence;
  const list = candidates(world, ctx, { from: book.system, empire: book.empire, maxRange: p.maxRange, toward: p.toward, mission: 'settle' })
    .filter((c) => presence[c.id]?.empire !== book.empire); // foreign holdings are not known here: settlers find out
  if (p.criteria === 'nearest') return list[0]?.id ?? null;
  const surveyed = list.filter((c) => isExplored(world, book.empire, c.id));
  const key = p.criteria === 'habitable' ? 'habitability' : 'richness';
  const score = (/** @type {string} */ id) => systemTraits(world.seed, ctx.data.catalog.get(id))[key];
  surveyed.sort((a, b) => score(b.id) - score(a.id) || a.distance - b.distance);
  return surveyed[0]?.id ?? null;
}

