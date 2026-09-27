// @ts-check
import { h, kv } from '../dom.js';
import { describeSpectral } from '../../galaxy/spectral.js';
import { systemTraits } from '../../galaxy/traits.js';

const pct = (/** @type {number} */ x) => `${Math.round(x * 100)} %`;

/** @param {number} lum */
function formatLum(lum) {
  if (!Number.isFinite(lum)) return '?';
  if (lum >= 10) return lum.toFixed(0);
  if (lum >= 0.1) return lum.toFixed(2);
  return lum.toExponential(1);
}

/**
 * The stars (always known: telescopes) and the survey (known only once explored).
 * @param {import('./context.js').PanelContext} c
 * @param {import('../../galaxy/catalog.js').StarSystem} s
 */
export function renderStars(c, s) {
  const explored = c.getPicture().explored.includes(s.id);
  const traits = systemTraits(c.game.world.seed, s);
  return [
    h('h3', {}, s.stars.length > 1 ? `Stars (${s.stars.length})` : 'Star'),
    ...s.stars.map((st) => {
      const d = describeSpectral(st.spect, st.cls);
      return h('div.star-row', {},
        h('span', {}, h('span.swatch', { className: `swatch cls-${d.cls}` }), ` ${st.name}`),
        h('div.dim', {}, `${st.spect} · ${d.kind} · ${d.temp} · L ${formatLum(st.lum)} L☉`),
      );
    }),
    h('h3', {}, 'Survey'),
    explored
      ? kv([['Habitability', pct(traits.habitability)], ['Resources', pct(traits.richness)], ['Major bodies', String(traits.planets)]])
      : h('p.hint', {}, 'Not explored: only what telescopes show (the stars above). Send a fleet to survey it.'),
  ];
}
