// @ts-check
import { h, kv } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtNumber, fmtPeople, fmtPercent, fmtYear, fmtYearShort } from '../../i18n/format.js';
import { colonyView } from '../../perspective/colony.js';
import { driftOf } from '../../loyalty/module.js';

/**
 * What pushes and pulls a colony's loyalty. Only the truth shows the forces
 * themselves; the capital sees just the reported loyalty.
 * @param {import('./context.js').PanelContext} c @param {string} id @param {boolean} truth
 */
function renderForces(c, id, truth) {
  if (!truth) return [h('p.hint', {}, t('loyalty.unknownForces'))];
  const f = driftOf(c.game.world, c.game.sim.ctx, id);
  if (!f) return [];
  const n = (/** @type {number} */ x) => t('loyalty.points', { n: fmtNumber(x * 100, 2) });
  /** @type {[string, string][]} */
  const rows = [
    ...Object.entries(f.push).filter(([, v]) => v > 0).map(([k, v]) => /** @type {[string, string]} */ ([t(`loyalty.push.${k}`), `−${n(v)}`])),
    ...Object.entries(f.pull).filter(([, v]) => v > 0).map(([k, v]) => /** @type {[string, string]} */ ([t(`loyalty.pull.${k}`), `+${n(v)}`])),
    [t('loyalty.net'), `${f.net >= 0 ? '+' : '−'}${n(Math.abs(f.net))}`],
  ];
  return [h('div.dim.small', {}, t('loyalty.forces')), kv(rows)];
}

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
  if (col.prepared > 0) rows.push([t('colony.prepared'), fmtPercent(col.prepared)]);
  const known = pic.systems.find((s) => s.id === id);
  if (id === pic.capital) rows.push([t('loyalty.title'), t('loyalty.capital')]);
  else if (known?.loyalty) rows.push([t('loyalty.title'), t('loyalty.value', { percent: fmtPercent(known.loyalty.value), stage: t(`loyalty.stage.${known.loyalty.stage}`) })]);
  nodes.push(kv(rows));
  if (id !== pic.capital && known?.loyalty) nodes.push(...renderForces(c, id, pic.mode === 'truth'));
  const troubles = [];
  if (col.crops) troubles.push(t(col.site.kind === 'habitable' || col.site.kind === 'terraformed' ? 'colony.trouble.famine' : 'colony.trouble.rationing'));
  if (col.unrest) troubles.push(t(col.society === 'embryo' ? 'colony.trouble.strangeness' : 'colony.trouble.unrest'));
  if (col.food < 1 && !col.crops) troubles.push(t('colony.trouble.hunger'));
  for (const x of troubles) nodes.push(h('p.warn', {}, x));
  return nodes;
}
