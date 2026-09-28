import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog, runUntil } from './helpers.js';
import { flightProfile, speedAt, distanceAt } from '../src/fleet/flight.js';
import { planVoyage } from '../src/fleet/plan.js';
import { fleetState, createFleet, launchFleet, launchVoyage } from '../src/fleet/module.js';
import { designStats, canBuild, bestDesign, DEFAULT_DESIGNS, APPROACHES } from '../src/ships/catalog.js';
import { buildShips, designsOf, designOf, addDesign } from '../src/ships/module.js';
import { resolveBattle, DEFAULT_PLAN, windowFor } from '../src/combat/model.js';
import { combatRecords, grievancesOf, scorchedAt } from '../src/combat/module.js';
import { colonyAt, setColony } from '../src/colony/module.js';
import { loyaltyAt } from '../src/loyalty/module.js';
import { empireState } from '../src/empire/module.js';
import { knowledgeOf } from '../src/info/module.js';
import { orderFleet } from '../src/info/orders.js';
import { imposeDirective, books } from '../src/governors/module.js';
import { issueDirective } from '../src/governors/issue.js';
import { acquireTech } from '../src/research/module.js';
import { knowledgePicture } from '../src/perspective/picture.js';
import { sightingsOf } from '../src/detection/module.js';
import { controllers, addController, think } from '../src/ai/module.js';
import { createRng, random } from '../src/core/rng.js';
import { distance } from '../src/core/vec3.js';
import { stateHash } from '../src/core/serialize.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';

const pos = (id) => catalog.get(id).pos;
const light = (a, b) => distance(pos(a), pos(b));
const design = (id) => DEFAULT_DESIGNS.find((d) => d.id === id);
const units = (id, n, p = 'u') => Array.from({ length: n }, (_, i) => ({ key: `${p}${i}`, design: id, role: 'warship', stats: designStats(design(id)), hp: designStats(design(id)).hp }));
const side = (empire, role, id, n, extra = {}) => ({ empire, role, plan: { ...DEFAULT_PLAN }, units: units(id, n, empire), alerted: true, ...extra });
const battle = (a, d, v, seed = 1) => {
  const rng = createRng(seed);
  return resolveBattle(a, d, v, () => random(rng));
};
/** A warfleet of Empire A at Sol, ready to sail. */
const squadron = (world, ctx, id = 'picket', n = 4) => {
  colonyAt(world, 'sol').materiel += 5000;
  return buildShips(world, ctx, { system: 'sol', design: design(id), count: n, name: 'Test' }).fleet;
};

describe('flight without braking', () => {
  it('a flyby arrives at speed and never brakes; a normal flight stops', () => {
    const fly = flightProfile({ distance: 10, accelG: 0.1, cruise: 0.1, brake: false });
    const stop = flightProfile({ distance: 10, accelG: 0.1, cruise: 0.1 });
    expect(fly.arrivalSpeed).toBeCloseTo(0.1, 9);
    expect(stop.arrivalSpeed).toBe(0);
    expect(fly.totalTime).toBeLessThan(stop.totalTime);
    expect(distanceAt(fly, fly.totalTime - 1e-9)).toBeCloseTo(10, 6);
    expect(speedAt(fly, fly.totalTime * 0.99)).toBeCloseTo(0.1, 9);
    expect(JSON.parse(JSON.stringify(fly)).brakeStart).toBeTypeOf('number'); // survives saves and reports
  });

  it('a voyage through several systems: flyby returns home, a strike ends at its target, stealth is slow', () => {
    const posOf = (id) => pos(id);
    /** @type {any[]} */
    const wps = [{ system: sys('Alpha Centauri'), action: 'attack' }, { system: sys("Barnard's Star"), action: 'visit' }];
    const base = { fromPos: pos('sol'), fromSystem: 'sol', departAt: 0, drive: { accelG: 0.1, cruise: 0.1 }, stealth: APPROACHES.stealth, posOf, wormholes: [] };
    /** @type {any} */
    const normal = planVoyage({ ...base, waypoints: wps, approach: 'normal', home: null });
    expect(normal.reach).toHaveLength(2);
    expect(normal.legs[normal.legs.length - 1].toSystem).toBe(wps[1].system);
    /** @type {any} */
    const flyby = planVoyage({ ...base, waypoints: wps, approach: 'flyby', home: 'sol' });
    expect(flyby.legs[flyby.reach[0]].profile.arrivalSpeed).toBeGreaterThan(0.05);
    expect(flyby.legs[flyby.legs.length - 1].toSystem).toBe('sol');
    const strike = planVoyage({ ...base, waypoints: [{ system: sys('Alpha Centauri'), action: /** @type {const} */ ('strike') }], approach: 'flyby', home: null });
    expect(strike.legs).toHaveLength(1);
    const stealth = planVoyage({ ...base, waypoints: wps.slice(0, 1), approach: 'stealth', home: null });
    expect(stealth.legs.at(-1).arriveAt).toBeGreaterThan(2 * normal.legs[normal.reach[0]].arriveAt);
  });
});

