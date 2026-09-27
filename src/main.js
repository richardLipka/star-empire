// @ts-check
import './ui/style.css';
import { createShell } from './ui/shell.js';
import { createViewport } from './render/viewport.js';
import { createGameHost } from './app/gameHost.js';
import { MODULES, DATA } from './app/modules.js';
import { mountTimeControls } from './ui/timeControls.js';
import { mountSavePanel } from './ui/savePanel.js';
import { mountGalaxyScreen } from './ui/galaxyScreen.js';
import { createToast } from './ui/toast.js';

const shell = createShell(/** @type {HTMLElement} */ (document.getElementById('app')));
const viewport = createViewport(shell.viewport);
const toast = createToast();

const game = createGameHost({ modules: MODULES, data: DATA });
game.newGame(Date.now() % 1e9);

const time = mountTimeControls(shell.timeSlot, game.clock, () => game.world.time);
mountSavePanel(shell.toolsSlot, { getWorld: () => game.world, loadWorld: game.loadWorld, toast });
const galaxy = mountGalaxyScreen({
  viewport,
  side: shell.side,
  toolsSlot: shell.toolsSlot,
  catalog: DATA.catalog,
  getSeed: () => game.world.seed,
});

game.bus.on('clock/changed', time.render);
game.bus.on('game/loaded', () => {
  time.render();
  galaxy.refresh();
});

let sinceUi = 0;
viewport.onFrame((dt) => {
  game.clock.frame(dt);
  sinceUi += dt;
  if (sinceUi > 0.1) {
    sinceUi = 0;
    time.render();
  }
});
