// @ts-check
import { createFleet, launchFleet } from '../../fleet/module.js';
import { DRIVE_TIERS } from '../../fleet/drives.js';

/** fleet.send: build (instantly, for now) and launch one fleet when the order arrives. */
export default {
  /** @type {import('./types.js').OnReceive} */
  onReceive(world, ctx, book, d) {
    const drive = typeof d.params.drive === 'number' ? DRIVE_TIERS[d.params.drive] : d.params.drive;
    const f = createFleet(world, ctx, { empire: book.empire, at: book.system, drive, ansible: d.params.ansible, courier: d.params.courier });
    launchFleet(world, ctx, { fleet: f.id, to: d.params.destination });
  },
};
