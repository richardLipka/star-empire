// @ts-check
import { h } from './dom.js';

/** A single transient message line at the bottom of the screen. */
export function createToast() {
  const el = h('div.toast', { role: 'status' });
  document.body.append(el);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @param {string} msg */
  return (msg) => {
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 2600);
  };
}
