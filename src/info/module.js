// @ts-check
import { defineModule } from '../sim/module.js';
import { hashUnit } from '../core/rng.js';
import { version, NETWORK } from '../core/versions.js';
import { empireState } from '../empire/module.js';
import { fleetState, fleetPosition } from '../fleet/module.js';
import { createNetwork, isFleetNode } from './network.js';
import { emptyKnowledge, recordEntry, recordExplored, logDispatch } from './knowledge.js';

/**
 * Messages at light speed, relay routing, and what each capital knows.
 *
 * @typedef {import('./network.js').RouteHop & { departAt: number, arriveAt: number, fromPos: import('../core/vec3.js').Vec3, toPos: import('../core/vec3.js').Vec3 }} Hop
 * @typedef {object} Message
 * @property {string} id
 * @property {string} empire
 * @property {'report' | 'fleetReport' | 'directive' | 'fleetOrder' | 'note' | 'sighting' | 'blueprint' | 'intercept' | 'colony'} kind
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
 * @property {number} cipher     encryption level at its origin (security)
 */

/** @typedef {{ messages: Record<string, Message>, knowledge: Record<string, import('./knowledge.js').Knowledge>, reporting: Record<string, boolean>, delivered: number, lost: number, pauseOnDispatch: string | null }} InfoState */
/* pauseOnDispatch: the empire (the player's) whose dispatches pause the clock, or null. */

/** @param {import('../sim/world.js').World} world @returns {InfoState} */
export const infoState = (world) => world.state.info;

/** Messages to the capital that could not be sent because the system is silent. */
const MISSED = 'missed';
/** Report interval multiplier per reporting mode (silent systems send nothing). */
const REPORT_FACTOR = { routine: 1, frequent: 0.25, silent: 1 };

/**
 * Other modules add their own fields to system reports (e.g. the governor's
 * directive book). Each extension returns an object merged into the snapshot.
 * @type {((world: import('../sim/world.js').World, system: string) => Record<string, any>)[]}
 */
const snapshotExtensions = [];
/** @param {(world: import('../sim/world.js').World, system: string) => Record<string, any>} fn */
export const extendSystemSnapshot = (fn) => {
  if (!snapshotExtensions.includes(fn)) snapshotExtensions.push(fn);
};

