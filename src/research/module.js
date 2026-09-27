// @ts-check
import { defineModule } from '../sim/module.js';
import { random } from '../core/rng.js';
import { empireState } from '../empire/module.js';
import { fleetState } from '../fleet/module.js';
import { send, recordDispatch, extendSystemSnapshot, knowledgeOf } from '../info/module.js';
import { TECHS, START_TECHS, RULES, tech } from './catalog.js';
import { capabilities } from './effects.js';
import { bump, NETWORK } from '../core/versions.js';

/**
 * Research (see docs/RESEARCH.md).
 *
 * Every held system researches in the area its governor was told to focus on
 * (directive research.focus). When its progress pays for a breakthrough, up to
 * three candidates are drawn from what it could research: one is revealed,
 * the other applications are closed off for this empire's own research
 * (theories stay open, see RULES.blockTheories). Closed-off technologies can
 * still be bought, reverse-engineered or stolen (acquireTech).
 *
 * Knowledge is local: a technology works at a system only once it is known
 * there. Blueprints travel at light speed to the capital, which passes them on
 * to every system it knows of, and they ride along on ships.
 *
 * @typedef {'research' | 'purchase' | 'reverse' | 'espionage'} How
 * @typedef {{ empire: string, known: Record<string, number>, blocked: Record<string, number>, progress: Record<string, number> }} Lab
 */

export const researchModule = defineModule({
  id: 'research',
  dependsOn: ['galaxy', 'empire', 'fleet', 'info', 'governors'],
  initState: () => ({
    /** @type {Record<string, Lab>} system → its research record */
    labs: {},
    /** @type {Record<string, Record<string, boolean>>} empire → condition → met */
    conditions: {},
    /** @type {Record<string, number>} system → when the capital last sent it missing blueprints */
    supplied: {},
  }),

  tick(world, dt, ctx) {
    const es = empireState(world);
    for (const [system, p] of Object.entries(es.presence)) {
      if (labs(world)[system]?.empire !== p.empire) openLab(world, ctx, system, p.empire); // e.g. after loading an old save
    }
    for (const [system, lab] of Object.entries(labs(world))) {
      const p = es.presence[system];
      if (!p || p.empire !== lab.empire) {
        delete labs(world)[system];
        continue;
      }
      const area = focusOf(world, system);
      if (area === 'none') continue;
      const emp = es.empires[lab.empire];
      const rate = (system === emp.capital ? RULES.capitalRate : RULES.outpostRate) * (p.capabilities?.researchRate ?? 1);
      const cost = breakthroughCost(lab, area);
      lab.progress[area] = Math.min(cost, (lab.progress[area] ?? 0) + rate * dt);
      if (lab.progress[area] < cost) continue;
      const candidates = frontier(world, lab, area);
      if (!candidates.length) continue; // stalled: needs prerequisites from other areas
      lab.progress[area] = 0;
      breakthrough(world, ctx, system, lab, candidates);
    }
  },

  listeners: {
    'empire/presenceChanged'(world, { system, empire }, ctx) {
      if (labs(world)[system]?.empire !== empire) openLab(world, ctx, system, empire);
    },
    'fleet/launched'(world, { fleet: id, system }) {
      const f = fleetState(world).fleets[id];
      const lab = labs(world)[system];
      if (!f || !lab || lab.empire !== f.empire) return;
      f.blueprints = Object.keys(lab.known);
      f.plumeVisibility = empireState(world).presence[system]?.capabilities?.plumeVisibility ?? 1;
    },
    'fleet/arrived'(world, { fleet: id, system }, ctx) {
      const f = fleetState(world).fleets[id];
      const lab = labs(world)[system];
      if (!f?.blueprints || !lab || lab.empire !== f.empire) return;
      learn(world, ctx, system, f.blueprints, []);
    },
    'info/delivered'(world, { message }, ctx) {
      if (message.kind === 'report') catchUp(world, ctx, message);
      if (message.kind !== 'blueprint') return;
      const lab = labs(world)[message.target];
      if (!lab || lab.empire !== message.empire) return; // not ours any more
      const { techs, blocked, origin, how, discoveredAt, pass } = message.payload;
      const fresh = learn(world, ctx, message.target, techs, blocked);
      const capital = empireState(world).empires[message.empire].capital;
      if (message.target !== capital || !pass) return;
      if (fresh.length) announce(world, ctx, message.empire, origin, techs, blocked, how, discoveredAt);
      distribute(world, ctx, message.empire, techs, blocked, how, origin, discoveredAt);
    },
  },
});

