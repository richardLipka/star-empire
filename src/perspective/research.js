// @ts-check
import { TECHS, AREAS } from '../research/catalog.js';
import { labs, frontier, breakthroughCost, focusOf, conditionMet } from '../research/module.js';
import { empireState } from '../empire/module.js';
import { knowledgeOf } from '../info/module.js';

/**
 * Research as the capital sees it. The capital knows its own lab exactly and
 * everything else from routine reports (each quotes what that system knows).
 *
 * @typedef {'known' | 'reported' | 'available' | 'needsCondition' | 'blocked' | 'locked'} TechState
 * @typedef {{ id: string, state: TechState, spread: number, candidate: boolean }} TechView
 * @typedef {object} ResearchPicture
 * @property {string} capital
 * @property {Record<string, TechView>} techs
 * @property {{ focus: string, progress: number, cost: number, stalled: boolean } | null} capitalLab
 * @property {Record<string, number>} focusCounts   area → systems reported working on it
 * @property {Record<string, { known: number, total: number }>} areaCounts  per area, known at the capital
 * @property {number} systems                        own systems the capital knows of
 * @property {Record<string, boolean>} conditions
 */

/**
 * @param {import('../sim/world.js').World} world
 * @param {string} empire
 * @returns {ResearchPicture}
 */
export function researchPicture(world, empire) {
  const capital = empireState(world).empires[empire].capital;
  const lab = labs(world)[capital];
  const reports = Object.entries(knowledgeOf(world, empire).systems)
    .filter(([id, e]) => id !== capital && e.data.owner === empire && e.data.research)
    .map(([, e]) => e.data.research);
  const known = new Set(lab ? Object.keys(lab.known) : []);
  const blocked = new Set([...(lab ? Object.keys(lab.blocked) : []), ...reports.flatMap((r) => r.blocked)]);
  /** @type {Map<string, number>} */
  const spread = new Map();
  for (const r of [...reports.map((x) => x.known), lab ? Object.keys(lab.known) : []]) for (const id of r) spread.set(id, (spread.get(id) ?? 0) + 1);

  const focus = lab ? focusOf(world, capital) : 'none';
  const candidates = new Set(lab && focus !== 'none' ? frontier(world, lab, focus).map((t) => t.id) : []);

  /** @type {Record<string, TechView>} */
  const techs = {};
  for (const t of TECHS) {
    let state = /** @type {TechState} */ ('locked');
    if (known.has(t.id)) state = 'known';
    else if (spread.has(t.id)) state = 'reported';
    else if (blocked.has(t.id)) state = 'blocked';
    else if (t.requires.every((r) => known.has(r))) {
      state = (t.conditions ?? []).every((c) => conditionMet(world, empire, c)) ? 'available' : 'needsCondition';
    }
    techs[t.id] = { id: t.id, state, spread: spread.get(t.id) ?? 0, candidate: candidates.has(t.id) };
  }

  /** @type {Record<string, number>} */
  const focusCounts = {};
  for (const f of [...reports.map((r) => r.focus), focus]) if (f && f !== 'none') focusCounts[f] = (focusCounts[f] ?? 0) + 1;
  /** @type {Record<string, { known: number, total: number }>} */
  const areaCounts = {};
  for (const a of AREAS) {
    const inArea = TECHS.filter((t) => t.area === a.id);
    areaCounts[a.id] = { known: inArea.filter((t) => known.has(t.id)).length, total: inArea.length };
  }

  return {
    capital,
    techs,
    capitalLab: lab ? { focus, progress: focus === 'none' ? 0 : lab.progress[focus] ?? 0, cost: focus === 'none' ? 0 : breakthroughCost(lab, focus), stalled: focus !== 'none' && candidates.size === 0 } : null,
    focusCounts,
    areaCounts,
    systems: reports.length + 1,
    conditions: world.state.research.conditions[empire] ?? {},
  };
}
