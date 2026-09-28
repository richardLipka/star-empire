// @ts-check
import { defineModule } from '../sim/module.js';
import { random, hashUnit } from '../core/rng.js';
import aiData from '../data/ai.json';
import { empireState } from '../empire/module.js';
import { knowledgeOf } from '../info/module.js';
import { issueDirective } from '../governors/issue.js';
import { labs, frontier } from '../research/module.js';
import { AREAS } from '../research/catalog.js';
import { knownPreparations } from '../colony/preparation.js';
import { grievancesOf } from '../combat/module.js';
import { guardOf } from '../governors/behaviours/warships.js';
import { mergeFleets } from '../ships/module.js';
import { fleetState } from '../fleet/module.js';
import { orderFleet } from '../info/orders.js';
import { distance } from '../core/vec3.js';

/**
 * Rival and independent AI (see docs/POLITICS.md).
 *
 * An AI plays by the player's rules: it sees only what its capital knows
 * (its knowledge base, its own lab and capabilities) and acts only by issuing
 * directives, which travel at light speed and may be ignored by restless
 * colonies. It thinks every few years:
 * - research: keeps a focus with open candidates, weighted by personality;
 * - expansion: scouts, colony ships (to prepared sites when its robots have
 *   prepared some), robotic preparation while only embryo ships are known,
 *   and later settling from every colony;
 * - economy: hungry colonies farm, fed ones return to balance;
 * - loyalty: cultural missions, and broad autonomy for colonies that slip away;
 * - war: a home guard at the capital; an empire that has destroyed a world
 *   is hated: war footing, fortified systems, and now and then its guard
 *   sails to attack the nearest known system of the wrongdoer. The AI never
 *   strikes a world itself.
 *
 * @typedef {'expansionist' | 'scholar' | 'cautious'} Personality
 * @typedef {object} Controller
 * @property {Personality} personality
 * @property {number} nextAt
 * @property {Record<string, string>} issued   what it has ordered (key → setting), so it does not repeat itself
 * @property {number} [lastAttack]  when it last sent its guard to attack
 */

export const AI = aiData;

export const aiModule = defineModule({
  id: 'ai',
  dependsOn: ['empire', 'info', 'governors', 'research', 'loyalty'],
  initState: () => ({ /** @type {Record<string, Controller>} */ controllers: {} }),

  tick(world, _dt, ctx) {
    for (const [empire, c] of Object.entries(controllers(world))) {
      if (ctx.now < c.nextAt) continue;
      c.nextAt += AI.thinkEvery;
      if (empireState(world).empires[empire]?.dissolvedAt != null) continue;
      think(world, ctx, empire, c);
    }
  },

  listeners: {
    'loyalty/seceded'(world, { empire }, ctx) {
      addController(world, ctx, empire, 'cautious');
    },
  },
});

/** @param {import('../sim/world.js').World} world @returns {Record<string, Controller>} */
export const controllers = (world) => world.state.ai?.controllers ?? {};

/**
 * Hand an empire to the AI.
 * @param {import('../sim/world.js').World} world @param {{ now: number }} ctx @param {string} empire @param {Personality} personality
 */
export function addController(world, ctx, empire, personality) {
  world.state.ai.controllers[empire] = { personality, nextAt: ctx.now + hashUnit(world.seed, `ai:${empire}`) * 2, issued: {} };
}

/**
 * One round of decisions.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {Controller} c
 */
