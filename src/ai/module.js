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
 * - loyalty: cultural missions, and broad autonomy for colonies that slip away.
 *
 * @typedef {'expansionist' | 'scholar' | 'cautious'} Personality
 * @typedef {object} Controller
 * @property {Personality} personality
 * @property {number} nextAt
 * @property {Record<string, string>} issued   what it has ordered (key → setting), so it does not repeat itself
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
}
