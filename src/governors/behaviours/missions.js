// @ts-check
import { createFleet, launchFleet, disbandFleet } from '../../fleet/module.js';
import { driveFor } from '../../fleet/drives.js';
import { distance } from '../../core/vec3.js';
import { empireState } from '../../empire/module.js';
import { knowledgeOf, reportFleetEvent } from '../../info/module.js';
import { shipCost } from '../../colony/module.js';
import { receiveMission } from '../../loyalty/module.js';
import loyaltyRules from '../../data/loyalty.json';

/** Loyalty below which a colony gets a mission, by the directive's threshold. */
const THRESHOLD = { restless: loyaltyRules.stages.loyal, wavering: 0.75, all: 1.01 };

/**
 * governance.missions: send cultural missions (songs, archives, envoys) to
 * the empire's least loyal colonies, as the capital knows them from reports.
 * Each colony gets one at most every `missionEvery` years. Needs the
 * technology that unlocks loyalty.missions here.
 * @type {import('./types.js').Behaviour}
 */
export default {
  usesShipyard: true,
  mission: 'culture',
  plan(world, ctx, book, d) {
    const caps = empireState(world).presence[book.system]?.capabilities;
    if (!caps?.unlocks.includes('loyalty.missions')) return null;
    const target = pick(world, ctx, book, d.params);
    if (!target) return null;
    return { cost: shipCost(world, book.system, 'envoy'), run: () => {
      (book.memory.missionDue ??= {})[target] = ctx.now + loyaltyRules.missionEvery;
      const f = createFleet(world, ctx, {
        empire: book.empire, at: book.system, drive: driveFor(empireState(world).presence[book.system]), transmitter: true, role: 'envoy',
        mission: { kind: 'culture', target, directive: d.id },
      });
      launchFleet(world, ctx, { fleet: f.id, to: target });
    } };
  },
  onArrive(world, ctx, fleet, system) {
    if (fleet.mission.target !== system) return;
    if (receiveMission(world, ctx, system, fleet.empire)) reportFleetEvent(world, ctx, fleet, system, 'missionArrived');
    disbandFleet(world, ctx, fleet.id);
  },
};

/**
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx
 * @param {import('../module.js').Book} book @param {Record<string, any>} p
 */
function pick(world, ctx, book, p) {
  const k = knowledgeOf(world, book.empire);
  const here = ctx.data.catalog.get(book.system).pos;
  const limit = THRESHOLD[/** @type {keyof typeof THRESHOLD} */ (p.threshold)] ?? THRESHOLD.wavering;
  const due = book.memory.missionDue ?? {};
  const sent = new Set(Object.values(world.state.fleet.fleets).filter((f) => f.empire === book.empire && f.mission?.kind === 'culture').map((f) => f.mission.target));
  let best = null;
  for (const [id, e] of Object.entries(k.systems)) {
    const loyalty = e.data.loyalty;
    if (e.data.owner !== book.empire || !loyalty || id === book.system || sent.has(id) || (due[id] ?? -Infinity) > ctx.now) continue;
    if (loyalty.value >= limit || distance(ctx.data.catalog.get(id).pos, here) > p.maxRange) continue;
    if (!best || loyalty.value < best.value) best = { id, value: loyalty.value };
  }
  return best?.id ?? null;
}
