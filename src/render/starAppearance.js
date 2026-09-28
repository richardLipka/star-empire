// @ts-check
import * as THREE from 'three';
import { theme } from './theme.js';
import { ageColor, factionColor } from './overlay/common.js';
import { classifyPolitics, classifyEconomy } from '../perspective/politics.js';

/** Point size in pixels from absolute magnitude: brighter stars are larger. */
export const magnitudeSize = (/** @type {number} */ absmag) => (Number.isFinite(absmag) ? Math.min(9, Math.max(2.5, 9 - 0.45 * absmag)) : 3);

const STATUS_SIZE = { capital: 9, relay: 7, outpost: 6, relayDown: 6, foreign: 6, explored: 4.5, unexplored: 2.8 };

/**
 * Colour and size of every star for one map view.
 * - 'spectral': colour by spectral class, size by brightness;
 * - 'status':   colour by what the perspective knows (unexplored, explored, outpost, relay...);
 * - 'age':      held systems coloured by the age of their news, everything else dimmed;
 * - 'politics': our colonies by reported loyalty, foreign ones in their faction's colour;
 * - 'economy':  held systems by population (size too) and trouble.
 * `highlight` (legend filter) dims every star whose key is not in the set.
 *
 * @param {object} p
 * @param {'spectral' | 'status' | 'age' | 'politics' | 'economy'} p.mode
 * @param {import('../galaxy/catalog.js').StarSystem[]} p.systems
 * @param {Map<string, import('../perspective/starStatus.js').StarStatus>} p.statuses
 * @param {import('../perspective/picture.js').Picture} p.pic
 * @param {Set<string> | null} p.highlight
 */
export function starAppearance({ mode, systems, statuses, pic, highlight }) {
  const held = new Map(pic.systems.map((s) => [s.id, s]));
  const political = mode === 'politics' ? classifyPolitics(pic) : null;
  const economic = mode === 'economy' ? classifyEconomy(pic) : null;
  const colors = [];
  const sizes = [];
  for (const s of systems) {
    const status = /** @type {import('../perspective/starStatus.js').StarStatus} */ (statuses.get(s.id));
    const cls = s.stars[0]?.cls ?? '?';
    let color;
    let size;
    if (mode === 'spectral') {
      color = new THREE.Color(theme.spectral[/** @type {keyof typeof theme.spectral} */ (cls)] ?? theme.spectral['?']);
      size = magnitudeSize(Math.min(...s.stars.map((x) => x.absmag)));
    } else if (mode === 'status') {
      color = new THREE.Color(theme.status[status]);
      size = STATUS_SIZE[status];
    } else if (political) {
      const k = political.get(s.id);
      color = new THREE.Color(!k ? theme.quiet : k.startsWith('faction:') ? factionColor(k.slice(8)) : theme.politics[/** @type {keyof typeof theme.politics} */ (k)]);
      size = k ? 7 : 2.5;
    } else if (economic) {
      const k = economic.get(s.id);
      const pop = held.get(s.id)?.population ?? 0;
      color = new THREE.Color(k ? theme.economy[k] : theme.quiet);
      size = k ? Math.min(12, 4 + 0.8 * Math.log10(1 + pop)) : 2.5;
    } else {
      const h = held.get(s.id);
      color = h ? ageColor(h.age, h.overdue, factionColor(h.owner)) : new THREE.Color(status === 'explored' ? '#5b6873' : theme.status.unexplored);
      size = h ? 7 : status === 'explored' ? 3.5 : 2.5;
    }
    if (s.id === pic.capital) size = Math.max(size, 8);
    const key = mode === 'spectral' ? cls : political ? political.get(s.id) ?? '' : economic ? economic.get(s.id) ?? '' : status;
    if (highlight && !highlight.has(key)) {
      color.multiplyScalar(0.22);
      size *= 0.7;
    }
    colors.push(color);
    sizes.push(size);
  }
  return { colors, sizes };
}
