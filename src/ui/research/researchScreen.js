// @ts-check
import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtNumber } from '../../i18n/format.js';
import { AREAS } from '../../research/catalog.js';
import { researchPicture } from '../../perspective/research.js';
import { acquireTech, grantCondition } from '../../research/module.js';
import { issueDirective } from '../../governors/issue.js';
import { createTechWeb } from './techWeb.js';
import { renderTechDetail } from './techDetail.js';
import { describeError } from '../text/describe.js';

const REFRESH = 0.5;

/**
 * The research screen: focus control and progress (left), the technology web
 * (centre), the selected technology (right). Opens over the map.
 * @param {object} deps
 * @param {HTMLElement} deps.root         element the screen is placed in
 * @param {HTMLElement} deps.toolsSlot    top bar slot for the open button
 * @param {ReturnType<typeof import('../../app/gameHost.js').createGameHost>} deps.game
 * @param {string} deps.empire
 * @param {(msg: string) => void} deps.toast
 */
export function mountResearchScreen({ root, toolsSlot, game, empire, toast }) {
  let open = false;
  let zoom = 1;
  let selected = /** @type {string | null} */ (null);
  let areaFilter = /** @type {string | null} */ (null);
  let focusChoice = 'communication';
  let since = 0;
  let detailKey = '';

  const web = createTechWeb({ onSelect: select });
  const left = h('aside.research-left');
  const detail = h('aside.research-detail');
  const scroller = h('div.research-web', {}, web.element);
  const screen = h('div.research-screen', { hidden: true },
    h('header.research-head', {},
      h('span.brand', {}, t('research.title')),
      h('span.spacer'),
      h('button.btn', { title: t('research.zoomOut'), onclick: () => setZoom(zoom / 1.25) }, '−'),
      h('button.btn', { title: t('research.zoomIn'), onclick: () => setZoom(zoom * 1.25) }, '+'),
      h('button.btn', { onclick: () => setZoom(Math.min(1, scroller.clientWidth / Number(web.element.getAttribute('viewBox')?.split(' ')[2]))) }, t('research.fit')),
      h('button.btn', { onclick: () => toggle(false) }, t('research.close')),
    ),
    h('div.research-body', {}, left, scroller, detail),
  );
  root.append(screen);
  const button = h('button.btn', { title: t('research.openTitle'), onclick: () => toggle() }, t('research.open'));
  toolsSlot.prepend(h('div.btn-group', {}, button));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'r' || e.key === 'R') toggle();
    else if (e.key === 'Escape' && open) toggle(false);
  });

  /** @param {boolean} [value] */
  function toggle(value = !open) {
    open = value;
    screen.hidden = !open;
    button.setAttribute('aria-pressed', String(open));
    if (open) refresh(true);
  }

  /** @param {number} z */
  function setZoom(z) {
    zoom = Math.max(0.35, Math.min(2, z));
    const [, , w, hgt] = /** @type {string} */ (web.element.getAttribute('viewBox')).split(' ').map(Number);
    web.element.setAttribute('width', String(w * zoom));
    web.element.setAttribute('height', String(hgt * zoom));
  }

  /** @param {string} id */
  function select(id) {
    selected = id;
    web.select(id);
    refresh(true);
  }

  /** @param {(w: any, c: any) => any} fn @param {string} [done] */
  function act(fn, done) {
    try {
      game.act(fn);
      if (done) toast(done);
      refresh(true);
    } catch (e) {
      toast(describeError(e));
    }
  }

  function renderLeft(/** @type {import('../../perspective/research.js').ResearchPicture} */ pic) {
    const lab = pic.capitalLab;
    const focusSelect = h('select', { onchange: (/** @type {Event} */ e) => (focusChoice = /** @type {HTMLSelectElement} */ (e.target).value) },
      ...['none', ...AREAS.map((a) => a.id)].map((a) => h('option', { value: a, selected: a === focusChoice }, t(`option.field.${a}`))));
    const setFocus = (/** @type {'empire' | 'capital'} */ scope) => act((w, c) => {
      const r = issueDirective(w, c, { empire, type: 'research.focus', target: scope === 'empire' ? { kind: 'empire' } : { kind: 'system', system: pic.capital }, params: { field: focusChoice } });
      toast(t('research.focusSent', { area: t(`option.field.${focusChoice}`), count: r.targets.length }));
    });
    left.replaceChildren(...[
      h('h3', {}, t('research.focusTitle')),
      h('p.hint.small', {}, t('research.focusHint')),
      focusSelect,
      h('div.row', {}, h('button.btn.small', { onclick: () => setFocus('empire') }, t('research.focusEmpire')), h('button.btn.small', { onclick: () => setFocus('capital') }, t('research.focusCapital'))),
      h('h3', {}, t('research.capital')),
      lab ? h('div', {},
        h('div', {}, lab.focus === 'none' ? t('research.noFocus') : t(`tech.area.${lab.focus}.name`)),
        lab.focus === 'none' ? null : h('div.bar', {}, h('span', { style: `width:${Math.round((100 * lab.progress) / Math.max(lab.cost, 1e-9))}%` })),
        lab.focus === 'none' ? null : h('div.dim.small', {}, lab.stalled ? t('research.stalled') : t('research.progress', { points: fmtNumber(lab.progress, 1), cost: fmtNumber(lab.cost, 1) })),
      ) : null,
      h('h3', {}, t('research.focusCounts')),
      h('div.areas', {}, ...AREAS.map((a) => h('button', {
        className: `area-row${areaFilter === a.id ? ' on' : ''}`, style: `--area:${a.color}`,
        onclick: () => { areaFilter = areaFilter === a.id ? null : a.id; refresh(true); },
      },
      h('span.swatch', { style: `background:${a.color}` }),
      h('span', {}, t(`tech.area.${a.id}.name`)),
      h('span.dim', {}, `${pic.focusCounts[a.id] ? `◆${pic.focusCounts[a.id]} ` : ''}${t('research.known', { known: pic.areaCounts[a.id].known, total: pic.areaCounts[a.id].total })}`)))),
      h('h3', {}, t('research.legend.title')),
      h('div.research-legend', {},
        ...['known', 'reported', 'available', 'needsCondition', 'blocked', 'locked'].map((s) => h('div.row', {}, h('span', { className: `legend-node ${s}` }), h('span.small', {}, t(`research.state.${s}`)))),
        h('div.row', {}, h('span.legend-node.theory'), h('span.small', {}, t('research.legend.theory'))),
        h('div.row', {}, h('span.legend-node.application'), h('span.small', {}, t('research.legend.application'))),
        h('div.row', {}, h('span.legend-edge'), h('span.small', {}, t('research.legend.crossArea'))),
      ),
    ].filter((n) => n != null));
  }

  /** @param {boolean} [force] */
  function refresh(force = false) {
    if (!open) return;
    const pic = researchPicture(game.world, empire);
    web.update(pic, areaFilter);
    renderLeft(pic);
    const key = selected ? `${selected}|${pic.techs[selected].state}|${pic.techs[selected].spread}|${JSON.stringify(pic.conditions)}` : '';
    if (force || key !== detailKey) {
      detailKey = key;
      detail.replaceChildren(...(selected ? renderTechDetail(selected, {
        pic,
        select,
        acquire: (how) => act((w, c) => acquireTech(w, c, { empire, system: pic.capital, tech: /** @type {string} */ (selected), how })),
        grant: (condition) => act((w) => grantCondition(w, empire, condition)),
      }).filter((n) => n != null) : [h('p.hint', {}, t('research.focusHint'))]));
    }
  }

  return {
    /** @param {number} dt */
    frame(dt) {
      since += dt;
      if (since > REFRESH) {
        since = 0;
        refresh();
      }
    },
    refresh: () => refresh(true),
  };
}