/** @param {import('../sim/world.js').World} world @returns {Record<string, Lab>} */
export const labs = (world) => world.state.research.labs;

/**
 * A new outpost knows the start technologies and whatever its founders carried.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string} empire
 */
function openLab(world, ctx, system, empire) {
  const carried = Object.values(fleetState(world).fleets)
    .filter((f) => f.empire === empire && f.status === 'docked' && f.at === system)
    .flatMap((f) => f.blueprints ?? []);
  /** @type {Lab} */
  const lab = { empire, known: {}, blocked: {}, progress: {} };
  for (const id of [...START_TECHS, ...carried]) lab.known[id] ??= ctx.now;
  labs(world)[system] = lab;
  applyCapabilities(world, ctx, system);
}

/** The area a system researches, from its governor's standing orders. @param {import('../sim/world.js').World} world @param {string} system */
export const focusOf = (world, system) => world.state.governors?.books[system]?.settings.researchFocus ?? 'none';

/** @param {import('../sim/world.js').World} world @param {string} empire @param {string} condition */
export const conditionMet = (world, empire, condition) => world.state.research.conditions[empire]?.[condition] === true;

/**
 * Research points for the next breakthrough in an area at this lab: it grows
 * with every technology of that area already known there.
 * @param {Lab} lab @param {string} area
 */
export function breakthroughCost(lab, area) {
  const known = Object.keys(lab.known).filter((id) => tech(id).area === area && !tech(id).start).length;
  return RULES.baseCost * RULES.costGrowth ** known;
}

/**
 * What a lab could research next in an area: not known, not closed off,
 * prerequisites known here, conditions met.
 * @param {import('../sim/world.js').World} world @param {Lab} lab @param {string} area
 */
export function frontier(world, lab, area) {
  return TECHS.filter((t) => t.area === area && !(t.id in lab.known) && !(t.id in lab.blocked)
    && t.requires.every((r) => r in lab.known)
    && (t.conditions ?? []).every((c) => conditionMet(world, lab.empire, c)));
}

/**
 * Draw up to three candidates (lower tiers likelier); reveal one, close off the rest.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {Lab} lab @param {import('./catalog.js').Tech[]} pool
 */
function breakthrough(world, ctx, system, lab, pool) {
  const drawn = [];
  const left = [...pool];
  while (drawn.length < RULES.candidates && left.length) {
    const weights = left.map((t) => 1 / t.tier);
    let r = random(ctx.rng) * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (r > weights[i] && i < left.length - 1) r -= weights[i++];
    drawn.push(left.splice(i, 1)[0]);
  }
  const revealed = drawn[Math.floor(random(ctx.rng) * drawn.length)];
  // Theories are understanding, not hardware: unless the rules say otherwise they stay open.
  const closed = drawn.filter((t) => t !== revealed && (RULES.blockTheories || t.kind === 'application')).map((t) => t.id);
  learn(world, ctx, system, [revealed.id], closed);
  ctx.notify('research/breakthrough', { system, empire: lab.empire, tech: revealed.id, blocked: closed });
  spread(world, ctx, lab.empire, system, [revealed.id], closed, 'research');
}

/**
 * Get a technology outside the normal draw: bought, reverse-engineered from a
 * captured ship, or stolen. Works even if it was closed off; it then spreads
 * like a breakthrough.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, system: string, tech: string, how: Exclude<How, 'research'> }} p
 */
export function acquireTech(world, ctx, { empire, system, tech: id, how }) {
  tech(id);
  const lab = labs(world)[system];
  if (!lab || lab.empire !== empire) throw new Error(`No lab of ${empire} at ${system}`);
  delete lab.blocked[id];
  learn(world, ctx, system, [id], []);
  spread(world, ctx, empire, system, [id], [], how);
}

/**
 * Sandbox / future events: a condition becomes true for an empire (e.g. a relic found).
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} condition
 */
export function grantCondition(world, empire, condition) {
  (world.state.research.conditions[empire] ??= {})[condition] = true;
}

/**
 * Learn technologies at a system (and note closed-off ones). Returns the newly learnt.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string[]} techs @param {string[]} blocked
 */