export function think(world, ctx, empire, c) {
  const emp = empireState(world).empires[empire];
  const capital = emp.capital;
  const caps = empireState(world).presence[capital]?.capabilities;
  if (!caps) return;
  const p = AI.personalities[c.personality];
  const k = knowledgeOf(world, empire);
  const own = Object.entries(k.systems).filter(([id, e]) => e.data.owner === empire && id !== capital);
  /** Issue once per key and setting. @param {string} key @param {string} setting @param {Parameters<typeof issueDirective>[2]} orderSpec */
  const order = (key, setting, orderSpec) => {
    if (c.issued[key] === setting) return;
    try {
      issueDirective(world, ctx, orderSpec);
      c.issued[key] = setting;
    } catch {
      // no reachable target known: try again next time
    }
  };
  const here = { kind: /** @type {const} */ ('system'), system: capital };

  // Research: a focus with something left to find.
  const lab = labs(world)[capital];
  if (lab) {
    const current = world.state.governors.books[capital]?.settings.researchFocus ?? 'none';
    const open = AREAS.map((a) => a.id).filter((a) => frontier(world, lab, a).length);
    if (open.length && (!open.includes(current) || random(ctx.rng) < 0.15)) {
      const weights = open.map((a) => /** @type {Record<string, number>} */ (p.research)[a] ?? 1);
      let r = random(ctx.rng) * weights.reduce((a, b) => a + b, 0);
      const field = open.find((_, i) => (r -= weights[i]) < 0) ?? open[0];
      if (field !== current) order('research', field, { empire, type: 'research.focus', target: { kind: 'empire' }, params: { field } });
    }
  }

  // Expansion.
  order('explore', String(p.exploreRange), { empire, type: 'expansion.explore', target: here, params: { maxRange: p.exploreRange, jumps: 3 } });
  const embryoOnly = !caps.unlocks.includes('colony.mode.cryo') && !caps.unlocks.includes('colony.mode.ark');
  if (embryoOnly && caps.unlocks.includes('colony.prepare')) {
    order('prepare', 'on', { empire, type: 'expansion.prepare', target: here, params: { criteria: 'habitable', maxRange: p.settleRange } });
  }
  const prepared = Object.values(knownPreparations(world, empire)).some((x) => x.status === 'ready' || x.status === 'working');
  const criteria = prepared && embryoOnly ? 'prepared' : 'habitable';
  order('settle', criteria, { empire, type: 'expansion.settle', target: here, params: { criteria, maxRange: p.settleRange, frequency: p.settleFrequency } });
  if (ctx.now - (emp.founded ?? 0) >= p.settleEmpireAfter && own.length >= 3) {
    order('settleEmpire', 'on', { empire, type: 'expansion.settle', target: { kind: 'empire' }, params: { criteria: 'habitable', maxRange: 12, frequency: 'low' }, priority: 'low' });
  }

  // Economy: feed the hungry.
  for (const [id, e] of own) {
    const food = e.data.colony?.food;
    if (food == null) continue;
    if (food < AI.hungry) order(`focus:${id}`, 'agriculture', { empire, type: 'economy.focus', target: { kind: 'system', system: id }, params: { focus: 'agriculture' } });
    else if (food >= AI.fed && c.issued[`focus:${id}`] === 'agriculture') order(`focus:${id}`, 'balanced', { empire, type: 'economy.focus', target: { kind: 'system', system: id }, params: { focus: 'balanced' } });
  }

  // Loyalty: missions, and a looser hand where a colony slips away.
  if (p.missions && caps.unlocks.includes('loyalty.missions')) {
    order('missions', 'on', { empire, type: 'governance.missions', target: here, params: { threshold: 'wavering' } });
  }
  for (const [id, e] of own) {
    const stage = e.data.loyalty?.stage;
    if (stage === 'autonomous') order(`autonomy:${id}`, 'broad', { empire, type: 'governance.autonomy', target: { kind: 'system', system: id }, params: { level: 'broad' }, priority: 'high' });
    else if (stage === 'loyal' && c.issued[`autonomy:${id}`] === 'broad') order(`autonomy:${id}`, 'normal', { empire, type: 'governance.autonomy', target: { kind: 'system', system: id }, params: { level: 'normal' }, priority: 'high' });
  }

  // War.
  const hated = Object.entries(grievancesOf(world, empire)).filter(([, n]) => n > 0).map(([e]) => e);
  order('warships', hated.length ? 'war' : 'defensive', { empire, type: 'military.warships', target: here, params: { level: hated.length ? 'war' : 'defensive' } });
  // Warships idling at the capital (home from a raid) rejoin the home guard.
  const guardHere = guardOf(world, capital, empire);
  for (const f of Object.values(fleetState(world).fleets)) {
    if (f.empire !== empire || f.status !== 'docked' || f.at !== capital || !f.ships?.length || f.mission || f === guardHere) continue;
    if (guardHere) mergeFleets(world, ctx, { from: f.id, into: guardHere.id });
    else f.mission = { kind: 'guard', home: capital };
  }
  if (hated.length) {
    order('readiness', 'fortify', { empire, type: 'military.readiness', target: { kind: 'empire' }, params: { posture: 'fortify' } });
    const guard = guardOf(world, capital, empire);
    // One raid at a time: at a tenth of light a raid takes centuries there and back.
    const raiding = Object.values(fleetState(world).fleets).some((f) => f.empire === empire && f.voyage?.waypoints.some((w) => w.action === 'attack') && f.status === 'transit');
    if (guard && !raiding && (guard.ships?.length ?? 0) >= AI.attackWith && ctx.now - (c.lastAttack ?? -Infinity) >= AI.attackEvery) {
      const home = ctx.data.catalog.get(capital).pos;
      const targets = Object.entries(k.systems)
        .filter(([, e]) => hated.includes(e.data.owner))
        .map(([id]) => ({ id, d: distance(ctx.data.catalog.get(id).pos, home) }))
        .filter((x) => x.d <= AI.attackRange)
        .sort((a, b) => a.d - b.d);
      if (targets.length && orderFleet(world, ctx, { empire, fleet: guard.id, payload: { type: 'voyage', waypoints: [{ system: targets[0].id, action: 'attack' }, { system: capital, action: 'visit' }], approach: 'normal' } })) {
        c.lastAttack = ctx.now;
        guard.mission = null; // it leaves its post; a new guard will be built
      }
    }
  }
}
