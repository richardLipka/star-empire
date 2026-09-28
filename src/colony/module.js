// @ts-check
import { defineModule } from '../sim/module.js';
import { random, hashUnit } from '../core/rng.js';
import { empireState, abandonPresence } from '../empire/module.js';
import { send, systemSnapshot, extendSystemSnapshot, recordDispatch, absorbSystemReport } from '../info/module.js';
import { RULES, chooseSite, capacity, foodRatio, industry, research, growth, riskChances, lossFraction } from './model.js';
import { startPreparation, finishPreparation, consumePreparation, learnPreparation, preparations } from './preparation.js';

export { startPreparation, preparations };

/**
 * Colonies (see docs/COLONIES.md).
 *
 * Every held system has people: on a habitable world, a terraformable or
 * hostile one under domes, or in an orbital base (always possible). They grow
 * toward the site's capacity when fed, starve when not, produce materiel
 * (which pays for ships) and research, and suffer: prion outbreaks, stellar
 * flares, crop failures, unrest. Small young colonies are hit hardest; a
 * colony that falls below a few dozen people dies and the system is lost.
 *
 * How the founders travelled shapes the society: embryo ships (machines raise
 * the first generations: strange, unstable), generation arks (closed peoples,
 * prone to prion disease) or cryo sleepers (a settled society).
 *
 * News of disasters reaches the capital as 'colony' messages at light speed.
 *
 * @typedef {import('./model.js').Site} Site
 * @typedef {'embryo' | 'ark' | 'cryo' | 'old'} Mode
 * @typedef {object} Colony
 * @property {string} empire
 * @property {number} founded
 * @property {Mode} mode             how it was founded
 * @property {string} society        society trait (RULES.society)
 * @property {Site} site
 * @property {number} population
 * @property {number} stock          embryos still frozen (embryo ships)
 * @property {number} materiel
 * @property {number} instability    0–1, fades over the centuries
 * @property {number | null} cropsUntil   crop failure until
 * @property {number | null} unrestUntil
 * @property {number | null} terraform    progress 0–1 while terraforming
 * @property {number} nextRollAt
 * @property {number} prepared     0–1: how well robots prepared the site before the colonists came
 * @property {{ food: number, capacity: number, industry: number, research: number }} last  last month's figures
 */

/** @typedef {{ mode: Mode, colonists?: number, expectPrepared?: boolean }} Founding */
/**
 * @typedef {{ population: number, mode: Mode, society: string, founded: number, site: { kind: string, body: string | null, name: string | null },
 *   materiel: number, food: number, capacity: number, industry: number, research: number, crops: boolean, unrest: boolean,
 *   terraform: number | null, instability: number, stock: number, prepared: number }} ColonyReport
 */

export const colonyModule = defineModule({
  id: 'colony',
  dependsOn: ['galaxy', 'empire', 'info'],
  initState: () => ({
    /** @type {Record<string, Colony>} */
    colonies: {},
    /** @type {Record<string, Founding>} system → how the next colony there is founded (set by a settler just before it lands) */
    pending: {},
    /** disasters on or off (sandbox and tests) */
    risks: true,
    /** @type {Record<string, import('./preparation.js').Preparation>} system → robotic preparation under way */
    preparations: {},
  }),

  handlers: {
    'colony/prepared'(world, e, ctx) {
      finishPreparation(world, ctx, e);
    },
  },

  tick(world, dt, ctx) {
    const es = empireState(world);
    for (const [system, p] of Object.entries(es.presence)) {
      if (colonies(world)[system]?.empire !== p.empire) settleOwner(world, ctx, system, p.empire);
    }
    for (const [system, c] of Object.entries(colonies(world))) {
      const p = es.presence[system];
      if (!p || p.empire !== c.empire) {
        delete colonies(world)[system];
        continue;
      }
      live(world, ctx, system, c, p, dt);
    }
  },

  listeners: {
    'empire/presenceChanged'(world, { system, empire }, ctx) {
      if (colonies(world)[system]?.empire !== empire) settleOwner(world, ctx, system, empire);
    },
    'empire/presenceLost'(world, { system }) {
      delete colonies(world)[system];
    },
    'info/delivered'(world, { message }, ctx) {
      if (message.kind === 'fleetReport') {
        const emp = empireState(world).empires[message.empire];
        if (message.target === emp.capital) learnPreparation(world, message.empire, message.payload.system, message.payload.event, message.validAt);
        return;
      }
      if (message.kind !== 'colony') return;
      const emp = empireState(world).empires[message.empire];
      if (message.target !== emp.capital) return;
      const hops = message.hops.filter((/** @type {any} */ h) => h.kind === 'radio').length;
      const entry = { validAt: message.validAt, receivedAt: ctx.now, via: message.via, hops };
      const { system, event, params, data } = message.payload;
      absorbSystemReport(world, ctx, message.empire, system, entry, data);
      recordDispatch(world, ctx, message.empire, { id: message.id, key: `colony.${event}`, params: { system, ...params }, ...entry });
    },
  },
});

