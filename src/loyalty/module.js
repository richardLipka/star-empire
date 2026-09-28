// @ts-check
import { defineModule } from '../sim/module.js';
import { random, hashUnit } from '../core/rng.js';
import { distance } from '../core/vec3.js';
import { empireState, declareIndependence, transferPresence, checkDissolution, nextPolityId } from '../empire/module.js';
import { extendSystemSnapshot } from '../info/module.js';
import { colonyAt, report } from '../colony/module.js';
import { RULES, stageOf, forces, secessionChance } from './model.js';

/**
 * Loyalty and drift (see docs/POLITICS.md).
 *
 * Every colony but the capital has a loyalty (0–1). Distance, neglect,
 * instability (embryo societies), hardship and self-sufficiency push it
 * down; a base pull, prosperity, orders and cultural missions from home and
 * technology hold it up. Stages: loyal → restless (ignores low-priority
 * orders, works less) → autonomous (refuses orders) → independence: the
 * colony becomes a polity of its own, and autonomous neighbours may join it.
 * Every change of stage is news that travels to the capital at light speed.
 *
 * @typedef {import('./model.js').Stage} Stage
 * @typedef {object} LoyaltyRecord
 * @property {string} empire
 * @property {number} value
 * @property {Stage} stage
 * @property {number} lastContact        when word last came from the capital (orders, blueprints, ships)
 * @property {number | null} lastDirective  when an order last raised loyalty (null: never; saves cannot hold Infinity)
 * @property {number} nextRollAt
 */

export const loyaltyModule = defineModule({
  id: 'loyalty',
  dependsOn: ['empire', 'info', 'colony', 'governors'],
  initState: () => ({
    /** @type {Record<string, LoyaltyRecord>} */
    records: {},
  }),

  tick(world, dt, ctx) {
    const es = empireState(world);
    for (const [system, p] of Object.entries(es.presence)) {
      const emp = es.empires[p.empire];
      const rec = records(world)[system];
      if (emp.capital === system) {
        if (rec) delete records(world)[system];
        continue;
      }
      if (!rec || rec.empire !== p.empire) {
        records(world)[system] = newRecord(world, ctx, system, p.empire);
        continue;
      }
      drift(world, ctx, system, rec, dt);
    }
    for (const system of Object.keys(records(world))) if (!es.presence[system]) delete records(world)[system];
    if (Math.floor(ctx.now) !== Math.floor(ctx.now - dt)) checkDissolution(world, ctx);
  },

  listeners: {
    'info/delivered'(world, { message }, ctx) {
      const rec = records(world)[message.target];
      if (!rec || rec.empire !== message.empire) return;
      if (message.origin !== empireState(world).empires[rec.empire].capital) return;
      rec.lastContact = ctx.now;
      if (message.kind === 'directive' && (rec.lastDirective == null || ctx.now - rec.lastDirective >= 1)) {
        rec.lastDirective = ctx.now;
        change(world, ctx, message.target, rec, RULES.pull.directive);
      }
    },
    'fleet/arrived'(world, { fleet, system }, ctx) {
      const rec = records(world)[system];
      const f = world.state.fleet.fleets[fleet];
      if (rec && f && f.empire === rec.empire) rec.lastContact = ctx.now; // ships bring news from home
    },
    'colony/event'(world, { system, event }, ctx) {
      const rec = records(world)[system];
      if (rec && ['prion', 'radiation', 'cropFailure', 'recyclerFailure', 'unrest', 'strangeness'].includes(event)) {
        const caps = empireState(world).presence[system]?.capabilities?.loyalty;
        change(world, ctx, system, rec, -RULES.push.disaster * (caps?.push ?? 1));
      }
    },
  },
});

/** @param {import('../sim/world.js').World} world @returns {Record<string, LoyaltyRecord>} */
export const records = (world) => world.state.loyalty?.records ?? {};

/** @param {import('../sim/world.js').World} world @param {string} system */
export const loyaltyAt = (world, system) => records(world)[system] ?? null;

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string} empire @returns {LoyaltyRecord}
 */
function newRecord(world, ctx, system, empire) {
  const mode = colonyAt(world, system)?.mode ?? 'cryo';
  const value = /** @type {Record<string, number>} */ (RULES.start)[mode] ?? 0.9;
  return { empire, value, stage: stageOf(value), lastContact: ctx.now, lastDirective: null, nextRollAt: ctx.now + hashUnit(world.seed, `loyalty:${system}`) };
}

