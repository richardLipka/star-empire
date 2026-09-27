// @ts-check
import { h } from './dom.js';
import { SPEEDS } from '../sim/clock.js';
import { formatYear } from '../core/time.js';

/**
 * Date readout, pause button and speed selector. Keyboard: space toggles
 * pause, + and - change speed.
 * @param {HTMLElement} slot
 * @param {import('../sim/clock.js').Clock} clock
 * @param {() => number} getTime
 */
export function mountTimeControls(slot, clock, getTime) {
  const date = h('span.value');
  const status = h('span.dim');
  const pause = h('button.btn', { title: 'Pause / resume (space)', onclick: () => clock.setPaused() });
  const speeds = SPEEDS.map((s, i) => h('button.btn', { onclick: () => clock.setSpeed(i) }, s.label));

  slot.append(
    h('div.btn-group', {},
      h('span.clock', {}, h('span.label', {}, 'YEAR'), date, ' ', status),
      pause,
      ...speeds,
    ),
  );

  function render() {
    const st = clock.state;
    date.textContent = formatYear(getTime());
    pause.textContent = st.paused ? '▶ Run' : '❚❚ Pause';
    pause.setAttribute('aria-pressed', String(!st.paused));
    status.textContent = st.lastPause ? `paused: ${st.lastPause}` : '';
    speeds.forEach((b, i) => b.setAttribute('aria-pressed', String(i === st.speedIndex)));
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') { e.preventDefault(); clock.setPaused(); }
    else if (e.key === '+' || e.key === '=') clock.setSpeed(clock.state.speedIndex + 1);
    else if (e.key === '-') clock.setSpeed(clock.state.speedIndex - 1);
  });

  render();
  return { render };
}
