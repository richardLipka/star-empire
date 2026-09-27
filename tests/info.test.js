import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog, runUntil } from './helpers.js';
import { knowledgeOf, truthNetwork, infoState } from '../src/info/module.js';
import { sendNote, orderRedirect } from '../src/info/orders.js';
import { orderDispatch } from '../src/governors/issue.js';
import { imposeDirective } from '../src/governors/module.js';
import { setRelay } from '../src/empire/module.js';
import { distance } from '../src/core/vec3.js';
import { fleetState, fleetPosition } from '../src/fleet/module.js';
import { openWormhole } from '../src/events/wormholes.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { stateHash } from '../src/core/serialize.js';

const pos = (id) => catalog.get(id).pos;
const dist = (a, b) => distance(pos(a), pos(b));
const lastNote = (world, text) => knowledgeOf(world, 'A').dispatches.find((d) => d.key === 'note' && d.params.text === text);

describe('light-speed timing', () => {
  it('a note from Alpha Centauri arrives exactly 4.32 years later', () => {
    const { sim, world, act } = sandbox();
    const aCen = sys('Alpha Centauri');
    act((w, c) => sendNote(w, c, { empire: 'A', from: aCen, to: 'sol', text: 'hello' }));
    sim.advanceTo(4.3);
    expect(lastNote(world, 'hello')).toBeUndefined();
    sim.advanceTo(5);
    const d = lastNote(world, 'hello');
    expect(d.receivedAt).toBeCloseTo(dist(aCen, 'sol'), 9);
    expect(d.validAt).toBe(0);
  });

  it('routine reports keep information about as old as the light delay', () => {
    const { sim, world } = sandbox();
    sim.advanceTo(30);
    const k = knowledgeOf(world, 'A').systems[sys('Alpha Centauri')];
    const age = world.time - k.validAt;
    const delay = dist(sys('Alpha Centauri'), 'sol');
    expect(age).toBeGreaterThanOrEqual(delay - 1e-9);
    expect(age).toBeLessThan(delay + 1 + 1e-9); // plus at most one report interval
    expect(k.receivedAt - k.validAt).toBeCloseTo(delay, 9);
  });
});

describe('relay chains', () => {
  it('routes Deneb Algedi → Fomalhaut → Tau Ceti → Sol, longer than the straight line', () => {
    const { world, ctx } = sandbox();
    const route = truthNetwork(world, ctx, 'A').route(sys('Deneb Algedi'), 'sol');
    expect(route.nodes).toEqual([sys('Deneb Algedi'), sys('Fomalhaut'), sys('Tau Ceti'), 'sol']);
    const straight = dist(sys('Deneb Algedi'), 'sol');
    expect(straight).toBeGreaterThan(20); // no direct link at 20 ly range
    expect(route.delay).toBeCloseTo(dist(sys('Deneb Algedi'), sys('Fomalhaut')) + dist(sys('Fomalhaut'), sys('Tau Ceti')) + dist(sys('Tau Ceti'), 'sol'), 9);
    expect(route.delay).toBeGreaterThan(straight);
  });

  it('a relayed message arrives after the sum of hop delays, hop by hop', () => {
    const { sim, world, act } = sandbox();
    const msg = act((w, c) => sendNote(w, c, { empire: 'A', from: sys('Deneb Algedi'), to: 'sol', text: 'far' }));
    const expected = msg.planned.delay;
    sim.advanceTo(expected - 0.01);
    const inFlight = infoState(world).messages[msg.id];
    expect(inFlight.hops.map((h) => h.to)).toEqual([sys('Fomalhaut'), sys('Tau Ceti'), 'sol']);
    expect(inFlight.hops[1].arriveAt).toBeCloseTo(inFlight.hops[0].arriveAt + dist(sys('Fomalhaut'), sys('Tau Ceti')), 9);
    sim.advanceTo(expected + 0.01);
    expect(lastNote(world, 'far').receivedAt).toBeCloseTo(expected, 9);
    expect(lastNote(world, 'far').hops).toBe(3);
  });

  it('reaches a system without a relay within range, but not one out of range', () => {
    const { sim, world, act } = sandbox();
    const sirius = sys('Sirius'); // no presence, 8.6 ly
    let delivered = null;
    sim.bus.on('info/delivered', ({ message }) => (delivered = message));
    act((w, c) => sendNote(w, c, { empire: 'A', from: 'sol', to: sirius, text: 'x' }));
    sim.advanceTo(9);
    expect(delivered?.target).toBe(sirius);

    const pollux = sys('Pollux'); // 33.8 ly, no relay within 20 ly
    const m = act((w, c) => sendNote(w, c, { empire: 'A', from: 'sol', to: pollux, text: 'y' }));
    sim.advanceTo(60);
    expect(infoState(world).messages[m.id].status).toBe('stalled');
  });

  it('an isolated outpost stays silent', () => {
    const { sim, world } = sandbox();
    const arcturus = sys('Arcturus');
    const before = knowledgeOf(world, 'A').systems[arcturus].validAt;
    sim.advanceTo(50);
    expect(knowledgeOf(world, 'A').systems[arcturus].validAt).toBe(before);
  });
});

