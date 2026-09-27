// @ts-check
import { h } from './dom.js';
import { serializeWorld, deserializeWorld } from '../sim/save.js';
import { t } from '../i18n/index.js';
import { fmtYear } from '../i18n/format.js';
import { describeError } from './text/describe.js';

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
    if (!s) return toast(t('save.storageOff'));
    try {
      s.setItem(SLOT_KEY, serializeWorld(getWorld(), { label: 'quick' }));
      toast(t('save.saved', { year: fmtYear(getWorld().time) }));
    } catch (e) {
      toast(t('save.failed', { error: describeError(e) }));
    }
  }

  function quickLoad() {
    const text = storage()?.getItem(SLOT_KEY);
    if (!text) return toast(t('save.noQuick'));
    tryLoad(text);
  }

  /** @param {string} text */
  function tryLoad(text) {
    try {
      loadWorld(deserializeWorld(text));
      toast(t('save.loaded', { year: fmtYear(getWorld().time) }));
    } catch (e) {
      toast(t('save.loadFailed', { error: describeError(e) }));
    }
  }

  function exportFile() {
    const blob = new Blob([serializeWorld(getWorld(), { label: 'export' })], { type: 'application/json' });
    const a = /** @type {HTMLAnchorElement} */ (h('a', { href: URL.createObjectURL(blob), download: `star-empire-${fmtYear(getWorld().time)}.json` }));
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
      h('button.btn', { onclick: quickSave, title: t('save.saveTitle') }, t('save.save')),
      h('button.btn', { onclick: quickLoad, title: t('save.loadTitle') }, t('save.load')),
      h('button.btn', { onclick: exportFile, title: t('save.exportTitle') }, t('save.export')),
      h('button.btn', { onclick: () => fileInput.click(), title: t('save.importTitle') }, t('save.import')),
      fileInput,
    ),
  );
}

/** Save the running game for a moment (e.g. across a reload to change language). */
export const RESUME_KEY = 'star-empire:resume';
