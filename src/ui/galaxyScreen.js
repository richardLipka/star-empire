// @ts-check
import { h } from './dom.js';
import { createGalaxyView } from '../render/galaxyView.js';
import { createInfoOverlay } from '../render/overlay/index.js';
import { starAppearance } from '../render/starAppearance.js';
import { createSidePanel } from './sidePanel.js';
import { mountMapControls } from './mapControls.js';
import { mountDispatchLog } from './dispatchLog.js';
import { annotations, legendItems } from './mapAnnotations.js';
import { isCatalogueDesignation } from '../galaxy/index.js';
import { knowledgePicture, truthPicture } from '../perspective/picture.js';
import { classifySystems } from '../perspective/starStatus.js';
import { knowledgeOf } from '../info/module.js';

const EMPIRE = 'A';
/** Seconds between restyling all stars and labels (moving objects update every frame). */
const RESTYLE_EVERY = 0.25;
const PANEL_EVERY = 0.5;

/**
 * The main screen: 3D galaxy map with the information overlay, map controls,
 * dispatch log and side panel. Owns selection and map state.
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
  const selection = { selected: /** @type {string | null} */ (null), measure: /** @type {string | null} */ (null) };
  /** @type {import('./mapControls.js').MapState} */
  const map = { mode: 'knowledge', network: true, ranges: false, colourBy: 'status', highlight: null };

  const getPicture = () => (map.mode === 'truth' ? truthPicture : knowledgePicture)(game.world, game.sim.ctx, EMPIRE);
  let picture = getPicture();
  let statuses = classifySystems(picture, catalog.systems);

  const panel = createSidePanel(side, { catalog, game, getPicture: () => picture, getStatuses: () => statuses, empire: EMPIRE, toast });
  const view = createGalaxyView({
    catalog,
    inputElement: viewport.inputElement,
    isMinorName: (name) => isCatalogueDesignation(name),
    onSelect(id) {
      selection.selected = id;
      selection.measure = null;
      updateSelection();
    },
    onMeasure(id) {
      selection.measure = id;
      updateSelection();
    },
  });
  const overlay = createInfoOverlay({ scene: view.scene, catalog });
  const controls = mountMapControls(viewportEl, { state: map, legend: () => legendItems(map.colourBy, catalog.systems, statuses), onChange: redraw });
  const dispatches = mountDispatchLog(viewportEl, { getDispatches: () => knowledgeOf(game.world, EMPIRE).dispatches });

  function updateSelection() {
    view.select(selection.selected);
    view.setMeasure(selection.measure);
    panel.render(selection.selected, selection.measure);
  }

  /** Recompute everything derived from the picture. */
  function restyle() {
    statuses = classifySystems(picture, catalog.systems);
    const look = starAppearance({ mode: map.colourBy, systems: catalog.systems, statuses, pic: picture, highlight: map.highlight });
    view.setStarAppearance(look.colors, look.sizes);
    view.setAnnotations(annotations(map.colourBy, catalog.systems, statuses, picture));
    controls.renderLegend();
  }

  function redraw() {
    picture = getPicture();
    overlay.update(picture, map);
    restyle();
    panel.refresh();
    dispatches.render();
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
      selection.selected = null;
      selection.measure = null;
      updateSelection();
    }
  });

  viewport.setView(view);
  updateSelection();
  redraw();

  let sinceStyle = 0;
  let sincePanel = 0;
  return {
    refresh: () => {
      updateSelection();
      redraw();
    },
    /** Every animation frame. @param {number} dt */
    frame(dt) {
      picture = getPicture();
      overlay.update(picture, map);
      sinceStyle += dt;
      sincePanel += dt;
      if (sinceStyle > RESTYLE_EVERY) {
        sinceStyle = 0;
        restyle();
      }
      if (sincePanel > PANEL_EVERY) {
        sincePanel = 0;
        panel.refresh();
        dispatches.render();
      }
    },
    /** After a world change from the UI. */
    changed: redraw,
  };
}
