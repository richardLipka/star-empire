// @ts-check
import { knowledgeOf } from '../info/module.js';
import { fleetState } from '../fleet/module.js';
import { designStats, DEFAULT_DESIGNS } from '../ships/catalog.js';
import { combatRecords } from '../combat/module.js';
import { windowFor, RULES } from '../combat/model.js';

/**
 * What the fleets screen shows: our fleets as the capital knows them (or the
 * truth), and the battle reports that have come in.
 *
 * @typedef {object} FleetView
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {{ design: string, name: string, count: number, hp: number, maxHp: number }[]} groups
 * @property {number} ships
 * @property {number} strength
 * @property {import('../combat/model.js').Plan | null} plan
 * @property {import('../fleet/module.js').Voyage | null} voyage
 * @property {'docked' | 'transit'} status
 * @property {string | null} at
 * @property {string | null} dest
 * @property {number | null} eta
 * @property {number} validAt
 * @property {boolean} ansible
 * @property {import('../fleet/legs.js').Drive} drive
 * @property {any[]} legs
 */

/**
 * @param {import('../sim/world.js').World} world
 * @param {{ now: number }} ctx
 * @param {string} empire
 * @param {'knowledge' | 'truth'} mode
 * @returns {FleetView[]}
 */
export function fleetsPicture(world, ctx, empire, mode) {
  const list = mode === 'truth'
    ? Object.values(fleetState(world).fleets).filter((f) => f.empire === empire).map((f) => ({ data: JSON.parse(JSON.stringify(f)), validAt: ctx.now }))
    : Object.values(knowledgeOf(world, empire).fleets).filter((e) => e.data.empire === empire && e.data.status !== 'disbanded' && e.data.status !== 'gone').map((e) => ({ data: e.data, validAt: e.validAt }));
  return list.map(({ data: f, validAt }) => view(f, validAt)).sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
}

/** @param {any} f @param {number} validAt @returns {FleetView} */
function view(f, validAt) {
  /** @type {Map<string, { design: string, name: string, count: number, hp: number, maxHp: number }>} */
  const groups = new Map();
  let strength = 0;
  for (const s of f.ships ?? []) {
    const design = f.designs?.[s.d] ?? DEFAULT_DESIGNS.find((d) => d.id === s.d);
    const stats = design ? designStats(design) : null;
    const g = groups.get(s.d) ?? { design: s.d, name: design?.name ?? s.d, count: 0, hp: 0, maxHp: 0 };
    g.count++;
    g.hp += s.hp;
    g.maxHp += stats?.hp ?? s.hp;
    groups.set(s.d, g);
    if (stats) strength += stats.strength * (s.hp / stats.hp);
  }
  const legs = f.legs ?? [];
  return {
    id: f.id, name: f.name, role: f.role ?? 'generic', groups: [...groups.values()], ships: (f.ships ?? []).length, strength: Math.round(strength),
    plan: f.plan ?? null, voyage: f.voyage ?? null, status: f.status, at: f.at ?? null, dest: f.dest ?? null,
    eta: legs.length ? legs[legs.length - 1].arriveAt : null, validAt, ansible: !!f.ansible, drive: f.drive, legs,
  };
}

/**
 * Battle and strike reports: received at the capital (knowledge), or all (truth).
 * @param {import('../sim/world.js').World} world @param {string} empire @param {'knowledge' | 'truth'} mode
 * @returns {{ record: import('../combat/module.js').CombatRecord, receivedAt: number | null }[]} newest first
 */
export function battlesPicture(world, empire, mode) {
  const list = mode === 'truth'
    ? combatRecords(world).map((record) => ({ record, receivedAt: null }))
    : (knowledgeOf(world, empire).battles ?? []).map((b) => ({ record: b.record, receivedAt: b.receivedAt }));
  return [...list].sort((a, b) => b.record.time - a.record.time);
}

/**
 * How long each weapon can bear at a closing speed (for planning).
 * @param {number} speed fraction of c (0: braking into the system)
 */
export function engagementWindows(speed) {
  const v = Math.max(speed, RULES.braked.speed);
  return { speed: v, missile: windowFor(2, v), beam: windowFor(1, v), kinetic: windowFor(0.2, v), pd: windowFor(0.5, v) };
}
