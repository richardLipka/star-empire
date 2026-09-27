// @ts-check
import { createFleet, launchFleet } from '../../fleet/module.js';
import { DRIVE_TIERS } from '../../fleet/drives.js';
import { spend, shipCost } from '../../colony/module.js';

/**
 * fleet.send: build and launch one fleet when the order arrives. If the
 * system cannot pay for the ship yet, the order waits and is retried yearly.
 */
export default {
  /** @type {import('./types.js').OnReceive} */
  onReceive(world, ctx, book, d) {
    if (!trySend(world, ctx, book, d)) (book.memory.pendingSends ??= []).push(d);
  },
};

/**
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx
 * @param {import('../module.js').Book} book @param {import('../module.js').Directive} d
 */
function trySend(world, ctx, book, d) {
  const role = d.params.courier ? 'courier' : 'generic';
  if (!spend(world, book.system, shipCost(world, book.system, role))) return false;
  const drive = typeof d.params.drive === 'number' ? DRIVE_TIERS[d.params.drive] : d.params.drive;
  const f = createFleet(world, ctx, { empire: book.empire, at: book.system, drive, ansible: d.params.ansible, courier: d.params.courier });
  launchFleet(world, ctx, { fleet: f.id, to: d.params.destination });
  return true;
}

/**
 * Orders that waited for materiel go out, oldest first, while it lasts.
 * @param {import('../../sim/world.js').World} world @param {import('../../sim/module.js').SimContext} ctx @param {import('../module.js').Book} book
 */
export function retryPendingSends(world, ctx, book) {
  const pending = book.memory.pendingSends ?? [];
  while (pending.length && trySend(world, ctx, book, pending[0])) pending.shift();
}
