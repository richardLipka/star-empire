// @ts-check
import { defineModule } from '../sim/module.js';
import { hashUnit } from '../core/rng.js';
import { empireState, setRelay } from '../empire/module.js';
import { fleetState } from '../fleet/module.js';
import { extendSystemSnapshot } from '../info/module.js';
import { directiveDef, normalizeParams, CAPACITY, PRIORITY_RANK, ALL_DIRECTIVES } from './catalog.js';
import { GameError } from '../core/errors.js';
import { BEHAVIOURS, MISSIONS } from './behaviours/index.js';
import { DEFAULT_SETTINGS, SETTINGS } from './behaviours/settings.js';
import { spend } from '../colony/module.js';
import { retryPendingSends } from './behaviours/fleetSend.js';
import { continueBuilds } from './behaviours/build.js';

/**
 * Governors: one per held system. They keep a book of standing directives
 * received from the capital (each arrives at light speed) and act on them
 * every year. The book travels back to the capital inside routine reports,
 * which is how the capital learns an order has been received.
 *
 * @typedef {object} Directive
 * @property {string} id
 * @property {string} type
 * @property {Record<string, any>} params
 * @property {'low' | 'normal' | 'high'} priority
 * @property {'always' | 'threatSeen' | 'noThreat'} when
 * @property {number | null} expiresAt
 * @property {number} issuedAt
 * @property {number} [receivedAt]
 *
 * @typedef {object} Book
 * @property {string} system
 * @property {string} empire
 * @property {Record<string, Directive>} directives   one per directive type; a newer order replaces an older one
 * @property {string[]} received                      ids of recently received orders (acknowledgements)
 * @property {string[]} [refused]                     ids of orders it would not follow (loyalty)
 * @property {{ nextLaunchAt: number, relayLostAt: number | null, lastThreatAt: number | null, courierDue: Record<string, number>, lastLaunch: Record<string, number>, pendingSends?: Directive[], missionDue?: Record<string, number>, pendingBuilds?: { design: any, count: number, into: string | null }[] }} memory
 * @property {typeof DEFAULT_SETTINGS} settings
 */

const THINK_EVERY = 1;
const RECEIVED_MEMORY = 30;
const ORDER = new Map(ALL_DIRECTIVES.map((d, i) => [d.id, i]));

export const governorsModule = defineModule({
  id: 'governors',
  dependsOn: ['galaxy', 'empire', 'fleet', 'info', 'detection', 'colony', 'ships'],
  initState: () => ({ /** @type {Record<string, Book>} */ books: {}, /** @type {Record<string, Record<string, any>>} */ issued: {} }),

  handlers: {
    'governors/think'(world, { system }, ctx) {
      const book = books(world)[system];
      const p = empireState(world).presence[system];
      if (!book) return;
      if (!p || p.empire !== book.empire) {
        delete books(world)[system]; // the system was lost: so is its governor
        return;
      }
      think(world, ctx, book);
      ctx.scheduleIn(THINK_EVERY, 'governors/think', { system });
    },
  },

  listeners: {
    'empire/presenceChanged'(world, { system, empire }, ctx) {
      const existing = books(world)[system];
      if (existing && existing.empire === empire) return;
      books(world)[system] = {
        system, empire, directives: {}, received: [],
        memory: { nextLaunchAt: ctx.now, relayLostAt: null, lastThreatAt: null, courierDue: {}, lastLaunch: {}, pendingSends: [] },
        settings: { ...DEFAULT_SETTINGS },
      };
      if (!existing) ctx.scheduleIn(hashUnit(world.seed, `governor:${system}`) * THINK_EVERY, 'governors/think', { system });
    },
    'info/delivered'(world, { message }, ctx) {
      if (message.kind === 'directive') receive(world, ctx, message.target, message.empire, message.payload);
    },
    'fleet/arrived'(world, { fleet: id, system }, ctx) {
      const f = fleetState(world).fleets[id];
      const behaviour = f?.mission && MISSIONS[f.mission.kind];
      behaviour?.onArrive?.(world, ctx, f, system);
    },
    'detection/observed'(world, { observer, empire, fleetEmpire }, ctx) {
      const book = books(world)[observer];
      if (book && fleetEmpire !== empire) book.memory.lastThreatAt = ctx.now;
    },
  },
});

