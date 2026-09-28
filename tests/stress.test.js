import { test, expect } from 'vitest';
import { sandbox } from './helpers.js';
import { addController } from '../src/ai/module.js';
import { acquireTech } from '../src/research/module.js';
import { buildShips } from '../src/ships/module.js';
import { DEFAULT_DESIGNS } from '../src/ships/catalog.js';
import { fleetState } from '../src/fleet/module.js';
import { orderFleet } from '../src/info/orders.js';
import { colonyAt } from '../src/colony/module.js';
import { empireState } from '../src/empire/module.js';
import { knowledgeOf } from '../src/info/module.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { stateHash } from '../src/core/serialize.js';
import { createRng, random } from '../src/core/rng.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { fleetsPicture, battlesPicture } from '../src/perspective/fleets.js';

/**
 * A long mixed game: both empires under AI, disasters, starting fleets, and
 * random voyages, attacks and strikes by Empire A; every perspective is built
 * along the way, and saving and loading must change nothing.
 */
test('a long mixed game runs, renders and saves without errors', () => {
  for (const seed of ['f1', 'f2']) {
    const rng = createRng(seed.length * 97 + seed.charCodeAt(1));
    const start = sandbox(seed, { ai: true, risks: true, fleets: true });
    let { sim, world, act } = start;
    const { ctx } = start;
    act((w, c) => addController(w, c, 'A', 'expansionist'));
    for (const tech of ['kin.rkv', 'com.sensor-net', 'eng.cold-drive', 'kin.batteries']) acquireTech(world, ctx, { empire: 'A', system: 'sol', tech, how: 'purchase' });
    const t0 = performance.now();
    for (let y = 10; y <= 200; y += 10) {
      sim.advanceTo(y);
      // Random player actions.
      act((w, c) => {
        const mine = Object.values(fleetState(w).fleets).filter((f) => f.empire === 'A' && f.ships?.length);
        const foreign = Object.entries(empireState(w).presence).filter(([, p]) => p.empire !== 'A').map(([s]) => s);
        if (mine.length && foreign.length && random(rng) < 0.5) {
          const f = mine[Math.floor(random(rng) * mine.length)];
          const target = foreign[Math.floor(random(rng) * foreign.length)];
          const approach = /** @type {any} */ (['normal', 'flyby', 'stealth'][Math.floor(random(rng) * 3)]);
          orderFleet(w, c, { empire: 'A', fleet: f.id, payload: { type: 'voyage', waypoints: [{ system: target, action: 'attack' }], approach } });
        }
        if (random(rng) < 0.1 && foreign.length) {
          colonyAt(w, 'sol').materiel += 100;
          const imp = buildShips(w, c, { system: 'sol', design: DEFAULT_DESIGNS.find((d) => d.id === 'impactor'), count: 1 }).fleet;
          if (imp) orderFleet(w, c, { empire: 'A', fleet: imp.id, payload: { type: 'voyage', waypoints: [{ system: foreign[0], action: 'strike' }], approach: 'flyby' } });
        }
      });
      // Perspectives must never throw.
      for (const e of Object.keys(empireState(world).empires)) {
        if (empireState(world).empires[e].dissolvedAt != null) continue;
        knowledgePicture(world, sim.ctx, e); truthPicture(world, sim.ctx, e);
        fleetsPicture(world, sim.ctx, e, 'knowledge'); battlesPicture(world, e, 'knowledge');
      }
      if (y % 100 === 0) {
        const loaded = createSimulation({ modules: MODULES, data: DATA, world: deserializeWorld(serializeWorld(world)) });
        if (stateHash(loaded.world) !== stateHash(world)) throw new Error('save changes state');
        sim = loaded; world = loaded.world; act = (fn) => fn(loaded.world, loaded.ctx);
      }
    }
    // Bookkeeping stays bounded.
    const st = world.state;
    expect(st.combat.records.length).toBeLessThanOrEqual(60);
    expect(Object.keys(st.combat.told).length).toBeLessThanOrEqual(st.combat.records.length);
    expect(Object.keys(knowledgeOf(world, 'A').plans ?? {}).length).toBeLessThan(50);
    expect(Object.values(st.fleet.mailbox).flat().every((o) => fleetState(world).fleets[o.forFleet])).toBe(true);
    expect(performance.now() - t0).toBeLessThan(20000);
  }
}, 120000);
