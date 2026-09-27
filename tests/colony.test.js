import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog } from './helpers.js';
import { colonies, colonyAt, setColony, spend, shipCost, chooseMode, availableModes, materielAt } from '../src/colony/module.js';
import { RULES, capacity, foodRatio, growth, industry, research, riskChances, lossFraction, resilience } from '../src/colony/model.js';
import { baseCapabilities, capabilities } from '../src/research/effects.js';
import { START_TECHS } from '../src/research/catalog.js';
import { acquireTech } from '../src/research/module.js';
import { imposeDirective, books } from '../src/governors/module.js';
import { empireState, establishPresence } from '../src/empire/module.js';
import { fleetState } from '../src/fleet/module.js';
import { knowledgeOf } from '../src/info/module.js';
import { colonyView } from '../src/perspective/colony.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { distance } from '../src/core/vec3.js';
import { stateHash } from '../src/core/serialize.js';

const light = (a, b) => distance(catalog.get(a).pos, catalog.get(b).pos);
const startCaps = () => capabilities(START_TECHS);
const site = (kind, extra = {}) => ({ kind, body: null, name: null, quality: 1, resources: 0.5, tidalLock: false, ...extra });

describe('colony rules', () => {
  it('habitable worlds hold billions, domes and stations only thousands', () => {
    const caps = startCaps();
    expect(capacity(site('habitable'), caps)).toBeGreaterThan(1e9);
    expect(capacity(site('terraformable'), caps)).toBeLessThan(capacity(site('terraformed'), caps) / 100);
    expect(capacity(site('hostile'), caps)).toBeLessThan(capacity(site('terraformable'), caps));
    expect(capacity(site('orbital'), caps)).toBeGreaterThan(0);
    // Orbital habitats double what a station holds.
    expect(capacity(site('orbital'), capabilities([...START_TECHS, 'pla.materials', 'pla.habitats']))).toBeCloseTo(2 * capacity(site('orbital'), caps));
  });

  it('closed habitats need life support to feed themselves; open worlds feed themselves', () => {
    expect(foodRatio(site('orbital'), baseCapabilities(), 'balanced', false)).toBeLessThan(1);
    expect(foodRatio(site('orbital'), startCaps(), 'balanced', false)).toBeGreaterThanOrEqual(1);
    expect(foodRatio(site('habitable'), baseCapabilities(), 'balanced', false)).toBeGreaterThan(1.2);
    expect(foodRatio(site('habitable'), startCaps(), 'balanced', true)).toBeLessThan(1); // a crop failure means famine
    // ...but a great people weathers it better than a small one.
    expect(foodRatio(site('habitable'), startCaps(), 'balanced', true, 1e10)).toBeGreaterThan(foodRatio(site('habitable'), startCaps(), 'balanced', true, 1000));
  });

  it('growth is logistic when fed, decline when starving', () => {
    const caps = startCaps();
    expect(growth(1000, 1e6, 1.2, caps)).toBeGreaterThan(0);
    expect(growth(9.9e5, 1e6, 1.2, caps)).toBeLessThan(growth(1e5, 1e6, 1.2, caps) / 5);
    expect(growth(1000, 1e6, 0.8, caps)).toBeLessThan(0);
    expect(growth(2e6, 1e6, 1.2, caps)).toBeLessThan(0); // above capacity
  });

  it('output grows with people; focus shifts it', () => {
    const s = site('hostile');
    expect(industry(1e5, s, startCaps(), 'balanced')).toBeGreaterThan(industry(1e3, s, startCaps(), 'balanced'));
    expect(industry(1e4, s, startCaps(), 'industry')).toBeGreaterThan(industry(1e4, s, startCaps(), 'balanced'));
    expect(research(1e6, 'research')).toBeGreaterThan(research(1e6, 'balanced'));
    expect(research(0, 'balanced')).toBe(0);
  });

  it('life is fragile at the beginning: small colonies are hit more often and harder; technology helps', () => {
    const small = { population: 150, site: site('orbital'), society: 'embryo', instability: 1 };
    const big = { population: 1e9, site: site('habitable'), society: 'settled', instability: 0.1 };
    const a = riskChances(small, 'M', startCaps());
    const b = riskChances(big, 'G', startCaps());
    for (const k of ['prion', 'radiation', 'unrest']) expect(a[k]).toBeGreaterThan(b[k]);
    expect(lossFraction(/** @type {[number, number]} */ (RULES.risks.prion.loss), 150, 0.5)).toBeGreaterThan(lossFraction(/** @type {[number, number]} */ (RULES.risks.prion.loss), 1e9, 0.5) * 3);
    expect(resilience(1e10)).toBe(1);
    const shielded = riskChances(small, 'M', capabilities([...START_TECHS, 'pla.materials', 'pla.shelters']));
    expect(shielded.radiation).toBeCloseTo(a.radiation * 0.6, 9);
    // Red dwarf flares are worse than a quiet yellow star's.
    expect(riskChances(small, 'M', startCaps()).radiation).toBeGreaterThan(riskChances(small, 'G', startCaps()).radiation);
  });
});

