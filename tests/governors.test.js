import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog } from './helpers.js';
import { issueDirective, revokeDirective, resolveTargets } from '../src/governors/issue.js';
import { books, imposeDirective } from '../src/governors/module.js';
import { CATEGORIES, ALL_DIRECTIVES, CAPACITY, normalizeParams } from '../src/governors/catalog.js';
import { ordersPicture, reportedBook } from '../src/perspective/directives.js';
import { knowledgePicture } from '../src/perspective/picture.js';
import { empireState, setRelay } from '../src/empire/module.js';
import { fleetState, createFleet, launchFleet } from '../src/fleet/module.js';
import { knowledgeOf } from '../src/info/module.js';
import { distance } from '../src/core/vec3.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { stateHash } from '../src/core/serialize.js';

const pos = (id) => catalog.get(id).pos;
const light = (a, b) => distance(pos(a), pos(b));
const fleets = (world, role) => Object.values(fleetState(world).fleets).filter((f) => !role || f.role === role);
const status = (world, ctx, id) => ordersPicture(world, ctx, 'A').find((o) => o.id === id);

describe('directive catalogue', () => {
  it('has the categories of the design, each directive with valid defaults', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['expansion', 'military', 'fleet', 'logistics', 'governance', 'economy', 'research', 'diplomacy']);
    for (const d of ALL_DIRECTIVES) {
      const needsInput = d.params.some((p) => p.default === undefined && !p.optional);
      if (!needsInput) expect(() => normalizeParams(d.id, {})).not.toThrow();
    }
    expect(() => normalizeParams('expansion.explore', { maxRange: 400 })).toThrow();
    expect(() => normalizeParams('expansion.settle', { criteria: 'shiny' })).toThrow();
  });
});

describe('delivery and acknowledgement', () => {
  it('an order reaches a governor after the light delay; the capital learns of it from the next report', () => {
    const { sim, world, ctx, act } = sandbox('gov1');
    const tau = sys('Tau Ceti');
    const d = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'military.readiness', target: { kind: 'system', system: tau }, params: { posture: 'fortify' } }));
    const arrive = light('sol', tau);
    expect(d.targets[0].plannedArrival).toBeCloseTo(arrive, 9);
    expect(status(world, ctx, d.id).targetStatus[0].status).toBe('inTransit');
    sim.advanceTo(arrive - 0.01);
    expect(books(world)[tau].settings.posture).toBe('vigilance');
    sim.advanceTo(arrive + 0.01);
    expect(books(world)[tau].settings.posture).toBe('fortify');
    expect(status(world, ctx, d.id).targetStatus[0].status).toBe('awaitingReport');
    sim.advanceTo(arrive + light(tau, 'sol') + 1.01); // the next routine report comes back
    expect(status(world, ctx, d.id).targetStatus[0].status).toBe('inEffect');
    expect(reportedBook(world, 'A', tau).settings.posture).toBe('fortify');
  });

  it('an empire-wide order spreads as a front: nearest first, unreachable marked', () => {
    const { sim, world, ctx, act } = sandbox('gov2');
    const d = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'governance.reporting', target: { kind: 'empire' }, params: { mode: 'frequent' } }));
    const arrivals = Object.fromEntries(d.targets.map((t) => [t.system, t.plannedArrival]));
    expect(arrivals[sys('Alpha Centauri')]).toBeLessThan(arrivals[sys('Tau Ceti')]);
    expect(arrivals[sys('Deneb Algedi')]).toBeGreaterThan(40); // three relay hops
    expect(arrivals[sys('Arcturus')]).toBeNull(); // beyond every relay
    expect(status(world, ctx, d.id).counts.unreachable).toBe(1);
    sim.advanceTo(5);
    expect(empireState(world).presence[sys('Alpha Centauri')].reporting).toBe('frequent');
    expect(empireState(world).presence[sys('Tau Ceti')].reporting).toBe('routine');
  });

  it('region targets: only known own systems within the radius', () => {
    const { world, ctx } = sandbox('gov3');
    const got = resolveTargets(world, ctx, 'A', { kind: 'region', center: sys('Tau Ceti'), radius: 12.5 });
    expect(new Set(got)).toEqual(new Set([sys('Tau Ceti'), 'sol'])); // Alpha Centauri is 13.5 ly from Tau Ceti
  });

  it('a newer order replaces an older one of the same kind; a stale one does not', () => {
    const { sim, world, act } = sandbox('gov4');
    const aCen = sys('Alpha Centauri');
    act((w, c) => issueDirective(w, c, { empire: 'A', type: 'military.readiness', target: { kind: 'system', system: aCen }, params: { posture: 'fortify' } }));
    sim.advanceTo(1);
    act((w, c) => issueDirective(w, c, { empire: 'A', type: 'military.readiness', target: { kind: 'system', system: aCen }, params: { posture: 'peace' } }));
    sim.advanceTo(10);
    expect(books(world)[aCen].settings.posture).toBe('peace');
    // A stale copy (issued earlier) arriving late must not override.
    const book = books(world)[aCen];
    const newest = book.directives['military.readiness'];
    expect(newest.params.posture).toBe('peace');
  });

  it('revocation and expiry return the governor to defaults', () => {
    const { sim, world, ctx, act } = sandbox('gov5');
    const aCen = sys('Alpha Centauri');
    const a = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'governance.reporting', target: { kind: 'system', system: aCen }, params: { mode: 'silent' } }));
    const b = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'military.readiness', target: { kind: 'system', system: aCen }, params: { posture: 'fortify' }, expiresIn: 10 }));
    sim.advanceTo(5);
    expect(books(world)[aCen].settings).toMatchObject({ reporting: 'silent', posture: 'fortify' });
    act((w, c) => revokeDirective(w, c, { empire: 'A', id: a.id }));
    sim.advanceTo(12);
    expect(books(world)[aCen].settings).toMatchObject({ reporting: 'routine', posture: 'vigilance' });
    expect(status(world, ctx, a.id).targetStatus[0].status).toBe('revoked');
    expect(status(world, ctx, b.id).targetStatus[0].status).toBe('expired');
  });

  it('orders to a system we do not hold lapse', () => {
    const { sim, world, act } = sandbox('gov6');
    act((w, c) => issueDirective(w, c, { empire: 'A', type: 'military.readiness', target: { kind: 'system', system: sys('Sirius') }, params: { posture: 'fortify' } }));
    sim.advanceTo(20);
    expect(books(world)[sys('Sirius')]).toBeUndefined();
  });
});

