import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog, runUntil } from './helpers.js';
import { createFleet, launchFleet, fleetState } from '../src/fleet/module.js';
import { orderDispatch } from '../src/governors/issue.js';
import { sightingsOf, plumeVisible, PLUME_RANGE } from '../src/detection/module.js';
import { knowledgePicture, truthPicture, burnPhase } from '../src/perspective/picture.js';
import { knowledgeOf } from '../src/info/module.js';
import { distance, sub } from '../src/core/vec3.js';
import { positionOnLegs } from '../src/fleet/legs.js';

const pos = (id) => catalog.get(id).pos;
const DRIVE = { accelG: 0.3, cruise: 0.3 };

/** Launch an Empire B fleet directly (truth), as the sandbox tool does. */
function rivalFleet(act, from, to) {
  return act((w, c) => {
    const f = createFleet(w, c, { empire: 'B', at: from, drive: DRIVE });
    launchFleet(w, c, { fleet: f.id, to });
    return f;
  });
}

describe('plume geometry', () => {
  it('is visible only inside the exhaust cone and within range', () => {
    expect(plumeVisible([1, 0, 0], [5, 0, 0])).toBe(true);
    expect(plumeVisible([1, 0, 0], [5, 2, 0])).toBe(true); // ~22°
    expect(plumeVisible([1, 0, 0], [5, 5, 0])).toBe(false); // 45°
    expect(plumeVisible([1, 0, 0], [-5, 0, 0])).toBe(false); // behind the nozzle
    expect(plumeVisible([1, 0, 0], [PLUME_RANGE + 1, 0, 0])).toBe(false);
  });
});

describe('detecting a rival fleet', () => {
  it('coasting is dark; braking toward our outpost is seen there, then reported to the capital', () => {
    const { sim, world, act } = sandbox('det');
    const from = sys('Epsilon Indi'); // Empire B's capital
    const tau = sys('Tau Ceti'); // our outpost
    const f = rivalFleet(act, from, tau);
    const leg = /** @type {any} */ (f.legs[0]);
    const brakeAt = leg.departAt + leg.profile.brakeStart;
    const brakePos = positionOnLegs(f.legs, brakeAt);
    const seenAt = brakeAt + distance(brakePos, pos(tau));
    const reportedAt = seenAt + distance(pos(tau), pos('sol'));

    // Launch plume points back at Epsilon Indi, away from all our systems within the cone.
    sim.advanceTo(brakeAt - 0.01);
    expect(sightingsOf(world, 'A')).toHaveLength(0);
    expect(burnPhase(f.legs, brakeAt - 0.5)).toBe(null); // coasting

    sim.advanceTo(reportedAt - 0.01);
    expect(sightingsOf(world, 'A')).toHaveLength(0); // seen at Tau Ceti, but the news is on its way
    sim.advanceTo(reportedAt + 0.01);
    const s = sightingsOf(world, 'A');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ phase: 'braking', fleetEmpire: 'B', fleet: null, near: tau, observer: tau });
    expect(s[0].seenAt).toBeCloseTo(seenAt, 9);
    expect(s[0].receivedAt).toBeCloseTo(reportedAt, 9);
    expect(knowledgeOf(world, 'A').dispatches.at(-1)).toMatchObject({ key: 'plume.foreign.braking', params: { empire: 'B', near: tau, observer: tau } });

    // Warning at Tau Ceti before arrival: braking time minus light time of the flash.
    expect(leg.arriveAt - seenAt).toBeCloseTo(leg.profile.warning, 9);
    // The capital learns of it only after the fleet has already arrived.
    expect(reportedAt).toBeGreaterThan(leg.arriveAt);
  });

  it('in flight the rival fleet is known only by its plume; docked at our outpost it is seen', () => {
    const { sim, world, ctx, act } = sandbox('det2');
    const f = rivalFleet(act, sys('Epsilon Indi'), sys('Tau Ceti'));
    const arrive = f.legs.at(-1).arriveAt;
    runUntil(sim, () => sightingsOf(world, 'A').length > 0, { step: 0.05, max: 100 });
    const pic = knowledgePicture(world, ctx, 'A');
    expect(pic.fleets.every((x) => x.empire === 'A')).toBe(true);
    expect(pic.sightings.some((s) => s.fleetEmpire === 'B')).toBe(true);
    expect(truthPicture(world, ctx, 'A').fleets.some((x) => x.empire === 'B')).toBe(true);
    sim.advanceTo(arrive + distance(pos(sys('Tau Ceti')), pos('sol')) + 1.01);
    expect(knowledgePicture(world, ctx, 'A').fleets.some((x) => x.id === f.id)).toBe(true);
  });

  it('an observer outside the exhaust cones sees nothing', () => {
    const { sim, world, act } = sandbox('det3');
    // Epsilon Indi → Lacaille 8760 (4.3 ly): neither burn points at any of our systems.
    rivalFleet(act, sys('Epsilon Indi'), sys('Lacaille 8760'));
    sim.advanceTo(80);
    expect(sightingsOf(world, 'A').filter((s) => s.fleetEmpire === 'B')).toHaveLength(0);
  });
});

