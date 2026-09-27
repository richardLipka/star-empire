import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog, runUntil } from './helpers.js';
import { TECHS, AREAS, TARGETS, CONDITIONS, START_TECHS, RULES, tech, targetOf, leadsTo, influences } from '../src/research/catalog.js';
import { capabilities } from '../src/research/effects.js';
import { labs, frontier, acquireTech, grantCondition, breakthroughCost } from '../src/research/module.js';
import { researchPicture } from '../src/perspective/research.js';
import { imposeDirective } from '../src/governors/module.js';
import { issueDirective } from '../src/governors/issue.js';
import { DRIVE_TIERS, START_DRIVE, driveFor } from '../src/fleet/drives.js';
import { empireState, establishPresence } from '../src/empire/module.js';
import { fleetState } from '../src/fleet/module.js';
import { knowledgeOf, truthNetwork } from '../src/info/module.js';
import { distance } from '../src/core/vec3.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { stateHash } from '../src/core/serialize.js';
import { colonyAt } from '../src/colony/module.js';
import { research } from '../src/colony/model.js';

const pos = (id) => catalog.get(id).pos;
const light = (a, b) => distance(pos(a), pos(b));

/** A sandbox where nobody researches unless the test says so. */
function quiet(seed) {
  const s = sandbox(seed);
  for (const system of Object.keys(empireState(s.world).presence)) {
    s.act((w, c) => imposeDirective(w, c, { system, type: 'research.focus', params: { field: 'none' } }));
  }
  return s;
}

describe('technology catalogue', () => {
  it('has the ten areas, each with technologies', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['engines', 'communication', 'informatics', 'planetary', 'sociology', 'projectile', 'energy', 'missiles', 'wormholes', 'exotic']);
    for (const a of AREAS) expect(TECHS.filter((t) => t.area === a.id).length).toBeGreaterThanOrEqual(6);
    expect(new Set(TECHS.map((t) => t.id)).size).toBe(TECHS.length);
  });

  it('prerequisites exist, never point to a deeper tier, and have no cycles', () => {
    for (const t of TECHS) {
      for (const r of t.requires) {
        expect(() => tech(r), `${t.id} → ${r}`).not.toThrow();
        expect(tech(r).tier, `${t.id} → ${r}`).toBeLessThanOrEqual(t.tier);
      }
    }
    const state = new Map();
    const visit = (id) => {
      if (state.get(id) === 'done') return;
      expect(state.get(id), `cycle at ${id}`).not.toBe('open');
      state.set(id, 'open');
      for (const r of tech(id).requires) visit(r);
      state.set(id, 'done');
    };
    for (const t of TECHS) visit(t.id);
  });

  it('applications are conditioned by theory; many links cross areas', () => {
    for (const t of TECHS.filter((x) => x.kind === 'application' && !x.start)) {
      expect(t.requires.some((r) => tech(r).kind === 'theory'), t.id).toBe(true);
    }
    const cross = TECHS.flatMap((t) => t.requires.filter((r) => tech(r).area !== t.area));
    expect(cross.length).toBeGreaterThanOrEqual(25);
  });

  it('every technology is reachable from the start (given all conditions)', () => {
    const known = new Set(START_TECHS);
    for (let changed = true; changed;) {
      changed = false;
      for (const t of TECHS) if (!known.has(t.id) && t.requires.every((r) => known.has(r))) { known.add(t.id); changed = true; }
    }
    expect(TECHS.filter((t) => !known.has(t.id)).map((t) => t.id)).toEqual([]);
  });

  it('effects point at registered targets; conditions are declared; every drive is researchable', () => {
    for (const t of TECHS) {
      for (const e of t.effects) {
        expect(targetOf(e.target), `${t.id}: ${e.target}`).not.toBeNull();
        if (e.kind === 'modifier') expect(['add', 'mul']).toContain(e.op);
        if (e.target.startsWith('drive.')) expect(DRIVE_TIERS.map((d) => d.id)).toContain(e.target.slice(6));
      }
      for (const c of t.conditions ?? []) expect(CONDITIONS).toContain(c);
    }
    const unlocked = new Set(TECHS.flatMap((t) => t.effects.filter((e) => e.target.startsWith('drive.')).map((e) => e.target.slice(6))));
    for (const d of DRIVE_TIERS) expect(unlocked.has(d.id), d.id).toBe(true);
    expect(TARGETS.every((x) => typeof x.implemented === 'boolean')).toBe(true);
  });

  it('knows what each technology leads to and influences', () => {
    expect(leadsTo('eng.antimatter')).toEqual(expect.arrayContaining(['eng.am-drive', 'kin.rkv', 'msl.am-warhead']));
    const inf = influences('eng.antimatter');
    expect(inf.areas).toEqual(expect.arrayContaining(['projectile', 'missiles', 'energy']));
    expect(influences('com.long-relay').modules).toEqual(['info']);
  });
});

