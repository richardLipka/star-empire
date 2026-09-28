// @ts-check
import { defineModule } from '../sim/module.js';
import { GameError } from '../core/errors.js';
import { planTrip, planVoyage } from './plan.js';
import { APPROACHES } from '../ships/catalog.js';
import { brakeLeg, positionOnLegs, velocityOnLegs } from './legs.js';
import { length, normalize } from '../core/vec3.js';
import { wormholes } from '../events/wormholes.js';
import { markExplored } from '../empire/module.js';
import { bump, NETWORK } from '../core/versions.js';

/**
 * Fleets moving between systems at sublight speed.
 *
 * @typedef {object} Fleet
 * @property {string} id
 * @property {string} empire
 * @property {string} name
 * @property {import('./legs.js').Drive} drive
 * @property {boolean} ansible      carries an ansible: instant link to the capital
 * @property {boolean} courier      carries information (reports, queued messages) with it
 * @property {boolean} transmitter  carries a relay module: can transmit from any system it is docked at
 * @property {'generic' | 'scout' | 'settler' | 'courier' | 'seeder' | 'envoy' | 'warship' | 'impactor'} role
 * @property {any} mission          what its governor sent it to do (plain data), or null
 * @property {string[]} [blueprints] technologies it carries (known where it was launched)
 * @property {number} [plumeVisibility] how far its drive plume can be seen (1 = normal), from launch-site technology
 * @property {'docked' | 'transit'} status
 * @property {string | null} at     system when docked
 * @property {string | null} dest   destination when in transit
 * @property {import('./legs.js').Leg[]} legs  current trip
 * @property {number} trip          increments on every new plan; stale events are ignored
 * @property {{ reports: any[], messages: string[] }} cargo
 * @property {Ship[]} [ships]        warships and other designed ships (none: a single civilian vessel)
 * @property {Record<string, import('../ships/catalog.js').Design>} [designs]  the designs its ships were built to
 * @property {import('../combat/model.js').Plan} [plan]  battle plan, set in advance
 * @property {Voyage | null} [voyage] the route it is flying, if a voyage
 * @property {any[]} [pendingReports] battle reports waiting until it can transmit (docked)
 * @property {any} [queued]        an order that reached it in flight (by ansible), for when it docks
 *
 * @typedef {{ d: string, hp: number }} Ship
 * @typedef {{ waypoints: import('./plan.js').Waypoint[], approach: import('./plan.js').Approach, home: string | null, reach: number[], issuedBy?: string | null }} Voyage
 */

/** How long orders wait at a system for a fleet that never comes. */
const MAILBOX_YEARS = 300;

export const fleetModule = defineModule({
  id: 'fleet',
  dependsOn: ['galaxy', 'empire', 'wormholes'],
  initState: () => ({
    /** @type {Record<string, Fleet>} */ fleets: {},
    /** @type {Record<string, any[]>} system → orders waiting there for a fleet to dock */ mailbox: {},
  }),
  listeners: {
    /** Orders addressed to a fleet (by ansible, or handed over at its system), or left for it at a system. */
    'info/delivered'(world, { message }, ctx) {
      const { kind, payload, target } = message;
      if (kind !== 'fleetOrder') return;
      if (payload.type === 'redirect' && fleetState(world).fleets[target]) {
        redirectFleet(world, ctx, { fleet: target, to: payload.to });
        return;
      }
      if (payload.forFleet) {
        const f = fleetState(world).fleets[payload.forFleet];
        if (f && f.status === 'docked' && f.at === target) applyOrder(world, ctx, f, payload);
        else (world.state.fleet.mailbox[target] ??= []).push({ ...payload, postedAt: ctx.now });
        return;
      }
      const f = fleetState(world).fleets[target];
      if (f) applyOrder(world, ctx, f, payload);
    },
    'fleet/arrived'(world, { fleet: id, system }, ctx) {
      const q = fleetState(world).fleets[id];
      if (q?.queued) {
        const order = q.queued;
        q.queued = null;
        applyOrder(world, ctx, q, order);
      }
      // Orders nobody came for in three centuries are forgotten.
      for (const [s, list] of Object.entries(world.state.fleet.mailbox ?? {})) {
        const left = list.filter((o) => ctx.now - (o.postedAt ?? ctx.now) <= MAILBOX_YEARS);
        if (left.length) world.state.fleet.mailbox[s] = left;
        else delete world.state.fleet.mailbox[s];
      }
      const box = world.state.fleet.mailbox?.[system];
      if (!box?.length) return;
      const mine = box.filter((o) => o.forFleet === id);
      if (!mine.length) return;
      world.state.fleet.mailbox[system] = box.filter((o) => o.forFleet !== id);
      const f = fleetState(world).fleets[id];
      for (const o of mine) if (f) applyOrder(world, ctx, f, o);
    },
  },
  handlers: {
    'fleet/waypoint'(world, { fleet: id, trip, index }, ctx) {
      const f = fleetState(world).fleets[id];
      if (!f || f.trip !== trip || !f.voyage) return;
      const wp = f.voyage.waypoints[index];
      const legIndex = f.voyage.reach[index];
      const leg = legIndex >= 0 ? f.legs[legIndex] : null;
      const speed = leg?.kind === 'flight' ? leg.profile.arrivalSpeed : 0;
      markExplored(world, f.empire, wp.system, ctx.now);
      ctx.notify('fleet/atWaypoint', { fleet: id, system: wp.system, index, action: wp.action, speed });
    },
    'fleet/legEnd'(world, { fleet: id, trip, leg }, ctx) {
      const f = fleetState(world).fleets[id];
      if (!f || f.trip !== trip) return; // replanned since
      const l = f.legs[leg];
      if (l.kind === 'wormhole') ctx.notify('fleet/transited', { fleet: id, from: l.fromSystem, to: l.toSystem });
      if (leg < f.legs.length - 1) return;
      if (l.kind === 'brake') return; // stopped in deep space; a new plan follows immediately
      if (l.kind === 'flight' && l.profile.brake === false) return; // passing at speed (a strike): it cannot stop here
      f.status = 'docked';
      f.at = l.toSystem;
      f.dest = null;
      f.legs = [];
      bump(world, NETWORK);
      markExplored(world, f.empire, f.at, ctx.now);
      ctx.notify('fleet/arrived', { fleet: id, system: f.at });
      ctx.notify('info/networkChanged', { empire: f.empire });
    },
  },
});

