// @ts-check
import { h } from './dom.js';
import { SPEEDS } from '../sim/clock.js';
import { t } from '../i18n/index.js';
import { fmtYear, fmtSpeed } from '../i18n/format.js';
import { describePause } from './text/describe.js';

/**
 * Date readout, pause button and speed selector. Keyboard: space toggles
 * pause, + and - change speed.
 * @param {HTMLElement} slot
 * @param {import('../sim/clock.js').Clock} clock
 * @param {() => number} getTime
 * @param {(id: string) => string} name
 */
export function mountTimeControls(slot, clock, getTime, name) {
  const date = h('span.value');
  const status = h('span.dim');
  const pause = h('button.btn', { title: t('time.toggleTitle'), onclick: () => clock.setPaused() });
  const speeds = SPEEDS.map((s, i) => h('button.btn', { onclick: () => clock.setSpeed(i) }, fmtSpeed(s.rate)));

  slot.append(
    h('div.btn-group', {},
      h('span.clock', {}, h('span.label', {}, t('time.year')), date, ' ', status),
      pause,
      ...speeds,
    ),
  );

  function render() {
    const st = clock.state;
    date.textContent = fmtYear(getTime());
    pause.textContent = st.paused ? t('time.run') : t('time.pause');
    pause.setAttribute('aria-pressed', String(!st.paused));
    status.textContent = st.lastPause ? t('time.paused', { reason: describePause(st.lastPause, name) }) : '';
    speeds.forEach((b, i) => b.setAttribute('aria-pressed', String(i === st.speedIndex)));
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space') { e.preventDefault(); clock.setPaused(); }
    else if (e.key === '+' || e.key === '=') clock.setSpeed(clock.state.speedIndex + 1);
    else if (e.key === '-') clock.setSpeed(clock.state.speedIndex - 1);
  });

  render();
  return { render };
}
