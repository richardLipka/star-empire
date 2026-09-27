// @ts-check
/**
 * The contract every simulation module implements. Modules are plain objects;
 * they keep their state in `world.state[id]` and talk to each other only
 * through scheduled events and notifications.
 *
 * @typedef {import('./world.js').World} World
 *
 * @typedef {object} SimContext
 * @property {number} now                                      current game time (years)
 * @property {import('../core/rng.js').RngState} rng           the world's seeded generator
 * @property {(time: number, type: string, payload?: any) => void} scheduleAt   schedule at absolute time
 * @property {(delay: number, type: string, payload?: any) => void} scheduleIn  schedule after a delay
 * @property {(type: string, payload?: any) => void} notify   inform other modules (sync) and the UI
 * @property {(reason: { key: string, params?: Record<string, any> }) => void} requestPause  ask the clock to auto-pause after this event (reason is a dispatch-like key)
 * @property {(prefix: string) => string} newId
 * @property {Readonly<Record<string, any>>} data              static content (star catalogue...), not saved
 *
 * @typedef {object} SimModule
 * @property {string} id
 * @property {string[]} [dependsOn]   ids of modules that must be registered earlier
 * @property {(world: World, ctx: SimContext) => any} [initState]      returns the module's state slice
 * @property {(world: World, ctx: SimContext) => void} [start]         runs once after every initState (new game only)
 * @property {(world: World, dt: number, ctx: SimContext) => void} [tick]   fixed-step update
 * @property {Record<string, (world: World, payload: any, ctx: SimContext) => void>} [handlers]
 *   Scheduled event handlers. Keys are full event types and must start with `${id}/`.
 * @property {Record<string, (world: World, payload: any, ctx: SimContext) => void>} [listeners]
 *   Reactions to notifications from any module.
 */

/**
 * Identity helper that gives editors the module type.
 * @param {SimModule} mod
 * @returns {SimModule}
 */
export const defineModule = (mod) => mod;
