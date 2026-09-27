import { describe, expect, it } from 'vitest';
import { catalog, galaxyModule, systemTraits, measure } from '../src/galaxy/index.js';
import { DRIVE_TIERS } from '../src/fleet/drives.js';
import { createSimulation } from '../src/sim/simulation.js';
import { serializeWorld } from '../src/sim/save.js';

describe('star catalogue', () => {
  it('contains Sol at the origin and real neighbours', () => {
    expect(catalog.sol.pos).toEqual([0, 0, 0]);
    const aCen = catalog.systems.find((s) => s.name === 'Alpha Centauri');
    expect(aCen.dist).toBeCloseTo(4.3, 1);
    expect(aCen.stars.map((s) => s.name)).toContain('Proxima Centauri');
    expect(catalog.meta.license).toBe('CC BY-SA 4.0');
  });

  it('uses galactic coordinates (Alpha Centauri at l ≈ 316°, b ≈ −1°)', () => {
    const [x, y, z] = catalog.systems.find((s) => s.name === 'Alpha Centauri').pos;
    const l = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const b = (Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI;
    expect(l).toBeCloseTo(315.7, 0);
    expect(b).toBeCloseTo(-0.7, 0);
  });

  it('keeps every system inside the map radius with unique ids', () => {
    const ids = new Set(catalog.systems.map((s) => s.id));
    expect(ids.size).toBe(catalog.systems.length);
    expect(catalog.systems.length).toBeGreaterThan(500);
    for (const s of catalog.systems) expect(s.dist).toBeLessThanOrEqual(catalog.meta.radiusLy);
  });
});

describe('system traits', () => {
  it('are deterministic per seed, vary between seeds, and fix Sol', () => {
    const s = catalog.systems[10];
    expect(systemTraits('a', s)).toEqual(systemTraits('a', s));
    const differs = catalog.systems.slice(1, 40).some((x) => systemTraits('a', x).habitability !== systemTraits('b', x).habitability);
    expect(differs).toBe(true);
    expect(systemTraits('a', catalog.sol).habitability).toBe(1);
    for (const x of catalog.systems) {
      const t = systemTraits('z', x);
      expect(t.habitability).toBeGreaterThanOrEqual(0);
      expect(t.habitability).toBeLessThanOrEqual(1);
    }
  });
});

describe('measure', () => {
  it('reports distance, light delay and trip times', () => {
    const aCen = catalog.systems.find((s) => s.name === 'Alpha Centauri');
    const m = measure(catalog.sol, aCen, DRIVE_TIERS);
    expect(m.lightDelay).toBeCloseTo(m.distance, 12);
    expect(m.trips[0].profile.totalTime).toBeGreaterThan(40);
    expect(m.trips[2].profile.totalTime).toBeLessThan(9);
  });
});

describe('galaxy module', () => {
  it('records the catalogue but keeps it out of the save', () => {
    const sim = createSimulation({ modules: [galaxyModule], data: { catalog }, seed: 1 });
    expect(sim.world.state.galaxy.catalog.systemCount).toBe(catalog.systems.length);
    expect(serializeWorld(sim.world).length).toBeLessThan(2000);
  });
});
