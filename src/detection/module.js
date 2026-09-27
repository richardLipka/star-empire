// @ts-check
import { defineModule } from '../sim/module.js';
import sensors from '../data/sensors.json';
import { empireState } from '../empire/module.js';
import { fleetState } from '../fleet/module.js';
import { positionOnLegs } from '../fleet/legs.js';
import { send, recordDispatch } from '../info/module.js';
import { distance, dot, normalize, scale, sub, length } from '../core/vec3.js';

/**
 * Drive-plume detection (DESIGN §5). A fleet is visible only while its engines
 * burn, and only to observers the exhaust points at:
 * - accelerating away from its origin, the plume points back: seen from behind;
 * - braking toward its destination, the plume points ahead: seen from the destination.
 * A coasting fleet is dark. Light from the burn reaches an observer at c, and
 * the observer's report then travels to its capital like any message.
 *
 * @typedef {import('../core/vec3.js').Vec3} Vec3
 * @typedef {'accelerating' | 'braking'} Phase
 * @typedef {object} Sighting
 * @property {string} id
 * @property {string} observer        system that saw it
 * @property {string} fleetEmpire     owner of the fleet (drive signatures are recognisable)
 * @property {string | null} fleet    fleet id, known only for own fleets
 * @property {Phase} phase
 * @property {Vec3} pos               where the burn was
 * @property {Vec3} motion            direction of travel (unit)
 * @property {number} emittedAt       when the burn started (validAt)
 * @property {number} seenAt          when its light reached the observer
 * @property {number} receivedAt      when the report reached the capital
 * @property {string | null} near     system the burn points to (braking) or leaves (accelerating)
 */

export const PLUME_RANGE = sensors.plumeRangeLy;
export const PLUME_COS = Math.cos((sensors.plumeHalfAngleDeg * Math.PI) / 180);
export const SIGHTING_MEMORY = sensors.sightingMemoryYears;
const MAX_SIGHTINGS = 200;
/** An observer this close to the burn sees it whatever the exhaust direction. */
const POINT_BLANK = 0.02;

export const detectionModule = defineModule({
  id: 'detection',
  dependsOn: ['galaxy', 'empire', 'fleet', 'info'],
  initState: () => ({ /** @type {Record<string, Sighting[]>} */ sightings: {} }),

  listeners: {
    'fleet/tripStarted'(world, { fleet: id, trip }, ctx) {
      const f = fleetState(world).fleets[id];
      f.legs.forEach((leg, i) => {
        if (leg.kind === 'flight') {
          ctx.scheduleAt(leg.departAt, 'detection/burn', { fleet: id, trip, leg: i, phase: 'accelerating' });
          ctx.scheduleAt(leg.departAt + leg.profile.brakeStart, 'detection/burn', { fleet: id, trip, leg: i, phase: 'braking' });
        } else if (leg.kind === 'brake') {
          ctx.scheduleAt(leg.departAt, 'detection/burn', { fleet: id, trip, leg: i, phase: 'braking' });
        }
      });
    },
    'info/delivered'(world, { message }, ctx) {
      if (message.kind !== 'sighting') return;
      const capital = empireState(world).empires[message.empire].capital;
      if (message.target !== capital) return;
      recordSighting(world, ctx, message.empire, { ...message.payload, receivedAt: ctx.now });
    },
  },

  handlers: {
    'detection/burn'(world, { fleet: id, trip, leg: index, phase }, ctx) {
      const f = fleetState(world).fleets[id];
      if (!f || f.trip !== trip) return; // replanned: this burn never happened
      const leg = f.legs[index];
      const pos = positionOnLegs(f.legs, ctx.now);
      const motion = normalize(sub(leg.toPos, leg.fromPos));
      const exhaust = phase === 'accelerating' ? scale(motion, -1) : motion;
      const visibility = f.plumeVisibility ?? 1;
      for (const [system, p] of Object.entries(empireState(world).presence)) {
        const toObserver = sub(ctx.data.catalog.get(system).pos, pos);
        const d = length(toObserver);
        const caps = p.capabilities;
        const range = (PLUME_RANGE + (caps?.sensorRange ?? 0)) * visibility;
        const cos = Math.cos(((sensors.plumeHalfAngleDeg + (caps?.sensorAngle ?? 0)) * Math.PI) / 180);
        if (!plumeVisible(exhaust, toObserver, range, cos)) continue;
        ctx.scheduleIn(d, 'detection/seen', {
          observer: system, observerEmpire: p.empire, fleet: id, fleetEmpire: f.empire, phase, pos, motion, emittedAt: ctx.now,
        });
      }
    },
    'detection/seen'(world, payload, ctx) {
      const p = empireState(world).presence[payload.observer];
      if (!p || p.empire !== payload.observerEmpire) return; // the observer is gone
      ctx.notify('detection/observed', { observer: payload.observer, empire: p.empire, fleetEmpire: payload.fleetEmpire, phase: payload.phase });
      const capital = empireState(world).empires[p.empire].capital;
      /** @type {Omit<Sighting, 'receivedAt' | 'id'>} */
      const sighting = {
        observer: payload.observer,
        fleetEmpire: payload.fleetEmpire,
        fleet: payload.fleetEmpire === p.empire ? payload.fleet : null,
        phase: payload.phase,
        pos: payload.pos,
        motion: payload.motion,
        emittedAt: payload.emittedAt,
        seenAt: ctx.now,
        near: nearSystem(ctx.data.catalog, payload.pos, payload.motion, payload.phase),
      };
      send(world, ctx, { empire: p.empire, kind: 'sighting', origin: payload.observer, target: capital, validAt: payload.emittedAt, payload: sighting });
    },
  },
});

