// @ts-check
import { h, kv, patch } from '../dom.js';
import { t } from '../../i18n/index.js';
import { fmtYearShort, fmtDuration, fmtSeconds, fmtC, fmtNumber } from '../../i18n/format.js';
import { fleetsPicture, engagementWindows } from '../../perspective/fleets.js';
import { knowledgePicture } from '../../perspective/picture.js';
import { createNetwork } from '../../info/network.js';
import { orderFleet } from '../../info/orders.js';
import { planVoyage } from '../../fleet/plan.js';
import { APPROACHES, PLUME_REFERENCE_G } from '../../ships/catalog.js';
import { PLAN_OPTIONS, DEFAULT_PLAN } from '../../combat/model.js';
import { empireState } from '../../empire/module.js';
import { distance } from '../../core/vec3.js';
import { PLUME_RANGE } from '../../detection/module.js';
import { designLabel } from './designTab.js';

/**
 * @typedef {object} ScreenContext
 * @property {ReturnType<typeof import('../../app/gameHost.js').createGameHost>} game
 * @property {string} empire
 * @property {(id: string) => string} name
 * @property {() => 'knowledge' | 'truth'} mode
 * @property {(fn: (w: any, c: any) => any, done?: string | ((r: any) => string)) => any} act
 * @property {(msg: string) => void} toast
 * @property {() => void} refresh
 */

/** How many nearby systems a waypoint list offers. */
const NEAREST = 60;

/**
 * Fleets tab: list (left), the fleet (centre), its orders (right).
 * @param {ScreenContext} c
 */
export function createFleetTab(c) {
  const list = h('aside.research-left');
  const centre = h('section.fleets-centre');
  const orders = h('aside.research-detail');
  const element = h('div.fleets-grid', {}, list, centre, orders);
  let selected = /** @type {string | null} */ (null);
  /** @type {{ fleet: string | null, plan: import('../../combat/model.js').Plan, approach: import('../../fleet/plan.js').Approach, waypoints: import('../../fleet/plan.js').Waypoint[] }} */
  let draft = { fleet: null, plan: { ...DEFAULT_PLAN }, approach: 'normal', waypoints: [] };
  let key = '';

  function refresh(/** @type {boolean} */ force) {
    const world = c.game.world;
    const fleets = fleetsPicture(world, c.game.sim.ctx, c.empire, c.mode()).filter((f) => f.ships > 0 || f.role !== 'generic');
    const k = `${c.mode()}|${fleets.map((f) => `${f.id}${f.validAt}${f.ships}`).join()}|${selected}|${Math.floor(c.game.world.time)}`;
    if (!force && k === key) return;
    key = k;
    if (selected && !fleets.some((f) => f.id === selected)) selected = null;
    patch(list, [
      h('h3', {}, t('fleets.ours')),
      fleets.length ? h('div.fleet-list', {}, ...fleets.map((f) => h('button', {
        className: `fleet-pick${f.id === selected ? ' on' : ''}`,
        onclick: () => { selected = f.id; refresh(true); },
      },
      h('div', {}, h('b', {}, f.name), h('span.dim', {}, ` · ${t(`fleet.role.${f.role}`)}`)),
      h('div.dim.small', {}, `${f.ships ? t('fleets.shipsStrength', { count: f.ships, strength: f.strength }) : t('fleets.civilian')} · ${where(c, f)}`),
      ))) : h('p.hint', {}, t('fleets.none')),
      h('p.hint.small', {}, t(c.mode() === 'truth' ? 'fleets.truthHint' : 'fleets.knowledgeHint')),
    ], force);
    const f = fleets.find((x) => x.id === selected) ?? null;
    if (f && draft.fleet !== f.id) draft = { fleet: f.id, plan: { ...(f.plan ?? DEFAULT_PLAN) }, approach: 'normal', waypoints: [] };
    patch(centre, (f ? renderFleet(c, f) : [h('p.hint', {}, t('fleets.pick'))]), force);
    patch(orders, (f ? renderOrders(c, f, draft, () => refresh(true)) : []), force);
  }
  return { element, refresh };
}

