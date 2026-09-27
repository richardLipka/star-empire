// @ts-check
import { empireState } from '../empire/module.js';
import { fleetState, fleetPosition } from '../fleet/module.js';
import { positionOnLegs } from '../fleet/legs.js';
import { wormholes } from '../events/wormholes.js';
import { infoState, knowledgeOf, truthNetwork } from '../info/module.js';
import { createNetwork, isFleetNode } from '../info/network.js';
import { distance, lerp } from '../core/vec3.js';

/**
 * A "picture" is everything the map draws, as seen from one perspective:
 * - 'knowledge': what one empire's capital knows now (old, partial, predicted);
 * - 'truth': the real state (sandbox / end-of-game chronicle).
 * Pictures are plain data, so they are testable without a renderer.
 *
 * @typedef {import('../core/vec3.js').Vec3} Vec3
 * @typedef {{ id: string, owner: string, relay: string, validAt: number, receivedAt: number, age: number, overdue: boolean, via: string, hops: number }} PicSystem
 * @typedef {{ id: string, name: string, empire: string, pos: Vec3, confirmedPos: Vec3, path: Vec3[], dest: string | null, status: 'docked' | 'transit' | 'unconfirmed',
 *             at: string | null, validAt: number, age: number, eta: number | null, ansible: boolean, courier: boolean, live: boolean, wormholeJumps: [Vec3, Vec3][] }} PicFleet
 * @typedef {{ id: string, kind: string, pos: Vec3, fromPos: Vec3, toPos: Vec3, stalled: boolean }} PicMessage
 * @typedef {object} Picture
 * @property {'knowledge' | 'truth'} mode
 * @property {string} empire
 * @property {number} now
 * @property {string} capital
 * @property {number} range
 * @property {PicSystem[]} systems
 * @property {string[]} relays
 * @property {[string, string, number][]} links
 * @property {PicFleet[]} fleets
 * @property {PicMessage[]} messages
 * @property {{ id: string, a: string, b: string }[]} wormholes
 */

/** Reports older than this many report intervals past due are flagged overdue. */
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
    const isCapital = id === emp.capital;
    systems.push({
      id, owner: e.data.owner, relay: e.data.relay, validAt: e.validAt, receivedAt: e.receivedAt, age: now - e.validAt,
      overdue: !isCapital && now - e.receivedAt > OVERDUE_INTERVALS * emp.reportInterval, via: e.via, hops: e.hops,
    });
  }
  const relays = systems.filter((s) => s.owner === empire && s.relay === 'ok').map((s) => s.id);
  const net = createNetwork({ capital: emp.capital, range: emp.relayRange, relays, fleets: [], posOf });

  /** @type {PicFleet[]} */
  const fleets = [];
  for (const [id, e] of Object.entries(k.fleets)) {
    const f = e.data;
    const age = now - e.validAt;
    const live = e.via === 'ansible' || (f.status === 'docked' && f.at === emp.capital);
    if (f.status === 'docked') {
      const p = posOf(f.at);
      fleets.push({ id, name: f.name, empire: f.empire, pos: p, confirmedPos: p, path: [], dest: null, status: 'docked', at: f.at, validAt: e.validAt, age, eta: null, ansible: f.ansible, courier: f.courier, live, wormholeJumps: [] });
      continue;
    }
    const legs = f.legs;
    const eta = legs[legs.length - 1].arriveAt;
    const predicted = positionOnLegs(legs, now);
    fleets.push({
      id, name: f.name, empire: f.empire, pos: predicted, confirmedPos: positionOnLegs(legs, e.validAt), path: remainingPath(legs, now), dest: f.dest,
      status: now >= eta ? 'unconfirmed' : 'transit', at: null, validAt: e.validAt, age, eta, ansible: f.ansible, courier: f.courier, live,
      wormholeJumps: wormholeJumps(legs, now),
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
    systems, relays, links: net.links(), fleets, messages, wormholes: wormholes(world).map(({ id, a, b }) => ({ id, a, b })),
  };
}

/**
 * The real state of the galaxy (all empires), drawn from `empire`'s side for range and capital.
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

  const fleets = Object.values(fleetState(world).fleets).map((f) => {
    const p = fleetPosition(f, now, posOf);
    const eta = f.legs.length ? f.legs[f.legs.length - 1].arriveAt : null;
    return {
      id: f.id, name: f.name, empire: f.empire, pos: p, confirmedPos: p, path: f.status === 'transit' ? remainingPath(f.legs, now) : [], dest: f.dest,
      status: f.status, at: f.at, validAt: now, age: 0, eta, ansible: f.ansible, courier: f.courier, live: true, wormholeJumps: wormholeJumps(f.legs, now),
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
    systems, relays: [...net.relays], links: net.links(), fleets, messages, wormholes: wormholes(world).map(({ id, a, b }) => ({ id, a, b })),
  };
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