/** @param {import('../sim/world.js').World} world */
export const fleetState = (world) => /** @type {{ fleets: Record<string, Fleet> }} */ (world.state.fleet);

/**
 * True position of a fleet at time `t`.
 * @param {Fleet} f @param {number} t @param {(id: string) => import('../core/vec3.js').Vec3} posOf
 */
export const fleetPosition = (f, t, posOf) => (f.status === 'docked' ? posOf(/** @type {string} */ (f.at)) : positionOnLegs(f.legs, t));

/** @param {import('../sim/module.js').SimContext} ctx */
const posLookup = (ctx) => (/** @type {string} */ id) => ctx.data.catalog.get(id).pos;

/**
 * Create a docked fleet.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, at: string, drive: import('./legs.js').Drive, ansible?: boolean, courier?: boolean, transmitter?: boolean,
 *           role?: Fleet['role'], mission?: any, name?: string, ships?: Ship[], designs?: Fleet['designs'], plan?: Fleet['plan'] }} p
 */
export function createFleet(world, ctx, { empire, at, drive, ansible = false, courier = false, transmitter = false, role = 'generic', mission = null, name, ships, designs, plan }) {
  const id = ctx.newId('fleet');
  const number = Object.values(fleetState(world).fleets).filter((x) => x.empire === empire).length + 1;
  /** @type {Fleet} */
  const f = { id, empire, name: name ?? `${empire}-${number}`, drive: { accelG: drive.accelG, cruise: drive.cruise }, ansible, courier, transmitter, role, mission, status: 'docked', at, dest: null, legs: [], trip: 0, cargo: { reports: [], messages: [] } };
  if (ships) {
    f.ships = ships;
    f.designs = designs ?? {};
    f.plan = plan;
    f.voyage = null;
  }
  fleetState(world).fleets[id] = f;
  bump(world, NETWORK);
  ctx.notify('fleet/created', { fleet: id, system: at });
  if (ansible || transmitter) ctx.notify('info/networkChanged', { empire });
  return f;
}

/**
 * Remove a fleet (a settler consumed by its new outpost, a courier home from its run).
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {string} id
 */
export function disbandFleet(world, ctx, id) {
  const f = fleetState(world).fleets[id];
  if (!f) return;
  delete fleetState(world).fleets[id];
  // Orders waiting for it anywhere are moot.
  for (const [system, box] of Object.entries(world.state.fleet.mailbox ?? {})) {
    const left = box.filter((o) => o.forFleet !== id);
    if (left.length) world.state.fleet.mailbox[system] = left;
    else delete world.state.fleet.mailbox[system];
  }
  bump(world, NETWORK);
  ctx.notify('fleet/disbanded', { fleet: id, empire: f.empire, system: f.at });
  ctx.notify('info/networkChanged', { empire: f.empire });
}

/**
 * Send a docked fleet to a system (using a wormhole if faster).
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ fleet: string, to: string }} p
 */
export function launchFleet(world, ctx, { fleet: id, to }) {
  const f = fleetState(world).fleets[id];
  if (f.status !== 'docked') throw new GameError('fleetNotDocked', { fleet: f.name });
  if (f.at === to) return;
  const from = /** @type {string} */ (f.at);
  const legs = planTrip({ fromPos: ctx.data.catalog.get(from).pos, fromSystem: from, toSystem: to, departAt: ctx.now, drive: f.drive, posOf: posLookup(ctx), wormholes: wormholes(world) });
  if (f.voyage !== undefined) f.voyage = null;
  startTrip(world, ctx, f, legs, to);
  ctx.notify('fleet/launched', { fleet: id, system: from });
  ctx.notify('info/networkChanged', { empire: f.empire });
}

