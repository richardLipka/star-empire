// @ts-check
import { h, kv, patch } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtYearShort, fmtDuration, fmtSeconds, fmtC, fmtNumber, fmtPeople } from '../../i18n/format.js';
import { battlesPicture } from '../../perspective/fleets.js';
import { factionColor } from '../../render/overlay/common.js';
import { designLabel } from './designTab.js';

const SVG = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string | number>} [attrs] @param {string} [text] */
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
};

/**
 * Battles tab: the reports that reached the capital (left), one report (centre and right).
 * @param {import('./fleetTab.js').ScreenContext} c
 */
export function createBattleTab(c) {
  const list = h('aside.research-left');
  const centre = h('section.fleets-centre');
  const sides = h('aside.research-detail');
  const element = h('div.fleets-grid', {}, list, centre, sides);
  let selected = /** @type {string | null} */ (null);
  let key = '';

  function refresh(/** @type {boolean} */ force) {
    const reports = battlesPicture(c.game.world, c.empire, c.mode());
    const k = `${c.mode()}|${reports.length}|${reports[0]?.record.id}|${selected}`;
    if (!force && k === key) return;
    key = k;
    if (!selected && reports.length) selected = reports[0].record.id;
    patch(list, [
      h('h3', {}, t('battles.title')),
      reports.length ? h('div.fleet-list', {}, ...reports.map(({ record: r, receivedAt }) => h('button', {
        className: `fleet-pick${r.id === selected ? ' on' : ''}`, onclick: () => { selected = r.id; refresh(true); },
      },
      h('div', {}, h('b', {}, c.name(r.system)), h('span.dim', {}, ` · ${fmtYearShort(r.time)}`)),
      h('div.dim.small', {}, `${headline(c, r)}${receivedAt != null ? ` · ${t('battles.heard', { age: fmtDuration(receivedAt - r.time) })}` : ''}`),
      ))) : h('p.hint', {}, t('battles.none')),
      h('p.hint.small', {}, t('battles.hint')),
    ], force);
    const item = reports.find((x) => x.record.id === selected);
    if (!item) {
      patch(centre, [h('p.hint', {}, t('battles.pick'))], force);
      patch(sides, [], force);
      return;
    }
    const r = item.record;
    if (r.kind === 'strike') {
      patch(centre, renderStrike(c, r, item.receivedAt), force);
      patch(sides, [], force);
      return;
    }
    patch(centre, [
      h('h2', {}, t('battles.at', { system: c.name(r.system), year: fmtYearShort(r.time) })),
      h('p.hint', {}, `${t('empire.name', { id: r.attacker })} → ${t('empire.name', { id: r.defender })} · ${t(`battles.outcome.${r.outcome}`)}`),
      kv([
        [t('battles.speed'), r.speed <= 0.001 ? t('battles.braked', { speed: fmtC(r.speed) }) : fmtC(r.speed)],
        [t('battles.beamWindow'), fmtSeconds(r.windows.beam)],
        [t('battles.kineticWindow'), fmtSeconds(r.windows.kinetic)],
        [t('battles.pdWindow'), fmtSeconds(r.windows.pd)],
        ...(item.receivedAt != null ? /** @type {[string, string][]} */ ([[t('battles.received'), `${fmtYearShort(item.receivedAt)} (${fmtDuration(item.receivedAt - r.time)})`]]) : []),
      ]),
      h('div.battle-timeline', {}, timeline(r)),
      h('p.hint.small', {}, t('battles.timelineHint')),
    ], force);
    patch(sides, r.sides.flatMap((s) => renderSide(s)), force);
  }
  return { element, refresh };
}

/** @param {import('./fleetTab.js').ScreenContext} c @param {import('../../combat/module.js').CombatRecord} r */
function headline(c, r) {
  if (r.kind === 'strike') return t(r.hit ? 'battles.strikeHit' : 'battles.strikeStopped', { empire: r.attacker, killed: fmtPeople(r.killed) });
  const ours = r.sides.find((s) => s.empire === c.empire) ?? r.sides[0];
  const theirs = r.sides.find((s) => s !== ours) ?? r.sides[1];
  return t('battles.line', { lost: ours.lost, killed: theirs.lost, outcome: t(`battles.outcome.${r.outcome}`) });
}

/**
 * The engagement on a line: closest approach in the middle; how long each
 * weapon could bear, drawn to scale (missiles, the widest, fill the line).
 * @param {import('../../combat/module.js').BattleRecord} r
 */
