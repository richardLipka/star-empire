// @ts-check
import { defineModule } from '../sim/module.js';
import { hashUnit } from '../core/rng.js';
import { empireState } from '../empire/module.js';
import { fleetState, fleetPosition } from '../fleet/module.js';
import { createNetwork, isFleetNode } from './network.js';
import { emptyKnowledge, recordEntry, logDispatch } from './knowledge.js';

/**
 * Messages at light speed, relay routing, and what each capital knows.
 *
 * @typedef {import('./network.js').RouteHop & { departAt: number, arriveAt: number, fromPos: import('../core/vec3.js').Vec3, toPos: import('../core/vec3.js').Vec3 }} Hop
 * @typedef {object} Message
 * @property {string} id
 * @property {string} empire
 * @property {'report' | 'fleetReport' | 'directive' | 'fleetOrder' | 'note'} kind
 * @property {string} origin     node where it was created
 * @property {string} target     system or fleet id
 * @property {number} createdAt
 * @property {number} validAt    when the carried information was true
 * @property {any} payload
 * @property {string} at         node where it is now (or last was)
 * @property {'transit' | 'stalled' | 'carried'} status
 * @property {Hop[]} hops        hops taken so far (the last may be in progress)
 * @property {import('./knowledge.js').Via} via
 * @property {{ nodes: string[], delay: number } | null} planned  route as planned at sending
 */

/** @typedef {{ messages: Record<string, Message>, knowledge: Record<string, import('./knowledge.js').Knowledge>, reporting: Record<string, boolean>, delivered: number, lost: number, pauseOnDispatch: boolean }} InfoState */

/** @param {import('../sim/world.js').World} world @returns {InfoState} */
export const infoState = (world) => world.state.info;

/** Messages to the capital that could not be sent because the system is silent. */
const MISSED = 'missed';

export const infoModule = defineModule({
  id: 'info',
  dependsOn: ['galaxy', 'empire', 'wormholes', 'fleet'],
  initState: () => /** @type {InfoState} */ ({ messages: {}, knowledge: {}, reporting: {}, delivered: 0, lost: 0, pauseOnDispatch: false }),

  tick(world, _dt, ctx) {
    // The capital knows its own system and anything linked by ansible without delay.
    for (const emp of Object.values(empireState(world).empires)) {
      const k = knowledgeOf(world, emp.id);
      recordEntry(k.systems, emp.capital, { validAt: ctx.now, receivedAt: ctx.now, via: 'capital', hops: 0, data: systemSnapshot(world, emp.capital) });
      for (const f of Object.values(fleetState(world).fleets)) {
        if (f.empire !== emp.id) continue;
        const instant = f.ansible || f.at === emp.capital;
        if (instant) recordEntry(k.fleets, f.id, { validAt: ctx.now, receivedAt: ctx.now, via: f.ansible ? 'ansible' : 'capital', hops: 0, data: fleetSnapshot(f) });
      }
    }
  },

  handlers: {
    'info/hop'(world, { message }, ctx) {
      const msg = infoState(world).messages[message];
      if (!msg) return;
      msg.at = msg.hops[msg.hops.length - 1].to;
      advance(world, ctx, msg);
    },
    'info/report'(world, { system }, ctx) {
      const st = infoState(world);
      const p = empireState(world).presence[system];
      if (!p) {
        delete st.reporting[system];
        return;
      }
      const emp = empireState(world).empires[p.empire];
      if (system !== emp.capital) {
        const net = truthNetwork(world, ctx, p.empire);
        if (net.route(system, emp.capital)) {
          send(world, ctx, { empire: p.empire, kind: 'report', origin: system, target: emp.capital, payload: { system, data: systemSnapshot(world, system) } });
        } else {
          ctx.notify('info/' + MISSED, { system });
        }
      }
      ctx.scheduleIn(emp.reportInterval, 'info/report', { system });
    },
  },

  listeners: {
    'empire/presenceChanged'(world, { system, empire }, ctx) {
      const st = infoState(world);
      if (st.reporting[system]) return;
      st.reporting[system] = true;
      const interval = empireState(world).empires[empire].reportInterval;
      ctx.scheduleIn(hashUnit(world.seed, `report:${system}`) * interval, 'info/report', { system });
    },
    'info/networkChanged'(world, { empire }, ctx) {
      for (const msg of Object.values(infoState(world).messages)) {
        if (msg.empire === empire && msg.status === 'stalled') advance(world, ctx, msg);
      }
    },
    'fleet/launched'(world, { fleet: id, system }, ctx) {
      const f = fleetState(world).fleets[id];
      reportFleet(world, ctx, f, system);
      if (f.courier) loadCourier(world, ctx, f, system);
    },
    'fleet/arrived'(world, { fleet: id, system }, ctx) {
      const f = fleetState(world).fleets[id];
      if (f.courier) unloadCourier(world, ctx, f, system);
      reportFleet(world, ctx, f, system);
    },
  },
});

