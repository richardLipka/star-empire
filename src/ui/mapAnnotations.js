// @ts-check
import { formatDuration } from '../core/time.js';
import { theme } from '../render/theme.js';
import { SPECTRAL_CLASSES } from '../galaxy/spectral.js';
import { STATUSES, countStatuses } from '../perspective/starStatus.js';

/**
 * Label suffixes and legend entries for the current colour mode.
 */

const STATUS_WORD = { capital: 'capital', relay: 'relay', outpost: 'outpost, no relay', relayDown: 'relay down', foreign: '', explored: '', unexplored: '' };

/**
 * @param {'spectral' | 'status' | 'age'} mode
 * @param {import('../galaxy/catalog.js').StarSystem[]} systems
 * @param {Map<string, import('../perspective/starStatus.js').StarStatus>} statuses
 * @param {import('../perspective/picture.js').Picture} pic
 * @returns {Map<string, import('../render/galaxyView.js').Annotation>}
 */
export function annotations(mode, systems, statuses, pic) {
  const held = new Map(pic.systems.map((s) => [s.id, s]));
  /** @type {Map<string, import('../render/galaxyView.js').Annotation>} */
  const out = new Map();
  for (const s of systems) {
    const h = held.get(s.id);
    const status = statuses.get(s.id);
    if (mode === 'spectral') {
      out.set(s.id, { suffix: s.stars.map((x) => x.spect).join(' + '), cls: '', force: !!h });
    } else if (!h) {
      continue;
    } else if (h.owner !== pic.empire) {
      out.set(s.id, { suffix: `Empire ${h.owner}${pic.mode === 'knowledge' ? ` · ${formatDuration(h.age)} ago` : ''}`, cls: 'foreign', force: true });
    } else if (mode === 'status') {
      out.set(s.id, { suffix: STATUS_WORD[/** @type {keyof typeof STATUS_WORD} */ (status)] ?? '', cls: h.relay === 'ok' ? '' : 'overdue', force: true });
    } else if (pic.mode === 'knowledge') {
      const suffix = s.id === pic.capital ? 'now' : `${formatDuration(h.age)}${h.overdue ? ' · overdue' : ''}`;
      out.set(s.id, { suffix, cls: h.overdue ? 'overdue' : h.age > theme.staleAfterYears ? 'stale' : 'fresh', force: true });
    } else {
      out.set(s.id, { suffix: h.relay === 'ok' ? '' : 'relay down', cls: h.relay === 'ok' ? 'fresh' : 'overdue', force: true });
    }
  }
  return out;
}

/**
 * @param {'spectral' | 'status' | 'age'} mode
 * @param {import('../galaxy/catalog.js').StarSystem[]} systems
 * @param {Map<string, import('../perspective/starStatus.js').StarStatus>} statuses
 * @returns {import('./mapControls.js').LegendItem[]}
 */
export function legendItems(mode, systems, statuses) {
  if (mode === 'spectral') {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const s of systems) counts[s.stars[0]?.cls ?? '?'] = (counts[s.stars[0]?.cls ?? '?'] ?? 0) + 1;
    const labels = { O: 'O blue', B: 'B blue-white', A: 'A white', F: 'F yellow-white', G: 'G yellow', K: 'K orange', M: 'M red dwarf', D: 'D white dwarf', '?': 'unclassified' };
    return SPECTRAL_CLASSES.filter((c) => counts[c]).map((c) => ({
      key: c, label: labels[/** @type {keyof typeof labels} */ (c)], color: theme.spectral[/** @type {keyof typeof theme.spectral} */ (c)], count: counts[c],
    }));
  }
  const counts = countStatuses(statuses);
  return STATUSES.filter(([k]) => counts[k] || mode === 'status').map(([key, label]) => ({ key, label, color: theme.status[key], count: counts[key] ?? 0 }));
}
