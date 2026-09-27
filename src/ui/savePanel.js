// @ts-check
import { h } from './dom.js';
import { serializeWorld, deserializeWorld } from '../sim/save.js';
import { formatYear } from '../core/time.js';

const SLOT_KEY = 'star-empire:save:quick';

/** localStorage may be unavailable (private mode, blocked storage). */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Quick save/load to browser storage plus JSON export/import.
 * @param {HTMLElement} slot
 * @param {{ getWorld: () => import('../sim/world.js').World, loadWorld: (w: import('../sim/world.js').World) => void, toast: (msg: string) => void }} api
 */
export function mountSavePanel(slot, { getWorld, loadWorld, toast }) {
  const fileInput = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.json,application/json', hidden: true }));

  function quickSave() {
    const s = storage();
    if (!s) return toast('Browser storage unavailable; use Export instead.');
    try {
      s.setItem(SLOT_KEY, serializeWorld(getWorld(), { label: 'quick' }));
      toast(`Saved at ${formatYear(getWorld().time)}`);
    } catch (e) {
      toast(`Save failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  function quickLoad() {
    const text = storage()?.getItem(SLOT_KEY);
    if (!text) return toast('No quick save found.');
    tryLoad(text);
  }

  /** @param {string} text */
  function tryLoad(text) {
    try {
      loadWorld(deserializeWorld(text));
      toast(`Loaded ${formatYear(getWorld().time)}`);
    } catch (e) {
      toast(`Load failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  function exportFile() {
    const blob = new Blob([serializeWorld(getWorld(), { label: 'export' })], { type: 'application/json' });
    const a = /** @type {HTMLAnchorElement} */ (h('a', { href: URL.createObjectURL(blob), download: `star-empire-${formatYear(getWorld().time)}.json` }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) tryLoad(await file.text());
    fileInput.value = '';
  });

  slot.append(
    h('div.btn-group', {},
      h('button.btn', { onclick: quickSave, title: 'Quick save to this browser' }, 'Save'),
      h('button.btn', { onclick: quickLoad, title: 'Load the quick save' }, 'Load'),
      h('button.btn', { onclick: exportFile, title: 'Download the game as a JSON file' }, 'Export'),
      h('button.btn', { onclick: () => fileInput.click(), title: 'Load a JSON save file' }, 'Import'),
      fileInput,
    ),
  );
}
