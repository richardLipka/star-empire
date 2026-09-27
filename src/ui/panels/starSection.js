// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtLum, fmtNumber, fmtPercent } from '../../i18n/format.js';
import { systemTraits } from '../../galaxy/traits.js';
import { systemBodies } from '../../galaxy/planets.js';
import { describeStar } from '../text/describe.js';
import { colonyView } from '../../perspective/colony.js';
import { orrery } from './orrery.js';

/**
 * The stars (always known: telescopes) and the survey (known only once explored).
 * @param {import('./context.js').PanelContext} c
 * @param {import('../../galaxy/catalog.js').StarSystem} s
 */
export function renderStars(c, s) {
  const pic = c.getPicture();
  const explored = pic.explored.includes(s.id);
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
    ...(explored ? renderSurvey(c, s) : [h('p.hint', {}, t('survey.unexplored'))]),
  ];
}

/**
 * @param {import('./context.js').PanelContext} c
 * @param {import('../../galaxy/catalog.js').StarSystem} s
 */
function renderSurvey(c, s) {
  const seed = c.game.world.seed;
  const traits = systemTraits(seed, s);
  const model = systemBodies(seed, s);
  const colony = colonyView(c.game.world, c.getPicture(), s.id)?.colony;
  const notable = model.bodies.filter((b) => b.site === 'habitable' || b.site === 'terraformable');
  return [
    kv([
      [t('survey.habitability'), fmtPercent(traits.habitability)],
      [t('survey.resources'), fmtPercent(traits.richness)],
      [t('survey.bodies'), String(traits.planets)],
      [t('survey.hz'), t('survey.hzRange', { from: fmtNumber(model.hz[0], 2), to: fmtNumber(model.hz[1], 2) })],
    ]),
    h('div.orrery-wrap', {}, orrery(model, s.stars, colony?.site.body ?? null)),
    notable.length
      ? h('ul.plain.small', {}, ...notable.map((b) => h('li', {}, `${b.name}: ${t(`survey.site.${b.site}`)} · ${t(`survey.type.${b.type}`)}${b.tidalLock ? ` · ${t('survey.tidalLock')}` : ''}`, h('span.dim', {}, ` (${fmtPercent(b.quality)})`))))
      : h('p.hint', {}, t(model.bodies.some((b) => b.site === 'hostile') ? 'survey.onlyHostile' : 'survey.onlyOrbital')),
    model.giantStar ? h('p.hint', {}, t('survey.giantStar')) : null,
  ].filter(Boolean);
}
