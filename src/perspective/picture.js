// @ts-check
import { empireState } from '../empire/module.js';
import { fleetState, fleetPosition } from '../fleet/module.js';
import { positionOnLegs, currentLeg } from '../fleet/legs.js';
import { wormholes } from '../events/wormholes.js';
import { infoState, knowledgeOf, truthNetwork } from '../info/module.js';
import { createNetwork, isFleetNode } from '../info/network.js';
import { sightingsOf, SIGHTING_MEMORY } from '../detection/module.js';
import { distance, lerp } from '../core/vec3.js';

/**
 * A "picture" is everything the map draws, as seen from one perspective:
 * - 'knowledge': what one empire's capital knows now (old, partial, predicted);
 * - 'truth': the real state (sandbox, and later the end-of-game chronicle).
 * Pictures are plain data, so they are testable without a renderer.
 *
 * Fleet certainty (knowledge perspective):
 * - 'live'        ansible link, or at the capital: seen now;
 * - 'confirmed'   docked, as reported by the system it reached;
 * - 'expected'    in transit, position predicted from the departure report;
 * - 'unconfirmed' past its planned arrival, but no arrival report yet;
 * - 'actual'      truth perspective.
 *
 * @typedef {import('../core/vec3.js').Vec3} Vec3
 * @typedef {'live' | 'confirmed' | 'expected' | 'unconfirmed' | 'actual'} Certainty
 * @typedef {{ id: string, owner: string, relay: string, validAt: number, receivedAt: number, age: number, overdue: boolean, via: string, hops: number }} PicSystem
 * @typedef {object} PicFleet
 * @property {string} id
 * @property {string} name
 * @property {string} empire
 * @property {string} role           generic, scout, settler, courier
 * @property {Vec3} pos              known (live/confirmed/actual) or predicted (expected/unconfirmed) position
 * @property {Vec3} confirmedPos     where it was when last reported
 * @property {Vec3[]} path           remaining route from `pos`
 * @property {[Vec3, Vec3][]} wormholeJumps
 * @property {string | null} at      docked system
 * @property {string | null} dest
 * @property {number | null} eta
 * @property {Certainty} certainty
 * @property {number} validAt
 * @property {number} age
 * @property {boolean} ansible
 * @property {boolean} courier
 * @property {'accelerating' | 'braking' | null} burning   truth only: engines firing now
 * @property {number | null} brakingSeenAt  knowledge: when its braking plume was seen (valid time)
 * @typedef {{ id: string, kind: string, pos: Vec3, fromPos: Vec3, toPos: Vec3, stalled: boolean }} PicMessage
 * @typedef {{ id: string, pos: Vec3, motion: Vec3, phase: string, fleetEmpire: string, own: boolean, near: string | null, observer: string, emittedAt: number, receivedAt: number, age: number }} PicSighting
 * @typedef {object} Picture
 * @property {'knowledge' | 'truth'} mode
 * @property {string} empire
 * @property {number} now
 * @property {string} capital
 * @property {number} range
 * @property {PicSystem[]} systems     systems known to be held (by anyone)
 * @property {string[]} explored       systems known to have been visited
 * @property {string[]} relays         own relays believed (or, in truth, known) to work
 * @property {[string, string, number][]} links
 * @property {PicFleet[]} fleets
 * @property {PicMessage[]} messages
 * @property {PicSighting[]} sightings
 * @property {{ id: string, a: string, b: string }[]} wormholes
 */

/** Reports this many intervals late are flagged overdue. */
const OVERDUE_INTERVALS = 2;

/** @param {{ data: Record<string, any> }} ctx */
const posLookup = (ctx) => (/** @type {string} */ id) => /** @type {Vec3} */ (ctx.data.catalog.get(id).pos);

/**
 * What an empire's capital knows now.
 * @param {import('../sim/world.js').World} world
 * @param {{ now: number, data: Record<string, any> }} ctx
 * @param {string} empire
 * @returns {Picture}
 */
