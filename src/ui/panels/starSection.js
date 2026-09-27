// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtLum, fmtPercent } from '../../i18n/format.js';
import { systemTraits } from '../../galaxy/traits.js';
import { describeStar } from '../text/describe.js';

/**
 * The stars (always known: telescopes) and the survey (known only once explored).
 * @param {import('./context.js').PanelContext} c
 * @param {import('../../galaxy/catalog.js').StarSystem} s
 */
export function renderStars(c, s) {
  const explored = c.getPicture().explored.includes(s.id);
  const traits = systemTraits(c.game.world.seed, s);
  return [
    h('h3', {}, s.stars.length > 1 ? t('panel.stars', { count: s.stars.length }) : t('panel.star')),
    ...s.stars.map((st) => {
      const d = describeStar(st);
      return h('div.star-row', {},
        h('span', {}, h('span.swatch', { className: `swatch cls-${d.cls}` }), ` ${st.name}`),
        h('div.dim', {}, [st.spect, d.kind, d.temp, t('unit.lsun', { n: fmtLum(st.lum) })].filter(Boolean).join(' · ')),
      );
    }),
    h('h3', {}, t('panel.survey')),
    explored
      ? kv([[t('survey.habitability'), fmtPercent(traits.habitability)], [t('survey.resources'), fmtPercent(traits.richness)], [t('survey.bodies'), String(traits.planets)]])
      : h('p.hint', {}, t('survey.unexplored')),
  ];
}