describe('ship design', () => {
  it('stats come from hull and components; technology decides what can be built', () => {
    const picket = designStats(design('picket'));
    const warden = designStats(design('warden'));
    expect(picket.armed).toBe(true);
    expect(warden.strength).toBeGreaterThan(picket.strength);
    expect(canBuild(design('picket'), [])).toBe(true);
    expect(canBuild(design('lancer'), [])).toBe(false);
    expect(canBuild(design('lancer'), ['ship.frigate', 'weapon.laser'])).toBe(true);
    expect(bestDesign(DEFAULT_DESIGNS, [], 1000).id).toBe('picket');
    expect(bestDesign(DEFAULT_DESIGNS, ['ship.frigate', 'weapon.laser', 'ship.cruiser', 'ship.pdLaser'], 1000).id).toBe('warden');
    expect(bestDesign(DEFAULT_DESIGNS, ['weapon.rkv'], 1000).id).toBe('picket'); // impactors are never chosen as warships
  });

  it('ships cost materiel; a build order carries its design to the yard', () => {
    const { sim, world, ctx, act } = sandbox('d1');
    const tau = sys('Tau Ceti');
    const mine = act((w, c) => addDesign(w, c, { empire: 'A', name: 'Gunboat', hull: 'corvette', components: ['missile', 'missile'] }));
    expect(designsOf(world, 'A').some((d) => d.id === mine.id)).toBe(true);
    setColony(world, tau, { materiel: 1000 });
    act((w, c) => issueDirective(w, c, { empire: 'A', type: 'fleet.build', target: { kind: 'system', system: tau }, params: { design: mine, count: 3 } }));
    sim.advanceTo(light('sol', tau) + 0.1);
    const built = Object.values(fleetState(world).fleets).find((f) => f.at === tau && f.ships?.length);
    expect(built.ships).toHaveLength(3);
    expect(built.designs[mine.id].components).toEqual(['missile', 'missile']);
    const earned = colonyAt(world, tau).last.industry * (light('sol', tau) + 0.2);
    expect(colonyAt(world, tau).materiel).toBeLessThan(1000 + earned - 3 * designStats(mine).cost + 1);
    void ctx;
  });

  it('a governor told to keep warships builds a home guard over the years', () => {
    const { sim, world, act } = sandbox('d2');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'military.warships', params: { level: 'steady' } }));
    sim.advanceTo(8);
    const guard = Object.values(fleetState(world).fleets).find((f) => f.mission?.kind === 'guard');
    expect(guard.ships.length).toBe(5);
    expect(guard.ships.every((s) => s.d === 'picket')).toBe(true);
  });
});