/**
 * A fleet takes an order that has reached it: a new battle plan, or a voyage
 * (a fleet in flight keeps the voyage for when it next docks).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {Fleet} f @param {any} order
 */
function applyOrder(world, ctx, f, order) {
  if (order.type === 'plan') {
    if (f.ships) f.plan = { ...order.plan };
    ctx.notify('fleet/planChanged', { fleet: f.id });
  } else if (order.type === 'voyage') {
    if (f.status === 'docked') launchVoyage(world, ctx, { fleet: f.id, waypoints: order.waypoints, approach: order.approach, issuedBy: order.issuedBy ?? null });
    else f.queued = order;
  }
}

/**
 * Send a docked fleet on a voyage through several systems (docs/FLEETS.md):
 * each waypoint is visited, attacked or struck; the approach decides how
 * (normal, flyby without braking, or stealth with faint burns). A flyby
 * voyage returns to where it started.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ fleet: string, waypoints: import('./plan.js').Waypoint[], approach: import('./plan.js').Approach, issuedBy?: string | null }} p
 */
export function launchVoyage(world, ctx, { fleet: id, waypoints, approach, issuedBy = null }) {
  const f = fleetState(world).fleets[id];
  if (f.status !== 'docked') throw new GameError('fleetNotDocked', { fleet: f.name });
  const from = /** @type {string} */ (f.at);
  const strike = waypoints.some((w) => w.action === 'strike');
  const mode = strike ? 'flyby' : approach;
  const home = mode === 'flyby' && !strike ? from : null;
  const { legs, reach } = planVoyage({
    fromPos: ctx.data.catalog.get(from).pos, fromSystem: from, waypoints, approach: mode, departAt: ctx.now, drive: f.drive,
    stealth: APPROACHES.stealth, home, posOf: posLookup(ctx), wormholes: wormholes(world),
  });
  f.voyage = { waypoints, approach: mode, home, reach, issuedBy };
  if (!legs.length) {
    waypoints.forEach((_, i) => ctx.scheduleIn(0, 'fleet/waypoint', { fleet: id, trip: f.trip, index: i }));
    return;
  }
  const last = legs[legs.length - 1];
  startTrip(world, ctx, f, legs, last.kind === 'brake' ? waypoints[waypoints.length - 1].system : last.toSystem);
  reach.forEach((leg, i) => ctx.scheduleAt(leg < 0 ? ctx.now : legs[leg].arriveAt, 'fleet/waypoint', { fleet: id, trip: f.trip, index: i }));
  ctx.notify('fleet/launched', { fleet: id, system: from });
  ctx.notify('info/networkChanged', { empire: f.empire });
}

/**
 * Change a fleet's destination. In transit this needs an order to reach the
 * fleet, which in practice means an ansible. The fleet brakes to a stop, then
 * flies to the new target.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ fleet: string, to: string }} p
 */
export function redirectFleet(world, ctx, { fleet: id, to }) {
  const f = fleetState(world).fleets[id];
  if (f.status === 'docked') return launchFleet(world, ctx, { fleet: id, to });
  const now = ctx.now;
  const pos = positionOnLegs(f.legs, now);
  const vel = velocityOnLegs(f.legs, now);
  const speed = length(vel);
  /** @type {import('./legs.js').Leg[]} */
  const legs = [];
  let t = now;
  let from = pos;
  if (speed > 1e-9) {
    const brake = brakeLeg({ fromPos: pos, dir: normalize(vel), v0: speed, accelG: f.drive.accelG, departAt: now });
    legs.push(brake);
    t = brake.arriveAt;
    from = brake.toPos;
  }
  legs.push(...planTrip({ fromPos: from, fromSystem: null, toSystem: to, departAt: t, drive: f.drive, posOf: posLookup(ctx), wormholes: wormholes(world) }));
  startTrip(world, ctx, f, legs, to);
  ctx.notify('fleet/redirected', { fleet: id, to });
}

/**
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {Fleet} f
 * @param {import('./legs.js').Leg[]} legs
 * @param {string} dest
 */
function startTrip(world, ctx, f, legs, dest) {
  f.trip++;
  bump(world, NETWORK);
  f.status = 'transit';
  f.at = null;
  f.dest = dest;
  f.legs = legs;
  legs.forEach((leg, i) => ctx.scheduleAt(leg.arriveAt, 'fleet/legEnd', { fleet: f.id, trip: f.trip, leg: i }));
  ctx.notify('fleet/tripStarted', { fleet: f.id, trip: f.trip });
}
