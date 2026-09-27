// @ts-check
import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtNumber } from '../../i18n/format.js';
import { tech, leadsTo, influences, targetOf, AREAS } from '../../research/catalog.js';

const AREA_COLOR = new Map(AREAS.map((a) => [a.id, a.color]));

/** @param {import('../../research/catalog.js').Effect} e */
export function describeEffect(e) {
  const reg = targetOf(e.target);
  const where = reg?.implemented ? t('research.implemented') : t('research.notYet', { module: t(`research.module.${reg?.module}`), milestone: reg?.milestone ?? '' });
  let text;
  if (e.kind === 'unlock') {
    const what = e.target.startsWith('drive.') ? t(`drive.${e.target.slice(6)}`) : t(`research.target.${reg?.id}`);
    text = t('research.effect.unlock', { target: what });
  } else {
    const target = t(`research.target.${reg?.id}`);
    text = e.op === 'add'
      ? t('research.effect.add', { target, value: fmtNumber(e.value, 2), unit: t(`research.unit.${reg?.unit ?? 'factor'}`) })
      : t('research.effect.mul', { target, value: fmtNumber(e.value, 2) });
  }
  return { text: text.trim(), where, implemented: !!reg?.implemented };
}

/**
 * Everything about one technology: what it is, what it needs and opens,
 * what it does and where, how to get it.
 * @param {string} id
 * @param {object} deps
 * @param {import('../../perspective/research.js').ResearchPicture} deps.pic
 * @param {(id: string) => void} deps.select
 * @param {(how: 'purchase' | 'reverse' | 'espionage') => void} deps.acquire
 * @param {(condition: string) => void} deps.grant
 */
export function renderTechDetail(id, { pic, select, acquire, grant }) {
  const x = tech(id);
  const view = pic.techs[id];
  const chip = (/** @type {string} */ other) => h('button', {
    className: `tech-chip ${pic.techs[other].state}`, style: `--area:${AREA_COLOR.get(tech(other).area)}`, onclick: () => select(other),
  }, t(`tech.${other}.name`));
  const inf = influences(id);
  const effects = x.effects.map(describeEffect);
  const conditions = x.conditions ?? [];

  return [
    h('h2', { style: `color:${AREA_COLOR.get(x.area)}` }, t(`tech.${id}.name`)),
    h('div.dim.small', {}, `${t(`tech.area.${x.area}.name`)} · ${t(`research.kind.${x.kind}`)} · ${t('research.tier', { n: x.tier })}`),
    h('div', { className: `tech-state ${view.state}` }, t(`research.state.${view.state}`)),
    h('p', {}, t(`tech.${id}.desc`)),
    h('h3', {}, t('research.requires')),
    x.requires.length ? h('div.chips', {}, ...x.requires.map(chip)) : h('p.hint', {}, t('research.none')),
    conditions.length ? h('div', {}, h('h3', {}, t('research.conditions')),
      ...conditions.map((c) => h('div.row', {}, h('span', {}, `${pic.conditions[c] ? '✓' : '✗'} ${t(`research.condition.${c}`)}`),
        pic.conditions[c] ? null : h('button.btn.small', { onclick: () => grant(c) }, t('research.sandboxCondition'))))) : null,
    h('h3', {}, t('research.leadsTo')),
    leadsTo(id).length ? h('div.chips', {}, ...leadsTo(id).map(chip)) : h('p.hint', {}, t('research.none')),
    h('h3', {}, t('research.effects')),
    effects.length
      ? h('ul.plain', {}, ...effects.map((e) => h('li', {}, e.text, h('div', { className: `small ${e.implemented ? 'dim' : 'warn'}` }, e.where))))
      : h('p.hint', {}, t('research.noEffects')),
    inf.areas.length || inf.modules.length ? h('div', {}, h('h3', {}, t('research.influences')),
      h('div.dim', {}, [...inf.areas.map((a) => t(`tech.area.${a}.name`)), ...inf.modules.map((m) => t(`research.module.${m}`))].join(' · '))) : null,
    h('p.dim.small', {}, t('research.spread', { count: view.spread, total: pic.systems })),
    view.state === 'known' ? null : h('div', {},
      h('h3', {}, t('research.obtain')),
      h('p.hint', {}, view.state === 'blocked' ? t('research.obtainBlocked') : t('research.obtainResearch', { area: t(`tech.area.${x.area}.name`) })),
      h('div.dim.small', {}, t('research.sandboxAcquire')),
      h('div.row', {}, ...(/** @type {const} */ (['purchase', 'reverse', 'espionage'])).map((how) => h('button.btn.small', { onclick: () => acquire(how) }, t(`research.via.${how}`)))),
    ),
  ];
}
