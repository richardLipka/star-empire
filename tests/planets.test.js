import { describe, expect, it } from 'vitest';
import { catalog, sys } from './helpers.js';
import { systemBodies } from '../src/galaxy/planets.js';
import { systemTraits } from '../src/galaxy/traits.js';
import { chooseSite } from '../src/colony/model.js';

const bodies = (name, seed = 'p') => systemBodies(seed, catalog.get(sys(name)));

describe('star systems', () => {
  it('are deterministic per seed and system; generated ones differ between seeds', () => {
    const s = catalog.systems.find((x) => x.name === 'Wolf 359');
    expect(systemBodies('a', s)).toEqual(systemBodies('a', s));
    const other = catalog.systems.filter((x) => !systemBodies('a', x).authored).slice(0, 40);
    expect(other.some((x) => JSON.stringify(systemBodies('a', x).bodies) !== JSON.stringify(systemBodies('b', x).bodies))).toBe(true);
  });

  it('known systems come from the data: Sol, and Proxima b orbiting Proxima in its own habitable zone', () => {
    const sol = bodies('Sol');
    expect(sol.authored).toBe(true);
    const earth = sol.bodies.find((b) => b.name === 'Earth');
    expect(earth.site).toBe('habitable');
    expect(earth.zone).toBe('temperate');
    expect(sol.hz[0]).toBeLessThan(1);
    expect(sol.hz[1]).toBeGreaterThan(1);
    const acen = bodies('Alpha Centauri');
    const proxima = acen.bodies.find((b) => b.name === 'Proxima b');
    expect(proxima.star).not.toBe(0);
    expect(proxima.zone).toBe('temperate'); // bolometric luminosity: red dwarfs shine mostly in the infrared
    expect(proxima.tidalLock).toBe(true);
    const [lo, hi] = acen.hzByStar[proxima.star];
    expect(proxima.orbit).toBeGreaterThan(lo);
    expect(proxima.orbit).toBeLessThan(hi);
  });

  it('follow the spectral class: habitable worlds only around F, G, K and M dwarfs, rare around M, none around giants', () => {
    const counts = {};
    let habitable = 0;
    for (const s of catalog.systems) {
      const m = systemBodies('spectral', s);
      if (m.authored) continue;
      for (const b of m.bodies) {
        if (b.site !== 'habitable') continue;
        habitable++;
        expect(['F', 'G', 'K', 'M']).toContain(m.cls);
        expect(m.giantStar).toBe(false);
        expect(b.zone).toBe('temperate');
        counts[m.cls] = (counts[m.cls] ?? 0) + 1;
      }
    }
    expect(habitable).toBeGreaterThan(5);
    expect(habitable).toBeLessThan(80); // life-bearing worlds are rare
    const perSystem = (cls) => (counts[cls] ?? 0) / catalog.systems.filter((s) => s.stars[0]?.cls === cls).length;
    expect(perSystem('M')).toBeLessThan(perSystem('K'));
    // Close-in worlds of red dwarfs are tidally locked.
    const locked = catalog.systems.flatMap((s) => systemBodies('spectral', s).bodies.filter((b) => b.tidalLock).map((b) => s.stars[b.star]?.cls));
    expect(locked.every((c) => c === 'M' || c === 'K')).toBe(true);
  });

  it('there is always somewhere to live: habitable over terraformable over domes over an orbital base', () => {
    for (const s of catalog.systems) {
      const site = chooseSite('any', s);
      expect(['habitable', 'terraformable', 'hostile', 'orbital']).toContain(site.kind);
    }
    expect(chooseSite('any', catalog.get('sol')).name).toBe('Earth');
    expect(chooseSite('any', catalog.get(sys('Alpha Centauri'))).kind).toBe('terraformable');
    expect(chooseSite('any', catalog.get(sys('Vega'))).kind).toBe('orbital'); // a young A star with a debris disc
  });

  it('traits summarise the bodies: Sol is fully habitable, a bare system still allows an orbital base', () => {
    expect(systemTraits('x', catalog.get('sol')).habitability).toBe(1);
    for (const s of catalog.systems.slice(0, 200)) {
      const tr = systemTraits('x', s);
      expect(tr.habitability).toBeGreaterThanOrEqual(0.03);
      expect(tr.habitability).toBeLessThanOrEqual(1);
      expect(tr.planets).toBe(systemBodies('x', s).bodies.length);
    }
  });
});
