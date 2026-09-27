// @ts-check
/**
 * Discrete-event queue stored inside the world as a binary min-heap of plain
 * objects, ordered by time and then by insertion sequence. The sequence makes
 * simultaneous events deterministic.
 */

/**
 * @typedef {object} ScheduledEvent
 * @property {number} time   game time in years
 * @property {number} seq    insertion order, tie-breaker
 * @property {string} type   'module/eventName'
 * @property {any} payload   JSON-serializable data
 */

/** @typedef {{ heap: ScheduledEvent[], seq: number }} EventQueue */

/** @returns {EventQueue} */
export const createQueue = () => ({ heap: [], seq: 0 });

/** @param {ScheduledEvent} a @param {ScheduledEvent} b */
const before = (a, b) => a.time < b.time || (a.time === b.time && a.seq < b.seq);

/**
 * @param {EventQueue} q
 * @param {number} time
 * @param {string} type
 * @param {any} [payload]
 * @returns {ScheduledEvent}
 */
export function push(q, time, type, payload = null) {
  if (!Number.isFinite(time)) throw new Error(`Event ${type} has invalid time ${time}`);
  const ev = { time, seq: q.seq++, type, payload };
  const h = q.heap;
  h.push(ev);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!before(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
  return ev;
}

/** @param {EventQueue} q @returns {ScheduledEvent | undefined} */
export const peek = (q) => q.heap[0];

/** @param {EventQueue} q @returns {ScheduledEvent | undefined} */
export function pop(q) {
  const h = q.heap;
  if (h.length === 0) return undefined;
  const top = h[0];
  const last = /** @type {ScheduledEvent} */ (h.pop());
  if (h.length > 0) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && before(h[l], h[m])) m = l;
      if (r < h.length && before(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
  return top;
}

/** @param {EventQueue} q */
export const size = (q) => q.heap.length;
