// @ts-check
import { createEventBus } from '../core/eventBus.js';
import { newId } from '../core/ids.js';
import * as queue from '../core/scheduler.js';
import { createWorld } from './world.js';

/** Safety valve against runaway event loops within one advance call. */
const MAX_STEPS_PER_ADVANCE = 1_000_000;

/**
 * @typedef {import('./module.js').SimModule} SimModule
 * @typedef {import('./module.js').SimContext} SimContext
 * @typedef {import('./world.js').World} World
 */

/**
 * @typedef {object} SimulationOptions
 * @property {SimModule[]} modules
 * @property {string | number} [seed]        new game seed (ignored when `world` is given)
 * @property {World} [world]                 a loaded world to continue
 * @property {number} [tickInterval]         fixed step in years (default: one month)
 * @property {Record<string, any>} [data]    static content passed to modules
 * @property {import('../core/eventBus.js').EventBus} [bus]  reuse a bus (keeps UI subscriptions across loads)
 */

/**
 * Create a simulation: the registered modules plus one world, advanced by
 * discrete events and a fixed-step tick.
 * @param {SimulationOptions} opts
 */
export function createSimulation({ modules, seed = 1, world, tickInterval = 1 / 12, data = {}, bus = createEventBus() }) {
  /** @type {Map<string, SimModule>} */
  const byId = new Map();
  /** @type {Map<string, SimModule>} */
  const handlerOwner = new Map();
  /** @type {Map<string, SimModule[]>} */
  const listeners = new Map();

  for (const mod of modules) {
    if (byId.has(mod.id)) throw new Error(`Duplicate module id "${mod.id}"`);
    for (const dep of mod.dependsOn ?? []) {
      if (!byId.has(dep)) throw new Error(`Module "${mod.id}" depends on "${dep}", which must be registered first`);
    }
    byId.set(mod.id, mod);
    for (const type of Object.keys(mod.handlers ?? {})) {
      if (!type.startsWith(`${mod.id}/`)) throw new Error(`Handler "${type}" must be prefixed "${mod.id}/"`);
      handlerOwner.set(type, mod);
    }
    for (const type of Object.keys(mod.listeners ?? {})) {
      if (!listeners.has(type)) listeners.set(type, []);
      /** @type {SimModule[]} */ (listeners.get(type)).push(mod);
    }
  }

  const isNew = !world;
  const w = world ?? createWorld({ seed, tickInterval });
  if (!isNew) {
    const expected = modules.map((m) => m.id).join(',');
    if (w.modules.join(',') !== expected) {
      throw new Error(`Save was made with modules [${w.modules}] but the game has [${expected}]`);
    }
  }

  /** @type {string | null} */
  let pauseReason = null;

  /** @type {SimContext} */
  const ctx = {
    get now() {
      return w.time;
    },
    get rng() {
      return w.rng;
    },
    scheduleAt(time, type, payload) {
      if (time < w.time) throw new Error(`Cannot schedule ${type} in the past (${time} < ${w.time})`);
      if (!handlerOwner.has(type)) throw new Error(`No handler registered for event "${type}"`);
      queue.push(w.queue, time, type, payload);
    },
    scheduleIn(delay, type, payload) {
      ctx.scheduleAt(w.time + delay, type, payload);
    },
    notify(type, payload) {
      for (const mod of listeners.get(type) ?? []) mod.listeners?.[type](w, payload, ctx);
      bus.emit(type, payload);
    },
    requestPause(reason) {
      pauseReason ??= reason;
    },
    newId: (prefix) => newId(w, prefix),
    data,
  };

  if (isNew) {
    for (const mod of modules) {
      w.modules.push(mod.id);
      w.state[mod.id] = mod.initState ? mod.initState(w, ctx) : {};
    }
    for (const mod of modules) mod.start?.(w, ctx);
  }

  function runTick() {
    const dt = w.tick.interval;
    w.time = w.tick.nextAt;
    for (const mod of modules) mod.tick?.(w, dt, ctx);
    w.tick.count++;
    // Recomputed from the count, not accumulated, so long games do not drift.
    w.tick.nextAt = (w.tick.count + 1) * w.tick.interval;
  }

  /** @param {import('../core/scheduler.js').ScheduledEvent} ev */
  function runEvent(ev) {
    w.time = ev.time;
    const mod = handlerOwner.get(ev.type);
    if (!mod) throw new Error(`No handler for event "${ev.type}"`);
    mod.handlers?.[ev.type](w, ev.payload, ctx);
  }

  /**
   * Advance game time to `target`, processing events and ticks in order.
   * Events at the same instant as a tick run before it.
   * Stops early if a module requests an auto-pause.
   * @param {number} target
   * @returns {{ time: number, paused: string | null }}
   */
  function advanceTo(target) {
    pauseReason = null;
    for (let steps = 0; ; steps++) {
      if (steps > MAX_STEPS_PER_ADVANCE) throw new Error('Simulation step limit exceeded');
      const next = queue.peek(w.queue);
      const tickAt = w.tick.nextAt;
      if (next && next.time <= tickAt) {
        if (next.time > target) break;
        runEvent(/** @type {any} */ (queue.pop(w.queue)));
      } else {
        if (tickAt > target) break;
        runTick();
      }
      if (pauseReason) return { time: w.time, paused: pauseReason };
    }
    if (target > w.time) w.time = target;
    return { time: w.time, paused: null };
  }

  return {
    world: w,
    bus,
    ctx,
    advanceTo,
    /** @param {number} dt years */
    advanceBy: (dt) => advanceTo(w.time + dt),
    /** @param {string} id */
    module: (id) => byId.get(id),
  };
}

/** @typedef {ReturnType<typeof createSimulation>} Simulation */
