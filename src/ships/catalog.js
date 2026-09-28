// @ts-check
import data from '../data/ships.json';

/**
 * Ship design (src/data/ships.json, docs/FLEETS.md): hulls with slots, and
 * components that fill them. A design is plain data; its numbers come from
 * `designStats`. What a system can build depends on the technologies known
 * there (`presence.capabilities.unlocks`).
 *
 * @typedef {{ slots: number, hp: number, cost: number, unlock: string | null, unmanned?: boolean, drive?: { accelG: number, cruise: number } }} Hull
 * @typedef {{ kind: 'missile' | 'kinetic' | 'beam' | 'pd' | 'armour' | 'screen' | 'shield' | 'ecm' | 'computer', cost: number, unlock: string | null,
 *   salvo?: number, damage?: number, evade?: number, rate?: number, range?: number, pd?: number, vsKinetic?: number, hp?: number,
 *   kinetic?: number, missile?: number, beam?: number, ecm?: number, accuracy?: number }} Component
 * @typedef {{ id: string, name?: string, hull: string, components: string[] }} Design
 * @typedef {object} DesignStats
 * @property {number} hp
 * @property {number} cost
 * @property {{ salvo: number, damage: number, evade: number }[]} missiles
 * @property {{ rate: number, damage: number, range: number }[]} beams
 * @property {{ rate: number, damage: number, range: number }[]} kinetics
 * @property {number} pd            interceptions per engagement (missiles)
 * @property {number} pdKinetic     interceptions per engagement (slugs, impactors)
 * @property {number} ecm           0–1: fraction of incoming aimed fire that misses
 * @property {number} accuracy      multiplier
 * @property {number} beamTaken     multiplier on beam damage received
 * @property {number} kineticTaken  multiplier on kinetic damage received
 * @property {number} missileTaken  multiplier on missile damage received
 * @property {boolean} armed
 * @property {boolean} unmanned
 * @property {number} strength      one rough number for comparisons
 */

/** @type {Record<string, Hull>} */
export const HULLS = /** @type {any} */ (data.hulls);
/** @type {Record<string, Component>} */
export const COMPONENTS = /** @type {any} */ (data.components);
/** @type {Design[]} */
export const DEFAULT_DESIGNS = data.defaultDesigns;
export const APPROACHES = data.approaches;
export const PLUME_REFERENCE_G = data.plumeReferenceG;
export const WARSHIP_LEVELS = data.warshipLevels;

/** @param {string} id */
export function hull(id) {
  const h = HULLS[id];
  if (!h) throw new Error(`Unknown hull ${id}`);
  return h;
}

/** @param {string} id */
export function component(id) {
  const c = COMPONENTS[id];
  if (!c) throw new Error(`Unknown component ${id}`);
  return c;
}

/**
 * @param {Design} design
 * @returns {DesignStats}
 */
export function designStats(design) {
  const h = hull(design.hull);
  /** @type {DesignStats} */
  const s = {
    hp: h.hp, cost: h.cost, missiles: [], beams: [], kinetics: [], pd: 0, pdKinetic: 0, ecm: 0, accuracy: 1,
    beamTaken: 1, kineticTaken: 1, missileTaken: 1, armed: false, unmanned: !!h.unmanned, strength: 0,
  };
  let miss = 1;
  for (const id of design.components) {
    const c = component(id);
    s.cost += c.cost;
    s.hp += c.hp ?? 0;
    switch (c.kind) {
      case 'missile': s.missiles.push({ salvo: c.salvo ?? 0, damage: c.damage ?? 0, evade: c.evade ?? 0 }); break;
      case 'beam': s.beams.push({ rate: c.rate ?? 0, damage: c.damage ?? 0, range: c.range ?? 0 }); break;
      case 'kinetic':
        s.kinetics.push({ rate: c.rate ?? 0, damage: c.damage ?? 0, range: c.range ?? 0 });
        s.pd += c.pd ?? 0;
        break;
      case 'pd':
        s.pd += c.pd ?? 0;
        s.pdKinetic += (c.pd ?? 0) * (c.vsKinetic ?? 0.5);
        break;
      case 'screen':
        s.kineticTaken *= c.kinetic ?? 1;
        s.missileTaken *= c.missile ?? 1;
        break;
      case 'shield': s.beamTaken *= c.beam ?? 1; break;
      case 'ecm': miss *= 1 - (c.ecm ?? 0); break;
      case 'computer': s.accuracy *= c.accuracy ?? 1; break;
      default: break;
    }
  }
  s.ecm = 1 - miss;
  s.armed = s.missiles.length + s.beams.length + s.kinetics.length > 0;
  const fire = s.missiles.reduce((a, m) => a + m.salvo * m.damage, 0) + 10 * s.beams.reduce((a, b) => a + b.rate * b.damage, 0)
    + 4 * s.kinetics.reduce((a, k) => a + k.rate * k.damage, 0);
  s.strength = s.hp / (s.beamTaken * 0.5 + s.kineticTaken * 0.25 + s.missileTaken * 0.25) + fire * s.accuracy + 0.5 * s.pd;
  return s;
}

/**
 * Is the design valid (fits its hull)?
 * @param {Design} design
 */
export function validDesign(design) {
  const h = HULLS[design.hull];
  return !!h && design.components.length <= h.slots && design.components.every((c) => !!COMPONENTS[c]);
}

/**
 * The technologies a design needs (capability ids).
 * @param {Design} design
 * @returns {string[]}
 */
export function designNeeds(design) {
  const needs = new Set();
  const h = hull(design.hull);
  if (h.unlock) needs.add(h.unlock);
  for (const c of design.components) {
    const u = component(c).unlock;
    if (u) needs.add(u);
  }
  return [...needs];
}

/**
 * Can a system with these capabilities build the design?
 * @param {Design} design @param {string[]} unlocks
 */
export const canBuild = (design, unlocks) => validDesign(design) && designNeeds(design).every((u) => unlocks.includes(u));

/**
 * The strongest armed, crewed design a system can build and afford.
 * @param {Design[]} designs @param {string[]} unlocks @param {number} budget materiel
 */
export function bestDesign(designs, unlocks, budget = Infinity) {
  let best = null;
  let bestStrength = -1;
  for (const d of designs) {
    if (!canBuild(d, unlocks)) continue;
    const s = designStats(d);
    if (!s.armed || s.unmanned || s.cost > budget) continue;
    if (s.strength > bestStrength) {
      best = d;
      bestStrength = s.strength;
    }
  }
  return best;
}
