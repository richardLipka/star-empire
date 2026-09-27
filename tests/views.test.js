import { describe, expect, it } from 'vitest';
import { sandbox, sys, catalog } from './helpers.js';
import { knowledgePicture, truthPicture } from '../src/perspective/picture.js';
import { classifySystems, countStatuses } from '../src/perspective/starStatus.js';
import { describeSpectral } from '../src/galaxy/spectral.js';
import { setRelay } from '../src/empire/module.js';
import { serializeWorld, deserializeWorld } from '../src/sim/save.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MODULES, DATA } from '../src/app/modules.js';
import { WORLD_VERSION } from '../src/sim/world.js';

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
    expect(describeSpectral('G2V', 'G')).toMatchObject({ cls: 'G', lum: 'dwarf', temp: [5200, 6000] });
    expect(describeSpectral('K1III', 'K').lum).toBe('giant');
    expect(describeSpectral('M5Ve', 'M').lum).toBe('dwarf');
    expect(describeSpectral('DA2', 'D').lum).toBe('whiteDwarf');
    expect(describeSpectral('sdM4', 'M').lum).toBe('subdwarf');
    expect(describeSpectral('A0m...', 'A').lum).toBe('star');
    expect(describeSpectral('G8IV', 'G').lum).toBe('subgiant');
    expect(describeSpectral('B8Ia', 'B').lum).toBe('supergiant');
  });
  it('every catalogue star gets a description', () => {
    for (const s of catalog.systems) for (const st of s.stars) expect(describeSpectral(st.spect, st.cls).lum).toBeTruthy();
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
    w.queue.heap = w.queue.heap.filter((e) => !e.type.startsWith('detection/') && !e.type.startsWith('governors/'));
    w.modules = w.modules.filter((m) => m !== 'governors');
    delete w.state.governors;
    for (const p of Object.values(w.state.empire.presence)) delete p.reporting;
    for (const k of Object.values(w.state.info.knowledge)) k.dispatches = k.dispatches.map((d) => ({ id: d.id, text: 'old', validAt: d.validAt, receivedAt: d.receivedAt }));
    const loaded = deserializeWorld(JSON.stringify(v1));
    expect(loaded.version).toBe(WORLD_VERSION);
    expect(loaded.modules).toEqual(MODULES.map((m) => m.id));
    const resumed = createSimulation({ modules: MODULES, data: DATA, world: loaded });
    resumed.advanceTo(20);
    expect(resumed.world.state.detection.sightings).toBeDefined();
  });
});
