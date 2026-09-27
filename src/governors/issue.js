// @ts-check
import { distance } from '../core/vec3.js';
import { GameError } from '../core/errors.js';
import { empireState } from '../empire/module.js';
import { knowledgeOf, send } from '../info/module.js';
import { directiveDef, normalizeParams } from './catalog.js';

/**
 * The capital's side of directives: issue and revoke. Each target system
 * gets its own message, so an empire-wide order spreads out as a front.
 *
 * @typedef {{ kind: 'system', system: string } | { kind: 'region', center: string, radius: number } | { kind: 'empire' }} Target
 * @typedef {object} IssuedDirective
 * @property {string} id
 * @property {string} empire
 * @property {string} type
 * @property {Record<string, any>} params
 * @property {'low' | 'normal' | 'high'} priority
 * @property {'always' | 'threatSeen' | 'noThreat'} when
 * @property {number | null} expiresAt
 * @property {number} issuedAt
 * @property {Target} target
 * @property {{ system: string, plannedArrival: number | null }[]} targets
 * @property {number | null} revokedAt
 */

/** @param {import('../sim/world.js').World} world @param {string} empire @returns {Record<string, IssuedDirective>} */
export const issuedBy = (world, empire) => (world.state.governors.issued[empire] ??= {});

/**
 * Systems a target reaches, as far as the capital knows (its own known holdings).
 * @param {import('../sim/world.js').World} world @param {{ data: Record<string, any> }} ctx
 * @param {string} empire @param {Target} target
 */
export function resolveTargets(world, ctx, empire, target) {
  if (target.kind === 'system') return [target.system];
  const capital = empireState(world).empires[empire].capital;
  const own = [...new Set([capital, ...Object.entries(knowledgeOf(world, empire).systems).filter(([, e]) => e.data.owner === empire).map(([id]) => id)])];
  if (target.kind === 'empire') return own;
  const center = ctx.data.catalog.get(target.center).pos;
  return own.filter((id) => distance(ctx.data.catalog.get(id).pos, center) <= target.radius);
}

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, type: string, target: Target, params?: Record<string, any>,
 *           priority?: IssuedDirective['priority'], when?: IssuedDirective['when'], expiresIn?: number | null }} p
 * @returns {IssuedDirective}
 */
export function issueDirective(world, ctx, { empire, type, target, params = {}, priority = 'normal', when = 'always', expiresIn = null }) {
  directiveDef(type);
  const normalized = normalizeParams(type, params);
  const systems = resolveTargets(world, ctx, empire, target);
  if (!systems.length) throw new GameError('noTargets');
  const capital = empireState(world).empires[empire].capital;
  const directive = { id: ctx.newId('dir'), type, params: normalized, priority, when, expiresAt: expiresIn ? ctx.now + expiresIn : null, issuedAt: ctx.now };
  const targets = systems.map((system) => {
    const msg = send(world, ctx, { empire, kind: 'directive', origin: capital, target: system, payload: { type: 'directive', directive } });
    return { system, plannedArrival: msg.planned ? ctx.now + msg.planned.delay : null };
  });
  /** @type {IssuedDirective} */
  const record = { ...directive, empire, target, targets, revokedAt: null };
  issuedBy(world, empire)[directive.id] = record;
  return record;
}

/**
 * Cancel a directive: a revocation follows it to every target.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, id: string }} p
 */
export function revokeDirective(world, ctx, { empire, id }) {
  const record = issuedBy(world, empire)[id];
  if (!record || record.revokedAt != null) return;
  record.revokedAt = ctx.now;
  const capital = empireState(world).empires[empire].capital;
  for (const { system } of record.targets) {
    send(world, ctx, { empire, kind: 'directive', origin: capital, target: system, payload: { type: 'revoke', id, directiveType: record.type } });
  }
}

/**
 * Shortcut: order one system to launch one fleet (directive fleet.send).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {{ empire: string, from: string, to: string, drive: number | import('../fleet/legs.js').Drive, ansible?: boolean, courier?: boolean }} p
 */
export function orderDispatch(world, ctx, { empire, from, to, drive, ansible = false, courier = false }) {
  return issueDirective(world, ctx, { empire, type: 'fleet.send', target: { kind: 'system', system: from }, params: { destination: to, drive, ansible, courier }, priority: 'high' });
}
