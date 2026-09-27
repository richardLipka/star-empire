// @ts-check
import { applyThemeToCss } from '../render/theme.js';
import { t } from '../i18n/index.js';

/**
 * Build the static page layout: top bar, 3D viewport and side panel.
 * Screens fill these regions; the shell itself holds no game logic.
 * @param {HTMLElement} root
 */
export function createShell(root) {
  applyThemeToCss(document.documentElement);
  document.title = t('app.title');
  root.innerHTML = `
    <header class="topbar">
      <span class="brand"></span>
      <div class="topbar-slot" data-slot="time"></div>
      <span class="spacer"></span>
      <div class="topbar-slot" data-slot="tools"></div>
    </header>
    <main class="viewport"></main>
    <aside class="sidepanel"></aside>
  `;
  const q = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  q('.brand').textContent = t('app.brand');
  return {
    viewport: q('.viewport'),
    side: q('.sidepanel'),
    timeSlot: q('[data-slot="time"]'),
    toolsSlot: q('[data-slot="tools"]'),
  };
}
