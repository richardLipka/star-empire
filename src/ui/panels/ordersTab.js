// @ts-check
import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtYearShort } from '../../i18n/format.js';
import { CATEGORIES, COMMON_PARAMS, directiveDef } from '../../governors/catalog.js';
import { issueDirective, revokeDirective, resolveTargets } from '../../governors/issue.js';
import { books, imposeDirective } from '../../governors/module.js';
import { ordersPicture } from '../../perspective/directives.js';
import { paramSummary, unitText } from '../text/params.js';
import { driveSelect } from './sandboxTools.js';

/** The directive being composed; survives re-renders. */
const draft = {
  type: 'expansion.explore',
  targetKind: /** @type {'system' | 'region' | 'empire'} */ ('empire'),
  radius: 15,
  /** @type {Record<string, any>} */ params: {},
  priority: 'normal',
  when: 'always',
  expires: 'never',
  instant: false,
};

/**
 * The directive composer (category → directive → target → parameters).
 * `system` parameters take the shift-clicked system.
 * @param {import('./context.js').PanelContext} c
 * @param {() => void} rerender
 */
export function renderComposer(c, rerender) {
  const { selected, measure } = c.getSelection();
  const def = directiveDef(draft.type);
  if (!selected && draft.targetKind !== 'empire') draft.targetKind = 'empire';

  const directiveSelect = h('select', { onchange: (/** @type {Event} */ e) => { draft.type = /** @type {HTMLSelectElement} */ (e.target).value; draft.params = {}; rerender(); } },
    ...CATEGORIES.map((cat) => h('optgroup', { label: t(`category.${cat.id}`) },
      ...cat.directives.map((d) => h('option', { value: d.id, selected: d.id === draft.type }, `${t(`directive.${d.id}.name`)}${d.implemented ? '' : ` (${t('orders.noEffectYet')})`}`)))));

  const target = h('div.tools', {},
    radio('system', selected ? t('orders.targetSystem', { system: c.name(selected) }) : `${t('orders.targetSystem', { system: '—' })} (${t('orders.needSelection')})`, !selected),
    h('div.row', {},
      radio('region', t('orders.targetRegion'), !selected),
      h('input.num', { type: 'number', min: 1, max: 60, step: 1, value: draft.radius, disabled: !selected, onchange: (/** @type {Event} */ e) => (draft.radius = Number(/** @type {HTMLInputElement} */ (e.target).value)) }),
      h('span.dim', {}, unitText('ly', draft.radius).replace(/^[\d\s.,]+/, '')),
    ),
    radio('empire', t('orders.targetEmpire'), false),
  );

  const paramRows = [...def.params, ...COMMON_PARAMS].map((p) => h('label.param', {}, h('span', {}, t(`param.${p.id}`)), control(p, measure, c)));
  const ready = def.params.every((p) => p.optional || p.type !== 'system' || measure) && (draft.targetKind === 'empire' || selected);

  return [
    h('h3', {}, t('orders.compose')),
    h('label.param', {}, h('span', {}, t('orders.directive')), directiveSelect),
    h('p.hint', {}, t(`directive.${draft.type}.desc`)),
    def.implemented ? null : h('p.warn.small', {}, t('orders.notImplemented')),
    h('div.dim.small', {}, t('orders.target')),
    target,
    ...paramRows,
    h('label', {}, h('input', { type: 'checkbox', checked: draft.instant, onchange: (/** @type {Event} */ e) => (draft.instant = /** @type {HTMLInputElement} */ (e.target).checked) }), ` ${t('orders.instant')}`),
    h('div.row', {}, h('button.btn.primary', { disabled: !ready, onclick: () => issue(c, selected, measure) }, t('orders.issue'))),
  ];

  /** @param {'system' | 'region' | 'empire'} kind @param {string} label @param {boolean} disabled */
  function radio(kind, label, disabled) {
    return h('label', {}, h('input', { type: 'radio', name: 'order-target', checked: draft.targetKind === kind, disabled,
      onchange: () => { draft.targetKind = kind; } }), ` ${label}`);
  }
}

/**
 * @param {import('../../governors/catalog.js').ParamDef} p
 * @param {string | null} measure
 * @param {import('./context.js').PanelContext} c
 */
