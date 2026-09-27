// @ts-check
/**
 * Minimal vector maths on plain `[x, y, z]` arrays, so positions stay
 * JSON-serializable inside the world state.
 */

/** @typedef {[number, number, number]} Vec3 */

/** @returns {Vec3} */
export const vec3 = (x = 0, y = 0, z = 0) => [x, y, z];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {Vec3} a @param {number} k @returns {Vec3} */
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/** @param {Vec3} a @param {Vec3} b */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {Vec3} a */
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
/** @param {Vec3} a @param {Vec3} b */
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** @param {Vec3} a @returns {Vec3} */
export const normalize = (a) => {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
/**
 * Nearest point of segment a–b to p, its distance, and how far along (0–1) it lies.
 * @param {Vec3} p @param {Vec3} a @param {Vec3} b
 */
export function toSegment(p, a, b) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  const closest = /** @type {Vec3} */ ([a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
  return { closest, t, distance: distance(p, closest) };
}

/** @param {Vec3} a @param {Vec3} b @param {number} t @returns {Vec3} */
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