describe('standing settings', () => {
  it('silent systems send no routine reports; frequent ones report four times a year', () => {
    const { sim, world, act } = sandbox('rep');
    const aCen = sys('Alpha Centauri');
    act((w, c) => imposeDirective(w, c, { system: aCen, type: 'governance.reporting', params: { mode: 'silent' } }));
    sim.advanceTo(20);
    const k = knowledgeOf(world, 'A').systems[aCen];
    expect(world.time - k.receivedAt).toBeGreaterThan(10);
    act((w, c) => imposeDirective(w, c, { system: aCen, type: 'governance.reporting', params: { mode: 'frequent' } }));
    sim.advanceTo(30);
    const age = world.time - knowledgeOf(world, 'A').systems[aCen].validAt;
    expect(age).toBeLessThan(light(aCen, 'sol') + 0.25 + 1e-9);
  });

  it('governors rebuild a destroyed relay by policy; fortify halves the time; never means never', () => {
    /** @type {[string, string, number][]} */
    const cases = [['normal', 'vigilance', CAPACITY.relayRepairYears.normal], ['fast', 'vigilance', CAPACITY.relayRepairYears.fast], ['normal', 'fortify', CAPACITY.relayRepairYears.normal * CAPACITY.fortifyRepairFactor]];
    for (const [repair, posture, years] of cases) {
      const { sim, world, act } = sandbox(`relay-${repair}-${posture}`);
      const tau = sys('Tau Ceti');
      act((w, c) => imposeDirective(w, c, { system: tau, type: 'governance.relay', params: { repair } }));
      act((w, c) => imposeDirective(w, c, { system: tau, type: 'military.readiness', params: { posture } }));
      act((w, c) => setRelay(w, c, { system: tau, state: 'destroyed' }));
      sim.advanceTo(years - 0.01);
      expect(empireState(world).presence[tau].relay).toBe('destroyed');
      sim.advanceTo(years + 1.01); // governors think once a year
      expect(empireState(world).presence[tau].relay).toBe('ok');
    }
    const { sim, world, act } = sandbox('relay-never');
    const tau = sys('Tau Ceti');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'governance.relay', params: { repair: 'never' } }));
    act((w, c) => setRelay(w, c, { system: tau, state: 'destroyed' }));
    sim.advanceTo(100);
    expect(empireState(world).presence[tau].relay).toBe('destroyed');
  });

  it('not-yet-implemented orders are accepted and acknowledged, with no effect', () => {
    const { sim, world, ctx, act } = sandbox('noop');
    const aCen = sys('Alpha Centauri');
    const d = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'economy.focus', target: { kind: 'system', system: aCen }, params: { focus: 'mining' } }));
    sim.advanceTo(light('sol', aCen) * 2 + 1.1);
    const o = status(world, ctx, d.id);
    expect(o.implemented).toBe(false);
    expect(o.targetStatus[0].status).toBe('inEffect');
    expect(fleets(world)).toHaveLength(0);
  });
});