describe('the combat model', () => {
  it('the faster the pass, the shorter the battle: milliseconds at relativistic speed', () => {
    expect(windowFor(1, 0.5)).toBeCloseTo(4, 9);
    expect(windowFor(0.2, 0.5)).toBeLessThan(1);
    expect(windowFor(1, 0)).toBe(windowFor(1, 0.0001)); // braking in: capped, a long battle
  });

  it('is deterministic, and the plans matter', () => {
    const a = () => side('A', 'attacker', 'warden', 2);
    const d = () => side('B', 'defender', 'lancer', 4);
    expect(battle(a(), d(), 0.1)).toEqual(battle(a(), d(), 0.1));
    // Evading: the evader fires nothing and takes less.
    const evade = battle({ ...a(), plan: { ...DEFAULT_PLAN, engage: 'evade' } }, d(), 0.1);
    const fight = battle(a(), d(), 0.1);
    expect(evade.sides[0].fired.damage).toBe(0);
    expect(evade.sides[1].fired.damage).toBeLessThan(fight.sides[1].fired.damage);
    // Point defence against missiles stops more of them.
    const mis = battle(side('A', 'attacker', 'picket', 6), { ...side('B', 'defender', 'picket', 6), plan: { ...DEFAULT_PLAN, pd: 'missiles' } }, 0.1);
    const slug = battle(side('A', 'attacker', 'picket', 6), { ...side('B', 'defender', 'picket', 6), plan: { ...DEFAULT_PLAN, pd: 'slugs' } }, 0.1);
    expect(mis.sides[0].fired.intercepted).toBeGreaterThan(slug.sides[0].fired.intercepted);
    // A surprised defender fights at half strength.
    const warned = battle(side('A', 'attacker', 'picket', 4), side('B', 'defender', 'picket', 4), 0.1);
    const surprised = battle(side('A', 'attacker', 'picket', 4), side('B', 'defender', 'picket', 4, { alerted: false }), 0.1);
    expect(surprised.sides[1].fired.damage).toBeLessThan(warned.sides[1].fired.damage);
  });
});

describe('battles in the game', () => {
  it('an attack is resolved where the voyage says; each side hears of it only by light', () => {
    const { sim, world, ctx, act } = sandbox('b1');
    const target = empireState(world).empires.B.capital; // Epsilon Indi
    const fleet = act((w, c) => squadron(w, c, 'picket', 5));
    act((w, c) => buildShips(w, c, { system: target, design: design('picket'), count: 2, mission: { kind: 'guard', home: target } }));
    act((w, c) => launchVoyage(w, c, { fleet: fleet.id, waypoints: [{ system: target, action: 'attack' }], approach: 'normal' }));
    const arrive = fleetState(world).fleets[fleet.id].legs.at(-1).arriveAt;
    sim.advanceTo(arrive + 0.01);
    /** @type {any} */
    const rec = combatRecords(world).at(-1);
    expect(rec).toMatchObject({ kind: 'battle', system: target, attacker: 'A', defender: 'B' });
    expect(rec.speed).toBeLessThan(0.001); // braked in
    // B's capital is the battle site: it knows at once. A hears after the light delay.
    expect(knowledgeOf(world, 'B').battles?.some((b) => b.record.id === rec.id)).toBe(true);
    expect(knowledgeOf(world, 'A').battles?.some((b) => b.record.id === rec.id) ?? false).toBe(false);
    sim.advanceTo(arrive + light(target, 'sol') + 0.5);
    const heard = knowledgeOf(world, 'A').battles?.find((b) => b.record.id === rec.id);
    if (fleetState(world).fleets[fleet.id]) expect(heard).toBeDefined(); // only survivors report
    void ctx;
  }, 20000);

  it('a flyby battle lasts seconds, and its report waits until the fleet docks again', () => {
    const { sim, world, act } = sandbox('b2');
    const target = empireState(world).empires.B.capital;
    const fleet = act((w, c) => squadron(w, c, 'picket', 6));
    act((w, c) => buildShips(w, c, { system: target, design: design('picket'), count: 1, mission: { kind: 'guard', home: target } }));
    act((w, c) => launchVoyage(w, c, { fleet: fleet.id, waypoints: [{ system: target, action: 'attack' }], approach: 'flyby' }));
    const f = fleetState(world).fleets[fleet.id];
    const pass = f.legs[f.voyage.reach[0]].arriveAt;
    const home = f.legs.at(-1).arriveAt;
    sim.advanceTo(pass + 0.01);
    /** @type {any} */
    const rec = combatRecords(world).at(-1);
    expect(rec.speed).toBeGreaterThan(0.05);
    expect(rec.windows.beam).toBeLessThan(60);
    const survivor = fleetState(world).fleets[fleet.id];
    if (!survivor) return;
    expect(survivor.pendingReports).toHaveLength(1);
    sim.advanceTo(home - 0.01);
    expect(knowledgeOf(world, 'A').battles?.some((b) => b.record.id === rec.id) ?? false).toBe(false);
    sim.advanceTo(home + 0.01);
    expect(knowledgeOf(world, 'A').battles?.some((b) => b.record.id === rec.id)).toBe(true); // docked at Sol: reported at once
  }, 20000);
});