export function knowledgePicture(world, ctx, empire) {
  const now = ctx.now;
  const posOf = posLookup(ctx);
  const emp = empireState(world).empires[empire];
  const k = knowledgeOf(world, empire);

  /** @type {PicSystem[]} */
  const systems = [];
  for (const [id, e] of Object.entries(k.systems)) {
    if (!e.data.owner) continue;
    const ours = e.data.owner === empire;
    systems.push({
      id, owner: e.data.owner, relay: e.data.relay, validAt: e.validAt, receivedAt: e.receivedAt, age: now - e.validAt,
      overdue: ours && id !== emp.capital && now - e.receivedAt > OVERDUE_INTERVALS * emp.reportInterval, via: e.via, hops: e.hops,
    });
  }
  const relays = systems.filter((s) => s.owner === empire && s.relay === 'ok').map((s) => s.id);
  const net = createNetwork({ capital: emp.capital, range: emp.relayRange, relays, fleets: [], posOf });

  const sightings = sightingsOf(world, empire)
    .filter((s) => now - s.emittedAt <= SIGHTING_MEMORY)
    .map((s) => ({ id: s.id, pos: s.pos, motion: s.motion, phase: s.phase, fleetEmpire: s.fleetEmpire, own: s.fleetEmpire === empire, near: s.near, observer: s.observer, emittedAt: s.emittedAt, receivedAt: s.receivedAt, age: now - s.emittedAt }));

  /** @type {PicFleet[]} */
  const fleets = [];
  for (const [id, e] of Object.entries(k.fleets)) {
    const f = e.data;
    if (f.status === 'gone' || f.status === 'disbanded') continue; // left (whereabouts unknown), or no longer exists
    const age = now - e.validAt;
    const live = e.via === 'ansible' || (f.status === 'docked' && f.at === emp.capital);
    const base = { id, name: f.name, empire: f.empire, role: f.role ?? 'generic', validAt: e.validAt, age, ansible: f.ansible, courier: f.courier, burning: null };
    if (f.status === 'docked') {
      const p = posOf(f.at);
      fleets.push({ ...base, pos: p, confirmedPos: p, path: [], wormholeJumps: [], at: f.at, dest: null, eta: null, certainty: live ? 'live' : 'confirmed', brakingSeenAt: null });
      continue;
    }
    const legs = f.legs;
    const eta = legs[legs.length - 1].arriveAt;
    const braking = sightings.find((s) => s.own && s.phase === 'braking' && s.near === f.dest && s.emittedAt >= legs[0].departAt);
    fleets.push({
      ...base, pos: positionOnLegs(legs, now), confirmedPos: positionOnLegs(legs, e.validAt), path: remainingPath(legs, now),
      wormholeJumps: wormholeJumps(legs, now), at: null, dest: f.dest, eta,
      certainty: live ? 'live' : now >= eta ? 'unconfirmed' : 'expected',
      brakingSeenAt: braking ? braking.emittedAt : null,
    });
  }

  // The capital knows what it sent and the route it expected; not what happened on the way.
  /** @type {PicMessage[]} */
  const messages = [];
  for (const msg of Object.values(infoState(world).messages)) {
    if (msg.empire !== empire || msg.origin !== emp.capital) continue;
    const nodes = (msg.planned?.nodes ?? [msg.origin]).filter((n) => !isFleetNode(n));
    const p = alongNodes(nodes.map(posOf), now - msg.createdAt);
    messages.push({ id: msg.id, kind: msg.kind, pos: p.pos, fromPos: p.from, toPos: p.to, stalled: !msg.planned });
  }

  return {
    mode: 'knowledge', empire, now, capital: emp.capital, range: emp.relayRange,
    systems, explored: Object.keys(k.explored), relays, links: net.links(), fleets, messages, sightings,
    wormholes: wormholes(world).map(({ id, a, b }) => ({ id, a, b })),
  };
}

/**
 * The real state of the galaxy (all empires). `empire` sets range, capital and exploration.
 * @param {import('../sim/world.js').World} world
 * @param {{ now: number, data: Record<string, any> }} ctx
 * @param {string} empire
 * @returns {Picture}
 */
