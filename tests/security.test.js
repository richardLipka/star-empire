import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog, runUntil } from './helpers.js';
import { toSegment, distance } from '../src/core/vec3.js';
import { establishPresence, empireState } from '../src/empire/module.js';
import { acquireTech, labs } from '../src/research/module.js';
import { interceptsOf, SPILL_LY } from '../src/security/module.js';
import { issueDirective } from '../src/governors/issue.js';
import { imposeDirective, books } from '../src/governors/module.js';
import { knowledgeOf, infoState } from '../src/info/module.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { classifySystems } from '../src/perspective/starStatus.js';
import { securityPicture } from '../src/perspective/security.js';
import { capabilities } from '../src/research/effects.js';
import { START_TECHS } from '../src/research/catalog.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { stateHash } from '../src/core/serialize.js';

const pos = (id) => catalog.get(id).pos;

/** Sandbox without research, plus a listening post of A at Lacaille 8760 (3.5 ly from B's relay link). */
function listening(seed, techs = ['com.intercept', 'com.listening']) {
  const s = sandbox(seed);
  for (const system of Object.keys(empireState(s.world).presence)) {
    s.act((w, c) => imposeDirective(w, c, { system, type: 'research.focus', params: { field: 'none' } }));
  }
  const post = sys('Lacaille 8760');
  s.act((w, c) => establishPresence(w, c, { empire: 'A', system: post }));
  for (const tech of techs) s.act((w, c) => acquireTech(w, c, { empire: 'A', system: post, tech, how: 'purchase' }));
  return { ...s, post, bCap: sys('Epsilon Indi'), bOut: sys('Gl 832') };
}

describe('geometry', () => {
  it('distance from a point to a segment', () => {
    expect(toSegment([0, 1, 0], [-1, 0, 0], [1, 0, 0])).toMatchObject({ distance: 1, t: 0.5 });
    expect(toSegment([3, 0, 0], [-1, 0, 0], [1, 0, 0]).distance).toBe(2); // beyond the end
  });
  it('security capabilities come from technology', () => {
    expect(capabilities(START_TECHS)).toMatchObject({ cipher: 1, decrypt: 1, interceptRange: 0, beamSpill: 1 });
    const c = capabilities([...START_TECHS, 'inf.keys', 'com.tight-beams', 'com.intercept', 'inf.crypto']);
    expect(c).toMatchObject({ cipher: 2, decrypt: 2, interceptRange: 1.5, beamSpill: 0.5 });
  });
});

