import { defineModule } from '../../src/sim/module.js';
import { range } from '../../src/core/rng.js';

/** Test module: random pings, monthly growth, and optional auto-pause. */
export const pingModule = defineModule({
  id: 'ping',
  initState: () => ({ pings: [], grown: 0, pauseAt: null }),
  start(_world, ctx) {
    ctx.scheduleIn(range(ctx.rng, 0.1, 2), 'ping/ping', { n: 0 });
  },
  tick(world, dt) {
    world.state.ping.grown += dt;
  },
  handlers: {
    'ping/ping'(world, { n }, ctx) {
      const s = world.state.ping;
      s.pings.push({ n, t: ctx.now, id: ctx.newId('p') });
      ctx.notify('ping/pinged', { n });
      if (s.pauseAt === n) ctx.requestPause(`ping ${n}`);
      ctx.scheduleIn(range(ctx.rng, 0.1, 2), 'ping/ping', { n: n + 1 });
    },
  },
});

export const echoModule = defineModule({
  id: 'echo',
  dependsOn: ['ping'],
  initState: () => ({ heard: 0 }),
  listeners: {
    'ping/pinged'(world) {
      world.state.echo.heard++;
    },
  },
});