function control(p, measure, c) {
  const common = p.id === 'priority' || p.id === 'when' || p.id === 'expires';
  const get = () => (common ? /** @type {any} */ (draft)[p.id] : draft.params[p.id] ?? p.default);
  const set = (/** @type {any} */ v) => { if (common) /** @type {any} */ (draft)[p.id] = v; else draft.params[p.id] = v; };
  switch (p.type) {
    case 'enum':
      return h('select', { onchange: (/** @type {Event} */ e) => set(/** @type {HTMLSelectElement} */ (e.target).value) },
        ...(p.options ?? []).map((o) => h('option', { value: o, selected: o === get() }, t(`option.${p.id}.${o}`))));
    case 'number':
      return h('span', {}, h('input.num', { type: 'number', min: p.min, max: p.max, step: p.step, value: get(), onchange: (/** @type {Event} */ e) => set(Number(/** @type {HTMLInputElement} */ (e.target).value)) }),
        ` ${unitText(p.unit, 0).replace(/^0\s*/, '')}`);
    case 'boolean':
      return h('input', { type: 'checkbox', checked: !!get(), onchange: (/** @type {Event} */ e) => set(/** @type {HTMLInputElement} */ (e.target).checked) });
    case 'drive':
      return driveSelect(get() ?? 0, set);
    case 'system':
      return h('span.dim', {}, measure ? t('orders.systemParam', { value: c.name(measure) }) : t('orders.systemNone'));
    default:
      return h('span');
  }
}

/** @param {import('./context.js').PanelContext} c @param {string | null} selected @param {string | null} measure */
function issue(c, selected, measure) {
  const def = directiveDef(draft.type);
  /** @type {Record<string, any>} */
  const params = { ...draft.params };
  for (const p of def.params) if (p.type === 'system') params[p.id] = measure ?? null;
  /** @type {import('../../governors/issue.js').Target} */
  const target = draft.targetKind === 'empire' ? { kind: 'empire' }
    : draft.targetKind === 'region' ? { kind: 'region', center: /** @type {string} */ (selected), radius: draft.radius }
      : { kind: 'system', system: /** @type {string} */ (selected) };
  const common = { type: draft.type, params, priority: /** @type {any} */ (draft.priority), when: /** @type {any} */ (draft.when) };
  if (draft.instant) {
    c.act((w, x) => {
      const systems = resolveTargets(w, x, c.empire, target).filter((s) => books(w)[s]?.empire === c.empire);
      for (const system of systems) imposeDirective(w, x, { system, ...common });
      c.toast(t('orders.imposed', { count: systems.length }));
    });
    return;
  }
  c.act((w, x) => {
    const r = issueDirective(w, x, { empire: c.empire, target, ...common, expiresIn: draft.expires === 'never' ? null : Number(draft.expires) });
    const arrivals = r.targets.map((tg) => tg.plannedArrival).filter((a) => a != null);
    const unreachable = r.targets.length - arrivals.length;
    const last = arrivals.length ? fmtYearShort(Math.max(.../** @type {number[]} */ (arrivals))) : '—';
    c.toast(t('orders.issued', { count: r.targets.length, year: last }) + (unreachable ? ` ${t('orders.issuedUnreachable', { count: unreachable })}` : ''));
  });
}

/**
 * Directives issued by the capital, newest first, with per-target status as
 * far as the capital knows.
 * @param {import('./context.js').PanelContext} c
 */
export function renderOrderList(c) {
  const orders = ordersPicture(c.game.world, c.game.sim.ctx, c.empire);
  if (!orders.length) return [h('p.hint', {}, t('orders.noneIssued'))];
  return orders.slice(0, 30).map((o) => {
    const targetDesc = o.target.kind === 'empire' ? t('orders.targetDesc.empire')
      : o.target.kind === 'region' ? t('orders.targetDesc.region', { radius: o.target.radius, system: c.name(o.target.center) })
        : t('orders.targetDesc.system', { system: c.name(o.target.system) });
    const chips = Object.entries(o.counts).map(([s, n]) => h('span', { className: `chip status-${s}` }, `${t(`orders.status.${s}`)}${o.targetStatus.length > 1 ? ` ${n}` : ''}`));
    return h('div.order', {},
      h('div.row', {},
        h('strong', {}, t(`directive.${o.type}.name`)),
        o.implemented ? null : h('span.chip.status-superseded', {}, t('orders.noEffectYet')),
        h('span.spacer'),
        o.revokedAt == null ? h('button.btn.small', { onclick: () => c.act((w, x) => revokeDirective(w, x, { empire: c.empire, id: o.id }), t('orders.revoked')) }, t('orders.revoke')) : null,
      ),
      h('div.dim.small', {}, `${targetDesc} · ${t('orders.issuedAt', { year: fmtYearShort(o.issuedAt) })}`),
      h('div.dim.small', {}, paramSummary(o.type, o.params, c.name)),
      h('div.chips', {}, ...chips),
      o.targetStatus.length > 1 ? h('details.small', {}, h('summary', {}, `${o.targetStatus.length} ×`),
        ...o.targetStatus.map((x) => h('div', {}, `${c.name(x.system)} · ${t(`orders.status.${x.status}`)}${x.status === 'inTransit' ? ` (${fmtYearShort(/** @type {number} */ (x.plannedArrival))})` : ''}`))) : null,
    );
  });
}
