// @ts-check
/**
 * Synchronous publish/subscribe for notifications that leave the simulation
 * (UI refresh, auto-pause, sounds). Not part of the saved state: anything
 * that must survive a save goes through the scheduler instead.
 */
export function createEventBus() {
  /** @type {Map<string, Set<(payload: any) => void>>} */
  const listeners = new Map();
  return {
    /** @param {string} type @param {(payload: any) => void} fn @returns {() => void} unsubscribe */
    on(type, fn) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    /** @param {string} type @param {any} [payload] */
    emit(type, payload) {
      for (const fn of listeners.get(type) ?? []) fn(payload);
      for (const fn of listeners.get('*') ?? []) fn({ type, payload });
    },
  };
}

/** @typedef {ReturnType<typeof createEventBus>} EventBus */
