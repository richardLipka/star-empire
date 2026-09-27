// @ts-check
import areasData from '../data/tech/areas.json';
import targetsData from '../data/tech/targets.json';
import engines from '../data/tech/engines.json';
import communication from '../data/tech/communication.json';
import informatics from '../data/tech/informatics.json';
import planetary from '../data/tech/planetary.json';
import sociology from '../data/tech/sociology.json';
import projectile from '../data/tech/projectile.json';
import energy from '../data/tech/energy.json';
import missiles from '../data/tech/missiles.json';
import wormholes from '../data/tech/wormholes.json';
import exotic from '../data/tech/exotic.json';

/**
 * The technology catalogue, assembled from src/data/tech/*.json.
 * To add a technology, add an entry to its area file and its texts to the
 * locale files (tech.<area prefix>.<name>.name/.desc); the tests check the rest.
 *
 * @typedef {'theory' | 'application'} TechKind
 * @typedef {{ kind: 'unlock', target: string } | { kind: 'modifier', target: string, op: 'add' | 'mul', value: number }} Effect
 * @typedef {object} Tech
 * @property {string} id           "<area prefix>.<name>", e.g. "eng.torch"
 * @property {string} area
 * @property {TechKind} kind       theory (abstract) or application (conditioned by theories)
 * @property {number} tier         1..6, rough depth
 * @property {string[]} requires   all of these must be known (may be in other areas)
 * @property {Effect[]} effects
 * @property {string[]} [conditions]  world conditions also needed (e.g. "relic")
 * @property {boolean} [start]     known by every empire from the beginning
 * @typedef {{ id: string, module: string, milestone: string, implemented: boolean, unit?: string }} Target
 */

const AREA_FILES = [engines, communication, informatics, planetary, sociology, projectile, energy, missiles, wormholes, exotic];

/** @type {{ id: string, color: string }[]} */
export const AREAS = areasData.areas;

/** @type {Tech[]} */
export const TECHS = AREA_FILES.flatMap((f) => f.techs.map((t) => /** @type {Tech} */ ({ ...t, area: f.area })));

/** @type {Map<string, Tech>} */
const byId = new Map(TECHS.map((t) => [t.id, t]));

/** @param {string} id */
export function tech(id) {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown technology ${id}`);
  return t;
}

export const hasTech = (/** @type {string} */ id) => byId.has(id);

/** Technologies that list `id` as a prerequisite. */
const unlocks = new Map(TECHS.map((t) => [t.id, /** @type {string[]} */ ([])]));
for (const t of TECHS) for (const r of t.requires) unlocks.get(r)?.push(t.id);
/** @param {string} id */
export const leadsTo = (id) => unlocks.get(id) ?? [];

/** @type {Target[]} */
export const TARGETS = /** @type {Target[]} */ (targetsData.targets);
export const CONDITIONS = targetsData.conditions.ids;
export const RULES = targetsData.rules;

/**
 * The registry entry an effect target belongs to (exact id, else longest prefix).
 * @param {string} target
 */
export function targetOf(target) {
  let best = null;
  for (const t of TARGETS) {
    if ((target === t.id || target.startsWith(`${t.id}.`)) && (!best || t.id.length > best.id.length)) best = t;
  }
  return best;
}

/**
 * Areas and modules a technology influences: its own area, the areas of the
 * technologies it leads to, and the modules its effects act on.
 * @param {string} id
 */
export function influences(id) {
  const t = tech(id);
  const areas = new Set(leadsTo(id).map((x) => tech(x).area));
  areas.delete(t.area);
  const modules = new Set(t.effects.map((e) => targetOf(e.target)?.module).filter(Boolean));
  return { areas: [...areas], modules: /** @type {string[]} */ ([...modules]) };
}

/** Start technologies (known everywhere from the beginning). */
export const START_TECHS = TECHS.filter((t) => t.start).map((t) => t.id);