function timeline(r) {
  const W = 560;
  const rows = [
    { key: 'missile', w: r.windows.missile, color: '#e8705a' },
    { key: 'pd', w: r.windows.pd, color: '#8ff0c0' },
    { key: 'beam', w: Math.min(r.windows.beam, 30), color: '#ffd84d' },
    { key: 'kinetic', w: Math.min(r.windows.kinetic, 30), color: '#d9b36a' },
  ];
  const span = Math.max(...rows.map((x) => x.w));
  const svg = el('svg', { viewBox: `0 0 ${W} ${rows.length * 22 + 24}`, class: 'timeline', role: 'img', 'aria-label': t('battles.timeline') });
  const mid = W / 2;
  svg.append(el('line', { x1: mid, y1: 0, x2: mid, y2: rows.length * 22 + 6, class: 'closest' }));
  rows.forEach((row, i) => {
    const half = (row.w / span) * (W / 2 - 110);
    const y = i * 22 + 6;
    svg.append(el('text', { x: 4, y: y + 11, class: 'row-label' }, t(`battles.phase.${row.key}`)));
    svg.append(el('rect', { x: mid - Math.max(half, 0.8), y, width: Math.max(2 * half, 1.6), height: 14, fill: row.color, 'fill-opacity': 0.55 }));
    svg.append(el('text', { x: mid + Math.max(half, 1) + 6, y: y + 11, class: 'row-value' }, fmtSeconds(row.w)));
  });
  svg.append(el('text', { x: mid, y: rows.length * 22 + 20, class: 'axis-label', 'text-anchor': 'middle' }, t('battles.closest')));
  return svg;
}

/** @param {import('../../combat/model.js').SideResult} s */
function renderSide(s) {
  const f = s.fired;
  /** @type {Map<string, { total: number, lost: number }>} */
  const byDesign = new Map();
  for (const u of s.units) {
    const g = byDesign.get(u.design) ?? { total: 0, lost: 0 };
    g.total++;
    if (u.destroyed) g.lost++;
    byDesign.set(u.design, g);
  }
  return [
    h('h3', { style: `color:${factionColor(s.empire)}` }, `${t('empire.name', { id: s.empire })} · ${t(`battles.role.${s.role}`)}`),
    h('p.hint.small', {}, `${s.alerted ? t('battles.alerted') : t('battles.surprised')} · ${Object.entries(s.plan).map(([k, v]) => t(`plan.${k}.${v}`)).join(' · ')}`),
    kv([
      [t('battles.missiles'), t('battles.missileLine', { n: fmtNumber(f.missiles, 0), stopped: fmtNumber(f.intercepted, 0), hits: fmtNumber(f.missileHits, 0) })],
      [t('battles.beams'), t('battles.hitLine', { n: fmtNumber(f.beamShots, 0), hits: fmtNumber(f.beamHits, 0) })],
      [t('battles.kinetics'), t('battles.hitLine', { n: fmtNumber(f.kineticShots, 0), hits: fmtNumber(f.kineticHits, 0) })],
      [t('battles.damage'), fmtNumber(f.damage, 1)],
    ]),
    h('div.dim.small', {}, t('battles.losses')),
    h('ul.plain.small', {}, ...[...byDesign].map(([d, g]) => h('li', {}, `${d === 'station' ? t('battles.station') : d === 'civilian' ? t('battles.civilian') : designLabel({ id: d })}: ${t('battles.lostOf', { lost: g.lost, total: g.total })}`))),
  ];
}

/**
 * @param {import('./fleetTab.js').ScreenContext} c @param {import('../../combat/module.js').StrikeRecord} r @param {number | null} receivedAt
 */
function renderStrike(c, r, receivedAt) {
  return [
    h('h2', {}, t('battles.strikeAt', { system: c.name(r.system), year: fmtYearShort(r.time) })),
    h('p.warn', {}, t(r.hit ? 'battles.strikeHitLong' : 'battles.strikeStoppedLong', { empire: r.attacker, killed: fmtPeople(r.killed), population: fmtPeople(r.population) })),
    kv([
      [t('battles.interceptChance'), `${fmtNumber(r.intercept * 100, 0)} %`],
      ...(receivedAt != null ? /** @type {[string, string][]} */ ([[t('battles.received'), `${fmtYearShort(receivedAt)} (${fmtDuration(receivedAt - r.time)})`]]) : []),
    ]),
    h('p.hint.small', {}, t('battles.strikeHint')),
  ];
}