/** @param {ScreenContext} c @param {import('../../perspective/fleets.js').FleetView} f */
function where(c, f) {
  if (f.status === 'docked' && f.at) return t('fleets.dockedAt', { system: c.name(f.at) });
  return f.dest ? t('fleets.bound', { system: c.name(f.dest), year: f.eta != null ? fmtYearShort(f.eta) : '?' }) : t('fleets.deepSpace');
}

/** @param {ScreenContext} c @param {import('../../perspective/fleets.js').FleetView} f */
function renderFleet(c, f) {
  const now = c.game.world.time;
  return [
    h('h2', {}, f.name),
    h('p.hint', {}, `${t(`fleet.role.${f.role}`)} · ${where(c, f)}${c.mode() === 'knowledge' ? ` · ${t('fleets.asOf', { year: fmtYearShort(f.validAt), age: fmtDuration(now - f.validAt) })}` : ''}${f.ansible ? ` · ${t('fleets.ansible')}` : ''}`),
    h('h3', {}, t('fleets.ships')),
    f.groups.length
      ? h('table.fleet-table', {},
        h('tr', {}, h('th', {}, t('fleets.design')), h('th', {}, t('fleets.count')), h('th', {}, t('fleets.condition'))),
        ...f.groups.map((g) => h('tr', {}, h('td', {}, designLabel({ id: g.design, name: g.name === g.design ? undefined : g.name })), h('td', {}, String(g.count)),
          h('td', {}, h('div.bar', {}, h('span', { style: `width:${Math.round((100 * g.hp) / Math.max(g.maxHp, 1e-9))}%` }))))))
      : h('p.hint', {}, t('fleets.civilian')),
    h('h3', {}, t('fleets.planNow')),
    f.plan ? kv(Object.entries(f.plan).map(([k, v]) => [t(`plan.${k}.title`), t(`plan.${k}.${v}`)])) : h('p.hint', {}, t('fleets.noPlan')),
    h('h3', {}, t('fleets.voyageNow')),
    f.voyage ? h('ol.plain', {}, ...f.voyage.waypoints.map((w) => h('li', {}, `${c.name(w.system)} · ${t(`action.${w.action}`)}`)), h('li.dim', {}, t(`approach.${f.voyage.approach}.name`))) : h('p.hint', {}, t('fleets.noVoyage')),
  ];
}

/**
 * Orders: a new battle plan, and a voyage; with when they would reach the
 * fleet, and what the voyage means for detection and battle.
 * @param {ScreenContext} c @param {import('../../perspective/fleets.js').FleetView} f
 * @param {{ fleet: string | null, plan: import('../../combat/model.js').Plan, approach: import('../../fleet/plan.js').Approach, waypoints: import('../../fleet/plan.js').Waypoint[] }} draft
 * @param {() => void} redraw
 */
