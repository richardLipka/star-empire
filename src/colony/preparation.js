// @ts-check
import { random } from '../core/rng.js';
import { fleetState, disbandFleet } from '../fleet/module.js';
import { reportFleetEvent, knowledgeOf } from '../info/module.js';
import { RULES } from './model.js';

/**
 * Robotic preparatory missions (directive expansion.prepare, see
 * docs/COLONIES.md). A seeder lands its robots at an empty system; they build
 * habitats, nurseries and fields for colonists still to come. The work takes
 * decades and can fail — often silently, so the capital may send colonists
 * to a site it believes ready.
 *
 * @typedef {object} Preparation
 * @property {string} empire
 * @property {string} fleet            the seeder (its robots) working there
 * @property {number} startedAt
 * @property {number} readyAt
 * @property {number | null} failAt    when the work fails (hidden), or null
 * @property {'working' | 'ready' | 'failed'} status
 * @property {number} headStart        terraforming progress for colonists on a terraformable world
 * @typedef {{ status: 'working' | 'ready' | 'lost' | 'taken', validAt: number }} KnownPreparation
 */

/** @param {import('../sim/world.js').World} world @returns {Record<string, Preparation>} */
export const preparations = (world) => (world.state.colony.preparations ??= {});

/** What the capital believes about preparations. @param {import('../sim/world.js').World} world @param {string} empire @returns {Record<string, KnownPreparation>} */
export const knownPreparations = (world, empire) => (knowledgeOf(world, empire).preparations ??= {});

/** What a seeder's builders can do, from the technologies of the system that launched it. @param {import('../research/effects.js').Capabilities | undefined} caps */
export function seederKit(caps) {
  const p = caps?.prepare ?? { failure: 1, time: 1, headStart: 0 };
  return { failure: p.failure, time: p.time, headStart: p.headStart };
}

/**
 * A seeder has landed at an empty system: the work begins.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} fleet @param {string} system
 */
export function startPreparation(world, ctx, fleet, system) {
  const kit = fleet.mission.kit ?? seederKit(undefined);
  const r = RULES.preparation;
  const cls = ctx.data.catalog.get(system).stars[0]?.cls ?? '?';
  const failChance = Math.min(0.9, (r.failure + (/** @type {Record<string, number>} */ (r.failureByClass)[cls] ?? 0)) * kit.failure);
  const years = r.years * kit.time;
  const fails = random(ctx.rng) < failChance;
  /** @type {Preparation} */
  const rec = {
    empire: fleet.empire, fleet: fleet.id, startedAt: ctx.now, readyAt: ctx.now + years,
    failAt: fails ? ctx.now + years * (0.1 + 0.85 * random(ctx.rng)) : null, status: 'working', headStart: kit.headStart,
  };
  preparations(world)[system] = rec;
  ctx.scheduleAt(rec.failAt ?? rec.readyAt, 'colony/prepared', { system, fleet: fleet.id });
  reportFleetEvent(world, ctx, fleet, system, 'prepStarted');
}

/**
 * The work ends: ready, or failed (reported only sometimes).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, fleet: string }} e
 */
export function finishPreparation(world, ctx, { system, fleet }) {
  const rec = preparations(world)[system];
  if (!rec || rec.fleet !== fleet || rec.status !== 'working') return;
  const f = fleetState(world).fleets[fleet];
  if (rec.failAt != null) {
    rec.status = 'failed';
    if (f && random(ctx.rng) >= RULES.preparation.silentFailure) reportFleetEvent(world, ctx, f, system, 'prepLost');
  } else {
    rec.status = 'ready';
    if (f) reportFleetEvent(world, ctx, f, system, 'prepReady');
  }
  if (f) disbandFleet(world, ctx, f.id); // the robots stay as part of the site, or are wrecks
}

/**
 * Colonists land: how prepared is the site for them (0–1), and was it
 * prepared by their own empire? The record is used up; working robots join
 * the colony.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string} empire
 * @returns {{ prepared: number, headStart: number, status: Preparation['status'] | null }}
 */
export function consumePreparation(world, ctx, system, empire) {
  const rec = preparations(world)[system];
  if (!rec) return { prepared: 0, headStart: 0, status: null };
  delete preparations(world)[system];
  if (fleetState(world).fleets[rec.fleet]) disbandFleet(world, ctx, rec.fleet);
  if (rec.failAt != null && ctx.now >= rec.failAt) rec.status = 'failed';
  if (rec.empire !== empire || rec.status === 'failed') return { prepared: 0, headStart: 0, status: rec.empire === empire ? rec.status : null };
  const prepared = rec.status === 'ready' ? 1 : Math.max(0, Math.min(1, (ctx.now - rec.startedAt) / (rec.readyAt - rec.startedAt)));
  return { prepared, headStart: rec.headStart * prepared, status: rec.status };
}

/**
 * The capital hears from a seeder: remember what it believes.
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} system @param {string} event @param {number} validAt
 */
export function learnPreparation(world, empire, system, event, validAt) {
  const status = { prepStarted: 'working', prepReady: 'ready', prepLost: 'lost', prepTaken: 'taken' }[event];
  if (!status) return;
  const k = knownPreparations(world, empire);
  if (k[system] && k[system].validAt > validAt) return;
  k[system] = { status: /** @type {KnownPreparation['status']} */ (status), validAt };
}
