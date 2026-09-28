import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog, runUntil } from './helpers.js';
import { RULES, forces, stageOf, secessionChance } from '../src/loyalty/model.js';
import { records, loyaltyAt, change, secede, driftOf } from '../src/loyalty/module.js';
import { empireState, establishPresence } from '../src/empire/module.js';
import { colonyAt, setColony } from '../src/colony/module.js';
import { RULES as COLONY } from '../src/colony/model.js';
import { preparations, knownPreparations } from '../src/colony/preparation.js';
import { labs, acquireTech } from '../src/research/module.js';
import { imposeDirective, books } from '../src/governors/module.js';
import { issueDirective } from '../src/governors/issue.js';
import { ordersPicture } from '../src/perspective/directives.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { classifyPolitics, classifyEconomy } from '../src/perspective/politics.js';
import { knowledgeOf } from '../src/info/module.js';
import { fleetState } from '../src/fleet/module.js';
import { controllers, think, addController } from '../src/ai/module.js';
import { distance } from '../src/core/vec3.js';
import { stateHash } from '../src/core/serialize.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';

const light = (a, b) => distance(catalog.get(a).pos, catalog.get(b).pos);
const base = { distance: 10, sinceContact: 0, instability: 0.1, population: 10000, hungry: false, unrest: false, prosperous: true, autonomy: 'normal', caps: undefined };
const fleets = (world, role) => Object.values(fleetState(world).fleets).filter((f) => !role || f.role === role);

describe('loyalty rules', () => {
  it('distance, neglect, instability and hardship push; prosperity and institutions pull', () => {
    const f = forces(base);
    expect(forces({ ...base, distance: 40 }).push.latency).toBeCloseTo(4 * f.push.latency, 12);
    expect(forces({ ...base, sinceContact: RULES.push.neglectGrace }).push.neglect).toBe(0);
    expect(forces({ ...base, sinceContact: RULES.push.neglectGrace + 100 }).push.neglect).toBeGreaterThan(0);
    expect(forces({ ...base, instability: 1 }).net).toBeLessThan(f.net);
    expect(forces({ ...base, hungry: true, unrest: true }).net).toBeLessThan(f.net - 0.03);
    expect(forces({ ...base, prosperous: false }).net).toBeLessThan(f.net);
    // Broad autonomy eases the pressure; tight control adds to it.
    expect(forces({ ...base, distance: 30, autonomy: 'broad' }).net).toBeGreaterThan(forces({ ...base, distance: 30, autonomy: 'tight' }).net);
    // Institutions: charters dampen the push, consensus adds to the pull.
    expect(forces({ ...base, caps: { push: 0.5, pull: 0.004, latency: 1, secession: 1 } }).net).toBeGreaterThan(f.net);
  });

  it('stages by threshold; only a colony far gone can secede', () => {
    expect(stageOf(0.9)).toBe('loyal');
    expect(stageOf(RULES.stages.loyal - 0.01)).toBe('restless');
    expect(stageOf(RULES.stages.restless - 0.01)).toBe('autonomous');
    expect(secessionChance(0.3, undefined)).toBe(0);
    expect(secessionChance(0.1, undefined)).toBe(RULES.secession.chance);
    expect(secessionChance(0.1, { push: 1, pull: 0, latency: 1, secession: 0.4 })).toBeCloseTo(0.4 * RULES.secession.chance, 12);
  });
});

describe('drift in the sandbox', () => {
  it('every colony but the capital has a loyalty, starting by how it was founded', () => {
    const { sim, world } = sandbox('l1');
    sim.advanceTo(0.1);
    expect(loyaltyAt(world, 'sol')).toBeNull();
    const acen = loyaltyAt(world, sys('Alpha Centauri'));
    expect(acen.value).toBeCloseTo(RULES.start.ark, 1);
    expect(acen.stage).toBe('loyal');
  });

  it('neglect estranges a colony', () => {
    const { sim, world, ctx } = sandbox('l2n');
    const far = sys('Fomalhaut');
    sim.advanceTo(0.1);
    const heard = driftOf(world, ctx, far).net;
    records(world)[far].lastContact = -200; // nothing from home for two centuries
    expect(driftOf(world, ctx, far).push.neglect).toBeGreaterThan(0);
    expect(driftOf(world, ctx, far).net).toBeLessThan(heard - 0.005);
  });

  it('orders from home keep a distant colony close', () => {
    const run = (orders) => {
      const { sim, world, act } = sandbox('l2');
      const far = sys('Fomalhaut'); // 25 ly, reached through the relay chain
      sim.advanceTo(0.1);
      for (let y = 0; y < 150; y += 10) {
        if (orders) act((w, c) => issueDirective(w, c, { empire: 'A', type: 'governance.reporting', target: { kind: 'system', system: far }, params: { mode: 'routine' } }));
        sim.advanceBy(10);
      }
      return loyaltyAt(world, far).value;
    };
    const alone = run(false);
    const cared = run(true);
    expect(cared).toBeGreaterThan(alone + 0.05);
  }, 30000);

  it('the capital learns loyalty from reports, as old as they are', () => {
    const { sim, world, ctx } = sandbox('l3');
    const tau = sys('Tau Ceti');
    sim.advanceTo(20);
    const known = knowledgePicture(world, ctx, 'A').systems.find((s) => s.id === tau);
    const truth = truthPicture(world, ctx, 'A').systems.find((s) => s.id === tau);
    expect(known.loyalty.stage).toBe('loyal');
    expect(known.validAt).toBeLessThan(20 - light(tau, 'sol') + 1e-9);
    expect(truth.loyalty.value).toBeCloseTo(loyaltyAt(world, tau).value, 9);
    expect(driftOf(world, ctx, tau).net).toBeTypeOf('number');
  });
});

