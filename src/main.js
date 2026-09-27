// @ts-check
import './ui/style.css';
import { setLocale, getLocale } from './i18n/index.js';
import { preferredLocale, mountLanguageSelect } from './ui/languageSelect.js';
import { createShell } from './ui/shell.js';
import { createViewport } from './render/viewport.js';
import { createGameHost } from './app/gameHost.js';
import { MODULES, DATA } from './app/modules.js';
import { sandboxScenario } from './app/scenarios.js';
import { mountTimeControls } from './ui/timeControls.js';
import { mountSavePanel, RESUME_KEY } from './ui/savePanel.js';
import { mountGalaxyScreen } from './ui/galaxyScreen.js';
import { createToast } from './ui/toast.js';
import { mountResearchScreen } from './ui/research/researchScreen.js';
import { describePause } from './ui/text/describe.js';
import { serializeWorld, deserializeWorld } from './sim/save.js';

setLocale(preferredLocale());
document.documentElement.lang = getLocale();

const shell = createShell(/** @type {HTMLElement} */ (document.getElementById('app')));
const viewport = createViewport(shell.viewport);
const toast = createToast();
const name = (/** @type {string} */ id) => DATA.catalog.get(id).name;

const game = createGameHost({ modules: MODULES, data: DATA, scenario: sandboxScenario });
startGame();

const time = mountTimeControls(shell.timeSlot, game.clock, () => game.world.time, name);
mountSavePanel(shell.toolsSlot, { getWorld: () => game.world, loadWorld: game.loadWorld, toast });
mountLanguageSelect(shell.toolsSlot, {
  beforeReload: () => {
    try { window.sessionStorage.setItem(RESUME_KEY, serializeWorld(game.world)); } catch { /* storage blocked: start fresh */ }
  },
});
const galaxy = mountGalaxyScreen({ viewport, viewportEl: shell.viewport, side: shell.side, toolsSlot: shell.toolsSlot, catalog: DATA.catalog, game, toast });
const research = mountResearchScreen({ root: document.body, toolsSlot: shell.toolsSlot, game, empire: 'A', toast });

game.bus.on('clock/changed', () => time.render());
game.bus.on('clock/autoPaused', ({ reason }) => toast(describePause(reason, name)));
game.bus.on('game/loaded', () => {
  time.render();
  galaxy.refresh();
});
game.bus.on('game/changed', () => galaxy.changed());
game.bus.on('game/loaded', () => research.refresh());

let sinceUi = 0;
viewport.onFrame((dt) => {
  game.clock.frame(dt);
  galaxy.frame(dt);
  research.frame(dt);
  sinceUi += dt;
  if (sinceUi > 0.1) {
    sinceUi = 0;
    time.render();
  }
});

/** Resume a game stashed across a language change, or start a new one. */
function startGame() {
  let stash = null;
  try {
    stash = window.sessionStorage.getItem(RESUME_KEY);
    window.sessionStorage.removeItem(RESUME_KEY);
  } catch { /* storage blocked */ }
  if (stash) {
    try {
      game.loadWorld(deserializeWorld(stash));
      return;
    } catch { /* fall through to a new game */ }
  }
  game.newGame(Date.now() % 1e9);
}
