import { describe, expect, it } from 'vitest';
import { C, G_LY_PER_YR2, gToLyYr2 } from '../src/core/units.js';

describe('units', () => {
  it('uses c = 1 ly/yr', () => {
    expect(C).toBe(1);
  });
  it('expresses 1 g as ~1.03 ly/yr²', () => {
    expect(G_LY_PER_YR2).toBeCloseTo(1.0323, 3);
    expect(gToLyYr2(3)).toBeCloseTo(3.0969, 3);
  });
});