describe('obedience', () => {
  it('restless colonies ignore low-priority orders; autonomous ones refuse all but governance', () => {
    const { world, act } = sandbox('o1');
    const tau = sys('Tau Ceti');
    act((w, c) => change(w, c, tau, records(w)[tau] ?? (w.state.loyalty.records[tau] = { empire: 'A', value: 0.9, stage: /** @type {const} */ ('loyal'), lastContact: 0, lastDirective: null, nextRollAt: 1 }), 0));
    const rec = records(world)[tau];
    act((w, c) => change(w, c, tau, rec, 0.5 - rec.value));
    expect(rec.stage).toBe('restless');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'economy.focus', params: { focus: 'mining' }, priority: 'low' }));
    expect(books(world)[tau].settings.economyFocus).toBe('balanced');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'economy.focus', params: { focus: 'mining' } }));
    expect(books(world)[tau].settings.economyFocus).toBe('mining');
    act((w, c) => change(w, c, tau, rec, 0.2 - rec.value));
    expect(rec.stage).toBe('autonomous');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'economy.focus', params: { focus: 'research' }, priority: 'high' }));
    expect(books(world)[tau].settings.economyFocus).toBe('mining');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'governance.autonomy', params: { level: 'broad' } }));
    expect(books(world)[tau].settings.autonomy).toBe('broad');
    expect(books(world)[tau].refused.length).toBe(2);
  });

  it('the capital sees a refused order as refused once the report comes back', () => {
    const { sim, world, ctx, act } = sandbox('o2');
    const tau = sys('Tau Ceti');
    sim.advanceTo(0.1);
    act((w, c) => change(w, c, tau, records(w)[tau], 0.2 - records(w)[tau].value));
    const d = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'economy.focus', target: { kind: 'system', system: tau }, params: { focus: 'mining' } }));
    sim.advanceTo(0.1 + 2 * light('sol', tau) + 1.2);
    expect(ordersPicture(world, ctx, 'A').find((o) => o.id === d.id).targetStatus[0].status).toBe('refused');
  });
});

describe('independence', () => {
  it('a colony declares independence: a new polity keeps its people and knowledge; autonomous neighbours join; the capital hears by light', () => {
    const { sim, world, ctx, act } = sandbox('i1');
    const altair = sys('Altair');
    const tau = sys('Tau Ceti');
    sim.advanceTo(0.1);
    act((w, c) => { establishPresence(w, c, { empire: 'A', system: sys('70 Ophiuchi') }); });
    sim.advanceTo(0.2);
    const neighbour = sys('70 Ophiuchi');
    act((w, c) => change(w, c, neighbour, records(w)[neighbour], 0.2 - records(w)[neighbour].value));
    const people = colonyAt(world, altair).population;
    const known = Object.keys(labs(world)[altair].known).length;
    const id = act((w, c) => secede(w, c, altair));
    expect(id).toBe('C');
    const polity = empireState(world).empires.C;
    expect(polity).toMatchObject({ parent: 'A', capital: altair });
    expect(empireState(world).presence[altair].empire).toBe('C');
    expect(colonyAt(world, altair).population).toBe(people);
    expect(colonyAt(world, altair).empire).toBe('C');
    expect(Object.keys(labs(world)[altair].known).length).toBeGreaterThanOrEqual(known);
    expect(loyaltyAt(world, altair)).toBeNull(); // a capital now
    if (distance(catalog.get(neighbour).pos, catalog.get(altair).pos) <= RULES.secession.joinRange) {
      expect(empireState(world).presence[neighbour].empire).toBe('C');
    }
    expect(empireState(world).presence[tau].empire).toBe('A');
    // News of it travels home at light speed.
    const heard = () => knowledgeOf(world, 'A').dispatches.find((d) => d.key === 'colony.independence' && d.params.system === altair);
    expect(heard()).toBeUndefined();
    sim.advanceBy(light(altair, 'sol') + 0.5);
    expect(heard()).toBeDefined();
    expect(knowledgeOf(world, 'A').systems[altair].data.owner).toBe('C');
    expect(controllers(world).C.personality).toBe('cautious'); // the new polity plays for itself
    expect(classifyPolitics(knowledgePicture(world, ctx, 'A')).get(altair)).toBe('faction:C');
  }, 20000);

  it('a polity that loses its last system dissolves', () => {
    const { sim, world, act } = sandbox('i2');
    const vega = sys('Vega');
    sim.advanceTo(0.1);
    act((w, c) => secede(w, c, vega));
    const id = empireState(world).presence[vega].empire;
    setColony(world, vega, { population: 10, stock: 0 });
    sim.advanceTo(2.5);
    expect(empireState(world).presence[vega]).toBeUndefined();
    expect(empireState(world).empires[id].dissolvedAt).toBeGreaterThan(0);
  });
});