/** @param {import('../sim/world.js').World} world @returns {Record<string, Book>} */
export const books = (world) => world.state.governors.books;

/**
 * An order arrives at a system. It lapses if nobody of that empire governs there.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} system @param {string} empire @param {any} payload
 */
function receive(world, ctx, system, empire, payload) {
  const book = books(world)[system];
  if (!book || book.empire !== empire) return;
  book.received.push(payload.type === 'revoke' ? `revoke:${payload.id}` : payload.directive.id);
  if (book.received.length > RECEIVED_MEMORY) book.received.splice(0, book.received.length - RECEIVED_MEMORY);

  if (payload.type === 'revoke') {
    if (book.directives[payload.directiveType]?.id === payload.id) delete book.directives[payload.directiveType];
  } else if (!obeys(world, book, payload.directive)) {
    (book.refused ??= []).push(payload.directive.id);
    if (book.refused.length > RECEIVED_MEMORY) book.refused.splice(0, book.refused.length - RECEIVED_MEMORY);
    ctx.notify('governors/refused', { system, empire, directive: payload.directive.id });
  } else {
    /** @type {Directive} */
    const d = { ...payload.directive, receivedAt: ctx.now };
    const def = directiveDef(d.type);
    const behaviour = BEHAVIOURS[d.type];
    if (def.oneShot) {
      if (active(world, ctx, book, d)) behaviour?.onReceive?.(world, ctx, book, d);
    } else {
      const current = book.directives[d.type];
      if (current && current.issuedAt > d.issuedAt) return; // a newer order of this kind is already in force
      book.directives[d.type] = d;
      behaviour?.onReceive?.(world, ctx, book, d);
    }
  }
  applySettings(world, ctx, book);
  ctx.notify('governors/received', { system, empire });
}

/**
 * Does the governor follow this order? That depends on the colony's loyalty
 * (loyalty module): restless colonies, and governors granted broad autonomy,
 * ignore low-priority orders; autonomous ones accept only governance orders
 * (such as being granted autonomy).
 * @param {import('../sim/world.js').World} world @param {Book} book @param {{ type: string, priority: string }} d
 */
export function obeys(world, book, d) {
  const stage = world.state.loyalty?.records[book.system]?.stage ?? 'loyal';
  if (stage === 'autonomous') return d.type.startsWith('governance.');
  if ((stage === 'restless' || book.settings.autonomy === 'broad') && d.priority === 'low') return false;
  return true;
}

/**
 * Sandbox: put a directive into a governor's book at once, as if it had just
 * arrived (tests and the sandbox tools; players issue directives from the capital).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ system: string, type: string, params?: Record<string, any>, priority?: Directive['priority'], when?: Directive['when'] }} p
 */
export function imposeDirective(world, ctx, { system, type, params = {}, priority = 'normal', when = 'always' }) {
  const book = books(world)[system];
  if (!book) throw new GameError('noPresence', { system });
  const directive = { id: ctx.newId('dir'), type, params: normalizeParams(type, params), priority, when, expiresAt: null, issuedAt: ctx.now };
  receive(world, ctx, system, book.empire, { type: 'directive', directive });
  return directive;
}

/**
 * Is a directive in force right now (not expired, its condition met)?
 * @param {import('../sim/world.js').World} _world @param {import('../sim/module.js').SimContext} ctx @param {Book} book @param {Directive} d
 */
export function active(_world, ctx, book, d) {
  if (d.expiresAt != null && ctx.now >= d.expiresAt) return false;
  const threat = book.memory.lastThreatAt != null && ctx.now - book.memory.lastThreatAt <= CAPACITY.threatMemoryYears;
  if (d.when === 'threatSeen') return threat;
  if (d.when === 'noThreat') return !threat;
  return true;
}

