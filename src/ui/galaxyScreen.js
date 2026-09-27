// @ts-check
import { h } from './dom.js';
import { createGalaxyView } from '../render/galaxyView.js';
import { createInfoOverlay } from '../render/infoOverlay.js';
import { createSystemPanel } from './systemPanel.js';
import { mountOverlayControls } from './overlayControls.js';
import { mountDispatchLog } from './dispatchLog.js';
import { isCatalogueDesignation } from '../galaxy/index.js';
import { knowledgePicture, truthPicture } from '../perspective/picture.js';
import { knowledgeOf } from '../info/module.js';

const EMPIRE = 'A';

/**
 * The main screen: 3D galaxy map with the information overlay, plus the side
 * panel. Owns selection and overlay state.
 * @param {object} deps
 * @param {ReturnType<typeof import('../render/viewport.js').createViewport>} deps.viewport
 * @param {HTMLElement} deps.viewportEl
 * @param {HTMLElement} deps.side
 * @param {HTMLElement} deps.toolsSlot
 * @param {import('../galaxy/catalog.js').Catalog} deps.catalog
 * @param {ReturnType<typeof import('../app/gameHost.js').createGameHost>} deps.game
 * @param {(msg: string) => void} deps.toast
 */
export function mountGalaxyScreen({ viewport, viewportEl, side, toolsSlot, catalog, game, toast }) {
  const state = { selected: /** @type {string | null} */ (null), measure: /** @type {string | null} */ (null) };
  const overlayState = { mode: /** @type {'knowledge' | 'truth'} */ ('knowledge'), network: true, ranges: false, age: true };

  const getPicture = () => overlayState.mode === 'truth'
    ? truthPicture(game.world, game.sim.ctx, EMPIRE)
    : knowledgePicture(game.world, game.sim.ctx, EMPIRE);

  const panel = createSystemPanel(side, { catalog, game, getPicture, toast });

  const view = createGalaxyView({
    catalog,
    inputElement: viewport.inputElement,
    isMinorName: (name) => isCatalogueDesignation(name),
    onSelect(id) {
      state.selected = id;
      state.measure = null;
      update();
    },
    onMeasure(id) {
      state.measure = id;
      update();
    },
  });
  const overlay = createInfoOverlay({ scene: view.scene, catalog, setAnnotations: view.setAnnotations });

  mountOverlayControls(viewportEl, { state: overlayState, onChange: () => { drawOverlay(); panel.refresh(); } });
  const dispatches = mountDispatchLog(viewportEl, { getDispatches: () => knowledgeOf(game.world, EMPIRE).dispatches });

  function update() {
    view.select(state.selected);
    view.setMeasure(state.measure);
    panel.render(state.selected, state.measure);
  }

  function drawOverlay() {
    overlay.update(getPicture(), overlayState);
  }

  /** @type {import('../render/galaxyView.js').LabelMode[]} */
  const modes = ['auto', 'all', 'none'];
  let mode = 0;
  const labelBtn = h('button.btn', {
    title: 'Star labels',
    onclick: () => {
      mode = (mode + 1) % modes.length;
      view.setLabelMode(modes[mode]);
      labelBtn.textContent = `Labels: ${modes[mode]}`;
    },
  }, 'Labels: auto');
  toolsSlot.prepend(h('div.btn-group', {}, labelBtn));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      state.selected = null;
      state.measure = null;
      update();
    }
  });

  viewport.setView(view);
  update();

  let sincePanel = 0;
  return {
    refresh: update,
    /** Called every animation frame. @param {number} dt */
    frame(dt) {
      drawOverlay();
      sincePanel += dt;
      if (sincePanel > 0.5) {
        sincePanel = 0;
        panel.refresh();
        dispatches.render();
      }
    },
    /** After any world change from the UI. */
    changed() {
      drawOverlay();
      panel.refresh();
      dispatches.render();
    },
  };
}