describe('cultural missions', () => {
  it('the capital sends a mission to its least loyal colony; its arrival restores loyalty', () => {
    const { sim, world, ctx, act } = sandbox('c1');
    const tau = sys('Tau Ceti');
    sim.advanceTo(0.1);
    acquireTech(world, ctx, { empire: 'A', system: 'sol', tech: 'soc.missions', how: 'purchase' });
    act((w, c) => change(w, c, tau, records(w)[tau], 0.45 - records(w)[tau].value));
    sim.advanceTo(light(tau, 'sol') + 1.5); // the capital learns of it
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'governance.missions', params: {} }));
    sim.advanceBy(1.1);
    const envoy = fleets(world, 'envoy')[0];
    expect(envoy.mission.target).toBe(tau);
    const before = loyaltyAt(world, tau).value;
    sim.advanceTo(envoy.legs.at(-1).arriveAt + 0.05);
    expect(loyaltyAt(world, tau).value).toBeGreaterThan(before + RULES.pull.mission * 0.8);
    expect(fleetState(world).fleets[envoy.id]).toBeUndefined();
  }, 20000);
});

describe('robotic preparation', () => {
  it('seeders need their technology; they prepare a site, and colonists landing there get its benefits', () => {
    const { sim, world, ctx, act } = sandbox('p1');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.prepare', params: { criteria: 'nearest', maxRange: 10 } }));
    sim.advanceTo(1.1);
    expect(fleets(world, 'seeder')).toHaveLength(0);
    acquireTech(world, ctx, { empire: 'A', system: 'sol', tech: 'pla.seeders', how: 'purchase' });
    runUntil(sim, () => fleets(world, 'seeder').length > 0, { step: 0.1, max: 3 }); // the governor's next yearly round
    delete books(world).sol.directives['expansion.prepare']; // one seeder is enough here
    const seeder = fleets(world, 'seeder')[0];
    const target = seeder.mission.target;
    sim.advanceTo(seeder.legs.at(-1).arriveAt + 0.05);
    const rec = preparations(world)[target];
    expect(rec.status).toBe('working');
    rec.failAt = null; // this one succeeds
    sim.advanceTo(rec.readyAt + light(target, 'sol') + 0.5);
    expect(rec.status).toBe('ready');
    expect(knownPreparations(world, 'A')[target].status).toBe('ready');
    // Colonists to prepared sites: embryo ships travel light.
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { criteria: 'prepared', maxRange: 10 } }));
    runUntil(sim, () => fleets(world, 'settler').length > 0, { step: 0.1, max: 25 });
    const settler = fleets(world, 'settler')[0];
    expect(settler.mission).toMatchObject({ target, expectPrepared: true, mode: 'embryo' });
    sim.advanceTo(settler.legs.at(-1).arriveAt + 0.05);
    const c = colonyAt(world, target);
    expect(c.prepared).toBe(1);
    expect(c.stock).toBeGreaterThan(COLONY.modes.embryo.stock * 0.9);
    expect(c.instability).toBeLessThan(COLONY.society.embryo.instability * 0.7);
    expect(preparations(world)[target]).toBeUndefined();
  }, 30000);

  it('a failed preparation leaves colonists to land on an unprepared world', () => {
    const { sim, world, ctx, act } = sandbox('p2');
    acquireTech(world, ctx, { empire: 'A', system: 'sol', tech: 'pla.seeders', how: 'purchase' });
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.prepare', params: { criteria: 'nearest', maxRange: 10 } }));
    runUntil(sim, () => fleets(world, 'seeder').length > 0, { step: 0.1, max: 3 });
    delete books(world).sol.directives['expansion.prepare']; // one seeder is enough here
    const seeder = fleets(world, 'seeder')[0];
    const target = seeder.mission.target;
    const landed = seeder.legs.at(-1).arriveAt;
    sim.advanceTo(landed + 0.05);
    const rec = preparations(world)[target];
    rec.failAt = sim.world.time + 1; // the robots will fail (silently or not)
    // The capital heard only that work began; it sends colonists.
    sim.advanceTo(landed + light(target, 'sol') + 0.5);
    expect(knownPreparations(world, 'A')[target].status).toBe('working');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { criteria: 'prepared', maxRange: 10 } }));
    runUntil(sim, () => fleets(world, 'settler').length > 0, { step: 0.1, max: 25 });
    const settler = fleets(world, 'settler').find((f) => f.mission.target === target);
    expect(settler.mission.expectPrepared).toBe(true);
    sim.advanceTo(Math.max(settler.legs.at(-1).arriveAt, rec.readyAt) + 0.05);
    const c = colonyAt(world, target);
    expect(rec.status).toBe('failed');
    expect(c.prepared).toBe(0);
    expect(c.stock).toBeLessThanOrEqual(COLONY.modes.embryo.stock * 0.5);
    sim.advanceBy(light(target, 'sol') + 0.5);
    expect(knowledgeOf(world, 'A').dispatches.some((d) => d.key === 'colony.unprepared' && d.params.system === target)).toBe(true);
  }, 30000);
});