function learn(world, ctx, system, techs, blocked) {
  const lab = labs(world)[system];
  const fresh = techs.filter((id) => !(id in lab.known));
  for (const id of fresh) {
    lab.known[id] = ctx.now;
    delete lab.blocked[id];
  }
  for (const id of blocked) if (!(id in lab.known)) lab.blocked[id] ??= ctx.now;
  if (fresh.length) applyCapabilities(world, ctx, system);
  return fresh;
}

/** @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {string} system */
function applyCapabilities(world, ctx, system) {
  const p = empireState(world).presence[system];
  const lab = labs(world)[system];
  if (!p || !lab) return;
  const before = p.capabilities?.relayBonus;
  p.capabilities = capabilities(Object.keys(lab.known));
  if (before !== p.capabilities.relayBonus) {
    bump(world, NETWORK);
    ctx.notify('info/networkChanged', { empire: p.empire });
  }
}

/**
 * A report reaching the capital shows what that system knows. If it lacks
 * technologies the capital knows (a new outpost, or one that missed a
 * broadcast), the capital sends them, unless an earlier batch may still be
 * on its way (one light round trip).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../info/module.js').Message} message
 */
function catchUp(world, ctx, message) {
  const capital = empireState(world).empires[message.empire].capital;
  const { system, data } = message.payload ?? {};
  if (message.target !== capital || !system || system === capital || data?.owner !== message.empire || !data.research) return;
  const lab = labs(world)[capital];
  if (!lab) return;
  const has = new Set(data.research.known);
  const missing = Object.keys(lab.known).filter((id) => !has.has(id));
  if (!missing.length) return;
  const st = world.state.research.supplied;
  const roundTrip = 2 * (ctx.now - message.validAt) + 1;
  if (st[system] !== undefined && ctx.now - st[system] < roundTrip) return;
  st[system] = ctx.now;
  send(world, ctx, { empire: message.empire, kind: 'blueprint', origin: capital, target: system, payload: { techs: missing, blocked: Object.keys(lab.blocked), origin: capital, how: 'research', discoveredAt: ctx.now, pass: false } });
}

/**
 * A new technology at `origin` spreads: to the capital (which announces and
 * passes it on), or from the capital to everyone.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {string} origin @param {string[]} techs @param {string[]} blocked @param {How} how
 */
function spread(world, ctx, empire, origin, techs, blocked, how) {
  const capital = empireState(world).empires[empire].capital;
  if (origin === capital) {
    announce(world, ctx, empire, origin, techs, blocked, how, ctx.now);
    distribute(world, ctx, empire, techs, blocked, how, origin, ctx.now);
  } else {
    send(world, ctx, { empire, kind: 'blueprint', origin, target: capital, payload: { techs, blocked, origin, how, discoveredAt: ctx.now, pass: true } });
  }
}

/**
 * The capital sends blueprints to every system it knows it holds.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {string[]} techs @param {string[]} blocked @param {How} how @param {string} origin @param {number} discoveredAt
 */
function distribute(world, ctx, empire, techs, blocked, how, origin, discoveredAt) {
  const capital = empireState(world).empires[empire].capital;
  const own = Object.entries(knowledgeOf(world, empire).systems).filter(([id, e]) => e.data.owner === empire && id !== capital && id !== origin).map(([id]) => id);
  for (const target of own) {
    send(world, ctx, { empire, kind: 'blueprint', origin: capital, target, payload: { techs, blocked, origin, how, discoveredAt, pass: false } });
  }
}

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {string} origin @param {string[]} techs @param {string[]} blocked @param {How} how @param {number} validAt
 */
function announce(world, ctx, empire, origin, techs, blocked, how, validAt) {
  recordDispatch(world, ctx, empire, {
    id: `tech:${techs.join('+')}@${origin}`,
    key: how === 'research' ? 'research.breakthrough' : 'research.acquired',
    params: { tech: techs[0], system: origin, blocked: blocked.length, how },
    validAt, receivedAt: ctx.now, via: origin === empireState(world).empires[empire].capital ? 'capital' : 'relay', hops: 0,
  });
}

// Routine reports tell the capital what each system knows and works on.
extendSystemSnapshot((world, system) => {
  const lab = world.state.research?.labs[system];
  if (!lab) return {};
  const area = focusOf(world, system);
  return {
    research: {
      known: Object.keys(lab.known),
      blocked: Object.keys(lab.blocked),
      focus: area,
      progress: area === 'none' ? 0 : lab.progress[area] ?? 0,
      cost: area === 'none' ? 0 : breakthroughCost(lab, area),
    },
  };
});
