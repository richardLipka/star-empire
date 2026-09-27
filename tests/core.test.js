import { describe, expect, it } from 'vitest';
import { createRng, random, int, hashUnit } from '../src/core/rng.js';
import { createQueue, push, pop, size } from '../src/core/scheduler.js';
import { stableStringify, stateHash } from '../src/core/serialize.js';
import { distance, normalize } from '../src/core/vec3.js';
import { formatDuration, formatYear } from '../src/core/time.js';

describe('rng', () => {
  it('is deterministic per seed and serializable', () => {
    const a = createRng('alpha');
    const b = createRng('alpha');
    const seqA = Array.from({ length: 5 }, () => random(a));
    expect(Array.from({ length: 5 }, () => random(b))).toEqual(seqA);

    const copy = JSON.parse(JSON.stringify(a));
    expect(random(copy)).toBe(random(a));
    expect(random(createRng('beta'))).not.toBe(seqA[0]);
  });

  it('produces values in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = random(r);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = int(r, 3, 5);
      expect(n >= 3 && n <= 5).toBe(true);
    }
  });

  it('hashUnit is stateless and key-dependent', () => {
    expect(hashUnit(1, 'star:5')).toBe(hashUnit(1, 'star:5'));
    expect(hashUnit(1, 'star:5')).not.toBe(hashUnit(1, 'star:6'));
  });
});

describe('scheduler', () => {
  it('orders by time, then by insertion', () => {
    const q = createQueue();
    push(q, 5, 'x/e', 'a');
    push(q, 1, 'x/e', 'b');
    push(q, 5, 'x/e', 'c');
    push(q, 3, 'x/e', 'd');
    push(q, 1, 'x/e', 'e');
    const order = [];
    while (size(q)) order.push(pop(q).payload);
    expect(order).toEqual(['b', 'e', 'd', 'a', 'c']);
  });

  it('handles many random events', () => {
    const q = createQueue();
    const r = createRng(3);
    for (let i = 0; i < 500; i++) push(q, random(r) * 100, 'x/e', i);
    let last = -1;
    while (size(q)) {
      const ev = pop(q);
      expect(ev.time).toBeGreaterThanOrEqual(last);
      last = ev.time;
    }
  });

  it('rejects invalid times', () => {
    expect(() => push(createQueue(), NaN, 'x/e')).toThrow();
  });
});

describe('serialize', () => {
  it('ignores key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(stateHash({ b: 1, a: 2 })).toBe(stateHash({ a: 2, b: 1 }));
    expect(stateHash({ a: 1 })).not.toBe(stateHash({ a: 2 }));
  });
});

describe('vec3 and time', () => {
  it('computes distances', () => {
    expect(distance([0, 0, 0], [3, 4, 12])).toBe(13);
    expect(normalize([0, 0, 5])).toEqual([0, 0, 1]);
  });
  it('formats durations', () => {
    expect(formatDuration(2 / 365.25)).toBe('2 d');
    expect(formatDuration(0.5)).toBe('6.0 mo');
    expect(formatDuration(11.44)).toBe('11.4 y');
    expect(formatDuration(1204.2)).toBe('1,204 y');
    expect(formatYear(0)).toBe('2400.000');
  });
});
