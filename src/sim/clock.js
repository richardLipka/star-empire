// @ts-check
import { DAYS_PER_YEAR } from '../core/units.js';

/**
 * Speed presets in game years per real second.
 * @type {{ label: string, rate: number }[]}
 */
export const SPEEDS = [
  { label: '1 d/s', rate: 1 / DAYS_PER_YEAR },
  { label: '1 wk/s', rate: 7 / DAYS_PER_YEAR },
  { label: '1 mo/s', rate: 1 / 12 },
  { label: '3 mo/s', rate: 0.25 },
  { label: '1 y/s', rate: 1 },
  { label: '5 y/s', rate: 5 },
  { label: '20 y/s', rate: 20 },
  { label: '50 y/s', rate: 50 },
];

/**
 * Real-time driver for a simulation: pause, speed, and auto-pause handling.
 * Headless; the UI calls `frame(dtReal)` from its animation loop.
 * @param {Pick<import('./simulation.js').Simulation, 'advanceBy' | 'bus' | 'world'>} sim
 *   a simulation, or any object delegating to the current one
 * @param {{ speedIndex?: number }} [opts]
 */
export function createClock(sim, { speedIndex = 4 } = {}) {
  const state = { paused: true, speedIndex, lastPause: /** @type {string | null} */ (null) };
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