describe('capabilities', () => {
  it('follow the technologies known', () => {
    const base = capabilities(START_TECHS);
    expect(base).toMatchObject({ relayBonus: 0, drive: 'fusion-1', researchRate: 1 });
    const more = capabilities([...START_TECHS, 'com.long-relay', 'com.neutrino-relay', 'inf.archives', 'inf.network', 'eng.torch-2', 'com.pickets', 'xen.silence']);
    expect(more.relayBonus).toBe(15);
    expect(more.researchRate).toBeCloseTo(1.1 * 1.15, 9);
    expect(more.drive).toBe('fusion-2');
    expect(more.sensorRange).toBe(5);
    expect(more.plumeVisibility).toBeCloseTo(0.7, 9);
  });
});

describe('research at a system', () => {
  it('every system starts with the start technologies and the starting drive', () => {
    const { world } = quiet('r0');
    for (const [system, p] of Object.entries(empireState(world).presence)) {
      expect(Object.keys(labs(world)[system].known).sort()).toEqual([...START_TECHS].sort());
      expect(driveFor(p)).toBe(START_DRIVE);
    }
  });

  it('a breakthrough comes when progress pays the cost; the next one costs more', () => {
    const { sim, world, act } = quiet('r1');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'research.focus', params: { field: 'communication' } }));
    const lab = labs(world).sol;
    expect(breakthroughCost(lab, 'communication')).toBe(RULES.baseCost);
    // Sol's billions do the work: points per year from its colony.
    const rate = research(colonyAt(world, 'sol').population, 'balanced');
    expect(rate).toBeGreaterThan(1);
    sim.advanceTo(RULES.baseCost / rate - 0.2);
    expect('com.optics' in lab.known).toBe(false);
    sim.advanceTo(RULES.baseCost / rate + 0.2);
    expect('com.optics' in lab.known).toBe(true); // the only candidate
    expect(breakthroughCost(lab, 'communication')).toBeCloseTo(RULES.baseCost * RULES.costGrowth, 9);
  });

  it('one candidate is revealed; the other applications are closed off for good, theories stay open', () => {
    const { sim, world, act } = quiet('r2');
    const lab = labs(world).sol;
    for (const id of ['nrg.fields', 'nrg.particle', 'com.optics', 'inf.pattern', 'msl.autonomy']) lab.known[id] = 0;
    const pool = frontier(world, lab, 'communication').map((t) => t.id);
    expect(pool.length).toBeGreaterThanOrEqual(3);
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'research.focus', params: { field: 'communication' } }));
    const before = new Set(Object.keys(lab.known));
    sim.advanceTo(breakthroughCost(lab, 'communication') + 0.5);
    const gained = Object.keys(lab.known).filter((id) => !before.has(id));
    expect(gained).toHaveLength(1);
    const closed = Object.keys(lab.blocked);
    expect(closed.length).toBeGreaterThanOrEqual(1);
    expect(closed.length).toBeLessThanOrEqual(2);
    for (const id of closed) expect(tech(id).kind).toBe('application');
    for (const id of [...gained, ...closed]) expect(pool).toContain(id);
    // Closed-off ones never come back through research.
    for (const id of Object.keys(lab.blocked)) expect(frontier(world, lab, 'communication').map((t) => t.id)).not.toContain(id);
  });

  it('an area stalls when it needs prerequisites from other areas', () => {
    const { sim, world, act } = quiet('r3');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'research.focus', params: { field: 'engines' } }));
    sim.advanceTo(40);
    const lab = labs(world).sol;
    expect('eng.nozzle' in lab.known).toBe(true);
    expect(frontier(world, lab, 'engines')).toHaveLength(0); // the rest needs materials, optics or particle physics
    expect(researchPicture(world, 'A').capitalLab.stalled).toBe(true);
  });

  it('conditional technologies wait for their condition', () => {
    const { world } = quiet('r4');
    const lab = labs(world).sol;
    lab.known['xen.xenoarch'] = 0;
    expect(frontier(world, lab, 'exotic').map((t) => t.id)).not.toContain('xen.relic-salvage');
    expect(researchPicture(world, 'A').techs['xen.relic-salvage'].state).toBe('needsCondition');
    grantCondition(world, 'A', 'relic');
    expect(frontier(world, lab, 'exotic').map((t) => t.id)).toContain('xen.relic-salvage');
  });

  it('research is faster with informatics', () => {
    const { sim, world, act } = quiet('r5');
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'inf.archives', how: 'purchase' }));
    expect(empireState(world).presence.sol.capabilities.researchRate).toBeCloseTo(1.1, 9);
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'research.focus', params: { field: 'communication' } }));
    sim.advanceTo(RULES.baseCost / 1.1 + 0.2);
    expect('com.optics' in labs(world).sol.known).toBe(true);
  });
});

