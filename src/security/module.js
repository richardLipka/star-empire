// @ts-check
import { defineModule } from '../sim/module.js';
import securityData from '../data/security.json';
import { empireState } from '../empire/module.js';
import { infoState, knowledgeOf, send, recordDispatch, absorbSystemReport } from '../info/module.js';
import { recordEntry } from '../info/knowledge.js';
import { acquireTech, labs } from '../research/module.js';
import { hasTech } from '../research/catalog.js';
import { distance, toSegment } from '../core/vec3.js';

/**
 * Communication security (see docs/SECURITY.md).
 *
 * Relay beams spill. A radio hop can be overheard by any system held by
 * another empire that lies within the beam's spill of its path:
 *   spillLy × the transmitting relay's beam.spill + the listener's intercept.range.
 * The light of the passing beam reaches the listener; it reads the content if
 * its decryption level is at least the cipher level of the message's origin,
 * otherwise it learns only that traffic passed between two systems (which
 * betrays both). What was learnt goes home as an 'intercept' report, itself
 * a radio message that can be overheard in turn.
 *
 * Couriers (ships) and ansibles cannot be overheard: slower, or rarer, but safe.
 *
 * @typedef {object} Intercept
 * @property {string} id
 * @property {string} listener       our system that overheard it
 * @property {string} senderEmpire
 * @property {string} from           transmitting relay
 * @property {string} to             receiving system of that hop
 * @property {string} kind           message kind
 * @property {boolean} readable
 * @property {number} validAt        when the beam passed
 * @property {number} receivedAt     when the capital learnt of it
 * @property {{ type: string, params: Record<string, any> } | null} directive  if an order was read
 * @property {string[]} techs        if blueprints were read
 */

export const SPILL_LY = securityData.spillLy;
const MEMORY = securityData.memory;

export const securityModule = defineModule({
  id: 'security',
  dependsOn: ['empire', 'info', 'research'],
  initState: () => ({
    /** @type {Record<string, Intercept[]>} empire → what its capital has overheard */
    intercepts: {},
    /** @type {Record<string, Record<string, boolean>>} empire → "sender|from|to" traffic links already reported */
    links: {},
  }),

  listeners: {
    'info/hopStarted'(world, { message: id, hop: index }, ctx) {
      const msg = infoState(world).messages[id];
      const hop = msg?.hops[index];
      if (!hop) return;
      const presence = empireState(world).presence;
      const spill = SPILL_LY * (presence[hop.from]?.capabilities?.beamSpill ?? 1);
      for (const [listener, p] of Object.entries(presence)) {
        if (p.empire === msg.empire) continue;
        const reach = spill + (p.capabilities?.interceptRange ?? 0);
        const near = toSegment(ctx.data.catalog.get(listener).pos, hop.fromPos, hop.toPos);
        if (near.distance > reach) continue;
        // The beam's light: along the path to the nearest point, then across to the listener.
        const heardAt = hop.departAt + distance(hop.fromPos, near.closest) + near.distance;
        ctx.scheduleAt(heardAt, 'security/overheard', {
          listener, listenerEmpire: p.empire, senderEmpire: msg.empire, from: hop.from, to: hop.to,
          kind: msg.kind, cipher: msg.cipher ?? 0, validAt: hop.departAt,
          content: JSON.parse(JSON.stringify(msg.payload ?? null)),
        });
      }
    },
    'info/delivered'(world, { message }, ctx) {
      if (message.kind !== 'intercept') return;
      const capital = empireState(world).empires[message.empire].capital;
      if (message.target === capital) absorb(world, ctx, message.empire, { ...message.payload, receivedAt: ctx.now, id: message.id });
    },
  },

  handlers: {
    'security/overheard'(world, e, ctx) {
      const p = empireState(world).presence[e.listener];
      if (!p || p.empire !== e.listenerEmpire) return; // the listening post is gone
      const readable = (p.capabilities?.decrypt ?? 0) >= e.cipher;
      const report = {
        listener: e.listener, senderEmpire: e.senderEmpire, from: e.from, to: e.to, kind: e.kind, readable, validAt: e.validAt,
        content: readable ? e.content : null,
      };
      const capital = empireState(world).empires[p.empire].capital;
      send(world, ctx, { empire: p.empire, kind: 'intercept', origin: e.listener, target: capital, validAt: e.validAt, payload: report });
    },
  },
});