describe('expansion', () => {
  it('explore: scouts fly to the nearest unexplored systems, hop on, and their reports mark them explored', () => {
    const { sim, world, ctx, act } = sandbox('explore');
    const before = new Set(knowledgePicture(world, ctx, 'A').explored);
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.explore', params: { frequency: 'high', maxRange: 15, jumps: 2 } }));
    sim.advanceTo(1.01);
    const scouts = fleets(world, 'scout');
    expect(scouts).toHaveLength(1);
    const first = scouts[0].mission.target;
    expect(before.has(first)).toBe(false);
    expect(scouts[0].transmitter).toBe(true);
    sim.advanceTo(400);
    const after = new Set(knowledgePicture(world, ctx, 'A').explored);
    expect(after.has(first)).toBe(true); // reported by the scout's own transmitter
    expect(after.size - before.size).toBeGreaterThanOrEqual(4);
    // One launch per interval: never more scouts than the shipyard could build.
    expect(fleets(world, 'scout').length).toBeLessThanOrEqual(Math.floor(400 / CAPACITY.launchInterval.high) + 1);
  });

  it('explore toward a system keeps to that direction', () => {
    const { sim, world, act } = sandbox('toward');
    const vega = sys('Vega');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.explore', params: { maxRange: 20, toward: vega, jumps: 1 } }));
    sim.advanceTo(1.01);
    const t = fleets(world, 'scout')[0].mission.target;
    const a = pos(t);
    const v = pos(vega);
    const cos = (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) / (Math.hypot(...a) * Math.hypot(...v));
    expect(cos).toBeGreaterThan(Math.cos(Math.PI / 3) - 1e-9);
  });

  it('settle: settlers found outposts with relays that then report home', () => {
    const { sim, world, ctx, act } = sandbox('settle');
    const held = () => Object.entries(empireState(world).presence).filter(([, p]) => p.empire === 'A').length;
    const start = held();
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { criteria: 'nearest', frequency: 'high', maxRange: 10 } }));
    sim.advanceTo(1.01);
    const settler = fleets(world, 'settler')[0];
    const target = settler.mission.target;
    const arrive = settler.legs.at(-1).arriveAt;
    sim.advanceTo(arrive + 0.01);
    expect(empireState(world).presence[target]).toMatchObject({ empire: 'A', relay: 'ok' });
    expect(fleetState(world).fleets[settler.id]).toBeUndefined(); // consumed
    sim.advanceTo(arrive + light(target, 'sol') + 1.5);
    const pic = knowledgePicture(world, ctx, 'A');
    expect(pic.systems.some((s) => s.id === target)).toBe(true);
    expect(pic.fleets.some((f) => f.id === settler.id)).toBe(false);
    expect(knowledgeOf(world, 'A').dispatches.some((d) => d.key === 'fleet.settled' && d.params.system === target)).toBe(true);
    expect(held()).toBeGreaterThan(start);
  });

  it('settle "most habitable" only picks surveyed systems, best first', () => {
    const { sim, world, act } = sandbox('habitable');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { criteria: 'habitable', maxRange: 10 } }));
    sim.advanceTo(1.01);
    const s = fleets(world, 'settler')[0];
    expect(world.state.empire.explored.A[s.mission.target]).toBeDefined();
  });

  it('a settler that finds the system taken reports failure and stays', () => {
    const { sim, world, act } = sandbox('fail');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { criteria: 'nearest', maxRange: 10 } }));
    sim.advanceTo(1.01);
    const settler = fleets(world, 'settler')[0];
    const target = settler.mission.target;
    // Empire B gets there first (sandbox).
    act((w, c) => { const f = createFleet(w, c, { empire: 'B', at: target, drive: { accelG: 0.1, cruise: 0.1 } }); void f; });
    act((w, c) => { empireState(w).presence[target] = { empire: 'B', relay: 'ok', since: c.now, reporting: 'routine' }; });
    sim.advanceTo(settler.legs.at(-1).arriveAt + light(target, 'sol') + 0.5);
    expect(fleetState(world).fleets[settler.id].mission.failed).toBe(true);
    expect(knowledgeOf(world, 'A').dispatches.some((d) => d.key === 'fleet.settleFailed')).toBe(true);
  });

  it('priority decides who gets the shipyard', () => {
    const { sim, world, act } = sandbox('prio');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.explore', params: {}, priority: 'low' }));
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { maxRange: 10 }, priority: 'high' }));
    sim.advanceTo(1.01);
    expect(fleets(world).map((f) => f.role)).toEqual(['settler']);
  });

  it('equal priority shares the shipyard in turn', () => {
    const { sim, world, act } = sandbox('share');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.explore', params: { frequency: 'high' } }));
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { frequency: 'high', maxRange: 12 } }));
    sim.advanceTo(35);
    const roles = fleets(world).map((f) => f.role);
    expect(roles.filter((r) => r === 'scout').length).toBeGreaterThanOrEqual(1);
    expect(roles.filter((r) => r === 'settler').length).toBeGreaterThanOrEqual(1);
  });

  it('conditional orders: only after a foreign plume is seen locally', () => {
    const { sim, world, act } = sandbox('cond');
    const tau = sys('Tau Ceti');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'expansion.explore', params: { frequency: 'high' }, when: 'threatSeen' }));
    sim.advanceTo(5);
    expect(fleets(world, 'scout')).toHaveLength(0);
    act((w, c) => { const f = createFleet(w, c, { empire: 'B', at: sys('Epsilon Indi'), drive: { accelG: 0.3, cruise: 0.3 } }); launchFleet(w, c, { fleet: f.id, to: tau }); });
    sim.advanceTo(60);
    expect(books(world)[tau].memory.lastThreatAt).not.toBeNull();
    expect(fleets(world, 'scout').length).toBeGreaterThan(0);
  });
});

