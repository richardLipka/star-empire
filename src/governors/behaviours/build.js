// @ts-check
import { buildShips } from '../../ships/module.js';

/**
 * fleet.build: build ships of a design (carried inside the order) into a new
 * fleet at this system. What cannot be paid for now waits, and is built as
 * materiel comes in (each year).
 */
export default {
  /** @type {import('./types.js').OnReceive} */
  onReceive(world, ctx, book, d) {
    const left = build(world, ctx, book.system, d.params.design, d.params.count, null);
    if (left.count > 0) (book.memory.pendingBuilds ??= []).push(left);
  },
};

/**
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx
 * @param {string} system @param {import('../../ships/catalog.js').Design} design @param {number} count @param {string | null} into
 */
function build(world, ctx, system, design, count, into) {
  const { built, fleet } = buildShips(world, ctx, { system, design, count, into, name: design.name });
  return { design, count: count - built, into: fleet?.id ?? into };
}

/**
 * Builds that waited for materiel continue.
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx @param {import('../module.js').Book} book
 */
export function continueBuilds(world, ctx, book) {
  const pending = book.memory.pendingBuilds ?? [];
  book.memory.pendingBuilds = pending.map((b) => build(world, ctx, book.system, b.design, b.count, b.into)).filter((b) => b.count > 0);
}