/** @param {import('../sim/world.js').World} world @returns {Record<string, Colony>} */
export const colonies = (world) => world.state.colony?.colonies ?? {};

/** @param {import('../sim/world.js').World} world @param {string} system */
export const colonyAt = (world, system) => colonies(world)[system] ?? null;

/**
 * Say how the next colony at `system` is founded (a settler about to land).
 * @param {import('../sim/world.js').World} world @param {string} system @param {Founding} founding
 */
export function prepareFounding(world, system, founding) {
  world.state.colony.pending[system] = founding;
}

/**
 * A system's owner changed: the people stay (secession), or a colony is founded.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string} empire
 */
function settleOwner(world, ctx, system, empire) {
  const c = colonies(world)[system];
  if (c) c.empire = empire;
  else found(world, ctx, system, empire);
}

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string} empire
 */
function found(world, ctx, system, empire) {
  const st = world.state.colony;
  const capital = empireState(world).empires[empire]?.capital === system;
  // A capital is an old people near its capacity; anything else founded without a settler, cryo sleepers.
  const f = st.pending[system] ?? { mode: capital ? 'old' : 'cryo' };
  delete st.pending[system];
  const mode = /** @type {Mode} */ (f.mode);
  const def = mode === 'old' ? null : RULES.modes[mode];
  const society = def?.society ?? 'old';
  const site = chooseSite(world.seed, ctx.data.catalog.get(system));
  const caps = empireState(world).presence[system]?.capabilities;
  const prep = consumePreparation(world, ctx, system, empire);
  // Embryo ships sent to a site believed ready carry little: without the robots' nurseries, half the frozen stock is lost.
  const unprepared = !!f.expectPrepared && prep.status !== 'ready';
  const stock = mode === 'embryo' ? RULES.modes.embryo.stock * (unprepared ? 0.5 : 1) : 0;
  const instability = (/** @type {Record<string, any>} */ (RULES.society)[society]?.instability ?? 0)
    * (1 - RULES.preparation.bonus.instability * prep.prepared) * (mode === 'embryo' ? caps?.colony.instability ?? 1 : 1);
  st.colonies[system] = {
    empire, founded: ctx.now, mode, society, site,
    population: f.colonists ?? (def ? def.colonists : RULES.start.capitalShare * capacity(site, caps)),
    stock,
    materiel: capital ? RULES.start.capitalMateriel : RULES.start.materiel,
    instability,
    cropsUntil: null, unrestUntil: null, terraform: site.kind === 'terraformable' && prep.headStart > 0 ? prep.headStart : null,
    nextRollAt: ctx.now + hashUnit(world.seed, `colony:${system}:${ctx.now}`),
    prepared: prep.prepared,
    last: { food: 1, capacity: 0, industry: 0, research: 0 },
  };
  if (prep.status === 'ready' || prep.prepared > 0) report(world, ctx, system, st.colonies[system], 'preparedLanding', { percent: Math.round(prep.prepared * 100) });
  else if (unprepared) report(world, ctx, system, st.colonies[system], 'unprepared', {});
}

/**
 * Sandbox and scenarios: set a colony's figures directly.
 * @param {import('../sim/world.js').World} world @param {string} system @param {Partial<Colony>} patch
 */
export function setColony(world, system, patch) {
  const c = colonies(world)[system];
  if (!c) throw new Error(`No colony at ${system}`);
  Object.assign(c, patch);
  if (patch.society && patch.instability === undefined) c.instability = /** @type {Record<string, any>} */ (RULES.society)[patch.society]?.instability ?? 0;
}

/** The economy focus a system's governor was told to follow. @param {import('../sim/world.js').World} world @param {string} system */
export const focusAt = (world, system) => world.state.governors?.books[system]?.settings.economyFocus ?? 'balanced';

/** @param {import('../sim/world.js').World} world @param {string} system */
const terraformProgramme = (world, system) => world.state.governors?.books[system]?.settings.terraform ?? 'full';

/**
 * One month of life.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {Colony} c @param {import('../empire/module.js').Presence} p @param {number} dt
 */