describe('interception of relay traffic', () => {
  it('a listening post near a foreign link overhears it when the light passes, and reads what its ciphers allow', () => {
    const { sim, world, post, bCap, bOut } = listening('s1');
    sim.advanceTo(25); // beam light ~6 y to the post, then ~13 y home to Sol
    const got = interceptsOf(world, 'A');
    expect(got.length).toBeGreaterThan(0);
    const i = got.find((x) => x.from === bOut && x.to === bCap);
    expect(i).toMatchObject({ senderEmpire: 'B', listener: post, readable: true, kind: 'report' });
    // Timing: along the beam to its nearest point, across to the post, then home by relay.
    const near = toSegment(pos(post), pos(bOut), pos(bCap));
    expect(i.receivedAt - i.validAt).toBeCloseTo(distance(pos(bOut), near.closest) + near.distance + distance(pos(post), pos('sol')), 6);
  });

  it('traffic analysis reveals both ends as foreign-held; reading reveals their state', () => {
    const { sim, world, ctx, bCap, bOut } = listening('s2');
    const before = classifySystems(knowledgePicture(world, ctx, 'A'), catalog.systems);
    expect(before.get(bCap)).not.toBe('foreign');
    sim.advanceTo(20);
    const after = classifySystems(knowledgePicture(world, ctx, 'A'), catalog.systems);
    expect(after.get(bCap)).toBe('foreign');
    expect(after.get(bOut)).toBe('foreign');
    expect(knowledgeOf(world, 'A').systems[bOut].via).toBe('intercept');
  });

  it('strong ciphers keep the content secret: only the traffic is noticed, once per link', () => {
    const { sim, world, act, bOut } = listening('s3');
    act((w, c) => acquireTech(w, c, { empire: 'B', system: bOut, tech: 'inf.keys', how: 'purchase' }));
    act((w, c) => acquireTech(w, c, { empire: 'B', system: bOut, tech: 'inf.lattice-ciphers', how: 'purchase' }));
    expect(empireState(world).presence[bOut].capabilities.cipher).toBe(4);
    sim.advanceTo(30);
    const fromOut = interceptsOf(world, 'A').filter((x) => x.from === bOut);
    expect(fromOut.length).toBeGreaterThan(3);
    expect(fromOut.every((x) => !x.readable)).toBe(true);
    const notes = knowledgeOf(world, 'A').dispatches.filter((d) => d.key === 'security.overheard' && d.params.from === bOut);
    expect(notes).toHaveLength(1);
  });

  it('read orders are recorded; read blueprints are stolen', () => {
    const { sim, world, act, bCap, bOut } = listening('s4');
    act((w, c) => issueDirective(w, c, { empire: 'B', type: 'military.readiness', target: { kind: 'system', system: bOut }, params: { posture: 'fortify' } }));
    act((w, c) => acquireTech(w, c, { empire: 'B', system: bCap, tech: 'eng.torch-2', how: 'purchase' })); // B's capital sends the blueprint out
    sim.advanceTo(25);
    const log = interceptsOf(world, 'A');
    expect(log.find((x) => x.kind === 'directive')?.directive).toMatchObject({ type: 'military.readiness', params: { posture: 'fortify' } });
    expect('eng.torch-2' in labs(world).sol.known).toBe(true);
    expect(knowledgeOf(world, 'A').dispatches.some((d) => d.key === 'security.stoleTech' && d.params.tech === 'eng.torch-2')).toBe(true);
    expect(knowledgeOf(world, 'A').dispatches.some((d) => d.key === 'security.readOrder')).toBe(true);
  });

  it('orders sent by courier ship cannot be overheard, and still arrive (later)', () => {
    const { sim, world, act, bOut } = listening('s5');
    const d = act((w, c) => issueDirective(w, c, { empire: 'B', type: 'military.readiness', target: { kind: 'system', system: bOut }, params: { posture: 'fortify' }, delivery: 'courier' }));
    const arrive = d.targets[0].plannedArrival;
    expect(arrive).toBeGreaterThan(distance(pos(sys('Epsilon Indi')), pos(bOut))); // slower than light
    sim.advanceTo(arrive + 0.1);
    expect(books(world)[bOut].settings.posture).toBe('fortify');
    expect(interceptsOf(world, 'A').some((x) => x.kind === 'directive')).toBe(false);
  });

  it('tight beams spill less: a marginal listener hears nothing', () => {
    const run = (tight) => {
      const { sim, world, act, post, bCap, bOut } = listening(`s6-${tight}`, []);
      const gap = toSegment(pos(post), pos(bOut), pos(bCap)).distance; // ~3.5 ly
      empireState(world).presence[post].capabilities.interceptRange = gap - SPILL_LY + 0.1; // just within the normal spill
      if (tight) for (const s of [bCap, bOut]) act((w, c) => acquireTech(w, c, { empire: 'B', system: s, tech: 'com.tight-beams', how: 'purchase' }));
      empireState(world).presence[post].capabilities.interceptRange = gap - SPILL_LY + 0.1;
      sim.advanceTo(25);
      return interceptsOf(world, 'A').filter((x) => x.senderEmpire === 'B').length;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });

  it('shows which of our links are exposed, knowledge vs truth', () => {
    const { sim, world, ctx, act } = listening('s7');
    // Empire B puts a listening post next to our Sol–Alpha Centauri link.
    const spot = catalog.systems.map((s) => ({ id: s.id, d: toSegment(s.pos, pos('sol'), pos(sys('Alpha Centauri'))).distance }))
      .filter((x) => x.id !== 'sol' && x.id !== sys('Alpha Centauri')).sort((a, b) => a.d - b.d)[0];
    act((w, c) => establishPresence(w, c, { empire: 'B', system: spot.id }));
    act((w, c) => acquireTech(w, c, { empire: 'B', system: spot.id, tech: 'com.listening', how: 'purchase' }));
    sim.advanceBy(0.1);
    const truth = securityPicture(world, ctx, truthPicture(world, ctx, 'A'));
    expect(truth.exposed.some((e) => e.listeners.includes(spot.id))).toBe(true);
    const known = securityPicture(world, ctx, knowledgePicture(world, ctx, 'A'));
    expect(known.exposed.some((e) => e.listeners.includes(spot.id))).toBe(false); // we do not know it is there
  });

  it('interception survives save and load deterministically', () => {
    const run = (withSave) => {
      const { sim } = listening('s8');
      sim.advanceTo(20);
      let s = sim;
      if (withSave) s = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(sim.world)) });
      s.advanceTo(60);
      return stateHash(s.world);
    };
    expect(run(true)).toBe(run(false));
  }, 30000);
});

describe('messages carry their cipher', () => {
  it('from the capabilities of their origin', () => {
    const { world, act } = listening('s9');
    act((w, c) => acquireTech(w, c, { empire: 'A', system: 'sol', tech: 'inf.keys', how: 'purchase' }));
    const m = act((w, c) => issueDirective(w, c, { empire: 'A', type: 'military.readiness', target: { kind: 'system', system: sys('Tau Ceti') }, params: {} }));
    const msg = Object.values(infoState(world).messages).find((x) => x.kind === 'directive' && x.payload.directive.id === m.id);
    expect(msg.cipher).toBe(2);
    expect(runUntil).toBeDefined();
  });
});
