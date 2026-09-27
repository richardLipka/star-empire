// @ts-check
import { formatDuration, formatYear } from '../core/time.js';

/**
 * Short human descriptions of picture items, shared by map labels and panels,
 * so both always say the same thing.
 */

/**
 * @param {import('./picture.js').PicFleet} f
 * @param {(id: string) => string} name
 */
export function describeFleet(f, name) {
  const year = (/** @type {number} */ t) => formatYear(t).slice(0, 7);
  const dest = f.dest ? name(f.dest) : '';
  switch (f.certainty) {
    case 'live':
      return f.at ? `at ${name(f.at)} · live` : `→ ${dest}, ETA ${year(/** @type {number} */ (f.eta))} · live (ansible)`;
    case 'actual':
      return f.at ? `at ${name(f.at)}` : `→ ${dest}, ETA ${year(/** @type {number} */ (f.eta))}${f.burning ? ` · ${f.burning}` : ' · coasting'}`;
    case 'confirmed':
      return `at ${name(/** @type {string} */ (f.at))} · confirmed, report ${formatDuration(f.age)} old`;
    case 'expected':
      return `expected → ${dest}, ETA ${year(/** @type {number} */ (f.eta))} · departure report ${formatDuration(f.age)} old${f.brakingSeenAt != null ? ' · braking seen' : ''}`;
    case 'unconfirmed':
      return `should have reached ${dest} in ${year(/** @type {number} */ (f.eta))} · arrival unconfirmed${f.brakingSeenAt != null ? ' (braking was seen)' : ''}`;
  }
}

/**
 * @param {import('./picture.js').PicSighting} s
 * @param {(id: string) => string} name
 */
export function describeSighting(s, name) {
  const who = s.own ? 'own fleet' : `Empire ${s.fleetEmpire} drive`;
  const where = s.near ? name(s.near) : 'deep space';
  const what = s.phase === 'braking' ? `braking → ${where}` : `accelerating from ${where}`;
  return `${who} ${what} · ${formatDuration(s.age)} ago`;
}