export const infoModule = defineModule({
  id: 'info',
  dependsOn: ['galaxy', 'empire', 'wormholes', 'fleet'],
  initState: () => /** @type {InfoState} */ ({ messages: {}, knowledge: {}, reporting: {}, delivered: 0, lost: 0, pauseOnDispatch: null }),

  tick(world, _dt, ctx) {
    // The capital knows its own system and anything linked by ansible without delay.
    for (const emp of Object.values(empireState(world).empires)) {
      absorbSystemReport(world, ctx, emp.id, emp.capital, { validAt: ctx.now, receivedAt: ctx.now, via: 'capital', hops: 0 }, systemSnapshot(world, emp.capital));
      const k = knowledgeOf(world, emp.id);
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
      const interval = emp.reportInterval * (REPORT_FACTOR[p.reporting] ?? 1);
      if (system !== emp.capital && p.reporting !== 'silent') {
        const net = truthNetwork(world, ctx, p.empire);
        if (net.route(system, emp.capital)) {
          send(world, ctx, { empire: p.empire, kind: 'report', origin: system, target: emp.capital, payload: { system, data: systemSnapshot(world, system) } });
        } else {
          ctx.notify('info/' + MISSED, { system });
        }
      }
      ctx.scheduleIn(interval, 'info/report', { system });
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
      // Only messages that could now leave where they wait are worth routing again.
      const net = truthNetwork(world, ctx, empire);
      for (const msg of Object.values(infoState(world).messages)) {
        if (msg.empire === empire && msg.status === 'stalled' && net.canSend(msg.at)) advance(world, ctx, msg);
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

/**
 * Log notable news at an empire's capital (and auto-pause if the player asked for it).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {import('./knowledge.js').Dispatch} d
 */
export function recordDispatch(world, ctx, empire, d) {
  logDispatch(knowledgeOf(world, empire), d);
  if (infoState(world).pauseOnDispatch === empire) ctx.requestPause({ key: d.key, params: d.params });
}

/** @param {import('../sim/world.js').World} world @param {string} empire */
export function knowledgeOf(world, empire) {
  const st = infoState(world);
  return (st.knowledge[empire] ??= emptyKnowledge());
}

/**
 * Networks are rebuilt only when something changed: cached per world, empire,
 * moment and network version (core/versions.js, bumped wherever relays,
 * presence, docked fleets or relay technology change). Derived data only.
 * @type {WeakMap<object, Map<string, { key: string, net: import('./network.js').Network }>>}
 */
const networkCache = new WeakMap();

/**
 * The empire's real communication network right now.
 * @param {import('../sim/world.js').World} world
 * @param {{ now: number, data: Record<string, any> }} ctx
 * @param {string} empire
 */
export function truthNetwork(world, ctx, empire) {
  let cache = networkCache.get(world);
  if (!cache) networkCache.set(world, (cache = new Map()));
  const key = `${ctx.now}|${version(world, NETWORK)}|${Object.keys(empireState(world).presence).length}`;
  const hit = cache.get(empire);
  if (hit && hit.key === key) return hit.net;
  const net = buildNetwork(world, ctx, empire);
  cache.set(empire, { key, net });
  return net;
}

/** @param {import('../sim/world.js').World} world @param {{ now: number, data: Record<string, any> }} ctx @param {string} empire */
function buildNetwork(world, ctx, empire) {
  const es = empireState(world);
  const emp = es.empires[empire];
  const posOf = (/** @type {string} */ id) => ctx.data.catalog.get(id).pos;
  const relays = Object.entries(es.presence).filter(([, p]) => p.empire === empire && p.relay === 'ok').map(([s]) => s);
  const fleets = Object.values(fleetState(world).fleets)
    .filter((f) => f.empire === empire)
    .map((f) => ({ id: f.id, ansible: f.ansible, transmitter: f.transmitter, dockedAt: f.status === 'docked' ? f.at : null, pos: fleetPosition(f, ctx.now, posOf) }));
  const rangeOf = (/** @type {string} */ s) => emp.relayRange + (es.presence[s]?.empire === empire ? es.presence[s].capabilities?.relayBonus ?? 0 : 0);
  return createNetwork({ capital: emp.capital, range: emp.relayRange, rangeOf, relays, fleets, posOf });
}

/**
 * Create a message at `origin` and start it on its way.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, kind: Message['kind'], origin: string, target: string, payload?: any, validAt?: number, via?: import('./knowledge.js').Via }} p
 */
export function send(world, ctx, { empire, kind, origin, target, payload = null, validAt = ctx.now, via = 'relay' }) {
  const msg = createMessage(world, ctx, { empire, kind, origin, target, payload, validAt, via });
  ctx.notify('info/sent', { message: msg.id });
  advance(world, ctx, msg);
  return msg;
}

/**
 * Create a message without sending it: it waits at `origin` ('stalled') or is
 * handed to a courier ('carried'), which releases it where it lands.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, kind: Message['kind'], origin: string, target: string, payload?: any, validAt?: number, via?: import('./knowledge.js').Via }} p
 * @param {'transit' | 'stalled' | 'carried'} [status]
 */
export function createMessage(world, ctx, { empire, kind, origin, target, payload = null, validAt = ctx.now, via = 'relay' }, status = 'transit') {
  const route = truthNetwork(world, ctx, empire).route(origin, target);
  /** @type {Message} */
  const msg = {
    id: ctx.newId('msg'), empire, kind, origin, target, createdAt: ctx.now, validAt, payload,
    at: origin, status, hops: [], via, planned: route ? { nodes: route.nodes, delay: route.delay } : null,
    cipher: empireState(world).presence[origin]?.capabilities?.cipher ?? 0,
  };
  infoState(world).messages[msg.id] = msg;
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
  // Radio beams spill and can be overheard (security module); local and ansible hand-overs cannot.
  if (hop.kind === 'radio') ctx.notify('info/hopStarted', { message: msg.id, hop: msg.hops.length - 1 });
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
  const dispatch = (/** @type {string} */ key, /** @type {Record<string, string | number>} */ params) =>
    recordDispatch(world, ctx, msg.empire, { id: msg.id, key, params, validAt: msg.validAt, receivedAt: ctx.now, via: msg.via, hops });

  if (msg.target === emp.capital) {
    if (msg.kind === 'report') {
      absorbSystemReport(world, ctx, msg.empire, msg.payload.system, entry, msg.payload.data);
    } else if (msg.kind === 'fleetReport') {
      // The system first, then the fleet's own report, which is the more specific.
      absorbSystemReport(world, ctx, msg.empire, msg.payload.system, entry, msg.payload.systemData);
      recordEntry(k.fleets, msg.payload.fleet.id, { ...entry, data: msg.payload.fleet });
      dispatch(`fleet.${msg.payload.event}`, { fleet: msg.payload.fleet.name, system: msg.payload.system });
    } else if (msg.kind === 'note') {
      dispatch('note', { from: msg.origin, text: msg.payload?.text ?? '' });
    }
  }
  ctx.notify('info/delivered', { message: msg });
}

/**
 * Status of a system as its governor would report it, including every fleet
 * docked there (foreign ones too: they are in plain sight).
 * @param {import('../sim/world.js').World} world @param {string} system
 */
export function systemSnapshot(world, system) {
  const p = empireState(world).presence[system];
  const docked = Object.values(fleetState(world).fleets)
    .filter((f) => f.status === 'docked' && f.at === system)
    .map((f) => ({ id: f.id, empire: f.empire }));
  const base = { owner: p?.empire ?? null, relay: p?.relay ?? 'none', reporting: p?.reporting ?? 'routine', docked };
  return Object.assign(base, ...snapshotExtensions.map((fn) => fn(world, system)));
}

/**
 * Take in a system report: the system itself, its exploration, and the fleets
 * seen docked there. Own fleets are refreshed; foreign fleets are recorded as
 * seen, and marked gone when a newer report no longer lists them.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {string} system
 * @param {{ validAt: number, receivedAt: number, via: import('./knowledge.js').Via, hops: number }} entry
 * @param {ReturnType<typeof systemSnapshot>} data
 */
export function absorbSystemReport(world, ctx, empire, system, entry, data) {
  const k = knowledgeOf(world, empire);
  if (!recordEntry(k.systems, system, { ...entry, data })) return; // older than what we have
  recordExplored(k, system, entry.validAt);
  const listed = new Set(data.docked.map((d) => d.id));
  for (const d of data.docked) {
    const old = k.fleets[d.id];
    if (d.empire === empire) {
      if (old && old.data.status !== 'disbanded') recordEntry(k.fleets, d.id, { ...entry, data: { ...old.data, status: 'docked', at: system, dest: null, legs: [] } });
      continue;
    }
    if (!old || old.data.status !== 'docked' || old.data.at !== system) {
      recordDispatch(world, ctx, empire, { id: `${d.id}@${system}`, key: 'foreignFleetPresent', params: { empire: d.empire, system }, validAt: entry.validAt, receivedAt: entry.receivedAt, via: entry.via, hops: entry.hops });
    }
    recordEntry(k.fleets, d.id, { ...entry, data: { id: d.id, name: null, empire: d.empire, status: 'docked', at: system, dest: null, legs: [], ansible: false, courier: false } });
  }
  for (const [id, e] of Object.entries(k.fleets)) {
    if (e.data.empire === empire || listed.has(id) || e.data.status !== 'docked' || e.data.at !== system) continue;
    recordEntry(k.fleets, id, { ...entry, data: { ...e.data, status: 'gone' } });
  }
}

/** @param {import('../fleet/module.js').Fleet} f */
export const fleetSnapshot = (f) => JSON.parse(JSON.stringify({
  id: f.id, name: f.name, empire: f.empire, status: f.status, at: f.at, dest: f.dest, legs: f.legs,
  ansible: f.ansible, courier: f.courier, transmitter: f.transmitter, role: f.role, drive: f.drive,
}));

/**
 * A fleet's final report before it is disbanded (e.g. a settler founding an outpost).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system @param {string} event
 */
export function reportFleetEvent(world, ctx, f, system, event) {
  const emp = empireState(world).empires[f.empire];
  send(world, ctx, {
    empire: f.empire, kind: 'fleetReport', origin: system, target: emp.capital,
    payload: { fleet: { ...fleetSnapshot(f), status: event === 'settled' ? 'disbanded' : f.status }, event, system, systemData: systemSnapshot(world, system) },
  });
}

/**
 * Departure or arrival report from the system where it happened.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system
 */
function reportFleet(world, ctx, f, system) {
  const emp = empireState(world).empires[f.empire];
  const event = f.status === 'docked' ? 'arrived' : 'departed';
  send(world, ctx, {
    empire: f.empire, kind: 'fleetReport', origin: system, target: emp.capital,
    payload: { fleet: fleetSnapshot(f), event, system, systemData: systemSnapshot(world, system) },
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