function renderOrders(c, f, draft, redraw) {
  const world = c.game.world;
  const ctx = c.game.sim.ctx;
  const capital = empireState(world).empires[c.empire].capital;
  const unlocks = empireState(world).presence[capital]?.capabilities?.unlocks ?? [];
  const impactor = f.role === 'impactor';
  const select = (/** @type {string[]} */ options, /** @type {string} */ value, /** @type {(v: string) => void} */ set, /** @type {(o: string) => string} */ label) =>
    h('select', { onchange: (/** @type {Event} */ e) => { set(/** @type {HTMLSelectElement} */ (e.target).value); redraw(); } }, ...options.map((o) => h('option', { value: o, selected: o === value }, label(o))));

  // Where can orders reach it, and when?
  const delivery = deliveryText(c, f, capital);
  const out = [h('h3', {}, t('fleets.orders')), h('p.hint.small', {}, delivery)];

  if (!impactor && f.ships) {
    out.push(h('div.dim.small', {}, t('fleets.planTitle')));
    for (const [k, options] of Object.entries(PLAN_OPTIONS)) {
      out.push(h('label.param', {}, h('span', {}, t(`plan.${k}.title`)),
        select(options, /** @type {any} */ (draft.plan)[k], (v) => { /** @type {any} */ (draft.plan)[k] = v; }, (o) => t(`plan.${k}.${o}`))));
    }
    out.push(h('p.hint.small', {}, t(`plan.formation.${draft.plan.formation}Hint`)));
    out.push(h('div.row', {}, h('button.btn', {
      onclick: () => c.act((w, x) => orderFleet(w, x, { empire: c.empire, fleet: f.id, payload: { type: 'plan', plan: { ...draft.plan } } }), (r) => sentText(c, r, f)),
    }, t('fleets.sendPlan'))));
  }

  // Voyage editor.
  const approaches = impactor ? ['flyby'] : ['normal', 'flyby', ...(unlocks.includes(/** @type {string} */ (APPROACHES.stealth.unlock)) ? ['stealth'] : [])];
  if (!approaches.includes(draft.approach)) draft.approach = /** @type {any} */ (approaches[0]);
  const from = f.status === 'docked' ? f.at : f.dest;
  const origin = from ? ctx.data.catalog.get(from).pos : null;
  const near = origin ? ctx.data.catalog.systems.map((/** @type {any} */ s) => ({ id: s.id, d: distance(s.pos, origin) })).filter((/** @type {any} */ x) => x.id !== from).sort((/** @type {any} */ a, /** @type {any} */ b) => a.d - b.d).slice(0, NEAREST) : [];
  const actions = impactor ? ['strike'] : ['visit', 'attack'];
  out.push(h('div.dim.small', {}, t('fleets.voyageTitle')));
  out.push(h('label.param', {}, h('span', {}, t('fleets.approach')), select(approaches, draft.approach, (v) => { draft.approach = /** @type {any} */ (v); }, (o) => t(`approach.${o}.name`))));
  out.push(h('p.hint.small', {}, t(`approach.${draft.approach}.desc`)));
  draft.waypoints.forEach((wp, i) => {
    out.push(h('div.row.waypoint', {},
      h('span.dim', {}, `${i + 1}.`),
      select(near.map((/** @type {any} */ x) => x.id).includes(wp.system) ? near.map((/** @type {any} */ x) => x.id) : [wp.system, ...near.map((/** @type {any} */ x) => x.id)], wp.system, (v) => { wp.system = v; }, (o) => `${c.name(o)} (${fmtNumber(near.find((/** @type {any} */ x) => x.id === o)?.d ?? 0, 1)} ly)`),
      select(actions, wp.action, (v) => { wp.action = /** @type {any} */ (v); }, (o) => t(`action.${o}`)),
      h('button.btn.small', { onclick: () => { draft.waypoints.splice(i, 1); redraw(); } }, '×')));
  });
  if (near.length && !(impactor && draft.waypoints.length)) {
    out.push(h('div.row', {}, h('button.btn.small', { onclick: () => { draft.waypoints.push({ system: near[0].id, action: /** @type {any} */ (actions[0]) }); redraw(); } }, t('fleets.addWaypoint'))));
  }
  if (draft.waypoints.length && from && f.drive) out.push(...preview(c, f, from, draft));
  out.push(h('div.row', {}, h('button.btn.primary', {
    disabled: !draft.waypoints.length,
    onclick: () => c.act((w, x) => orderFleet(w, x, { empire: c.empire, fleet: f.id, payload: { type: 'voyage', waypoints: draft.waypoints.map((p) => ({ ...p })), approach: draft.approach } }), (r) => sentText(c, r, f)),
  }, t('fleets.sendVoyage'))));
  if (impactor) out.push(h('p.warn.small', {}, t('fleets.strikeWarning')));
  return out;
}

/** @param {ScreenContext} c @param {any} r @param {import('../../perspective/fleets.js').FleetView} f */
function sentText(c, r, f) {
  if (!r) return t('fleets.unreachable', { fleet: f.name });
  if (r.via === 'direct') return t('fleets.sentDirect', { fleet: f.name, year: r.arrives != null ? fmtYearShort(r.arrives) : '?' });
  return t('fleets.sentMailbox', { fleet: f.name, system: c.name(r.system), year: r.arrives != null ? fmtYearShort(r.arrives) : '?' });
}

