import { describe, expect, it } from 'vitest';
import { layoutWeb, edgePath, LAYOUT } from '../src/ui/research/layout.js';
import { TECHS, AREAS, tech } from '../src/research/catalog.js';

describe('tech web layout', () => {
  const layout = layoutWeb(TECHS, AREAS);
  it('places every technology once, without overlaps', () => {
    expect(layout.nodes.size).toBe(TECHS.length);
    const boxes = [...layout.nodes.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
  it('columns follow tiers, bands follow areas', () => {
    for (const t of TECHS) {
      const b = layout.nodes.get(t.id);
      expect(b.x).toBe(LAYOUT.left + (t.tier - 1) * (LAYOUT.nodeW + LAYOUT.colGap));
      const band = layout.bands.find((x) => x.area === t.area);
      expect(b.y).toBeGreaterThanOrEqual(band.y);
      expect(b.y + b.h).toBeLessThanOrEqual(band.y + band.h);
    }
    expect(layout.bands.map((b) => b.area)).toEqual(AREAS.map((a) => a.id));
  });
  it('draws an edge for every prerequisite', () => {
    for (const t of TECHS) for (const r of t.requires) expect(edgePath(layout.nodes.get(r), layout.nodes.get(t.id))).toMatch(/^M/);
    expect(tech('eng.torch').requires).toContain('eng.plasma');
  });
});