describe('colonies in the sandbox', () => {
  it('every held system has people; Sol holds billions of an old society', () => {
    const { world } = sandbox('c1');
    for (const system of Object.keys(empireState(world).presence)) expect(colonyAt(world, system)).not.toBeNull();
    const sol = colonyAt(world, 'sol');
    expect(sol.population).toBeGreaterThan(5e9);
    expect(sol.society).toBe('old');
    expect(sol.site.name).toBe('Earth');
    expect(colonyAt(world, sys('Alpha Centauri')).mode).toBe('ark');
  });

  it('colonies grow and produce materiel over the years', () => {
    const { sim, world } = sandbox('c2');
    const tau = sys('Tau Ceti');
    const before = { ...colonyAt(world, tau) };
    sim.advanceTo(50);
    const after = colonyAt(world, tau);
    expect(after.population).toBeGreaterThan(before.population);
    expect(after.materiel).toBeGreaterThan(before.materiel);
    expect(after.last.research).toBeGreaterThan(0);
  });

  it('the capital learns of its colonies by report: population arrives light-years late', () => {
    const { sim, world, ctx } = sandbox('c3');
    const tau = sys('Tau Ceti');
    sim.advanceTo(30);
    const known = colonyView(world, knowledgePicture(world, ctx, 'A'), tau);
    const truth = colonyView(world, truthPicture(world, ctx, 'A'), tau);
    expect(known.validAt).toBeLessThanOrEqual(30 - light(tau, 'sol') + 1e-9);
    expect(truth.validAt).toBe(30);
    expect(known.colony.population).not.toBe(truth.colony.population);
  });

  it('a starving colony dies out; the system is lost and the capital hears of it', () => {
    const { sim, world } = sandbox('c4');
    const vega = sys('Vega');
    expect(colonyAt(world, vega).site.kind).toBe('orbital');
    // Life support fails for good: rationing until the end.
    setColony(world, vega, { population: 200, cropsUntil: 1000 });
    sim.advanceTo(40);
    expect(empireState(world).presence[vega]).toBeUndefined();
    expect(colonyAt(world, vega)).toBeNull();
    sim.advanceTo(40 + light(vega, 'sol') + 1);
    const d = knowledgeOf(world, 'A').dispatches.find((x) => x.key === 'colony.extinct' && x.params.system === vega);
    expect(d).toBeDefined();
    expect(knowledgeOf(world, 'A').systems[vega].data.owner).toBeNull();
  });

  it('disasters happen when risks are on, reach the capital as dispatches, and runs stay deterministic', () => {
    const run = () => {
      const { sim, world } = sandbox('risky', { risks: true });
      sim.advanceTo(120);
      return world;
    };
    const a = run();
    const keys = new Set(knowledgeOf(a, 'A').dispatches.map((d) => d.key));
    expect([...keys].some((k) => k.startsWith('colony.'))).toBe(true);
    expect(stateHash(a)).toBe(stateHash(run()));
  }, 30000);
});