/** @param {import('../sim/world.js').World} world @param {string} empire */
export function knowledgeOf(world, empire) {
  const st = infoState(world);
  return (st.knowledge[empire] ??= emptyKnowledge());
}

/**
 * The empire's real communication network right now.
 * @param {import('../sim/world.js').World} world
 * @param {{ now: number, data: Record<string, any> }} ctx
 * @param {string} empire
 */
export function truthNetwork(world, ctx, empire) {
  const es = empireState(world);
  const emp = es.empires[empire];
  const posOf = (/** @type {string} */ id) => ctx.data.catalog.get(id).pos;
  const relays = Object.entries(es.presence).filter(([, p]) => p.empire === empire && p.relay === 'ok').map(([s]) => s);
  const fleets = Object.values(fleetState(world).fleets)
    .filter((f) => f.empire === empire)
    .map((f) => ({ id: f.id, ansible: f.ansible, dockedAt: f.status === 'docked' ? f.at : null, pos: fleetPosition(f, ctx.now, posOf) }));
  return createNetwork({ capital: emp.capital, range: emp.relayRange, relays, fleets, posOf });
}

/**
 * Create a message at `origin` and start it on its way.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, kind: Message['kind'], origin: string, target: string, payload?: any, validAt?: number, via?: import('./knowledge.js').Via }} p
 */
export function send(world, ctx, { empire, kind, origin, target, payload = null, validAt = ctx.now, via = 'relay' }) {
  const route = truthNetwork(world, ctx, empire).route(origin, target);
  /** @type {Message} */
  const msg = {
    id: ctx.newId('msg'), empire, kind, origin, target, createdAt: ctx.now, validAt, payload,
    at: origin, status: 'transit', hops: [], via, planned: route ? { nodes: route.nodes, delay: route.delay } : null,
  };
  infoState(world).messages[msg.id] = msg;
  ctx.notify('info/sent', { message: msg.id });
  advance(world, ctx, msg);
  return msg;
}

/**
 * Move a message on from where it is: deliver, take the next hop, or wait.
 * Routing is recomputed at every node, so the network adapts to losses.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {Message} msg
 */
function advance(world, ctx, msg) {
  if (msg.at === msg.target) return deliver(world, ctx, msg);
  const net = truthNetwork(world, ctx, msg.empire);
  const route = net.route(msg.at, msg.target);
  if (!route) {
    if (isFleetNode(msg.target)) return lose(world, ctx, msg, 'target fleet unreachable');
    msg.status = 'stalled';
    return;
  }
  const hop = route.hops[0];
  if (hop.kind === 'ansible') msg.via = 'ansible';
  msg.status = 'transit';
  msg.hops.push({ ...hop, departAt: ctx.now, arriveAt: ctx.now + hop.delay, fromPos: net.posOf(hop.from), toPos: net.posOf(hop.to) });
  ctx.scheduleIn(hop.delay, 'info/hop', { message: msg.id });
}

/** @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {Message} msg @param {string} reason */
function lose(world, ctx, msg, reason) {
  delete infoState(world).messages[msg.id];
  infoState(world).lost++;
  ctx.notify('info/lost', { message: msg, reason });
}