/** @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {Book} book */
function applySettings(world, ctx, book) {
  const settings = { ...DEFAULT_SETTINGS };
  const inForce = Object.values(book.directives).filter((d) => active(world, ctx, book, d)).sort((a, b) => a.issuedAt - b.issuedAt);
  for (const d of inForce) Object.assign(settings, SETTINGS[/** @type {keyof typeof SETTINGS} */ (d.type)]?.(d.params) ?? {});
  book.settings = settings;
  const p = empireState(world).presence[book.system];
  if (p) p.reporting = /** @type {any} */ (settings.reporting);
}

/**
 * The yearly round: drop expired orders, apply settings, repair the relay,
 * run courier schedules, and give the shipyard to the most important proposal.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {Book} book
 */
function think(world, ctx, book) {
  for (const [type, d] of Object.entries(book.directives)) {
    if (d.expiresAt != null && ctx.now >= d.expiresAt) delete book.directives[type];
  }
  applySettings(world, ctx, book);
  repairRelay(world, ctx, book);
  retryPendingSends(world, ctx, book);
  continueBuilds(world, ctx, book);

  // Higher priority first; at equal priority, whichever launched least recently (fair rotation).
  const last = (/** @type {Directive} */ d) => book.memory.lastLaunch[d.type] ?? -Infinity;
  const inForce = Object.values(book.directives)
    .filter((d) => active(world, ctx, book, d))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || last(a) - last(b)
      || /** @type {number} */ (ORDER.get(a.type)) - /** @type {number} */ (ORDER.get(b.type)));

  for (const d of inForce) {
    const b = BEHAVIOURS[d.type];
    if (b?.plan && !b.usesShipyard) b.plan(world, ctx, book, d);
  }
  if (ctx.now < book.memory.nextLaunchAt) return;
  for (const d of inForce) {
    const b = BEHAVIOURS[d.type];
    if (!b?.plan || !b.usesShipyard) continue;
    const proposal = b.plan(world, ctx, book, d);
    if (!proposal || !spend(world, book.system, proposal.cost)) continue; // nothing to do, or not yet affordable
    proposal.run();
    book.memory.lastLaunch[d.type] = ctx.now;
    book.memory.nextLaunchAt = ctx.now + CAPACITY.launchInterval[/** @type {'low' | 'normal' | 'high'} */ (d.params.frequency ?? 'normal')];
    return;
  }
}

/** @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx @param {Book} book */
function repairRelay(world, ctx, book) {
  const p = empireState(world).presence[book.system];
  if (!p || p.relay !== 'destroyed') {
    book.memory.relayLostAt = null;
    return;
  }
  book.memory.relayLostAt ??= ctx.now;
  const policy = /** @type {'fast' | 'normal' | 'never'} */ (book.settings.relayRepair);
  if (policy === 'never') return;
  const years = CAPACITY.relayRepairYears[policy] * (book.settings.posture === 'fortify' ? CAPACITY.fortifyRepairFactor : 1);
  if (ctx.now - book.memory.relayLostAt >= years) {
    setRelay(world, ctx, { system: book.system, state: 'ok' });
    book.memory.relayLostAt = null;
  }
}

// Routine reports carry the governor's book, so the capital learns what is in force.
extendSystemSnapshot((world, system) => {
  const book = world.state.governors?.books[system];
  if (!book) return {};
  // Copies (reports are a snapshot); directive parameters are never changed in place, so a shallow copy is enough.
  return {
    governor: {
      directives: Object.values(book.directives).map(({ id, type, params, priority, when, expiresAt, issuedAt }) => ({ id, type, params: { ...params }, priority, when, expiresAt, issuedAt })),
      received: [...book.received],
      refused: [...(book.refused ?? [])],
      settings: { ...book.settings },
    },
  };
});
