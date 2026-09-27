// @ts-check
import { h, kv } from './dom.js';
import { formatDuration } from '../core/time.js';
import { distance } from '../core/vec3.js';
import { measure, systemTraits } from '../galaxy/index.js';
import { DRIVE_TIERS, START_DRIVE, WEAR_ABOVE_G } from '../fleet/drives.js';

/**
 * Side panel for the galaxy screen: overview, selected system, measurement.
 * @param {HTMLElement} root
 * @param {{ catalog: import('../galaxy/catalog.js').Catalog, getSeed: () => string }} deps
 */
export function createSystemPanel(root, { catalog, getSeed }) {
  const pct = (/** @type {number} */ x) => `${Math.round(x * 100)} %`;
  const ly = (/** @type {number} */ x) => `${x.toFixed(2)} ly`;

  function overview() {
    const m = catalog.meta;
    return [
      h('h2', {}, 'Local bubble'),
      h('p.hint', {}, `${m.systemCount} systems, ${m.starCount} stars within ${m.radiusLy} ly of Sol.`),
      h('h3', {}, 'Controls'),
      kv([
        ['Click', 'select a system'],
        ['Shift+click', 'measure to another'],
        ['Double-click', 'centre the view'],
        ['Drag / wheel', 'orbit / zoom'],
        ['Right-drag', 'pan'],
        ['Space', 'pause / run'],
      ]),
      credits(),
    ];
  }

  /** @param {import('../galaxy/catalog.js').StarSystem} s */
  function systemDetails(s) {
    const traits = systemTraits(getSeed(), s);
    const fromSol = distance(s.pos, catalog.sol.pos);
    const trip = measure(catalog.sol, s, [START_DRIVE]).trips[0].profile;
    return [
      h('h2', {}, s.name),
      h('p.hint', {}, s.id === 'sol' ? 'Seat of Empire A.' : `${ly(fromSol)} from Sol`),
      h('h3', {}, 'From Sol'),
      kv([
        ['Light delay', formatDuration(fromSol)],
        ['Round trip (message)', formatDuration(2 * fromSol)],
        [`Trip, ${START_DRIVE.name.toLowerCase()}`, formatDuration(trip.totalTime)],
      ]),
      h('h3', {}, s.stars.length > 1 ? `Stars (${s.stars.length})` : 'Star'),
      kv(s.stars.map((st) => [st.name, `${st.spect} · L ${formatLum(st.lum)}`])),
      h('h3', {}, 'Survey estimate'),
      kv([
        ['Habitability', pct(traits.habitability)],
        ['Resources', pct(traits.richness)],
        ['Major bodies', String(traits.planets)],
      ]),
      h('p.hint', {}, 'Placeholder values until star systems are modelled (M7).'),
      h('h3', {}, 'Galactic position'),
      kv([['x, y, z', s.pos.map((v) => v.toFixed(2)).join(', ')]]),
    ];
  }

  /** @param {import('../galaxy/catalog.js').StarSystem} a @param {import('../galaxy/catalog.js').StarSystem} b */
  function measurement(a, b) {
    const m = measure(a, b, DRIVE_TIERS);
    const oneG = m.trips.find((t) => t.drive.accelG === 1) ?? m.trips[m.trips.length - 1];
    return [
      h('h3', {}, `Measure: ${a.name} → ${b.name}`),
      kv([
        ['Distance', ly(m.distance)],
        ['Light delay', formatDuration(m.lightDelay)],
      ]),
      h('h3', {}, 'Trip time by drive'),
      kv(m.trips.map(({ drive, profile }) => [
        `${drive.accelG} g → ${drive.cruise} c${drive.accelG > WEAR_ABOVE_G ? ' ⚠' : ''}`,
        `${formatDuration(profile.totalTime)} (crew ${formatDuration(profile.properTime)})`,
      ])),
      h('p.hint', {}, `Warning at arrival, braking at ${oneG.drive.accelG} g: ${formatDuration(oneG.profile.warning)}. ⚠ = wear above ${WEAR_ABOVE_G} g.`),
    ];
  }

  return {
    /** @param {string | null} selectedId @param {string | null} measureId */
    render(selectedId, measureId) {
      const parts = [];
      if (!selectedId) parts.push(...overview());
      else {
        const s = catalog.get(selectedId);
        parts.push(...systemDetails(s));
        if (measureId && measureId !== selectedId) parts.push(...measurement(s, catalog.get(measureId)));
        else parts.push(h('p.hint', {}, 'Shift+click another system to measure.'));
      }
      root.replaceChildren(...parts);
    },
  };

  function credits() {
    const m = catalog.meta;
    return h('p.hint.credits', {},
      'Star data: ',
      h('a', { href: m.url, target: '_blank', rel: 'noopener' }, m.source),
      ` by ${m.author}, `,
      h('a', { href: m.licenseUrl, target: '_blank', rel: 'noopener' }, m.license),
      '.',
    );
  }
}

/** @param {number} lum */
function formatLum(lum) {
  if (!Number.isFinite(lum)) return '?';
  if (lum >= 10) return lum.toFixed(0);
  if (lum >= 0.1) return lum.toFixed(2);
  return lum.toExponential(1);
}