/**
 * The capital takes in an interception: traffic analysis always, content if read.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {any} r
 */
function absorb(world, ctx, empire, r) {
  const k = knowledgeOf(world, empire);
  const entry = { validAt: r.validAt, receivedAt: r.receivedAt, via: /** @type {const} */ ('intercept'), hops: 0 };
  const ours = (/** @type {string} */ s) => empireState(world).presence[s]?.empire === empire && k.systems[s]?.data.owner === empire;

  // Traffic analysis: a transmitting relay betrays its owner; so does the receiver.
  for (const [system, relay] of [[r.from, 'ok'], [r.to, 'none']]) {
    if (system.startsWith('fleet-') || ours(system)) continue;
    const old = k.systems[system];
    if (!old || old.validAt < r.validAt) {
      recordEntry(k.systems, system, { ...entry, data: { ...(old?.data ?? { docked: [], reporting: 'routine' }), owner: r.senderEmpire, relay: old?.data.relay === 'ok' ? 'ok' : relay } });
    }
  }
  const linkKey = `${r.senderEmpire}|${r.from}|${r.to}`;
  const links = (world.state.security.links[empire] ??= {});
  const newLink = !links[linkKey];
  links[linkKey] = true;

  /** @type {Intercept} */
  const rec = { id: r.id, listener: r.listener, senderEmpire: r.senderEmpire, from: r.from, to: r.to, kind: r.kind, readable: r.readable, validAt: r.validAt, receivedAt: r.receivedAt, directive: null, techs: [] };
  const dispatch = (/** @type {string} */ key, /** @type {Record<string, any>} */ params) => recordDispatch(world, ctx, empire, {
    id: `${r.id}:${key}`, key, params: { empire: r.senderEmpire, from: r.from, to: r.to, ...params }, validAt: r.validAt, receivedAt: r.receivedAt, via: 'intercept', hops: 0,
  });

  if (!r.readable) {
    if (newLink) dispatch('security.overheard', {});
  } else {
    const c = r.content;
    switch (r.kind) {
      case 'report':
        if (c?.system && !ours(c.system)) absorbSystemReport(world, ctx, empire, c.system, entry, c.data);
        if (newLink) dispatch('security.readTraffic', {});
        break;
      case 'fleetReport':
        if (c?.fleet) recordEntry(k.fleets, c.fleet.id, { ...entry, data: c.fleet });
        if (c?.system && c.systemData && !ours(c.system)) absorbSystemReport(world, ctx, empire, c.system, entry, c.systemData);
        dispatch('security.readFleet', { fleet: c?.fleet?.name ?? '', system: c?.system ?? r.from });
        break;
      case 'directive':
        if (c?.type === 'directive') {
          rec.directive = { type: c.directive.type, params: c.directive.params };
          dispatch('security.readOrder', { directive: c.directive.type, system: r.to });
        }
        break;
      case 'blueprint': {
        const capital = empireState(world).empires[empire].capital;
        const lab = labs(world)[capital];
        for (const id of c?.techs ?? []) {
          if (!hasTech(id) || !lab || id in lab.known) continue;
          rec.techs.push(id);
          acquireTech(world, ctx, { empire, system: capital, tech: id, how: 'espionage' });
        }
        if (rec.techs.length) dispatch('security.stoleTech', { tech: rec.techs[0] });
        break;
      }
      default:
        if (newLink) dispatch('security.readTraffic', {});
    }
  }
  const list = (world.state.security.intercepts[empire] ??= []);
  list.push(rec);
  if (list.length > MEMORY) list.splice(0, list.length - MEMORY);
}

/** @param {import('../sim/world.js').World} world @param {string} empire @returns {Intercept[]} */
export const interceptsOf = (world, empire) => world.state.security?.intercepts[empire] ?? [];