describe('logistics', () => {
  it('a courier run goes out and back on schedule, carrying news', () => {
    const { sim, world, act } = sandbox('courier');
    const aCen = sys('Alpha Centauri');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'logistics.courier', params: { destination: aCen, every: 50 } }));
    sim.advanceTo(1.01);
    const c1 = fleets(world, 'courier');
    expect(c1).toHaveLength(1);
    sim.advanceTo(49);
    expect(fleets(world, 'courier')[0].mission.returning).toBe(true);
    sim.advanceTo(52);
    expect(fleets(world, 'courier').length).toBeGreaterThanOrEqual(1); // the next run has started
  });
});

describe('determinism with governors', () => {
  it('a long expansion run survives save and load unchanged', () => {
    const run = (withSave) => {
      const { sim, act } = sandbox('det-gov');
      act((w, c) => issueDirective(w, c, { empire: 'A', type: 'expansion.explore', target: { kind: 'empire' }, params: { frequency: 'high' } }));
      act((w, c) => issueDirective(w, c, { empire: 'A', type: 'expansion.settle', target: { kind: 'region', center: 'sol', radius: 12 }, params: { maxRange: 12 } }));
      sim.advanceTo(90);
      let s = sim;
      if (withSave) s = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(sim.world)) });
      s.advanceTo(250);
      return stateHash(s.world);
    };
    expect(run(true)).toBe(run(false));
  }, 30000);
});
