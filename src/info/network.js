// @ts-check
import { distance } from '../core/vec3.js';

/**
 * Communication graph of one empire and shortest-delay routing over it.
 *
 * Rules (DESIGN §3):
 * - A system with a working relay can transmit to any system within relay range.
 *   So can a system where a fleet carrying a relay module (transmitter) is docked.
 * - Every system can receive; a system without a relay cannot pass messages on by radio.
 * - Fleets cannot receive in transit, except fleets carrying an ansible.
 * - Ansibles connect instantly to the hub at the capital (and so to each other).
 * - A docked fleet and its system hand messages over locally (no delay).
 * - Wormholes carry ships, never messages: they are not part of this graph.
 *
 * @typedef {import('../core/vec3.js').Vec3} Vec3
 * @typedef {{ id: string, ansible: boolean, transmitter?: boolean, dockedAt: string | null, pos: Vec3 }} NetFleet
 * @typedef {object} NetworkInput
 * @property {string} capital
 * @property {number} range                 base relay range
 * @property {(system: string) => number} [rangeOf]  range of the relay at a system (technology known there); defaults to `range`
 * @property {Iterable<string>} relays        systems with a working relay
 * @property {NetFleet[]} fleets              the empire's fleets
 * @property {(id: string) => Vec3} posOf     system positions
 *
 * @typedef {{ from: string, to: string, delay: number, kind: 'radio' | 'local' | 'ansible' }} RouteHop
 * @typedef {{ nodes: string[], hops: RouteHop[], delay: number }} Route
 */

export const isFleetNode = (/** @type {string} */ id) => id.startsWith('fleet-');

/** @param {NetworkInput} input */
export function createNetwork(input) {
  const relays = new Set(input.relays);
  const fleets = new Map(input.fleets.map((f) => [f.id, f]));
  /** @type {Map<string, NetFleet[]>} */
  const dockedAt = new Map();
  for (const f of input.fleets) {
    if (!f.dockedAt) continue;
    if (!dockedAt.has(f.dockedAt)) dockedAt.set(f.dockedAt, []);
    /** @type {NetFleet[]} */ (dockedAt.get(f.dockedAt)).push(f);
  }
  const ansibles = input.fleets.filter((f) => f.ansible);
  const rangeOf = input.rangeOf ?? (() => input.range);
  /** Systems that can transmit by radio: working relays, plus docked fleets carrying a transmitter. */
  const radio = new Set([...relays, ...input.fleets.filter((f) => f.transmitter && f.dockedAt).map((f) => /** @type {string} */ (f.dockedAt))]);

  /** @param {string} node */
  const posOf = (node) => (isFleetNode(node) ? /** @type {NetFleet} */ (fleets.get(node)).pos : input.posOf(node));

  /**
   * Outgoing edges of a node. `target` widens radio edges to non-relay endpoints.
   * @param {string} node @param {string} target
   * @returns {RouteHop[]}
   */
  function edges(node, target) {
    /** @type {RouteHop[]} */
    const out = [];
    if (isFleetNode(node)) {
      const f = fleets.get(node);
      if (!f) return out;
      if (f.dockedAt) out.push({ from: node, to: f.dockedAt, delay: 0, kind: 'local' });
      if (f.ansible) {
        out.push({ from: node, to: input.capital, delay: 0, kind: 'ansible' });
        for (const g of ansibles) if (g.id !== node) out.push({ from: node, to: g.id, delay: 0, kind: 'ansible' });
      }
      return out;
    }
    for (const f of dockedAt.get(node) ?? []) out.push({ from: node, to: f.id, delay: 0, kind: 'local' });
    if (node === input.capital) for (const f of ansibles) out.push({ from: node, to: f.id, delay: 0, kind: 'ansible' });
    if (radio.has(node)) {
      const here = input.posOf(node);
      const reach = rangeOf(node);
      const candidates = new Set([...radio, ...dockedAt.keys()]);
      if (!isFleetNode(target)) candidates.add(target);
      for (const other of candidates) {
        if (other === node) continue;
        const d = distance(here, input.posOf(other));
        if (d <= reach) out.push({ from: node, to: other, delay: d, kind: 'radio' });
      }
    }
    return out;
  }

  /** @type {Map<string, Route | null>} */
  const routes = new Map();
  /**
   * Fastest route, remembered for the life of this network (routes are asked
   * for again and again: every message at every node).
   * @param {string} from @param {string} target
   * @returns {Route | null}
   */
  function route(from, target) {
    const key = `${from}>${target}`;
    if (!routes.has(key)) routes.set(key, findRoute(from, target));
    const r = /** @type {Route | null} */ (routes.get(key));
    return r && { nodes: [...r.nodes], hops: r.hops.map((h) => ({ ...h })), delay: r.delay };
  }

  /**
   * Fastest route from `from` to `target` (Dijkstra on delay; fewer hops break ties).
   * @param {string} from @param {string} target
   * @returns {Route | null}
   */
  function findRoute(from, target) {
    if (from === target) return { nodes: [from], hops: [], delay: 0 };
    const HOP_COST = 1e-9;
    /** @type {Map<string, number>} */ const best = new Map([[from, 0]]);
    /** @type {Map<string, RouteHop>} */ const via = new Map();
    const open = new Set([from]);
    const done = new Set();
    while (open.size) {
      let u = '';
      let du = Infinity;
      for (const n of open) {
        const d = /** @type {number} */ (best.get(n));
        if (d < du) { du = d; u = n; }
      }
      open.delete(u);
      done.add(u);
      if (u === target) break;
      for (const e of edges(u, target)) {
        if (done.has(e.to)) continue;
        const nd = du + e.delay + HOP_COST;
        if (nd < (best.get(e.to) ?? Infinity)) {
          best.set(e.to, nd);
          via.set(e.to, e);
          open.add(e.to);
        }
      }
    }
    if (!via.has(target)) return null;
    /** @type {RouteHop[]} */
    const hops = [];
    for (let n = target; n !== from; ) {
      const e = /** @type {RouteHop} */ (via.get(n));
      hops.unshift(e);
      n = e.from;
    }
    return { nodes: [from, ...hops.map((h) => h.to)], hops, delay: hops.reduce((s, h) => s + h.delay, 0) };
  }

  /** Relay-to-relay links within range (for drawing the network). */
  function links() {
    const list = [...relays];
    /** @type {[string, string, number][]} */
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = distance(input.posOf(list[i]), input.posOf(list[j]));
        if (d <= Math.max(rangeOf(list[i]), rangeOf(list[j]))) out.push([list[i], list[j], d]);
      }
    }
    return out;
  }

  /**
   * Could a message waiting at this node leave it right now? (A relay or a
   * docked transmitter here, a docked ansible fleet, or the node is a fleet.)
   * @param {string} node
   */
  function canSend(node) {
    if (isFleetNode(node)) return fleets.has(node);
    return radio.has(node) || (dockedAt.get(node) ?? []).length > 0 || (node === input.capital && ansibles.length > 0);
  }

  return { route, links, canSend, posOf, relays, range: input.range, rangeOf, capital: input.capital };
}

/** @typedef {ReturnType<typeof createNetwork>} Network */
