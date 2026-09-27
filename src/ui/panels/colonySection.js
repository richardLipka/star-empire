// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtNumber, fmtPeople, fmtPercent, fmtYear, fmtYearShort } from '../../i18n/format.js';
import { colonyView } from '../../perspective/colony.js';

/** Food ratio → how the colony eats. @param {number} food */
const foodWord = (food) => (food < 1 ? 'starving' : food < 1.1 ? 'tight' : 'surplus');

/**
 * The people of one system, as the current picture knows them.
 * @param {import('./context.js').PanelContext} c
 * @param {string} id
 */
export function renderColony(c, id) {
  const pic = c.getPicture();
  const view = colonyView(c.game.world, pic, id);
  if (!view) return [h('p.hint', {}, t('colony.none'))];
  const col = view.colony;
  const nodes = [];
  if (pic.mode === 'knowledge' && id !== pic.capital) nodes.push(h('p.hint', {}, t('colony.asOf', { year: fmtYear(view.validAt), age: fmtDuration(pic.now - view.validAt) })));
  const place = col.site.name ? t(`colony.site.${col.site.kind}`, { body: col.site.name }) : t('colony.site.deepOrbital');
  /** @type {[string, string][]} */
  const rows = [
    [t('colony.population'), t('colony.ofCapacity', { people: fmtPeople(col.population), capacity: fmtPeople(col.capacity) })],
    [t('colony.where'), place],
    [t('colony.origin'), t(`colony.mode.${col.mode}`, { year: fmtYearShort(col.founded) })],
    [t('colony.society'), t(`colony.societyKind.${col.society}`)],
    [t('colony.food'), t(`colony.foodState.${foodWord(col.food)}`, { ratio: fmtPercent(col.food) })],
    [t('colony.industry'), t('colony.perYear', { n: fmtNumber(col.industry, 1) })],
    [t('colony.materiel'), fmtNumber(col.materiel, 0)],
    [t('colony.research'), t('colony.perYear', { n: fmtNumber(col.research, 2) })],
  ];
  if (col.stock > 0) rows.push([t('colony.embryos'), fmtPeople(col.stock)]);
  if (col.instability >= 0.1) rows.push([t('colony.instability'), fmtPercent(col.instability)]);
  if (col.terraform != null) rows.push([t('colony.terraforming'), fmtPercent(col.terraform)]);
  nodes.push(kv(rows));
  const troubles = [];
  if (col.crops) troubles.push(t(col.site.kind === 'habitable' || col.site.kind === 'terraformed' ? 'colony.trouble.famine' : 'colony.trouble.rationing'));
  if (col.unrest) troubles.push(t(col.society === 'embryo' ? 'colony.trouble.strangeness' : 'colony.trouble.unrest'));
  if (col.food < 1 && !col.crops) troubles.push(t('colony.trouble.hunger'));
  for (const x of troubles) nodes.push(h('p.warn', {}, x));
  return nodes;
}
