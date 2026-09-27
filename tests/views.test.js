import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog } from './helpers.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { classifySystems, countStatuses } from '../src/perspective/starStatus.js';
import { describeSpectral } from '../src/galaxy/spectral.js';
import { setRelay } from '../src/empire/module.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';

describe('star status view', () => {
  it('classifies capital, relays, outposts, explored and unexplored from knowledge', () => {
    const { sim, world, ctx, act } = sandbox('views');
    sim.advanceTo(30);
    act((w, c) => setRelay(w, c, { system: sys('Vega'), state: 'destroyed' }));
    const k = classifySystems(knowledgePicture(world, ctx, 'A'), catalog.systems);
    expect(k.get('sol')).toBe('capital');
    expect(k.get(sys('Tau Ceti'))).toBe('relay');
    expect(k.get(sys('Vega'))).toBe('relay'); // the loss is not known yet
    expect(k.get(sys('Barnard\'s Star'))).toBe('explored'); // probed, 6 ly
    expect(k.get(sys('Pollux'))).toBe('unexplored');
    expect(k.get(sys('Epsilon Indi'))).toBe('unexplored'); // 11.8 ly: Empire B's home is unknown to A
    const t = classifySystems(truthPicture(world, ctx, 'A'), catalog.systems);
    expect(t.get(sys('Vega'))).toBe('relayDown');
    expect(t.get(sys('Epsilon Indi'))).toBe('foreign');
    const counts = countStatuses(k);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(catalog.systems.length);
  });
});

describe('spectral descriptions', () => {
  it('describes common types', () => {
    expect(describeSpectral('G2V', 'G').kind).toBe('yellow main-sequence dwarf');
    expect(describeSpectral('K1III', 'K').kind).toBe('orange giant');
    expect(describeSpectral('M5Ve', 'M').kind).toBe('red main-sequence dwarf');
    expect(describeSpectral('DA2', 'D').kind).toBe('white dwarf');
    expect(describeSpectral('sdM4', 'M').kind).toBe('red subdwarf');
    expect(describeSpectral('A0m...', 'A').kind).toBe('white star');
  });
  it('every catalogue star gets a description', () => {
    for (const s of catalog.systems) for (const st of s.stars) expect(describeSpectral(st.spect, st.cls).kind).toBeTruthy();
  });
});

describe('save migration', () => {
  it('loads a version 1 save', () => {
    const { sim } = sandbox('mig');
    sim.advanceTo(5);
    const v1 = JSON.parse(serializeWorld(sim.world));
    const w = v1.world;
    w.version = 1;
    w.modules = w.modules.filter((m) => m !== 'detection');
    delete w.state.detection;
    delete w.state.empire.explored;
    for (const k of Object.values(w.state.info.knowledge)) delete k.explored;
    w.state.info.pauseOnDispatch = false;
    w.queue.heap = w.queue.heap.filter((e) => !e.type.startsWith('detection/'));
    const loaded = deserializeWorld(JSON.stringify(v1));
    expect(loaded.version).toBe(2);
    const resumed = createSimulation({ modules: MODULES, data: DATA, world: loaded });
    resumed.advanceTo(20);
    expect(resumed.world.state.detection.sightings).toBeDefined();
  });
});
