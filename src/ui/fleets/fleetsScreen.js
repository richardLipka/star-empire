// @ts-check
import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { describeError } from '../text/describe.js';
import { createFleetTab } from './fleetTab.js';
import { createDesignTab } from './designTab.js';
import { createBattleTab } from './battleTab.js';

const REFRESH = 0.5;

/**
 * The fleets screen (docs/FLEETS.md): our fleets and their orders (battle
 * plans and voyages), ship designs and building, and the battle reports that
 * have reached the capital. Opens over the map like the research screen.
 * @param {object} deps
 * @param {HTMLElement} deps.root
 * @param {HTMLElement} deps.toolsSlot
 * @param {ReturnType<typeof import('../../app/gameHost.js').createGameHost>} deps.game
 * @param {string} deps.empire
 * @param {(msg: string) => void} deps.toast
 * @param {() => 'knowledge' | 'truth'} deps.mode   the map's perspective
 * @param {(id: string) => string} deps.name
 */
export function mountFleetsScreen({ root, toolsSlot, game, empire, toast, mode, name }) {
  let open = false;
  let tab = /** @type {'fleets' | 'designs' | 'battles'} */ ('fleets');
  let since = 0;

  /** @type {import('./fleetTab.js').ScreenContext} */
  const c = {
    game, empire, name, mode,
    act(fn, done) {
      try {
        const r = game.act(fn);
        if (done) toast(typeof done === 'function' ? done(r) : done);
        refresh(true);
        return r;
      } catch (e) {
        toast(describeError(e));
        return null;
      }
    },
    toast,
    refresh: () => refresh(true),
  };
  const tabs = { fleets: createFleetTab(c), designs: createDesignTab(c), battles: createBattleTab(c) };
  const body = h('div.fleets-body');
  const tabButtons = /** @type {const} */ (['fleets', 'designs', 'battles']).map((id) => h('button.tab', { onclick: () => { tab = id; refresh(true); } }, t(`fleets.tab.${id}`)));
  const screen = h('div.research-screen.fleets-screen', { hidden: true },
    h('header.research-head', {},
      h('span.brand', {}, t('fleets.title')),
      h('div.tabs', {}, ...tabButtons),
      h('span.spacer'),
      h('button.btn', { onclick: () => toggle(false) }, t('research.close')),
    ),
    body,
  );
  root.append(screen);
  const button = h('button.btn', { title: t('fleets.openTitle'), onclick: () => toggle() }, t('fleets.open'));
  toolsSlot.prepend(h('div.btn-group', {}, button));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'f' || e.key === 'F') toggle();
    else if (e.key === 'Escape' && open) toggle(false);
  });

  /** @param {boolean} [value] */
  function toggle(value = !open) {
    open = value;
    screen.hidden = !open;
    button.setAttribute('aria-pressed', String(open));
    if (open) refresh(true);
  }

  /** @param {boolean} [force] */
  function refresh(force = false) {
    if (!open) return;
    tabButtons.forEach((b, i) => b.setAttribute('aria-selected', String(['fleets', 'designs', 'battles'][i] === tab)));
    const view = tabs[tab];
    if (body.firstChild !== view.element) body.replaceChildren(view.element);
    view.refresh(force);
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
    /** Open on a tab (e.g. a battle report from a dispatch). @param {'fleets' | 'designs' | 'battles'} which */
    show(which) {
      tab = which;
      toggle(true);
    },
  };
}