/** @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {Message} msg */
function deliver(world, ctx, msg) {
  const st = infoState(world);
  delete st.messages[msg.id];
  st.delivered++;
  const emp = empireState(world).empires[msg.empire];
  const k = knowledgeOf(world, msg.empire);
  const hops = msg.hops.filter((h) => h.kind === 'radio').length;
  const entry = { validAt: msg.validAt, receivedAt: ctx.now, via: msg.via, hops };
  const dispatch = (/** @type {string} */ subject, /** @type {string} */ text) => {
    logDispatch(k, { id: msg.id, kind: msg.kind, subject, text, validAt: msg.validAt, receivedAt: ctx.now, via: msg.via, hops });
    if (st.pauseOnDispatch) ctx.requestPause(text);
  };

  if (msg.target === emp.capital) {
    if (msg.kind === 'report') {
      recordEntry(k.systems, msg.payload.system, { ...entry, data: msg.payload.data });
    } else if (msg.kind === 'fleetReport') {
      recordEntry(k.fleets, msg.payload.fleet.id, { ...entry, data: msg.payload.fleet });
      dispatch(msg.payload.fleet.id, `${msg.payload.fleet.name} ${msg.payload.event} ${msg.payload.systemName}`);
      recordEntry(k.systems, msg.payload.system, { ...entry, data: msg.payload.systemData });
    } else if (msg.kind === 'note') {
      dispatch(msg.origin, msg.payload?.text ?? 'message');
    }
  }
  ctx.notify('info/delivered', { message: msg });
}

/**
 * Status of a system as its governor would report it.
 * @param {import('../sim/world.js').World} world @param {string} system
 */
export function systemSnapshot(world, system) {
  const p = empireState(world).presence[system];
  const docked = Object.values(fleetState(world).fleets).filter((f) => f.status === 'docked' && f.at === system).map((f) => f.id);
  return { owner: p?.empire ?? null, relay: p?.relay ?? 'none', docked };
}

/** @param {import('../fleet/module.js').Fleet} f */
export const fleetSnapshot = (f) => JSON.parse(JSON.stringify({ id: f.id, name: f.name, empire: f.empire, status: f.status, at: f.at, dest: f.dest, legs: f.legs, ansible: f.ansible, courier: f.courier, drive: f.drive }));

/**
 * Departure or arrival report from the system where it happened.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system
 */
function reportFleet(world, ctx, f, system) {
  const emp = empireState(world).empires[f.empire];
  const event = f.status === 'docked' ? 'arrived at' : 'departed';
  send(world, ctx, {
    empire: f.empire, kind: 'fleetReport', origin: system, target: emp.capital,
    payload: { fleet: fleetSnapshot(f), event, system, systemName: ctx.data.catalog.get(system).name, systemData: systemSnapshot(world, system) },
  });
}

/**
 * A courier takes the system's latest status and its waiting messages aboard.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system
 */
function loadCourier(world, ctx, f, system) {
  const emp = empireState(world).empires[f.empire];
  f.cargo.reports.push({ system, validAt: ctx.now, data: systemSnapshot(world, system) });
  for (const msg of Object.values(infoState(world).messages)) {
    if (msg.empire === f.empire && msg.status === 'stalled' && msg.at === system) {
      msg.status = 'carried';
      f.cargo.messages.push(msg.id);
    }
  }
  if (emp.capital === system) f.cargo.reports.length = 0; // the capital needs no report of itself
}

/**
 * At the destination, cargo enters the relay network from there.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system
 */
function unloadCourier(world, ctx, f, system) {
  const emp = empireState(world).empires[f.empire];
  for (const r of f.cargo.reports) {
    send(world, ctx, { empire: f.empire, kind: 'report', origin: system, target: emp.capital, validAt: r.validAt, via: 'courier', payload: { system: r.system, data: r.data } });
  }
  for (const id of f.cargo.messages) {
    const msg = infoState(world).messages[id];
    if (!msg) continue;
    msg.at = system;
    msg.via = 'courier';
    advance(world, ctx, msg);
  }
  f.cargo = { reports: [], messages: [] };
}
