// @ts-check
import { issuedBy } from '../governors/issue.js';
import { directiveDef } from '../governors/catalog.js';
import { knowledgeOf } from '../info/module.js';

/**
 * What the capital knows about the orders it has issued. The status of each
 * target comes only from what has come back: the planned arrival time, and
 * the governor's book as quoted in the latest report from that system.
 *
 * @typedef {'inTransit' | 'awaitingReport' | 'inEffect' | 'carriedOut' | 'superseded' | 'unreachable' | 'expired' | 'revoked'} OrderStatus
 * @typedef {{ system: string, status: OrderStatus, plannedArrival: number | null }} OrderTarget
 * @typedef {import('../governors/issue.js').IssuedDirective & { implemented: boolean, targetStatus: OrderTarget[], counts: Partial<Record<OrderStatus, number>> }} OrderView
 */

/**
 * @param {import('../sim/world.js').World} world
 * @param {{ now: number }} ctx
 * @param {string} empire
 * @returns {OrderView[]} newest first
 */
export function ordersPicture(world, ctx, empire) {
  const k = knowledgeOf(world, empire);
  return Object.values(issuedBy(world, empire))
    .map((d) => {
      const def = directiveDef(d.type);
      const targetStatus = d.targets.map(({ system, plannedArrival }) => ({ system, plannedArrival, status: statusAt(d, def.oneShot === true, system, plannedArrival, k, ctx.now) }));
      /** @type {Partial<Record<OrderStatus, number>>} */
      const counts = {};
      for (const t of targetStatus) counts[t.status] = (counts[t.status] ?? 0) + 1;
      return { ...d, implemented: def.implemented, targetStatus, counts };
    })
    .sort((a, b) => b.issuedAt - a.issuedAt);
}

/**
 * @param {import('../governors/issue.js').IssuedDirective} d @param {boolean} oneShot @param {string} system
 * @param {number | null} plannedArrival @param {import('../info/knowledge.js').Knowledge} k @param {number} now
 * @returns {OrderStatus}
 */
function statusAt(d, oneShot, system, plannedArrival, k, now) {
  if (d.revokedAt != null) return 'revoked';
  if (d.expiresAt != null && now >= d.expiresAt) return 'expired';
  const report = k.systems[system];
  const governor = report && report.validAt >= d.issuedAt ? report.data.governor : null;
  if (governor?.received.includes(d.id)) {
    if (oneShot) return 'carriedOut';
    return governor.directives.some((/** @type {{ id: string }} */ x) => x.id === d.id) ? 'inEffect' : 'superseded';
  }
  if (plannedArrival == null) return 'unreachable';
  return now < plannedArrival ? 'inTransit' : 'awaitingReport';
}

/**
 * The governor's book of a system, as last reported to the capital.
 * @param {import('../sim/world.js').World} world @param {string} empire @param {string} system
 */
export function reportedBook(world, empire, system) {
  const e = knowledgeOf(world, empire).systems[system];
  if (!e?.data.governor) return null;
  return { validAt: e.validAt, ...e.data.governor };
}
