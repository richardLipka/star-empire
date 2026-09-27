import { describe, expect, it } from 'vitest';
import { createGameHost } from '../src/app/gameHost.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { pingModule } from './fixtures/pingModule.js';

describe('game host', () => {
  it('keeps bus subscriptions and the clock across loads', () => {
    const game = createGameHost({ modules: [pingModule] });
    game.newGame('host');
    let pings = 0;
    game.bus.on('ping/pinged', () => pings++);

    game.clock.setPaused(false);
    game.clock.frame(5); // 5 years at 1 y/s
    const saved = serializeWorld(game.world);
    const before = pings;
    expect(before).toBeGreaterThan(0);

    game.clock.frame(5);
    game.loadWorld(deserializeWorld(saved));
    expect(game.world.time).toBeCloseTo(5, 9);
    expect(game.clock.state.paused).toBe(true);

    game.clock.setPaused(false);
    game.clock.frame(5);
    expect(pings).toBeGreaterThan(before);
  });
});

describe('scenario warm-up', () => {
  it('runs the scenario history before the player takes over', async () => {
    const { MODULES, DATA } = await import('../src/app/modules.js');
    const { sandboxScenario } = await import('../src/app/scenarios.js');
    const { knowledgePicture } = await import('../src/perspective/picture.js');
    const game = createGameHost({ modules: MODULES, data: DATA, scenario: sandboxScenario });
    game.newGame('warm');
    expect(game.world.time).toBe(sandboxScenario.warmupYears);
    const overdue = knowledgePicture(game.world, game.sim.ctx, 'A').systems.filter((s) => s.overdue).map((s) => DATA.catalog.get(s.id).name);
    expect(overdue).toEqual(['Arcturus']); // only the outpost beyond every relay
  });
});
