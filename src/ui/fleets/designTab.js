// @ts-check
import { h, kv, patch } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtNumber } from '../../i18n/format.js';
import { HULLS, COMPONENTS, designStats, designNeeds, canBuild } from '../../ships/catalog.js';
import { designsOf, addDesign } from '../../ships/module.js';
import { issueDirective } from '../../governors/issue.js';
import { knowledgeOf } from '../../info/module.js';
import { empireState } from '../../empire/module.js';
import { targetOf } from '../../research/catalog.js';

/** Display name of a design: its own, or the stock design's translation. @param {{ id: string, name?: string }} d */
export const designLabel = (d) => d.name ?? t(`ship.design.${d.id}`);

/**
 * Designs tab: the designs (left), the design editor (centre), building (right).
 * @param {import('./fleetTab.js').ScreenContext} c
 */
export function createDesignTab(c) {
  const list = h('aside.research-left');
  const centre = h('section.fleets-centre');
  const build = h('aside.research-detail');
  const element = h('div.fleets-grid', {}, list, centre, build);
  /** @type {{ name: string, hull: string, components: string[] }} */
  let draft = { name: '', hull: 'corvette', components: ['missile', 'flak'] };
  let selected = 'picket';
  const order = { system: '', count: 3 };
  let key = '';

  function refresh(/** @type {boolean} */ force) {
    const designs = designsOf(c.game.world, c.empire);
    const capital = empireState(c.game.world).empires[c.empire].capital;
    const unlocks = empireState(c.game.world).presence[capital]?.capabilities?.unlocks ?? [];
    const k = `${designs.length}|${selected}|${unlocks.length}|${JSON.stringify(draft)}`;
    if (!force && k === key) return;
    key = k;
    patch(list, [
      h('h3', {}, t('designs.title')),
      h('div.fleet-list', {}, ...designs.map((d) => {
        const s = designStats(d);
        return h('button', { className: `fleet-pick${d.id === selected ? ' on' : ''}`, onclick: () => { selected = d.id; draft = { name: d.name ?? '', hull: d.hull, components: [...d.components] }; refresh(true); } },
          h('div', {}, h('b', {}, designLabel(d)), h('span.dim', {}, ` · ${t(`ship.hull.${d.hull}`)}`)),
          h('div.dim.small', {}, `${t('designs.costStrength', { cost: s.cost, strength: Math.round(s.strength) })}${canBuild(d, unlocks) ? '' : ` · ${t('designs.notYet')}`}`));
      })),
    ], force);
    patch(centre, renderEditor(c, draft, unlocks, () => refresh(true), (id) => { selected = id; }), force);
    const current = designs.find((d) => d.id === selected) ?? designs[0];
    patch(build, renderBuild(c, current, order, unlocks, () => refresh(true)), force);
  }
  return { element, refresh };
}

/**
 * @param {import('./fleetTab.js').ScreenContext} c
 * @param {{ name: string, hull: string, components: string[] }} draft @param {string[]} unlocks
 * @param {() => void} redraw @param {(id: string) => void} onSaved
 */