/**
 * What pushes and pulls a colony, from its state now.
 * @param {import('../sim/world.js').World} world @param {{ now: number, data: Record<string, any> }} ctx @param {string} system
 */
export function driftOf(world, ctx, system) {
  const rec = records(world)[system];
  const p = empireState(world).presence[system];
  if (!rec || !p) return null;
  const capital = empireState(world).empires[p.empire].capital;
  const c = colonyAt(world, system);
  const pos = (/** @type {string} */ id) => ctx.data.catalog.get(id).pos;
  return forces({
    distance: distance(pos(system), pos(capital)),
    sinceContact: ctx.now - rec.lastContact,
    instability: c?.instability ?? 0,
    population: c?.population ?? 0,
    hungry: (c?.last.food ?? 1) < 1,
    unrest: c?.unrestUntil != null,
    prosperous: (c?.last.food ?? 0) >= 1 && c?.cropsUntil == null && c?.unrestUntil == null,
    autonomy: world.state.governors?.books[system]?.settings.autonomy ?? 'normal',
    caps: p.capabilities?.loyalty,
  });
}

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {LoyaltyRecord} rec @param {number} dt
 */
function drift(world, ctx, system, rec, dt) {
  const f = driftOf(world, ctx, system);
  if (f) change(world, ctx, system, rec, f.net * dt);
  if (ctx.now < rec.nextRollAt) return;
  rec.nextRollAt += 1;
  const caps = empireState(world).presence[system]?.capabilities?.loyalty;
  if ((colonyAt(world, system)?.population ?? 0) < RULES.secession.minPopulation) return; // too few to stand alone
  if (random(ctx.rng) < secessionChance(rec.value, caps)) secede(world, ctx, system);
}

/**
 * Move a colony's loyalty and announce a change of stage.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {LoyaltyRecord} rec @param {number} delta
 */
export function change(world, ctx, system, rec, delta) {
  rec.value = Math.min(1, Math.max(0, rec.value + delta));
  const stage = stageOf(rec.value);
  if (stage === rec.stage) return;
  const worse = ['loyal', 'restless', 'autonomous'].indexOf(stage) > ['loyal', 'restless', 'autonomous'].indexOf(rec.stage);
  rec.stage = stage;
  const c = colonyAt(world, system);
  if (c) report(world, ctx, system, c, worse ? stage : `${stage}Again`, {});
  ctx.notify('loyalty/stage', { system, empire: rec.empire, stage });
}

/**
 * A cultural mission arrives: songs, archives and envoys from home.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {string} system @param {string} empire
 */
export function receiveMission(world, ctx, system, empire) {
  const rec = records(world)[system];
  if (!rec || rec.empire !== empire) return false;
  rec.lastContact = ctx.now;
  change(world, ctx, system, rec, RULES.pull.mission);
  return true;
}

/**
 * The colony declares independence; autonomous neighbours of the same empire
 * join the new polity. Each sends its declaration home first (after the
 * change, the old empire's relays no longer carry it).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {string} system
 */
export function secede(world, ctx, system) {
  const es = empireState(world);
  const parent = es.presence[system]?.empire;
  if (!parent || es.empires[parent].capital === system) return null;
  const id = nextPolityId(world);
  const announce = (/** @type {string} */ s, /** @type {string} */ event) => {
    const c = colonyAt(world, s);
    if (c) report(world, ctx, s, c, event, {}, { owner: id, relay: es.presence[s].relay });
  };
  announce(system, 'independence');
  const pos = (/** @type {string} */ s) => ctx.data.catalog.get(s).pos;
  const joining = Object.entries(records(world))
    .filter(([s, r]) => s !== system && r.empire === parent && r.stage === 'autonomous' && distance(pos(s), pos(system)) <= RULES.secession.joinRange)
    .map(([s]) => s);
  for (const s of joining) announce(s, 'joined');
  const made = declareIndependence(world, ctx, { system });
  delete records(world)[system]; // the seat of the new polity
  for (const s of joining) transferPresence(world, ctx, { system: s, empire: made });
  // The new polity starts with fresh loyalty to itself.
  for (const s of joining) records(world)[s] = { ...newRecord(world, ctx, s, made), value: 0.8, stage: 'loyal' };
  ctx.notify('loyalty/seceded', { system, empire: made, parent, joined: joining });
  return made;
}

// Reports carry the colony's loyalty: the capital learns (late) how its colonies feel.
extendSystemSnapshot((world, system) => {
  const rec = records(world)[system];
  return rec ? { loyalty: { value: Math.round(rec.value * 100) / 100, stage: rec.stage } } : {};
});