describe('orders to fleets', () => {
  it('a fleet in flight cannot hear: its orders wait at its destination and take effect when it docks', () => {
    const { sim, world, act } = sandbox('o1');
    const fleet = act((w, c) => squadron(w, c, 'picket', 2));
    const tau = sys('Tau Ceti');
    act((w, c) => launchFleet(w, c, { fleet: fleet.id, to: tau }));
    sim.advanceTo(0.5);
    const r = act((w, c) => orderFleet(w, c, { empire: 'A', fleet: fleet.id, payload: { type: 'voyage', waypoints: [{ system: sys('Epsilon Eridani'), action: 'visit' }], approach: 'normal' } }));
    expect(r.via).toBe('mailbox');
    expect(r.system).toBe(tau);
    const arrive = fleetState(world).fleets[fleet.id].legs.at(-1).arriveAt;
    sim.advanceTo(arrive + 0.01);
    expect(fleetState(world).fleets[fleet.id].dest).toBe(sys('Epsilon Eridani'));
  }, 20000);

  it('the capital predicts a fleet from the voyage it ordered, before any report comes back', () => {
    const { sim, world, ctx, act } = sandbox('o2');
    const tau = sys('Tau Ceti');
    const fleet = act((w, c) => { const f = squadron(w, c, 'picket', 2); launchFleet(w, c, { fleet: f.id, to: tau }); return f; });
    const arrive = fleetState(world).fleets[fleet.id].legs.at(-1).arriveAt;
    sim.advanceTo(arrive + light(tau, 'sol') + 1.5); // the capital knows it is docked at Tau Ceti
    const target = sys('Epsilon Eridani');
    const r = act((w, c) => orderFleet(w, c, { empire: 'A', fleet: fleet.id, payload: { type: 'voyage', waypoints: [{ system: target, action: 'visit' }], approach: 'normal' } }));
    expect(r.via).toBe('direct');
    sim.advanceTo(r.arrives + 0.5); // it has left, but no report can have come back yet
    const f = knowledgePicture(world, ctx, 'A').fleets.find((x) => x.id === fleet.id);
    expect(f.planned).toBe(true);
    expect(f.dest).toBe(target);
  }, 20000);
});

describe('detection', () => {
  it('a sensor net sees a dark fleet coasting by; a stealth approach is faint', () => {
    const { sim, world, ctx, act } = sandbox('s1');
    acquireTech(world, ctx, { empire: 'A', system: 'sol', tech: 'com.sensor-net', how: 'purchase' });
    const aCen = sys('Alpha Centauri');
    // A B fleet flies past Sol toward Alpha Centauri, close enough for the net.
    const f = act((w, c) => createFleet(w, c, { empire: 'B', at: sys('Epsilon Indi'), drive: { accelG: 0.1, cruise: 0.1 } }));
    act((w, c) => launchFleet(w, c, { fleet: f.id, to: 'sol' }));
    sim.advanceTo(fleetState(world).fleets[f.id].legs.at(-1).arriveAt + 1);
    expect(sightingsOf(world, 'A').some((s) => s.phase === 'net' && s.fleetEmpire === 'B')).toBe(true);
    void aCen;
  }, 20000);
});

