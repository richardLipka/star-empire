// @ts-check
import { h } from './dom.js';
import { createGalaxyView } from '../render/galaxyView.js';
import { createSystemPanel } from './systemPanel.js';
import { isCatalogueDesignation } from '../galaxy/index.js';

/**
 * The main screen: 3D galaxy map plus the side panel. Owns selection state.
 * @param {object} deps
 * @param {ReturnType<typeof import('../render/viewport.js').createViewport>} deps.viewport
 * @param {HTMLElement} deps.side
 * @param {HTMLElement} deps.toolsSlot
 * @param {import('../galaxy/catalog.js').Catalog} deps.catalog
 * @param {() => string} deps.getSeed
 */
export function mountGalaxyScreen({ viewport, side, toolsSlot, catalog, getSeed }) {
  const state = { selected: /** @type {string | null} */ (null), measure: /** @type {string | null} */ (null) };
  const panel = createSystemPanel(side, { catalog, getSeed });

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

  function update() {
    view.select(state.selected);
    view.setMeasure(state.measure);
    panel.render(state.selected, state.measure);
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
  return { refresh: update };
}
