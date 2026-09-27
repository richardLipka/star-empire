// @ts-check
import { t } from '../i18n/index.js';
import { fmtDuration } from '../i18n/format.js';
import { theme } from '../render/theme.js';
import { SPECTRAL_CLASSES } from '../galaxy/spectral.js';
import { STATUSES, countStatuses } from '../perspective/starStatus.js';

/**
 * Label suffixes and legend entries for the current colour mode.
 */

const SHORT_STATUS = ['capital', 'relay', 'outpost', 'relayDown'];

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
    const status = /** @type {string} */ (statuses.get(s.id));
    if (mode === 'spectral') {
      out.set(s.id, { suffix: s.stars.map((x) => x.spect).join(' + '), cls: '', force: !!h });
    } else if (!h) {
      continue;
    } else if (h.owner !== pic.empire) {
      const who = t('empire.name', { id: h.owner });
      out.set(s.id, { suffix: pic.mode === 'knowledge' ? `${who} · ${fmtDuration(h.age)}` : who, cls: 'foreign', force: true });
    } else if (mode === 'status') {
      out.set(s.id, { suffix: SHORT_STATUS.includes(status) ? t(`status.short.${status}`) : '', cls: h.relay === 'ok' ? '' : 'overdue', force: true });
    } else if (pic.mode === 'knowledge') {
      const suffix = s.id === pic.capital ? t('fleet.live') : `${fmtDuration(h.age)}${h.overdue ? ` · ${t('map.overdue')}` : ''}`;
      out.set(s.id, { suffix, cls: h.overdue ? 'overdue' : h.age > theme.staleAfterYears ? 'stale' : 'fresh', force: true });
    } else {
      out.set(s.id, { suffix: h.relay === 'ok' ? '' : t('status.short.relayDown'), cls: h.relay === 'ok' ? 'fresh' : 'overdue', force: true });
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
    return SPECTRAL_CLASSES.filter((c) => counts[c]).map((c) => ({
      key: c, label: t(`spectral.class.${c}`), color: theme.spectral[/** @type {keyof typeof theme.spectral} */ (c)], count: counts[c],
    }));
  }
  const counts = countStatuses(statuses);
  return STATUSES.filter((k) => counts[k] || mode === 'status').map((key) => ({ key, label: t(`status.${key}`), color: theme.status[key], count: counts[key] ?? 0 }));
}
