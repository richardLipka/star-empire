// @ts-check
/**
 * Behaviour hooks for a directive type. All optional.
 *
 * @typedef {import('../module.js').Book} Book
 * @typedef {import('../module.js').Directive} Directive
 * @typedef {(world: import('../../sim/world.js').World, ctx: import('../../sim/module.js').SimContext, book: Book, d: Directive) => void} OnReceive
 *   runs once when the directive arrives
 * @typedef {{ cost: number, run: () => void }} Proposal  a ship to build (cost in materiel) and what to do with it
 * @typedef {(world: import('../../sim/world.js').World, ctx: import('../../sim/module.js').SimContext, book: Book, d: Directive) => Proposal | null} Plan
 *   yearly: propose a ship launch or nothing; the governor builds the
 *   highest-priority proposal it can pay for when its shipyard is free
 * @typedef {(world: import('../../sim/world.js').World, ctx: import('../../sim/module.js').SimContext, fleet: import('../../fleet/module.js').Fleet, system: string) => void} OnArrive
 *   a fleet on this behaviour's mission arrived somewhere
 * @typedef {{ onReceive?: OnReceive, plan?: Plan, onArrive?: OnArrive, mission?: string, usesShipyard?: boolean }} Behaviour
 *   usesShipyard: `plan` competes for the system's single shipyard slot (by priority)
 */
export {};
