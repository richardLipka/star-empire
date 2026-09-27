// @ts-check
import { h } from '../dom.js';
import { t } from '../../i18n/index.js';
import { DRIVE_TIERS, WEAR_ABOVE_G } from '../../fleet/drives.js';
import { establishPresence, setRelay, empireState } from '../../empire/module.js';
import { sendNote } from '../../info/orders.js';
import { orderDispatch } from '../../governors/issue.js';
import { openWormhole } from '../../events/wormholes.js';
import { createFleet, launchFleet } from '../../fleet/module.js';

/** Form state survives re-renders. */
const form = { tier: 0, ansible: false, courier: false };

/** Drive tier choice. @param {number} value @param {(i: number) => void} onChange */
export function driveSelect(value, onChange) {
  return h('select', { onchange: (/** @type {Event} */ e) => onChange(Number(/** @type {HTMLSelectElement} */ (e.target).value)) },
    ...DRIVE_TIERS.map((d, i) => h('option', { value: i, selected: i === value },
      `${t(`drive.${d.id}`)} · ${t('drive.spec', { g: d.accelG, c: d.cruise })}${d.accelG > WEAR_ABOVE_G ? ` ${t('drive.wear')}` : ''}`)));
}

/**
 * Sandbox tools: change the world directly (outposts, relays, wormholes, a rival fleet)
 * or give orders the proper way (they travel from the capital at light speed).
 * @param {import('./context.js').PanelContext} c
 * @param {string} id selected system
 * @param {string | null} target measured system
 */
export function renderSandboxTools(c, id, target) {
  const presence = empireState(c.game.world).presence[id];
  const here = c.name(id);
  const rows = [];
  if (!presence) {
    rows.push(h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => establishPresence(w, x, { empire: c.empire, system: id }), t('sandbox.founded', { system: here })) }, t('sandbox.found'))));
  } else if (presence.empire === c.empire && presence.relay === 'ok') {
    rows.push(h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => setRelay(w, x, { system: id, state: 'destroyed' }), t('sandbox.relayDestroyed', { system: here })) }, t('sandbox.destroyRelay')), h('span.dim', {}, t('sandbox.destroyHint'))));
  } else if (presence.empire === c.empire) {
    rows.push(h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => setRelay(w, x, { system: id, state: 'ok' }), t('sandbox.relayRebuilt', { system: here })) }, t('sandbox.rebuildRelay'))));
  } else {
    rows.push(h('p.hint', {}, t('sandbox.heldBy', { empire: presence.empire })));
  }
  if (!target || target === id) {
    rows.push(h('p.hint', {}, t('sandbox.pickTarget')));
    return h('div.tools', {}, ...rows);
  }
  const there = c.name(target);
  const check = (/** @type {'ansible' | 'courier'} */ key) => h('label', {},
    h('input', { type: 'checkbox', checked: form[key], onchange: (/** @type {Event} */ e) => (form[key] = /** @type {HTMLInputElement} */ (e.target).checked) }), ` ${t(`sandbox.${key}`)}`);
  rows.push(
    h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => sendNote(w, x, { empire: c.empire, from: id, to: target, text: t('sandbox.noteText', { system: here }) }), t('sandbox.noteSent', { from: here, to: there })) }, t('sandbox.note', { system: there }))),
    h('div.row', {}, driveSelect(form.tier, (i) => (form.tier = i)), check('ansible'), check('courier')),
    h('div.row', {}, h('button.btn', {
      onclick: () => c.act((w, x) => orderDispatch(w, x, { empire: c.empire, from: id, to: target, drive: form.tier, ansible: form.ansible, courier: form.courier }), t('sandbox.orderSent', { from: here, to: there })),
    }, t('sandbox.orderFleet', { from: here, to: there }))),
    h('p.hint', {}, t('sandbox.orderHint')),
    h('div.row', {}, h('button.btn', { onclick: () => c.act((w, x) => openWormhole(w, x, { a: id, b: target }), t('sandbox.wormholeOpened', { from: here, to: there })) }, t('sandbox.wormhole', { system: there }))),
    h('div.row', {}, h('button.btn', {
      title: t('sandbox.rivalTitle'),
      onclick: () => c.act((w, x) => {
        const f = createFleet(w, x, { empire: 'B', at: id, drive: DRIVE_TIERS[form.tier] });
        launchFleet(w, x, { fleet: f.id, to: target });
      }, t('sandbox.rivalLaunched', { from: here, to: there })),
    }, t('sandbox.rival', { system: there }))),
  );
  return h('div.tools', {}, ...rows);
}