describe('losing and rebuilding a relay', () => {
  it('a message waits at a dead relay and continues when it is rebuilt', () => {
    const { sim, world, act } = sandbox();
    const fom = sys('Fomalhaut');
    act((w, c) => imposeDirective(w, c, { system: fom, type: 'governance.relay', params: { repair: 'never' } }));
    const msg = act((w, c) => sendNote(w, c, { empire: 'A', from: sys('Deneb Algedi'), to: 'sol', text: 'wait' }));
    const firstHop = dist(sys('Deneb Algedi'), fom);
    act((w, c) => setRelay(w, c, { system: fom, state: 'destroyed' }));
    sim.advanceTo(firstHop + 1);
    const m = infoState(world).messages[msg.id];
    expect(m.at).toBe(fom); // it was received: systems always receive
    expect(m.status).toBe('stalled'); // but cannot be passed on
    sim.advanceTo(40);
    act((w, c) => setRelay(w, c, { system: fom, state: 'ok' }));
    const rest = dist(fom, sys('Tau Ceti')) + dist(sys('Tau Ceti'), 'sol');
    sim.advanceTo(40 + rest + 0.01);
    expect(lastNote(world, 'wait').receivedAt).toBeCloseTo(40 + rest, 9);
  });

  it('a system with a dead relay goes silent but still receives orders', () => {
    const { sim, world, act } = sandbox();
    const tau = sys('Tau Ceti');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'governance.relay', params: { repair: 'never' } }));
    act((w, c) => setRelay(w, c, { system: tau, state: 'destroyed' }));
    sim.advanceTo(20);
    const k = knowledgeOf(world, 'A').systems[tau];
    expect(world.time - k.receivedAt).toBeGreaterThan(5); // overdue
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: tau, to: sys('Epsilon Eridani'), drive: { accelG: 0.1, cruise: 0.1 } }));
    sim.advanceTo(20 + dist('sol', tau) + 0.01);
    const fleets = Object.values(fleetState(world).fleets);
    expect(fleets).toHaveLength(1);
    expect(fleets[0].status).toBe('transit');
  });
});

describe('fleets', () => {
  it('launch when the order arrives, fly the planned profile, and report back by light', () => {
    const { sim, world, act } = sandbox();
    const tau = sys('Tau Ceti');
    const target = sys('Epsilon Eridani');
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: tau, to: target, drive: { accelG: 0.1, cruise: 0.1 } }));
    const orderDelay = dist('sol', tau);
    sim.advanceTo(orderDelay - 0.01);
    expect(Object.keys(fleetState(world).fleets)).toHaveLength(0);
    sim.advanceTo(orderDelay + 0.01);
    const f = Object.values(fleetState(world).fleets)[0];
    const leg = /** @type {any} */ (f.legs[0]);
    expect(leg.departAt).toBeCloseTo(orderDelay, 9);

    // The departure report reaches Sol one light delay after launch.
    const k = () => knowledgeOf(world, 'A').fleets[f.id];
    sim.advanceTo(orderDelay + orderDelay - 0.01);
    expect(k()).toBeUndefined();
    sim.advanceTo(orderDelay + orderDelay + 0.01);
    expect(k().validAt).toBeCloseTo(orderDelay, 9);

    // The profile is symmetric: halfway in time is halfway in distance.
    const mid = (leg.departAt + leg.arriveAt) / 2;
    sim.advanceTo(mid);
    const p = fleetPosition(f, mid, pos);
    expect(distance(p, pos(tau))).toBeCloseTo(distance(leg.fromPos, leg.toPos) / 2, 6);

    sim.advanceTo(leg.arriveAt + 0.01);
    expect(f.status).toBe('docked');
    expect(f.at).toBe(target);
  });

  it('a fleet in transit cannot be reached without an ansible', () => {
    const { sim, world, act } = sandbox();
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: sys('Alpha Centauri'), drive: { accelG: 0.1, cruise: 0.1 } }));
    sim.advanceTo(1);
    const f = Object.values(fleetState(world).fleets)[0];
    expect(f.status).toBe('transit');
    expect(act((w, c) => orderRedirect(w, c, { empire: 'A', fleet: f.id, to: sys('Sirius') }))).toBeNull();
  });
});

