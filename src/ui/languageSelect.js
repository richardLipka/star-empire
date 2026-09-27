// @ts-check
import { h } from './dom.js';
import { LOCALES, getLocale, t } from '../i18n/index.js';

export const LOCALE_KEY = 'star-empire:locale';

/** The saved language, or the browser's if we have it. */
export function preferredLocale() {
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    if (saved && LOCALES[saved]) return saved;
  } catch { /* storage blocked */ }
  const browser = (navigator.language || 'en').slice(0, 2);
  return LOCALES[browser] ? browser : 'en';
}

/**
 * Language switch. Changing language reloads the page; `beforeReload` stashes
 * the running game so it resumes where it was.
 * @param {HTMLElement} slot @param {{ beforeReload: () => void }} deps
 */
export function mountLanguageSelect(slot, { beforeReload }) {
  const select = h('select.lang', {
    title: t('lang.label'),
    onchange: (/** @type {Event} */ e) => {
      const value = /** @type {HTMLSelectElement} */ (e.target).value;
      try { window.localStorage.setItem(LOCALE_KEY, value); } catch { /* storage blocked */ }
      beforeReload();
      window.location.reload();
    },
  }, ...Object.entries(LOCALES).map(([code, l]) => h('option', { value: code, selected: code === getLocale(), title: l.name }, code.toUpperCase())));
  slot.append(select);
}
