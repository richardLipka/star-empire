import { describe, expect, it } from 'vitest';
import { flightProfile, distanceAt, speedAt } from '../src/fleet/flight.js';
import { DRIVE_TIERS, START_DRIVE } from '../src/fleet/drives.js';

const trip = (distance, accelG, cruise) => flightProfile({ distance, accelG, cruise });

describe('flight profile', () => {
  it('matches the design table for 1 g to 0.6 c', () => {
    const f = trip(10, 1, 0.6);
    expect(f.burnTime).toBeCloseTo(0.727, 2);
    expect(f.burnDistance).toBeCloseTo(0.242, 2);
    expect(f.warning).toBeCloseTo(0.484, 2);
    expect(f.totalTime).toBeCloseTo(17.3, 1);
    expect(trip(4.37, 1, 0.6).totalTime).toBeCloseTo(7.9, 1);
  });

  it('matches the starting drive (0.1 g, 0.1 c)', () => {
    expect(START_DRIVE).toMatchObject({ accelG: 0.1, cruise: 0.1 });
    expect(trip(4.37, 0.1, 0.1).totalTime).toBeCloseTo(45, 0);
    expect(trip(20, 0.1, 0.1).totalTime).toBeCloseTo(201, 0);
  });

  it('3 g gives about two months of warning', () => {
    expect(trip(20, 3, 0.6).warning * 12).toBeCloseTo(1.94, 1);
  });

  it('turns over at the midpoint on short hops', () => {
    const f = trip(0.1, 0.1, 0.6);
    expect(f.coastTime).toBe(0);
    expect(f.peakSpeed).toBeLessThan(0.6);
    expect(distanceAt(f, f.totalTime / 2)).toBeCloseTo(0.05, 6);
  });

  it('position and speed are continuous and end at the target', () => {
    for (const d of DRIVE_TIERS) {
      const f = trip(12, d.accelG, d.cruise);
      let prev = 0;
      for (let i = 1; i <= 400; i++) {
        const t = (i / 400) * f.totalTime;
        const x = distanceAt(f, t);
        expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(x - prev).toBeLessThan(f.totalTime / 400 + 1e-9); // never faster than light
        prev = x;
        expect(speedAt(f, t)).toBeLessThanOrEqual(d.cruise + 1e-12);
      }
      expect(distanceAt(f, f.totalTime)).toBe(12);
      expect(distanceAt(f, f.brakeStart)).toBeCloseTo(12 - f.burnDistance, 9);
    }
  });

  it('crew time runs slower than star time', () => {
    const f = trip(20, 1, 0.6);
    expect(f.properTime).toBeLessThan(f.totalTime);
    expect(f.totalTime / f.properTime).toBeGreaterThan(1.2);
  });
});
