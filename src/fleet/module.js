// @ts-check
import { defineModule } from '../sim/module.js';
import { planTrip } from './plan.js';
import { brakeLeg, positionOnLegs, velocityOnLegs } from './legs.js';
import { length, normalize } from '../core/vec3.js';
import { wormholes } from '../events/wormholes.js';
import { empireState, markExplored } from '../empire/module.js';

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
 * @property {'docked' | 'transit'} status
 * @property {string | null} at     system when docked
 * @property {string | null} dest   destination when in transit
 * @property {import('./legs.js').Leg[]} legs  current trip
 * @property {number} trip          increments on every new plan; stale events are ignored
 * @property {{ reports: any[], messages: string[] }} cargo
 */

export const fleetModule = defineModule({
  id: 'fleet',
  dependsOn: ['galaxy', 'empire', 'wormholes'],
  initState: () => ({ /** @type {Record<string, Fleet>} */ fleets: {} }),
  listeners: {
    /** Orders arriving by message. */
    'info/delivered'(world, { message }, ctx) {
      const { kind, payload, target, empire } = message;
      if (kind === 'directive' && payload.type === 'dispatchFleet') {
        const p = empireState(world).presence[target];
        if (!p || p.empire !== empire) return; // the outpost is gone: the order lapses
        const f = createFleet(world, ctx, { empire, at: target, drive: payload.drive, ansible: payload.ansible, courier: payload.courier });
        launchFleet(world, ctx, { fleet: f.id, to: payload.to });
      } else if (kind === 'fleetOrder' && payload.type === 'redirect') {
        if (fleetState(world).fleets[target]) redirectFleet(world, ctx, { fleet: target, to: payload.to });
      }
    },
  },
  handlers: {
    'fleet/legEnd'(world, { fleet: id, trip, leg }, ctx) {
      const f = fleetState(world).fleets[id];
      if (!f || f.trip !== trip) return; // replanned since
      const l = f.legs[leg];
      if (l.kind === 'wormhole') ctx.notify('fleet/transited', { fleet: id, from: l.fromSystem, to: l.toSystem });
      if (leg < f.legs.length - 1) return;
      if (l.kind === 'brake') return; // stopped in deep space; a new plan follows immediately
      f.status = 'docked';
      f.at = l.toSystem;
      f.dest = null;
      f.legs = [];
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
 * @param {{ empire: string, at: string, drive: import('./legs.js').Drive, ansible?: boolean, courier?: boolean, name?: string }} p
 */
export function createFleet(world, ctx, { empire, at, drive, ansible = false, courier = false, name }) {
  const id = ctx.newId('fleet');
  const number = Object.values(fleetState(world).fleets).filter((x) => x.empire === empire).length + 1;
  /** @type {Fleet} */
  const f = { id, empire, name: name ?? `${empire}-${number}`, drive, ansible, courier, status: 'docked', at, dest: null, legs: [], trip: 0, cargo: { reports: [], messages: [] } };
  fleetState(world).fleets[id] = f;
  ctx.notify('fleet/created', { fleet: id, system: at });
  if (ansible) ctx.notify('info/networkChanged', { empire });
  return f;
}

/**
 * Send a docked fleet to a system (using a wormhole if faster).
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ fleet: string, to: string }} p
 */
export function launchFleet(world, ctx, { fleet: id, to }) {
  const f = fleetState(world).fleets[id];
  if (f.status !== 'docked') throw new Error(`${id} is not docked`);
  if (f.at === to) return;
  const from = /** @type {string} */ (f.at);
  const legs = planTrip({ fromPos: ctx.data.catalog.get(from).pos, fromSystem: from, toSystem: to, departAt: ctx.now, drive: f.drive, posOf: posLookup(ctx), wormholes: wormholes(world) });
  startTrip(world, ctx, f, legs, to);
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
  f.status = 'transit';
  f.at = null;
  f.dest = dest;
  f.legs = legs;
  legs.forEach((leg, i) => ctx.scheduleAt(leg.arriveAt, 'fleet/legEnd', { fleet: f.id, trip: f.trip, leg: i }));
  ctx.notify('fleet/tripStarted', { fleet: f.id, trip: f.trip });
}