/**
 * @param {ScreenContext} c @param {import('../../perspective/fleets.js').FleetView} f @param {string} capital
 */
function deliveryText(c, f, capital) {
  if (f.ansible) return t('fleets.reachAnsible');
  const pic = knowledgePicture(c.game.world, c.game.sim.ctx, c.empire);
  const net = createNetwork({ capital: pic.capital, range: pic.range, relays: pic.relays, fleets: [], posOf: (x) => c.game.sim.ctx.data.catalog.get(x).pos });
  if (f.status === 'docked' && f.at) {
    const r = f.at === capital ? { delay: 0 } : net.route(capital, f.at);
    return r ? t('fleets.reachDocked', { system: c.name(f.at), delay: fmtDuration(r.delay) }) : t('fleets.reachNone', { system: c.name(f.at) });
  }
  if (f.dest) return t('fleets.reachMailbox', { system: c.name(f.dest), year: f.eta != null ? fmtYearShort(f.eta) : '?' });
  return t('fleets.reachLost');
}

/**
 * What the voyage would look like: arrival at each waypoint, closing speed and
 * how long weapons bear; and how visible the approach is.
 * @param {ScreenContext} c @param {import('../../perspective/fleets.js').FleetView} f @param {string} from
 * @param {{ approach: import('../../fleet/plan.js').Approach, waypoints: import('../../fleet/plan.js').Waypoint[] }} draft
 */
function preview(c, f, from, draft) {
  const ctx = c.game.sim.ctx;
  const start = f.status === 'docked' ? c.game.world.time : Math.max(c.game.world.time, f.eta ?? c.game.world.time);
  const { legs, reach } = planVoyage({
    fromPos: ctx.data.catalog.get(from).pos, fromSystem: from, waypoints: draft.waypoints, approach: draft.approach, departAt: start, drive: f.drive,
    stealth: APPROACHES.stealth, home: draft.approach === 'flyby' ? from : null, posOf: (x) => ctx.data.catalog.get(x).pos, wormholes: [],
  });
  const rows = draft.waypoints.map((wp, i) => {
    const leg = reach[i] >= 0 ? legs[reach[i]] : null;
    const speed = leg?.kind === 'flight' ? leg.profile.arrivalSpeed : 0;
    const w = engagementWindows(speed);
    const when = leg ? fmtYearShort(leg.arriveAt) : fmtYearShort(start);
    const fight = wp.action === 'visit' ? '' : speed > 0
      ? t('fleets.flybyWindow', { speed: fmtC(speed), beam: fmtSeconds(w.beam), kinetic: fmtSeconds(w.kinetic) })
      : t('fleets.brakedWindow', { beam: fmtSeconds(Math.min(w.beam, 30)) });
    const warning = leg?.kind === 'flight' && leg.profile.brake ? t('fleets.warning', { years: fmtDuration(leg.profile.warning) }) : t('fleets.noWarning');
    return h('li', {}, h('b', {}, c.name(wp.system)), ` · ${when}`, h('div.dim.small', {}, [fight, wp.action === 'visit' ? '' : warning].filter(Boolean).join(' · ')));
  });
  const accel = draft.approach === 'stealth' ? Math.min(f.drive.accelG, APPROACHES.stealth.accelG ?? 1) : f.drive.accelG;
  const plume = PLUME_RANGE * Math.min(2, Math.sqrt(accel / PLUME_REFERENCE_G));
  const end = legs.length ? legs[legs.length - 1].arriveAt : start;
  return [
    h('div.dim.small', {}, t('fleets.preview')),
    h('ol.plain.small', {}, ...rows),
    h('p.hint.small', {}, t('fleets.plumeRange', { range: fmtNumber(plume, 1) })),
    h('p.hint.small', {}, t(draft.approach === 'flyby' ? 'fleets.returnsHome' : 'fleets.endsAt', { year: fmtYearShort(end), system: c.name(draft.approach === 'flyby' ? from : draft.waypoints[draft.waypoints.length - 1].system) })),
  ];
}
