// @ts-check
import './ui/style.css';
import { createShell } from './ui/shell.js';
import { createViewport } from './render/viewport.js';
import { createGameHost } from './app/gameHost.js';
import { MODULES, DATA } from './app/modules.js';
import { sandboxScenario } from './app/scenarios.js';
import { mountTimeControls } from './ui/timeControls.js';
import { mountSavePanel } from './ui/savePanel.js';
import { mountGalaxyScreen } from './ui/galaxyScreen.js';
import { createToast } from './ui/toast.js';

const shell = createShell(/** @type {HTMLElement} */ (document.getElementById('app')));
const viewport = createViewport(shell.viewport);
const toast = createToast();

const game = createGameHost({ modules: MODULES, data: DATA, scenario: sandboxScenario });
game.newGame(Date.now() % 1e9);

const time = mountTimeControls(shell.timeSlot, game.clock, () => game.world.time);
mountSavePanel(shell.toolsSlot, { getWorld: () => game.world, loadWorld: game.loadWorld, toast });
const galaxy = mountGalaxyScreen({
  viewport,
  viewportEl: shell.viewport,
  side: shell.side,
  toolsSlot: shell.toolsSlot,
  catalog: DATA.catalog,
  game,
  toast,
});

game.bus.on('clock/changed', (st) => {
  time.render();
  if (st.lastPause) toast(`Paused: ${st.lastPause}`);
});
game.bus.on('game/loaded', () => {
  time.render();
  galaxy.refresh();
});
game.bus.on('game/changed', () => galaxy.changed());

let sinceUi = 0;
viewport.onFrame((dt) => {
  game.clock.frame(dt);
  galaxy.frame(dt);
  sinceUi += dt;
  if (sinceUi > 0.1) {
    sinceUi = 0;
    time.render();
  }
});