function renderEditor(c, draft, unlocks, redraw, onSaved) {
  const hull = HULLS[draft.hull];
  draft.components = draft.components.slice(0, hull.slots);
  const design = { id: 'draft', hull: draft.hull, components: draft.components };
  const s = designStats(design);
  const needs = designNeeds(design);
  const sum = (/** @type {{ [k: string]: number }[]} */ xs, /** @type {(x: any) => number} */ f) => fmtNumber(xs.reduce((a, x) => a + f(x), 0), 1);
  const slots = Array.from({ length: hull.slots }, (_, i) => h('label.param', {}, h('span', {}, t('designs.slot', { n: i + 1 })),
    h('select', { onchange: (/** @type {Event} */ e) => { const v = /** @type {HTMLSelectElement} */ (e.target).value; if (v) draft.components[i] = v; else draft.components.splice(i, 1); redraw(); } },
      h('option', { value: '', selected: !draft.components[i] }, t('designs.empty')),
      ...Object.keys(COMPONENTS).map((id) => {
        const u = COMPONENTS[id].unlock;
        return h('option', { value: id, selected: draft.components[i] === id }, `${t(`ship.component.${id}`)}${u && !unlocks.includes(u) ? ` (${t('designs.locked')})` : ''}`);
      }))));
  return [
    h('h2', {}, t('designs.editor')),
    h('label.param', {}, h('span', {}, t('designs.name')), h('input', { value: draft.name, placeholder: t('designs.namePlaceholder'), oninput: (/** @type {Event} */ e) => { draft.name = /** @type {HTMLInputElement} */ (e.target).value; } })),
    h('label.param', {}, h('span', {}, t('designs.hull')), h('select', { onchange: (/** @type {Event} */ e) => { draft.hull = /** @type {HTMLSelectElement} */ (e.target).value; redraw(); } },
      ...Object.keys(HULLS).map((id) => h('option', { value: id, selected: id === draft.hull }, `${t(`ship.hull.${id}`)} · ${t('designs.slots', { count: HULLS[id].slots })}`)))),
    h('p.hint.small', {}, t(`ship.hullDesc.${draft.hull}`)),
    ...slots,
    h('h3', {}, t('designs.stats')),
    kv([
      [t('designs.cost'), String(s.cost)],
      [t('designs.hp'), fmtNumber(s.hp, 1)],
      [t('designs.missiles'), sum(s.missiles, (m) => m.salvo)],
      [t('designs.beams'), sum(s.beams, (b) => b.rate * b.damage)],
      [t('designs.kinetics'), sum(s.kinetics, (k) => k.rate * k.damage)],
      [t('designs.pd'), fmtNumber(s.pd, 1)],
      [t('designs.protection'), t('designs.taken', { beam: fmtNumber(s.beamTaken, 2), kinetic: fmtNumber(s.kineticTaken, 2), missile: fmtNumber(s.missileTaken, 2), ecm: fmtNumber(s.ecm, 2) })],
      [t('designs.strength'), String(Math.round(s.strength))],
    ]),
    h('div.dim.small', {}, t('designs.needs')),
    needs.length ? h('ul.plain.small', {}, ...needs.map((u) => h('li', { className: unlocks.includes(u) ? '' : 'warn' }, t(`research.target.${targetOf(u)?.id ?? u}`)))) : h('p.hint.small', {}, t('designs.needsNothing')),
    h('div.row', {}, h('button.btn.primary', {
      disabled: !draft.name.trim(),
      onclick: () => {
        const d = c.act((w, x) => addDesign(w, x, { empire: c.empire, name: draft.name.trim(), hull: draft.hull, components: draft.components }), t('designs.saved', { name: draft.name.trim() }));
        if (d) onSaved(d.id);
      },
    }, t('designs.save'))),
    h('p.hint.small', {}, t('designs.hint')),
  ];
}

/**
 * Build orders: the design travels inside the order to the chosen yard.
 * @param {import('./fleetTab.js').ScreenContext} c @param {import('../../ships/catalog.js').Design} design
 * @param {{ system: string, count: number }} order @param {string[]} unlocks @param {() => void} redraw
 */
function renderBuild(c, design, order, unlocks, redraw) {
  const k = knowledgeOf(c.game.world, c.empire);
  const capital = empireState(c.game.world).empires[c.empire].capital;
  const own = [capital, ...Object.entries(k.systems).filter(([id, e]) => e.data.owner === c.empire && id !== capital).map(([id]) => id)];
  if (!own.includes(order.system)) order.system = capital;
  const cost = designStats(design).cost;
  return [
    h('h3', {}, t('designs.build')),
    h('p', {}, h('b', {}, designLabel(design)), h('span.dim', {}, ` · ${t('designs.each', { cost })}`)),
    h('label.param', {}, h('span', {}, t('designs.yard')), h('select', { onchange: (/** @type {Event} */ e) => { order.system = /** @type {HTMLSelectElement} */ (e.target).value; redraw(); } },
      ...own.map((id) => h('option', { value: id, selected: id === order.system }, c.name(id))))),
    h('label.param', {}, h('span', {}, t('designs.count')), h('input.num', { type: 'number', min: 1, max: 12, value: order.count, onchange: (/** @type {Event} */ e) => { order.count = Math.max(1, Math.min(12, Number(/** @type {HTMLInputElement} */ (e.target).value))); } })),
    h('p.hint.small', {}, t(canBuild(design, unlocks) ? 'designs.buildHint' : 'designs.buildLocked')),
    h('div.row', {}, h('button.btn.primary', {
      onclick: () => c.act((w, x) => issueDirective(w, x, { empire: c.empire, type: 'fleet.build', target: { kind: 'system', system: order.system }, params: { design: { ...design }, count: order.count } }),
        t('designs.ordered', { count: order.count, name: designLabel(design), system: c.name(order.system) })),
    }, t('designs.orderBuild'))),
  ];
}