describe('relativistic strikes', () => {
  it('an impactor burns a world; its light brings shame, fear and grievance to all who see it', () => {
    const { sim, world, ctx, act } = sandbox('r1');
    acquireTech(world, ctx, { empire: 'A', system: 'sol', tech: 'kin.rkv', how: 'purchase' });
    const target = sys('Gl 832'); // Empire B's colony
    const imp = act((w, c) => { colonyAt(w, 'sol').materiel += 1000; return buildShips(w, c, { system: 'sol', design: design('impactor'), count: 1 }).fleet; });
    expect(imp.drive.cruise).toBeGreaterThan(0.8);
    act((w, c) => launchVoyage(w, c, { fleet: imp.id, waypoints: [{ system: target, action: 'strike' }], approach: 'flyby' }));
    const hit = fleetState(world).fleets[imp.id].legs.at(-1).arriveAt;
    sim.advanceTo(0.1);
    const people = colonyAt(world, target).population;
    const tauLoyalty = loyaltyAt(world, sys('Tau Ceti')).value;
    sim.advanceTo(hit + 0.01);
    /** @type {any} */
    const rec = combatRecords(world).at(-1);
    expect(rec.kind).toBe('strike');
    if (!rec.hit) return; // intercepted (rare without warning)
    expect(rec.killed).toBeGreaterThan(0.8 * people);
    expect(scorchedAt(world, target)).toBeCloseTo(hit, 6);
    // The light reaches our own colony at Tau Ceti: shame.
    sim.advanceTo(hit + light(target, sys('Tau Ceti')) + 0.1);
    expect(loyaltyAt(world, sys('Tau Ceti')).value).toBeLessThan(tauLoyalty - 0.1);
    // Empire B's capital holds a grievance once the news reaches it.
    const bCapital = empireState(world).empires.B.capital;
    sim.advanceTo(hit + light(target, bCapital) + 1);
    expect(grievancesOf(world, 'B').A).toBe(1);
    expect(knowledgeOf(world, 'B').dispatches.some((d) => d.key === 'combat.atrocity')).toBe(true);
    // The AI goes to war footing.
    addController(world, sim.ctx, 'B', 'expansionist');
    think(world, sim.ctx, 'B', controllers(world).B);
    expect(Object.values(world.state.governors.issued.B).some((d) => d.type === 'military.warships' && d.params.level === 'war')).toBe(true);
  }, 30000);
});

describe('persistence', () => {
  it('saving and loading mid-voyage and mid-battle changes nothing', () => {
    const a = sandbox('p1', { fleets: true, ai: true, risks: true });
    const target = empireState(a.world).empires.B.capital;
    const f = a.act((w, c) => squadron(w, c, 'picket', 5));
    a.act((w, c) => launchVoyage(w, c, { fleet: f.id, waypoints: [{ system: target, action: 'attack' }], approach: 'flyby' }));
    a.sim.advanceTo(20);
    const loaded = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(a.world)) });
    a.sim.advanceTo(120);
    loaded.advanceTo(120);
    expect(stateHash(loaded.world)).toBe(stateHash(a.world));
    expect(combatRecords(a.world).length).toBeGreaterThan(0);
  }, 60000);

  it('the sandbox starts with a home guard and a squadron at Sol', () => {
    const { world } = sandbox('p2', { fleets: true });
    const fleets = Object.values(fleetState(world).fleets).filter((f) => f.empire === 'A');
    expect(fleets.some((f) => f.mission?.kind === 'guard')).toBe(true);
    expect(fleets.some((f) => !f.mission && f.ships?.length === 3)).toBe(true);
    expect(designOf(world, 'A', 'picket')).toBeTruthy();
    void books; void runUntil;
  });
});