describe('ansible', () => {
  it('keeps the capital informed instantly and accepts orders in flight', () => {
    const { sim, world, act } = sandbox();
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: sys('Vega'), drive: { accelG: 0.3, cruise: 0.3 }, ansible: true }));
    sim.advanceTo(10);
    const f = Object.values(fleetState(world).fleets)[0];
    const k = knowledgeOf(world, 'A').fleets[f.id];
    expect(world.time - k.validAt).toBeLessThan(1 / 12 + 1e-9); // fresh to the tick
    expect(k.via).toBe('ansible');

    const msg = act((w, c) => orderRedirect(w, c, { empire: 'A', fleet: f.id, to: sys('Altair') }));
    expect(msg).not.toBeNull();
    sim.advanceBy(0); // delivered at once
    expect(f.dest).toBe(sys('Altair'));
    expect(f.legs[0].kind).toBe('brake');
    const where = fleetPosition(f, world.time, pos);
    // Position is continuous across the redirect.
    expect(distance(where, f.legs[0].fromPos)).toBeLessThan(1e-9);
    sim.advanceTo(f.legs[f.legs.length - 1].arriveAt + 0.01);
    expect(f.at).toBe(sys('Altair'));
  });

  it('an ansible fleet docked at an isolated outpost connects it to the capital', () => {
    const { sim, world, act } = sandbox();
    const arcturus = sys('Arcturus');
    act((w, c) => openWormhole(w, c, { a: 'sol', b: arcturus })); // get there quickly
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: arcturus, drive: { accelG: 0.1, cruise: 0.1 }, ansible: true }));
    sim.advanceTo(3);
    const k = knowledgeOf(world, 'A').systems[arcturus];
    expect(world.time - k.validAt).toBeLessThanOrEqual(1 + 1e-9); // latest routine report, no light delay
    expect(k.via).toBe('ansible');
  });
});

describe('wormholes', () => {
  it('carry ships instantly but not messages', () => {
    const { sim, world, act } = sandbox();
    const arcturus = sys('Arcturus');
    act((w, c) => openWormhole(w, c, { a: 'sol', b: arcturus }));
    const note = act((w, c) => sendNote(w, c, { empire: 'A', from: arcturus, to: 'sol', text: 'through?' }));
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: arcturus, drive: { accelG: 0.1, cruise: 0.1 } }));
    sim.advanceBy(0.001);
    const f = Object.values(fleetState(world).fleets)[0];
    expect(f.status).toBe('docked');
    expect(f.at).toBe(arcturus); // 36.7 ly in no time
    expect(infoState(world).messages[note.id].status).toBe('stalled');
  });

  it('uses a wormhole only when it is faster', () => {
    const { sim, world, act } = sandbox();
    act((w, c) => openWormhole(w, c, { a: 'sol', b: sys('Arcturus') }));
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: sys('Alpha Centauri'), drive: { accelG: 0.1, cruise: 0.1 } }));
    sim.advanceBy(0.001);
    const f = Object.values(fleetState(world).fleets)[0];
    expect(f.legs.map((l) => l.kind)).toEqual(['flight']);
  });

  it('a courier through a wormhole brings news faster than light', () => {
    const { sim, world, act } = sandbox();
    const arcturus = sys('Arcturus');
    act((w, c) => openWormhole(w, c, { a: 'sol', b: arcturus }));
    const note = act((w, c) => sendNote(w, c, { empire: 'A', from: arcturus, to: 'sol', text: 'by courier' }));
    sim.advanceTo(5);
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: arcturus, to: 'sol', drive: { accelG: 0.1, cruise: 0.1 }, courier: true }));
    // The order itself cannot reach Arcturus by light: it waits at Sol.
    sim.advanceTo(6);
    expect(Object.keys(fleetState(world).fleets)).toHaveLength(0);

    // A courier sent from Sol through the wormhole carries the order, then comes back with the news.
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: arcturus, drive: { accelG: 0.1, cruise: 0.1 }, courier: true }));
    sim.advanceTo(6.01);
    const t = world.time;
    // First courier: delivered the stalled order at Arcturus, which launched the second courier back.
    runUntil(sim, () => lastNote(world, 'by courier'), { step: 0.01, max: 5 });
    expect(world.time - t).toBeLessThan(0.05);
    const k = knowledgeOf(world, 'A').systems[arcturus];
    expect(k.via).toBe('courier');
    expect(world.time - k.validAt).toBeLessThan(0.1); // instead of 36.7 years
    expect(infoState(world).messages[note.id]).toBeUndefined();
  });
});

describe('determinism with all modules', () => {
  it('saves and reloads mid-game without changing the outcome', () => {
    const run = (withSave) => {
      const { sim, act } = sandbox('det');
      act((w, c) => orderDispatch(w, c, { empire: 'A', from: sys('Tau Ceti'), to: sys('Epsilon Eridani'), drive: { accelG: 0.1, cruise: 0.1 }, ansible: true }));
      act((w, c) => openWormhole(w, c, { a: 'sol', b: sys('Arcturus') }));
      sim.advanceTo(25);
      let s = sim;
      if (withSave) s = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(sim.world)) });
      s.advanceTo(80);
      return stateHash(s.world);
    };
    expect(run(true)).toBe(run(false));
  }, 30000);
});