function live(world, ctx, system, c, p, dt) {
  const caps = p.capabilities;
  const focus = focusAt(world, system);
  const unlocks = caps?.unlocks ?? [];

  // Full terraforming, or ecopoiesis carrying on what the seeders' microbes began (at half speed).
  const full = unlocks.includes('planet.terraform');
  const seeded = !full && c.terraform != null && unlocks.includes('planet.ecopoiesis');
  if (c.site.kind === 'terraformable' && (full || seeded) && terraformProgramme(world, system) === 'full') {
    const years = RULES.terraforming.years * (unlocks.includes('planet.processors') ? 0.5 : 1) * (seeded ? 2 : 1) / (caps?.colony.terraformSpeed ?? 1);
    c.terraform = (c.terraform ?? 0) + dt / years;
    if (c.terraform >= 1) {
      c.site = { ...c.site, kind: 'terraformed' };
      c.terraform = null;
      report(world, ctx, system, c, 'terraformed', {});
    }
  }

  const crops = c.cropsUntil != null && ctx.now < c.cropsUntil;
  const unrest = c.unrestUntil != null && ctx.now < c.unrestUntil;
  if (!crops) c.cropsUntil = null;
  if (!unrest) c.unrestUntil = null;
  const prepared = c.prepared ?? 0;
  const cap = capacity(c.site, caps, prepared);
  const food = foodRatio(c.site, caps, focus, crops, c.population, prepared);
  c.population = Math.max(0, c.population + growth(c.population, cap, food, caps) * dt);
  if (c.stock > 0) {
    const n = Math.min(c.stock, RULES.modes.embryo.decant * (1 + RULES.preparation.bonus.decant * prepared) * dt);
    c.stock -= n;
    c.population += n;
  }
  // Unrest stops work; a restless colony (loyalty module) drags its feet.
  const restless = world.state.loyalty?.records[system]?.stage === 'restless' ? RULES.restlessIndustry : 1;
  const slowed = (unrest ? RULES.risks.unrest.output : 1) * restless;
  const made = industry(c.population, c.site, caps, focus) * slowed;
  c.materiel += made * dt;
  c.instability *= Math.exp(-dt / RULES.risks.unrest.fades);
  c.last = { food, capacity: cap, industry: made, research: research(c.population, focus) * slowed };

  if (ctx.now >= c.nextRollAt) {
    c.nextRollAt += 1;
    if (world.state.colony.risks) roll(world, ctx, system, c, caps);
  }

  // Even a capital can die out (a small breakaway polity); the seat then moves (empire module).
  if (c.population < RULES.growth.extinctBelow && c.stock <= 0) die(world, ctx, system, c);
}

/**
 * The yearly throw of the dice.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {Colony} c @param {import('../research/effects.js').Capabilities | undefined} caps
 */
function roll(world, ctx, system, c, caps) {
  const r = RULES.risks;
  const star = ctx.data.catalog.get(system).stars[0]?.cls ?? '?';
  const chance = riskChances(c, star, caps, ctx.now);
  const hit = (/** @type {'prion' | 'radiation'} */ kind) => {
    const loss = lossFraction(/** @type {[number, number]} */ (r[kind].loss), c.population, random(ctx.rng));
    const lost = Math.round(c.population * loss);
    c.population -= lost;
    report(world, ctx, system, c, kind, { lost, percent: Math.round(loss * 100) });
  };
  if (random(ctx.rng) < chance.prion) hit('prion');
  if (random(ctx.rng) < chance.radiation) hit('radiation');
  if (c.cropsUntil == null && random(ctx.rng) < chance.crops) {
    const [lo, hi] = r.crops.years;
    const years = lo + Math.floor(random(ctx.rng) * (hi - lo + 1));
    c.cropsUntil = ctx.now + years;
    report(world, ctx, system, c, RULES.sites[c.site.kind].crops ? 'cropFailure' : 'recyclerFailure', { count: years });
  }
  if (c.unrestUntil == null && random(ctx.rng) < chance.unrest) {
    const [lo, hi] = r.unrest.years;
    const years = lo + Math.floor(random(ctx.rng) * (hi - lo + 1));
    c.unrestUntil = ctx.now + years;
    const lost = Math.round(c.population * r.unrest.loss);
    c.population -= lost;
    report(world, ctx, system, c, c.society === 'embryo' ? 'strangeness' : 'unrest', { years, lost });
  }
}

/**
 * The last of them are gone: the news goes out, and the system is lost.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {string} system @param {Colony} c
 */
function die(world, ctx, system, c) {
  report(world, ctx, system, c, 'extinct', { years: Math.round(ctx.now - c.founded) }, { owner: null, relay: 'none', colony: null });
  delete colonies(world)[system];
  abandonPresence(world, ctx, { system, reason: 'extinct' });
}

