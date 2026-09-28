// @ts-check
import { defineModule } from '../sim/module.js';
import { GameError } from '../core/errors.js';
import { bump, NETWORK } from '../core/versions.js';

/**
 * Empires and their presence in star systems. In M3 presence is only an
 * outpost with an optional relay station; the people living there are the
 * colony module's state (src/colony).
 *
 * @typedef {object} Empire
 * @property {string} id            faction letter (the display name is a translation)
 * @property {string} capital       system id of the seat of government
 * @property {number} relayRange    ly a relay can reach (technology)
 * @property {number} reportInterval years between routine status reports
 * @property {string | null} [parent]   the empire an independent polity broke away from
 * @property {number} [founded]         game time it came into being
 * @property {number | null} [dissolvedAt]  when it lost its last system
 *
 * @typedef {object} Presence
 * @property {string} empire
 * @property {'ok' | 'destroyed' | 'none'} relay
 * @property {number} since         game time of founding
 * @property {'routine' | 'frequent' | 'silent'} reporting  set by the governor's reporting directive
 * @property {import('../research/effects.js').Capabilities} [capabilities]  what the technologies known here allow (set by research)
 */

export const empireModule = defineModule({
  id: 'empire',
  dependsOn: ['galaxy'],
  initState: () => ({
    /** @type {Record<string, Empire>} */
    empires: {},
    /** @type {Record<string, Presence>} systemId → presence */
    presence: {},
    /** @type {Record<string, Record<string, number>>} empire → systemId → time of first visit (truth) */
    explored: {},
    /** how many polities have broken away so far */
    nextIndependent: 1,
  }),
});

/**
 * @typedef {{ empires: Record<string, Empire>, presence: Record<string, Presence>, explored: Record<string, Record<string, number>>, nextIndependent: number }} EmpireState
 * @param {import('../sim/world.js').World} world
 * @returns {EmpireState}
 */
export const empireState = (world) => world.state.empire;

/**
 * Record that an empire has been to a system (truth; the capital learns it by report).
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} system @param {number} time
 */
export function markExplored(world, empire, system, time) {
  const table = (empireState(world).explored[empire] ??= {});
  if (table[system] === undefined) table[system] = time;
}

/**
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ id: string, capital: string, relayRange?: number, reportInterval?: number }} opts
 */
export function createEmpire(world, ctx, { id, capital, relayRange = 20, reportInterval = 1 }) {
  const st = empireState(world);
  if (st.empires[id]) throw new Error(`Empire ${id} exists`);
  st.empires[id] = { id, capital, relayRange, reportInterval, parent: null, founded: ctx.now, dissolvedAt: null };
  establishPresence(world, ctx, { empire: id, system: capital, relay: true });
  return st.empires[id];
}

/**
 * Found an outpost (sandbox / scenario action; colonisation proper comes in M5).
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, system: string, relay?: boolean }} opts
 */
export function establishPresence(world, ctx, { empire, system, relay = true }) {
  const st = empireState(world);
  if (!st.empires[empire]) throw new Error(`Unknown empire ${empire}`);
  const existing = st.presence[system];
  if (existing && existing.empire !== empire) throw new GameError('systemHeld', { system, empire: existing.empire });
  st.presence[system] = { empire, relay: relay ? 'ok' : 'none', since: ctx.now, reporting: 'routine' };
  bump(world, NETWORK);
  markExplored(world, empire, system, ctx.now);
  ctx.notify('empire/presenceChanged', { system, empire });
  ctx.notify('info/networkChanged', { empire });
}

/** Faction letters for polities that break away (A and B are the starting empires). */
const LETTERS = 'CDEFGHJKLMNPQRSTUVWXYZ';

/**
 * The id the next independent polity will get: the next free letter.
 * @param {import('../sim/world.js').World} world
 */
export function nextPolityId(world) {
  const st = empireState(world);
  for (const l of LETTERS) if (!st.empires[l]) return l;
  return `X${st.nextIndependent}`;
}

/** @param {import('../sim/world.js').World} world @param {string} id */
export const isIndependent = (world, id) => !!empireState(world).empires[id]?.parent;

/**
 * A colony breaks away: a new independent polity with its seat there. The
 * people, their knowledge and their governor stay; only the allegiance changes.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string }} p
 * @returns {string} the new polity's id
 */
export function declareIndependence(world, ctx, { system }) {
  const st = empireState(world);
  const p = st.presence[system];
  if (!p) throw new GameError('noPresence', { system });
  const parent = st.empires[p.empire];
  if (parent.capital === system) throw new Error('A capital cannot secede');
  const id = nextPolityId(world);
  st.nextIndependent++;
  st.empires[id] = { id, capital: system, relayRange: parent.relayRange, reportInterval: parent.reportInterval, parent: parent.id, founded: ctx.now, dissolvedAt: null };
  st.explored[id] = { ...(st.explored[parent.id] ?? {}) }; // they share the old survey records
  transferPresence(world, ctx, { system, empire: id });
  return id;
}

/**
 * A system changes hands with its people (secession, later conquest).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, empire: string }} p
 */
export function transferPresence(world, ctx, { system, empire }) {
  const st = empireState(world);
  const p = st.presence[system];
  if (!p) throw new GameError('noPresence', { system });
  const from = p.empire;
  p.empire = empire;
  p.reporting = 'routine';
  bump(world, NETWORK);
  markExplored(world, empire, system, ctx.now);
  ctx.notify('empire/presenceChanged', { system, empire, from });
  ctx.notify('info/networkChanged', { empire: from });
  ctx.notify('info/networkChanged', { empire });
}

/**
 * An empire with no system left dissolves (its history remains).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 */
export function checkDissolution(world, ctx) {
  const st = empireState(world);
  const held = new Set(Object.values(st.presence).map((p) => p.empire));
  for (const emp of Object.values(st.empires)) {
    if (emp.dissolvedAt != null || held.has(emp.id)) continue;
    emp.dissolvedAt = ctx.now;
    ctx.notify('empire/dissolved', { empire: emp.id });
  }
}

/**
 * An empire loses a system (its colony died out or was abandoned).
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, reason: string }} opts
 */
export function abandonPresence(world, ctx, { system, reason }) {
  const st = empireState(world);
  const p = st.presence[system];
  if (!p) return;
  delete st.presence[system];
  bump(world, NETWORK);
  ctx.notify('empire/presenceLost', { system, empire: p.empire, reason });
  const emp = st.empires[p.empire];
  if (emp.capital === system) {
    // The seat moves to the nearest system still held (with the archives); with none left, the polity dissolves.
    const here = ctx.data.catalog.get(system).pos;
    const d = (/** @type {string} */ s) => { const q = ctx.data.catalog.get(s).pos; return Math.hypot(q.x - here.x, q.y - here.y, q.z - here.z); };
    const next = Object.entries(st.presence).filter(([, q]) => q.empire === p.empire).map(([s]) => s).sort((a, b) => d(a) - d(b))[0];
    if (next) {
      emp.capital = next;
      ctx.notify('empire/capitalMoved', { empire: p.empire, from: system, to: next });
    } else {
      checkDissolution(world, ctx);
    }
  }
  ctx.notify('info/networkChanged', { empire: p.empire });
}

/**
 * Destroy or rebuild a system's relay. A system without a relay still receives.
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, state: 'ok' | 'destroyed' }} opts
 */
export function setRelay(world, ctx, { system, state }) {
  const p = empireState(world).presence[system];
  if (!p) throw new GameError('noPresence', { system });
  p.relay = state;
  bump(world, NETWORK);
  ctx.notify('info/networkChanged', { empire: p.empire });
}
