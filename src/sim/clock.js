// @ts-check
import { DAYS_PER_YEAR } from '../core/units.js';

/**
 * Speed presets in game years per real second.
 * @type {{ rate: number }[]}
 */
export const SPEEDS = [
  { rate: 1 / DAYS_PER_YEAR },
  { rate: 7 / DAYS_PER_YEAR },
  { rate: 1 / 12 },
  { rate: 0.25 },
  { rate: 1 },
  { rate: 5 },
  { rate: 20 },
  { rate: 50 },
];

/**
 * Real-time driver for a simulation: pause, speed, and auto-pause handling.
 * Headless; the UI calls `frame(dtReal)` from its animation loop.
 * @param {Pick<import('./simulation.js').Simulation, 'advanceBy' | 'bus' | 'world'>} sim
 *   a simulation, or any object delegating to the current one
 * @param {{ speedIndex?: number }} [opts]
 */
export function createClock(sim, { speedIndex = 4 } = {}) {
  const state = { paused: true, speedIndex, lastPause: /** @type {{ key: string, params?: Record<string, any> } | null} */ (null) };
  const notify = () => sim.bus.emit('clock/changed', { ...state, time: sim.world.time });

  return {
    get state() {
      return state;
    },
    get rate() {
      return SPEEDS[state.speedIndex].rate;
    },
    /** @param {number} dtReal seconds since last frame */
    frame(dtReal) {
      if (state.paused || dtReal <= 0) return;
      const result = sim.advanceBy(dtReal * SPEEDS[state.speedIndex].rate);
      if (result.paused) {
        state.paused = true;
        state.lastPause = result.paused;
        notify();
        sim.bus.emit('clock/autoPaused', { reason: result.paused });
      }
    },
    /** @param {boolean} [paused] */
    setPaused(paused = !state.paused) {
      state.paused = paused;
      if (!paused) state.lastPause = null;
      notify();
    },
    /** @param {number} index */
    setSpeed(index) {
      state.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, index));
      notify();
    },
  };
}

/** @typedef {ReturnType<typeof createClock>} Clock */
