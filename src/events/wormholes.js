// @ts-check
import { defineModule } from '../sim/module.js';
import { GameError } from '../core/errors.js';

/**
 * Wormholes: paired mouths at two systems. Ships pass instantly; messages
 * (light) cannot, so information crosses only when a ship carries it.
 *
 * @typedef {{ id: string, a: string, b: string, openedAt: number }} Wormhole
 */
export const wormholeModule = defineModule({
  id: 'wormholes',
  dependsOn: ['galaxy'],
  initState: () => ({ /** @type {Wormhole[]} */ list: [] }),
});

/** @param {import('../sim/world.js').World} world @returns {Wormhole[]} */
export const wormholes = (world) => world.state.wormholes.list;

/**
 * @param {import('../sim/world.js').World} world
 * @param {import('../sim/module.js').SimContext} ctx
 * @param {{ a: string, b: string }} ends system ids
 */
export function openWormhole(world, ctx, { a, b }) {
  if (a === b) throw new GameError('wormholeSameSystem');
  if (wormholes(world).some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return null;
  const w = { id: ctx.newId('wormhole'), a, b, openedAt: ctx.now };
  wormholes(world).push(w);
  ctx.notify('wormholes/opened', w);
  return w;
}
