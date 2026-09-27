// @ts-check
import { createFleet, launchFleet, disbandFleet } from '../../fleet/module.js';
import { driveFor } from '../../fleet/drives.js';
import { empireState } from '../../empire/module.js';
import { spend, shipCost } from '../../colony/module.js';

/**
 * logistics.courier: every N years a courier takes this system's news and
 * waiting messages to the destination, and brings the destination's back.
 * Runs on its own schedule; it does not use the shipyard slot.
 * @type {import('./types.js').Behaviour}
 */
export default {
  mission: 'courier',
  onReceive(_world, ctx, book, d) {
    book.memory.courierDue[d.id] = ctx.now;
  },
  plan(world, ctx, book, d) {
    const due = book.memory.courierDue[d.id] ?? ctx.now;
    if (ctx.now < due || d.params.destination === book.system) return null;
    if (!spend(world, book.system, shipCost(world, book.system, 'courier'))) return null; // try again next year
    book.memory.courierDue[d.id] = ctx.now + d.params.every;
    const f = createFleet(world, ctx, {
      empire: book.empire, at: book.system, drive: driveFor(empireState(world).presence[book.system]), courier: true, role: 'courier',
      mission: { kind: 'courier', target: d.params.destination, home: book.system, returning: false, directive: d.id },
    });
    launchFleet(world, ctx, { fleet: f.id, to: d.params.destination });
    return null; // acted directly: no shipyard slot needed
  },
  onArrive(world, ctx, fleet, system) {
    const m = fleet.mission;
    if (!m.returning && system === m.target) {
      fleet.mission = { ...m, returning: true, target: m.home };
      launchFleet(world, ctx, { fleet: fleet.id, to: m.home });
    } else if (m.returning && system === m.home) {
      disbandFleet(world, ctx, fleet.id);
    }
  },
};