describe('blueprints travel', () => {
  it('a breakthrough at an outpost reaches the capital by light, then every other system', () => {
    const { sim, world, act } = quiet('b1');
    const tau = sys('Tau Ceti');
    const aCen = sys('Alpha Centauri');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'research.focus', params: { field: 'communication' } }));
    // A small colony researches slowly: decades for the first breakthrough.
    const at = runUntil(sim, () => 'com.optics' in labs(world)[tau].known, { step: 0.05, max: 80 });
    expect(at).toBeGreaterThan(RULES.baseCost / 0.6);
    expect('com.optics' in labs(world).sol.known).toBe(false);
    sim.advanceTo(at + light(tau, 'sol') + 0.2);
    expect('com.optics' in labs(world).sol.known).toBe(true);
    const d = knowledgeOf(world, 'A').dispatches.find((x) => x.key === 'research.breakthrough');
    expect(d.params).toMatchObject({ tech: 'com.optics', system: tau });
    expect(d.receivedAt - d.validAt).toBeCloseTo(light(tau, 'sol'), 1);
    expect('com.optics' in labs(world)[aCen].known).toBe(false);
    sim.advanceTo(at + light(tau, 'sol') + light('sol', aCen) + 0.2);
    expect('com.optics' in labs(world)[aCen].known).toBe(true);
  });

  it('a technology works at a system only once known there', () => {
    const { sim, world, act } = quiet('b2');
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'eng.torch-2', how: 'reverse' }));
    expect(driveFor(empireState(world).presence.sol).id).toBe('fusion-2');
    const tau = sys('Tau Ceti');
    expect(driveFor(empireState(world).presence[tau]).id).toBe('fusion-1');
    sim.advanceTo(light('sol', tau) + 0.2);
    expect(driveFor(empireState(world).presence[tau]).id).toBe('fusion-2');
    // Ships launched at Sol now fly faster.
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.explore', params: { frequency: 'high' } }));
    sim.advanceBy(1.2);
    const scout = Object.values(fleetState(world).fleets).find((f) => f.role === 'scout');
    expect(scout.drive).toMatchObject({ accelG: 0.3, cruise: 0.3 });
  });

  it('relay technology extends the network', () => {
    const { world, ctx, act } = quiet('b3');
    const vega = sys('Vega');
    expect(truthNetwork(world, ctx, 'A').route('sol', vega).hops.length).toBeGreaterThan(1); // via 61 Cygni or Altair
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'com.neutrino-relay', how: 'espionage' }));
    expect(truthNetwork(world, ctx, 'A').route('sol', vega).hops.length).toBe(1); // 30 ly reach
  });

  it('closed-off technologies can still be bought, reverse-engineered or stolen', () => {
    const { world, act } = quiet('b4');
    const lab = labs(world).sol;
    lab.blocked['com.long-relay'] = 0;
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'com.long-relay', how: 'purchase' }));
    expect('com.long-relay' in lab.known).toBe(true);
    expect('com.long-relay' in lab.blocked).toBe(false);
    expect(knowledgeOf(world, 'A').dispatches.at(-1)).toMatchObject({ key: 'research.acquired', params: { tech: 'com.long-relay', how: 'purchase' } });
  });

  it('an outpost the capital did not know of catches up once its first report arrives', () => {
    const { sim, world, act } = quiet('b6');
    const post = sys('Lacaille 8760');
    act((w, c) => establishPresence(w, c, { empire: 'A', system: post }));
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'com.intercept', how: 'purchase' }));
    const d = light('sol', post);
    sim.advanceTo(d + 0.5);
    expect('com.intercept' in labs(world)[post].known).toBe(false); // the broadcast went only to known systems
    sim.advanceTo(3 * d + 2); // first report home, then the missing blueprints out
    expect('com.intercept' in labs(world)[post].known).toBe(true);
  });

  it('settlers carry the blueprints of the system they left', () => {
    const { sim, world, act } = quiet('b5');
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'inf.archives', how: 'purchase' }));
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { maxRange: 10 } }));
    sim.advanceBy(1.1);
    const settler = Object.values(fleetState(world).fleets).find((f) => f.role === 'settler');
    expect(settler.blueprints).toContain('inf.archives');
    const target = settler.mission.target;
    sim.advanceTo(settler.legs.at(-1).arriveAt + 0.05);
    expect('inf.archives' in labs(world)[target].known).toBe(true);
  });
});