describe('colonisation modes and costs', () => {
  it('at the start only embryo ships are known; cryo sleep and arks come with research', () => {
    const { world, ctx } = sandbox('m1');
    const caps = () => empireState(world).presence.sol.capabilities;
    expect(availableModes(caps())).toEqual(['embryo']);
    expect(chooseMode(world, 'sol', 'auto')).toBe('embryo');
    expect(chooseMode(world, 'sol', 'cryo')).toBeNull();
    acquireTech(world, ctx, { empire: 'A', system: 'sol', tech: 'soc.cryo', how: 'purchase' });
    expect(availableModes(caps())).toContain('cryo');
    expect(chooseMode(world, 'sol', 'auto')).toBe('cryo');
  });

  it('an embryo ship founds a small, strange colony that machines keep decanting', () => {
    const { sim, world, act } = sandbox('m2');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { criteria: 'nearest', maxRange: 10, vessel: 'embryo' } }));
    sim.advanceTo(1.01);
    const settler = Object.values(fleetState(world).fleets).find((f) => f.role === 'settler');
    expect(settler.mission.mode).toBe('embryo');
    const target = settler.mission.target;
    sim.advanceTo(settler.legs.at(-1).arriveAt + 0.1);
    const c = colonyAt(world, target);
    expect(c).toMatchObject({ mode: 'embryo', society: 'embryo' });
    expect(c.instability).toBeCloseTo(RULES.society.embryo.instability, 2);
    expect(c.population).toBeLessThan(RULES.modes.embryo.colonists + 20);
    const pop = c.population;
    sim.advanceBy(10);
    expect(colonyAt(world, target).population).toBeGreaterThan(pop + 0.5 * 10 * RULES.modes.embryo.decant);
    expect(colonyAt(world, target).stock).toBeLessThan(RULES.modes.embryo.stock);
  });

  it('ships cost materiel: a poor system waits until it can pay', () => {
    const { sim, world, act } = sandbox('m3');
    const tau = sys('Tau Ceti');
    setColony(world, tau, { materiel: 0 });
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'expansion.explore', params: { frequency: 'high' } }));
    sim.advanceTo(1.2);
    const scouts = () => Object.values(fleetState(world).fleets).filter((f) => f.role === 'scout').length;
    expect(scouts()).toBe(0);
    const cost = shipCost(world, tau, 'scout');
    const perYear = colonyAt(world, tau).last.industry;
    sim.advanceTo(1.2 + cost / perYear + 2);
    expect(scouts()).toBe(1);
    expect(materielAt(world, tau)).toBeLessThan(cost + perYear * 2);
    expect(spend(world, tau, 1e9)).toBe(false);
  });

  it('a fleet order waits for materiel and goes out once it can be paid', () => {
    const { sim, world, act } = sandbox('m4');
    const tau = sys('Tau Ceti');
    setColony(world, tau, { materiel: 0 });
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'fleet.send', params: { destination: 'sol' } }));
    expect(books(world)[tau].memory.pendingSends).toHaveLength(1);
    sim.advanceTo(0.1); // a first month of work
    sim.advanceTo(shipCost(world, tau, 'generic') / colonyAt(world, tau).last.industry + 3);
    expect(books(world)[tau].memory.pendingSends).toHaveLength(0);
    expect(Object.values(fleetState(world).fleets).some((f) => f.role === 'generic' && f.dest === 'sol')).toBe(true);
  });

  it('production focus changes output and ship costs', () => {
    const { sim, world, act } = sandbox('m5');
    const tau = sys('Tau Ceti');
    sim.advanceTo(1);
    const balanced = colonyAt(world, tau).last.industry;
    act((w, c) => imposeDirective(w, c, { system: tau, type: 'economy.focus', params: { focus: 'shipbuilding' } }));
    sim.advanceTo(2.5);
    expect(colonyAt(world, tau).last.industry).toBeGreaterThan(balanced);
    expect(shipCost(world, tau, 'scout')).toBeCloseTo(RULES.shipCosts.scout * RULES.focus.shipbuilding.shipCost, 9);
  });

  it('terraforming turns a marginal world into an open one over centuries', () => {
    const { sim, world, ctx } = sandbox('m6');
    const acen = sys('Alpha Centauri');
    expect(colonyAt(world, acen).site.kind).toBe('terraformable');
    for (const tech of ['pla.terraform', 'pla.processors']) acquireTech(world, ctx, { empire: 'A', system: acen, tech, how: 'purchase' });
    sim.advanceTo(RULES.terraforming.years * 0.5 * 0.5);
    expect(colonyAt(world, acen).terraform).toBeGreaterThan(0.4);
    sim.advanceTo(RULES.terraforming.years * 0.5 + 2);
    expect(colonyAt(world, acen).site.kind).toBe('terraformed');
    expect(colonyAt(world, acen).last.capacity).toBeGreaterThan(1e8);
  }, 30000);

  it('a system founded directly (sandbox) gets cryo sleepers', () => {
    const { world, act } = sandbox('m7');
    const target = sys('Wolf 359');
    act((w, c) => establishPresence(w, c, { empire: 'A', system: target }));
    expect(colonyAt(world, target)).toMatchObject({ mode: 'cryo', population: RULES.modes.cryo.colonists });
    expect(Object.keys(colonies(world))).toContain(target);
  });
});