describe('AI', () => {
  it('Empire B plays through directives from its own knowledge, and expands', () => {
    const { sim, world } = sandbox('ai1', { ai: true });
    const held = () => Object.values(empireState(world).presence).filter((p) => p.empire === 'B').length;
    const start = held();
    sim.advanceTo(150);
    const issued = Object.values(world.state.governors.issued.B ?? {});
    expect(issued.some((d) => d.type === 'expansion.explore')).toBe(true);
    expect(issued.some((d) => d.type === 'expansion.settle')).toBe(true);
    expect(issued.some((d) => d.type === 'research.focus')).toBe(true);
    expect(held()).toBeGreaterThan(start);
  }, 60000);

  it('feeds the colonies it believes hungry', () => {
    const { sim, world, ctx } = sandbox('ai2');
    addController(world, ctx, 'B', 'cautious');
    sim.advanceTo(10);
    const gl = sys('Gl 832');
    const entry = knowledgeOf(world, 'B').systems[gl];
    entry.data = { ...entry.data, colony: { ...entry.data.colony, food: 0.8 } };
    think(world, sim.ctx, 'B', controllers(world).B);
    expect(Object.values(world.state.governors.issued.B).some((d) => d.type === 'economy.focus' && d.params.focus === 'agriculture' && d.targets[0].system === gl)).toBe(true);
  });

  it('saving and loading mid-game changes nothing', () => {
    const a = sandbox('ai4', { ai: true, risks: true });
    a.sim.advanceTo(60);
    const loaded = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(a.world)) });
    a.sim.advanceTo(140);
    loaded.advanceTo(140);
    expect(stateHash(loaded.world)).toBe(stateHash(a.world));
  }, 60000);

  it('a game with AI, loyalty and disasters stays deterministic', () => {
    const run = () => {
      const { sim, world } = sandbox('ai3', { ai: true, risks: true });
      sim.advanceTo(120);
      return stateHash(world);
    };
    expect(run()).toBe(run());
  }, 60000);
});

describe('map views', () => {
  it('politics and economy keys come from the picture', () => {
    const { sim, world, ctx, act } = sandbox('v1');
    sim.advanceTo(20);
    const tau = sys('Tau Ceti');
    act((w, c) => change(w, c, tau, records(w)[tau], 0.5 - records(w)[tau].value));
    const truth = truthPicture(world, ctx, 'A');
    const pol = classifyPolitics(truth);
    expect(pol.get('sol')).toBe('capital');
    expect(pol.get(tau)).toBe('restless');
    expect(pol.get(sys('Epsilon Indi'))).toBe('faction:B');
    const eco = classifyEconomy(truth);
    expect(eco.get('sol')).toBe('billions');
    expect(['thousands', 'hungry']).toContain(eco.get(tau));
  });
});