describe('research picture', () => {
  it('shows states as the capital knows them', () => {
    const { sim, world, act } = quiet('p1');
    const tau = sys('Tau Ceti');
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'research.focus', params: { field: 'communication' } }));
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'research.focus', params: { field: 'informatics' } }));
    let pic = researchPicture(world, 'A');
    expect(pic.techs['com.relay'].state).toBe('known');
    expect(pic.techs['com.optics'].state).toBe('available');
    expect(pic.techs['com.neutrino'].state).toBe('locked');
    expect(pic.techs['inf.archives'].candidate).toBe(true);
    // Tau Ceti discovers; its routine report mentions it before the blueprint... both arrive together; before either: available.
    sim.advanceTo(RULES.baseCost / RULES.outpostRate + light(tau, 'sol') + 1.2);
    pic = researchPicture(world, 'A');
    expect(pic.techs['com.optics'].state).toBe('known');
    expect(pic.techs['com.optics'].spread).toBeGreaterThanOrEqual(2);
    expect(pic.focusCounts.communication).toBe(1);
    expect(pic.focusCounts.informatics).toBe(1);
  });
});

describe('orders and determinism', () => {
  it('an empire-wide research focus spreads by light', () => {
    const { sim, world, act } = quiet('o1');
    act((w, c) => issueDirective(w, c, { empire: 'A', type: 'research.focus', target: { kind: 'empire' }, params: { field: 'informatics' } }));
    sim.advanceTo(5);
    expect(world.state.governors.books[sys('Alpha Centauri')].settings.researchFocus).toBe('informatics');
    expect(world.state.governors.books[sys('Tau Ceti')].settings.researchFocus).toBe('none');
  });

  it('a long research run survives save and load unchanged', () => {
    const run = (withSave) => {
      const { sim, act } = sandbox('det-research');
      act((w, c) => issueDirective(w, c, { empire: 'A', type: 'research.focus', target: { kind: 'empire' }, params: { field: 'communication' } }));
      act((w, c) => issueDirective(w, c, { empire: 'A', type: 'expansion.settle', target: { kind: 'system', system: 'sol' }, params: {} }));
      sim.advanceTo(120);
      let s = sim;
      if (withSave) s = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(sim.world)) });
      s.advanceTo(300);
      return stateHash(s.world);
    };
    expect(run(true)).toBe(run(false));
  }, 30000);
});