export function truthPicture(world, ctx, empire) {
  const now = ctx.now;
  const posOf = posLookup(ctx);
  const es = empireState(world);
  const emp = es.empires[empire];
  const systems = Object.entries(es.presence).map(([id, p]) => ({ id, owner: p.empire, relay: p.relay, validAt: now, receivedAt: now, age: 0, overdue: false, via: 'truth', hops: 0 }));
  const net = truthNetwork(world, ctx, empire);

  /** @type {PicFleet[]} */
  const fleets = Object.values(fleetState(world).fleets).map((f) => {
    const p = fleetPosition(f, now, posOf);
    return {
      id: f.id, name: f.name, empire: f.empire, role: f.role, pos: p, confirmedPos: p, path: f.status === 'transit' ? remainingPath(f.legs, now) : [],
      wormholeJumps: wormholeJumps(f.legs, now), at: f.at, dest: f.dest, eta: f.legs.length ? f.legs[f.legs.length - 1].arriveAt : null,
      certainty: 'actual', validAt: now, age: 0, ansible: f.ansible, courier: f.courier, burning: burnPhase(f.legs, now), brakingSeenAt: null,
    };
  });

  const messages = Object.values(infoState(world).messages).map((msg) => {
    const hop = msg.hops[msg.hops.length - 1];
    if (msg.status !== 'transit' || !hop) {
      const here = isFleetNode(msg.at) ? net.posOf(msg.at) : posOf(msg.at);
      return { id: msg.id, kind: msg.kind, pos: here, fromPos: here, toPos: here, stalled: msg.status === 'stalled' };
    }
    const span = hop.arriveAt - hop.departAt;
    const t = span > 0 ? Math.min(1, Math.max(0, (now - hop.departAt) / span)) : 1;
    return { id: msg.id, kind: msg.kind, pos: lerp(hop.fromPos, hop.toPos, t), fromPos: hop.fromPos, toPos: hop.toPos, stalled: false };
  });

  return {
    mode: 'truth', empire, now, capital: emp.capital, range: emp.relayRange,
    systems, explored: Object.keys(es.explored[empire] ?? {}), relays: [...net.relays], links: net.links(), fleets, messages, sightings: [],
    wormholes: wormholes(world).map(({ id, a, b }) => ({ id, a, b })),
  };
}

/**
 * Engines firing at time `t`, if any.
 * @param {import('../fleet/legs.js').Leg[]} legs @param {number} t
 * @returns {'accelerating' | 'braking' | null}
 */
export function burnPhase(legs, t) {
  const leg = currentLeg(legs, t);
  if (!leg || leg.kind === 'wormhole') return null;
  if (leg.kind === 'brake') return 'braking';
  const dt = t - leg.departAt;
  if (dt < leg.profile.burnTime) return 'accelerating';
  if (dt >= leg.profile.brakeStart) return 'braking';
  return null;
}

/**
 * Points still ahead on a trip (current position, then each leg end), skipping wormhole jumps.
 * @param {import('../fleet/legs.js').Leg[]} legs @param {number} now @returns {Vec3[]}
 */
function remainingPath(legs, now) {
  const pts = [positionOnLegs(legs, now)];
  for (const leg of legs) {
    if (leg.arriveAt <= now || leg.kind === 'wormhole') continue;
    pts.push(leg.toPos);
  }
  return pts;
}

/** @param {import('../fleet/legs.js').Leg[]} legs @param {number} now @returns {[Vec3, Vec3][]} */
const wormholeJumps = (legs, now) => legs.filter((l) => l.kind === 'wormhole' && l.arriveAt >= now).map((l) => [l.fromPos, l.toPos]);

/**
 * Point `elapsed` light-years along a polyline (c = 1).
 * @param {Vec3[]} pts @param {number} elapsed
 */
function alongNodes(pts, elapsed) {
  let left = elapsed;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distance(pts[i], pts[i + 1]);
    if (left <= d) return { pos: lerp(pts[i], pts[i + 1], d > 0 ? left / d : 1), from: pts[i], to: pts[i + 1] };
    left -= d;
  }
  const last = pts[pts.length - 1];
  return { pos: last, from: pts[Math.max(0, pts.length - 2)], to: last };
}