describe('our own fleets', () => {
  it('stay "expected" until the arrival report reaches the capital, even after braking is seen', () => {
    const { sim, world, ctx, act } = sandbox('own');
    const tau = sys('Tau Ceti');
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: tau, drive: DRIVE }));
    sim.advanceBy(0.01);
    const f = Object.values(fleetState(world).fleets)[0];
    const leg = /** @type {any} */ (f.legs[0]);
    const kf = () => knowledgePicture(world, ctx, 'A').fleets[0];

    expect(kf().certainty).toBe('expected'); // departure from the capital is known at once
    // Braking is seen at Tau Ceti; the news reaches Sol after the fleet has arrived.
    const brakeAt = leg.departAt + leg.profile.brakeStart;
    sim.advanceTo(brakeAt + 0.1);
    expect(kf().brakingSeenAt).toBeNull(); // seen at Tau Ceti, not yet known at Sol
    sim.advanceTo(leg.arriveAt - 0.01);
    expect(kf().certainty).toBe('expected');
    // After the planned arrival, before the arrival report: unconfirmed.
    sim.advanceTo(leg.arriveAt + 1);
    expect(f.status).toBe('docked'); // truth
    expect(kf().certainty).toBe('unconfirmed');
    // The arrival report from Tau Ceti's relay confirms it one light delay later.
    sim.advanceTo(leg.arriveAt + distance(pos(tau), pos('sol')) + 0.01);
    expect(kf().certainty).toBe('confirmed');
    expect(kf().at).toBe(tau);
    // Tau Ceti saw the braking plume before the arrival; that report is on record too.
    const braking = sightingsOf(world, 'A').find((s) => s.fleet === f.id && s.phase === 'braking');
    expect(braking.observer).toBe(tau);
    expect(braking.seenAt).toBeLessThan(leg.arriveAt);
  });

  it('an arrival at a system without our relay is never confirmed', () => {
    const { sim, world, ctx, act } = sandbox('own2');
    const target = sys('Procyon'); // nobody's system, 11.5 ly: never probed
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: target, drive: DRIVE }));
    sim.advanceBy(0.01);
    const f = Object.values(fleetState(world).fleets)[0];
    sim.advanceTo(f.legs[0].arriveAt + 30);
    expect(knowledgePicture(world, ctx, 'A').fleets[0].certainty).toBe('unconfirmed');
    // Truth: it did arrive and explored the system; the capital does not know that.
    expect(world.state.empire.explored.A[target]).toBeDefined();
    expect(knowledgePicture(world, ctx, 'A').explored).not.toContain(target);
  });

  it('an arrival reported by ansible confirms it and marks the system explored', () => {
    const { sim, world, ctx, act } = sandbox('own3');
    const target = sys('Procyon');
    expect(knowledgePicture(world, ctx, 'A').explored).not.toContain(target);
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: target, drive: DRIVE, ansible: true }));
    sim.advanceBy(0.01);
    const f = Object.values(fleetState(world).fleets)[0];
    sim.advanceTo(f.legs[0].arriveAt + 0.01);
    const kf = knowledgePicture(world, ctx, 'A').fleets[0];
    expect(kf.certainty).toBe('live');
    expect(kf.at).toBe(target);
    expect(knowledgePicture(world, ctx, 'A').explored).toContain(target); // no relay there, but the ansible reports
  });
});

describe('burn phases', () => {
  it('accelerate, coast, brake', () => {
    const { world, act } = sandbox('burn');
    const f = rivalFleet(act, sys('Epsilon Indi'), sys('Tau Ceti'));
    const leg = /** @type {any} */ (f.legs[0]);
    expect(burnPhase(f.legs, leg.departAt + 0.1)).toBe('accelerating');
    expect(burnPhase(f.legs, leg.departAt + leg.profile.burnTime + 1)).toBe(null);
    expect(burnPhase(f.legs, leg.arriveAt - 0.1)).toBe('braking');
    expect(world).toBeDefined();
    expect(sub(leg.toPos, leg.fromPos)).toBeDefined();
  });
});

describe('fleets seen at our systems', () => {
  it('routine reports keep a docked fleet current, and reveal a foreign fleet that docks', () => {
    const { sim, world, ctx, act } = sandbox('dock');
    const tau = sys('Tau Ceti');
    act((w, c) => orderDispatch(w, c, { empire: 'A', from: 'sol', to: tau, drive: DRIVE }));
    const b = rivalFleet(act, sys('Epsilon Indi'), tau);
    sim.advanceBy(0.01);
    const arrive = Math.max(...Object.values(fleetState(world).fleets).map((f) => f.legs.at(-1).arriveAt));
    sim.advanceTo(arrive + distance(pos(tau), pos('sol')) + 30);
    const pic = knowledgePicture(world, ctx, 'A');
    const own = pic.fleets.find((f) => f.empire === 'A');
    expect(own.certainty).toBe('confirmed');
    expect(own.age).toBeLessThan(distance(pos(tau), pos('sol')) + 1.01); // refreshed by routine reports
    const foreign = pic.fleets.find((f) => f.id === b.id);
    expect(foreign).toMatchObject({ empire: 'B', at: tau, certainty: 'confirmed', name: null });
    expect(knowledgeOf(world, 'A').dispatches.some((d) => d.key === 'foreignFleetPresent' && d.params.system === tau)).toBe(true);
  });

  it('a foreign fleet that leaves is dropped once a newer report omits it', () => {
    const { sim, world, ctx, act } = sandbox('dock2');
    const tau = sys('Tau Ceti');
    const b = rivalFleet(act, sys('Epsilon Indi'), tau);
    sim.advanceTo(b.legs.at(-1).arriveAt + 20);
    expect(knowledgePicture(world, ctx, 'A').fleets.some((f) => f.id === b.id)).toBe(true);
    act((w, c) => launchFleet(w, c, { fleet: b.id, to: sys('Epsilon Indi') }));
    sim.advanceTo(world.time + distance(pos(tau), pos('sol')) + 2);
    expect(knowledgePicture(world, ctx, 'A').fleets.some((f) => f.id === b.id)).toBe(false);
  });
});
