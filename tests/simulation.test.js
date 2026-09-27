import { describe, expect, it } from 'vitest';
import { createSimulation } from '../src/sim/simulation.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createClock } from '../src/sim/clock.js';
import { defineModule } from '../src/sim/module.js';
import { stateHash } from '../src/core/serialize.js';
import { pingModule, echoModule } from './fixtures/pingModule.js';

const modules = [pingModule, echoModule];
const newGame = (seed = 'test') => createSimulation({ modules, seed });

describe('simulation', () => {
  it('runs ticks and events in time order', () => {
    const sim = newGame();
    sim.advanceTo(10);
    const { pings, grown } = sim.world.state.ping;
    expect(sim.world.time).toBe(10);
    expect(sim.world.tick.count).toBe(120);
    expect(grown).toBeCloseTo(10, 9);
    expect(pings.length).toBeGreaterThan(4);
    for (let i = 1; i < pings.length; i++) expect(pings[i].t).toBeGreaterThanOrEqual(pings[i - 1].t);
    expect(pings.every((p) => p.t <= 10)).toBe(true);
  });

  it('delivers notifications to listening modules and the bus', () => {
    const sim = newGame();
    let busCount = 0;
    sim.bus.on('ping/pinged', () => busCount++);
    sim.advanceTo(20);
    expect(sim.world.state.echo.heard).toBe(sim.world.state.ping.pings.length);
    expect(busCount).toBe(sim.world.state.ping.pings.length);
  });

  it('is deterministic for a seed, and independent of step size', () => {
    const a = newGame('same');
    a.advanceTo(50);
    const b = newGame('same');
    for (let t = 0.37; t < 50; t += 0.37) b.advanceTo(t);
    b.advanceTo(50);
    expect(stateHash(b.world)).toBe(stateHash(a.world));

    const c = newGame('other');
    c.advanceTo(50);
    expect(stateHash(c.world)).not.toBe(stateHash(a.world));
  });

  it('continues identically after save and load', () => {
    const straight = newGame('save');
    straight.advanceTo(40);

    const first = newGame('save');
    first.advanceTo(17.3);
    const text = serializeWorld(first.world);
    const resumed = createSimulation({ modules, world: deserializeWorld(text) });
    resumed.advanceTo(40);

    expect(stateHash(resumed.world)).toBe(stateHash(straight.world));
  });

  it('stops early on an auto-pause request and resumes cleanly', () => {
    const straight = newGame('pause');
    straight.advanceTo(30);

    const sim = newGame('pause');
    sim.world.state.ping.pauseAt = 3;
    straight.world.state.ping.pauseAt = 3; // keep states comparable
    const r = sim.advanceTo(30);
    expect(r.paused).toEqual({ key: 'ping', params: { n: 3 } });
    expect(r.time).toBeLessThan(30);
    sim.advanceTo(30);
    expect(sim.world.state.ping.pings).toEqual(straight.world.state.ping.pings);
  });

  it('validates modules, handlers and saves', () => {
    expect(() => createSimulation({ modules: [echoModule] })).toThrow(/depends on/);
    expect(() => createSimulation({ modules: [pingModule, pingModule] })).toThrow(/Duplicate/);
    const bad = defineModule({ id: 'bad', handlers: { 'other/x': () => {} } });
    expect(() => createSimulation({ modules: [bad] })).toThrow(/prefixed/);

    const sim = newGame();
    expect(() => sim.ctx.scheduleIn(1, 'nobody/listens')).toThrow(/No handler/);
    expect(() => createSimulation({ modules: [pingModule], world: sim.world })).toThrow(/saveModules/);
    expect(() => deserializeWorld('{"hello":1}')).toThrow(/saveFormat/);
    expect(() => deserializeWorld('not json')).toThrow(/saveFormat/);
  });
});

describe('clock', () => {
  it('advances only when running, scaled by speed', () => {
    const sim = newGame();
    const clock = createClock(sim, { speedIndex: 4 }); // 1 y/s
    clock.frame(2);
    expect(sim.world.time).toBe(0);
    clock.setPaused(false);
    clock.frame(2);
    expect(sim.world.time).toBeCloseTo(2, 9);
    clock.setSpeed(6); // 20 y/s
    clock.frame(0.5);
    expect(sim.world.time).toBeCloseTo(12, 9);
  });

  it('pauses itself when the simulation asks', () => {
    const sim = newGame('pause');
    sim.world.state.ping.pauseAt = 1;
    const clock = createClock(sim, { speedIndex: 7 });
    clock.setPaused(false);
    clock.frame(1);
    expect(clock.state.paused).toBe(true);
    expect(clock.state.lastPause).toEqual({ key: 'ping', params: { n: 1 } });
  });
});