/**
 * Is a plume with this exhaust direction visible from an observer at `toObserver` (relative)?
 * Range and cone widen with the observer's sensor technology.
 * @param {Vec3} exhaust unit vector @param {Vec3} toObserver
 * @param {number} [range] ly @param {number} [cos] cosine of the cone half-angle
 */
export function plumeVisible(exhaust, toObserver, range = PLUME_RANGE, cos = PLUME_COS) {
  const d = length(toObserver);
  if (d > range) return false;
  if (d < POINT_BLANK) return true;
  return dot(exhaust, toObserver) / d >= cos;
}

/**
 * The system a braking burn points to, or an accelerating burn leaves from.
 * @param {import('../galaxy/catalog.js').Catalog} catalog @param {Vec3} pos @param {Vec3} motion @param {Phase} phase
 */
export function nearSystem(catalog, pos, motion, phase) {
  let best = null;
  let bestD = Infinity;
  for (const s of catalog.systems) {
    const w = sub(s.pos, pos);
    const along = dot(w, motion);
    if (phase === 'braking') {
      if (along < -0.01 || along > 1.5) continue;
      const perp = length(sub(w, scale(motion, along)));
      if (perp < 0.3 && along < bestD) { bestD = along; best = s.id; }
    } else {
      const d = distance(s.pos, pos);
      if (d < 1.5 && d < bestD) { bestD = d; best = s.id; }
    }
  }
  return best;
}

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {Omit<Sighting, 'id'>} s
 */
function recordSighting(world, ctx, empire, s) {
  const list = (world.state.detection.sightings[empire] ??= []);
  const sighting = { id: ctx.newId('sighting'), ...s };
  list.push(sighting);
  if (list.length > MAX_SIGHTINGS) list.splice(0, list.length - MAX_SIGHTINGS);
  const own = s.fleetEmpire === empire;
  if (own && s.phase === 'accelerating') return; // our own departures are reported anyway
  recordDispatch(world, ctx, empire, {
    id: sighting.id,
    key: `plume.${own ? 'own' : 'foreign'}.${s.phase}${s.near ? '' : 'Deep'}`,
    params: { empire: s.fleetEmpire, near: s.near ?? '', observer: s.observer },
    validAt: s.emittedAt, receivedAt: s.receivedAt, via: 'relay', hops: 0,
  });
}

/** @param {import('../sim/world.js').World} world @param {string} empire @returns {Sighting[]} */
export const sightingsOf = (world, empire) => world.state.detection.sightings[empire] ?? [];