/**
 * Send news of a colony event to the capital (with a fresh system report).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {Colony} c @param {string} event @param {Record<string, number>} params @param {Record<string, any>} [override]
 */
export function report(world, ctx, system, c, event, params, override = {}) {
  const capital = empireState(world).empires[c.empire].capital;
  const data = { ...systemSnapshot(world, system), ...override };
  send(world, ctx, { empire: c.empire, kind: 'colony', origin: system, target: capital, payload: { system, event, params, data }, via: system === capital ? 'capital' : 'relay' });
  ctx.notify('colony/event', { system, event });
}

/**
 * Materiel held at a system (0 where there is no colony).
 * @param {import('../sim/world.js').World} world @param {string} system
 */
export const materielAt = (world, system) => colonies(world)[system]?.materiel ?? 0;

/**
 * Pay for something built at `system`. Returns false (and pays nothing) when
 * the stock is short. Systems without a colony (old saves, tests) build free.
 * @param {import('../sim/world.js').World} world @param {string} system @param {number} amount
 */
export function spend(world, system, amount) {
  const c = colonies(world)[system];
  if (!c) return true;
  if (c.materiel < amount) return false;
  c.materiel -= amount;
  return true;
}

/**
 * What a ship costs at `system` (its focus makes shipyards cheaper or dearer).
 * @param {import('../sim/world.js').World} world @param {string} system @param {string} kind  ship role or 'settler:<mode>'
 */
export function shipCost(world, system, kind) {
  const base = kind.startsWith('settler:')
    ? RULES.modes[/** @type {'embryo' | 'ark' | 'cryo'} */ (kind.slice(8))].cost
    : /** @type {Record<string, number>} */ (RULES.shipCosts)[kind] ?? RULES.shipCosts.generic;
  const f = RULES.focus[/** @type {keyof typeof RULES.focus} */ (focusAt(world, system))] ?? RULES.focus.balanced;
  return base * f.shipCost;
}

/**
 * Colonisation modes a system can use (by its technologies), cheapest first.
 * @param {import('../research/effects.js').Capabilities | undefined} caps
 * @returns {('embryo' | 'ark' | 'cryo')[]}
 */
export function availableModes(caps) {
  const unlocks = caps?.unlocks ?? [];
  const all = /** @type {('embryo' | 'ark' | 'cryo')[]} */ (Object.keys(RULES.modes).filter((m) => m !== 'note'));
  return all.filter((m) => unlocks.includes(RULES.modes[m].unlock));
}

/**
 * The mode a governor picks: the one asked for if possible; otherwise cryo
 * sleepers when known, an ark when affordable, embryos as the last resort.
 * @param {import('../sim/world.js').World} world @param {string} system @param {string} wanted
 * @returns {'embryo' | 'ark' | 'cryo' | null}
 */
export function chooseMode(world, system, wanted) {
  const modes = availableModes(empireState(world).presence[system]?.capabilities);
  if (wanted !== 'auto') return modes.includes(/** @type {any} */ (wanted)) ? /** @type {any} */ (wanted) : null;
  if (modes.includes('cryo')) return 'cryo';
  if (modes.includes('ark') && materielAt(world, system) >= shipCost(world, system, 'settler:ark')) return 'ark';
  return modes.includes('embryo') ? 'embryo' : modes[0] ?? null;
}

/**
 * Research points a system produces per year (null where there is no colony).
 * @param {import('../sim/world.js').World} world @param {string} system
 */
export const researchOutput = (world, system) => colonies(world)[system]?.last.research ?? null;

/**
 * A colony as its governor reports it (plain data).
 * @param {import('../sim/world.js').World} world @param {string} system
 * @returns {ColonyReport | null}
 */
export function colonySummary(world, system) {
  const c = colonies(world)[system];
  if (!c) return null;
  return {
    population: Math.round(c.population), mode: c.mode, society: c.society, founded: c.founded,
    site: { kind: c.site.kind, body: c.site.body, name: c.site.name },
    materiel: Math.round(c.materiel), food: round2(c.last.food), capacity: Math.round(c.last.capacity),
    industry: round2(c.last.industry), research: round2(c.last.research),
    crops: c.cropsUntil != null, unrest: c.unrestUntil != null, terraform: c.terraform == null ? null : round2(c.terraform),
    instability: round2(c.instability), stock: Math.round(c.stock), prepared: round2(c.prepared ?? 0),
  };
}

// Reports carry the colony's state, so the capital learns how its people fare.
extendSystemSnapshot((world, system) => {
  const colony = colonySummary(world, system);
  return colony ? { colony } : {};
});

const round2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;
