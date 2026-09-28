// @ts-check
import { createFleet, launchFleet, disbandFleet } from '../../fleet/module.js';
import { driveFor } from '../../fleet/drives.js';
import { empireState } from '../../empire/module.js';
import { systemTraits } from '../../galaxy/traits.js';
import { reportFleetEvent } from '../../info/module.js';
import { shipCost, startPreparation } from '../../colony/module.js';
import { preparations, knownPreparations, seederKit } from '../../colony/preparation.js';
import { candidates, isExplored } from '../targets.js';

/**
 * expansion.prepare: send robotic seeders ahead of the colonists. They build
 * habitats, nurseries and fields at a surveyed, empty system; colonists who
 * land on a prepared site (settle › prepared sites) grow faster and suffer
 * less. The robots can fail, often without a word.
 * Needs the technology that unlocks colony.prepare at this system.
 * @type {import('./types.js').Behaviour}
 */
export default {
  usesShipyard: true,
  mission: 'prepare',
  plan(world, ctx, book, d) {
    const caps = empireState(world).presence[book.system]?.capabilities;
    if (!caps?.unlocks.includes('colony.prepare')) return null;
    const target = pick(world, ctx, book, d.params);
    if (!target) return null;
    return { cost: shipCost(world, book.system, 'seeder'), run: () => {
      const f = createFleet(world, ctx, {
        empire: book.empire, at: book.system, drive: driveFor(empireState(world).presence[book.system]), transmitter: true, role: 'seeder',
        mission: { kind: 'prepare', target, directive: d.id, kit: seederKit(caps) },
      });
      launchFleet(world, ctx, { fleet: f.id, to: target });
    } };
  },
  onArrive(world, ctx, fleet, system) {
    const m = fleet.mission;
    if (m.target !== system || m.done) return;
    fleet.mission = { ...m, done: true };
    if (empireState(world).presence[system] || preparations(world)[system]) {
      reportFleetEvent(world, ctx, fleet, system, 'prepTaken');
      disbandFleet(world, ctx, fleet.id);
      return;
    }
    startPreparation(world, ctx, fleet, system);
  },
};

/**
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx
 * @param {import('../module.js').Book} book @param {Record<string, any>} p
 */
function pick(world, ctx, book, p) {
  const presence = empireState(world).presence;
  const known = knownPreparations(world, book.empire);
  const list = candidates(world, ctx, { from: book.system, empire: book.empire, maxRange: p.maxRange, toward: p.toward, mission: 'prepare' })
    .filter((c) => presence[c.id]?.empire !== book.empire && isExplored(world, book.empire, c.id) && !['working', 'ready'].includes(known[c.id]?.status ?? ''));
  if (p.criteria === 'nearest') return list[0]?.id ?? null;
  const key = p.criteria === 'habitable' ? 'habitability' : 'richness';
  const score = (/** @type {string} */ id) => systemTraits(world.seed, ctx.data.catalog.get(id))[key];
  list.sort((a, b) => score(b.id) - score(a.id) || a.distance - b.distance);
  return list[0]?.id ?? null;
}
