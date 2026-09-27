import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog } from './helpers.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { setRelay } from '../src/empire/module.js';
import { orderDispatch, sendNote } from '../src/info/orders.js';
import { distance } from '../src/core/vec3.js';
import { fleetState, fleetPosition } from '../src/fleet/module.js';

const pos = (id) => catalog.get(id).pos;

describe('knowledge picture', () => {
  it('shows every outpost with the age of its latest report', () => {
    const { sim, world, ctx } = sandbox();
    sim.advanceTo(40);
    const pic = knowledgePicture(world, ctx, 'A');
    const by = Object.fromEntries(pic.systems.map((s) => [s.id, s]));
    expect(by.sol.age).toBeLessThan(1 / 12 + 1e-9);
    const aCen = by[sys('Alpha Centauri')];
    expect(aCen.age).toBeGreaterThanOrEqual(distance(pos(sys('Alpha Centauri')), pos('sol')) - 1e-9);
    // Farther along the relay chain means older news.
    expect(by[sys('Deneb Algedi')].age).toBeGreaterThan(by[sys('Fomalhaut')].age);
    expect(by[sys('Deneb Algedi')].hops).toBe(3);
    // The isolated outpost: century-old records, flagged overdue.
    expect(by[sys('Arcturus')].age).toBeGreaterThan(100);
    expect(by[sys('Arcturus')].overdue).toBe(true);
  });

  it('does not reveal a lost relay until the silence is noticed', () => {
    const { sim, world, ctx, act } = sandbox();
    sim.advanceTo(30);
    const fom = sys('Fomalhaut');
    act((w, c) => setRelay(w, c, { system: fom, state: 'destroyed' }));
    sim.advanceTo(30.5);
    const k1 = knowledgePicture(world, ctx, 'A');
    expect(k1.relays).toContain(fom); // the capital still believes it works
    expect(truthPicture(world, ctx, 'A').relays).not.toContain(fom);
    // The last report (sent just before the loss) needs ~29.7 years through two relays,
    // so the silence can be noticed only after that plus two missed intervals.
    const delay = 17.8 + 11.9;
    sim.advanceTo(30 + delay + 1);
    expect(knowledgePicture(world, ctx, 'A').systems.find((s) => s.id === fom).overdue).toBe(false);
    sim.advanceTo(30 + delay + 3);
    expect(knowledgePicture(world, ctx, 'A').systems.find((s) => s.id === fom).overdue).toBe(true);
  });

  it('draws the relay network from known relays within range', () => {
    const { sim, world, ctx } = sandbox();
    sim.advanceTo(5);
    const pic = knowledgePicture(world, ctx, 'A');
    const has = (a, b) => pic.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    expect(has('sol', sys('Tau Ceti'))).toBe(true);
    expect(has(sys('Tau Ceti'), sys('Fomalhaut'))).toBe(true);
    expect(has('sol', sys('Vega'))).toBe(false); // 25 ly: out of range
    for (const [, , d] of pic.links) expect(d).toBeLessThanOrEqual(pic.range);
  });

  it('predicts a fleet from its departure report, while the truth moves on', () => {
    const { sim, world, ctx, act } = sandbox();
    const tau = sys('Tau Ceti');
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: tau, to: sys('Epsilon Eridani'), drive: { accelG: 0.1, cruise: 0.1 } }));
    const launch = distance(pos('sol'), pos(tau));
    sim.advanceTo(launch + 5);
    // Launched, but the departure report is still on its way.
    expect(knowledgePicture(world, ctx, 'A').fleets).toHaveLength(0);
    expect(truthPicture(world, ctx, 'A').fleets).toHaveLength(1);
    sim.advanceTo(2 * launch + 3);
    const kf = knowledgePicture(world, ctx, 'A').fleets[0];
    const f = Object.values(fleetState(world).fleets)[0];
    expect(kf.age).toBeCloseTo(world.time - launch, 6);
    expect(distance(kf.pos, fleetPosition(f, world.time, pos))).toBeLessThan(1e-9); // no redirect: the prediction holds
    expect(kf.live).toBe(false);
  });

  it('shows own orders on their planned way, not other traffic', () => {
    const { sim, world, ctx, act } = sandbox();
    act((w, c) => sendNote(w, c, { empire: 'A', from: 'sol', to: sys('Vega'), text: 'out' }));
    sim.advanceTo(3);
    const pic = knowledgePicture(world, ctx, 'A');
    expect(pic.messages).toHaveLength(1);
    expect(distance(pic.messages[0].pos, pos('sol'))).toBeCloseTo(3, 6);
    expect(truthPicture(world, ctx, 'A').messages.length).toBeGreaterThan(1); // routine reports in flight too
  });
});
