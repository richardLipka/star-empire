// @ts-check
import { t } from '../../i18n/index.js';
import { fmtDuration, fmtYearShort, fmtNumber } from '../../i18n/format.js';
import { describeSpectral } from '../../galaxy/spectral.js';

/**
 * Turning game data into sentences. Shared by map labels and panels so both
 * always say the same thing, in the current language.
 * @typedef {(id: string) => string} NameOf  system id → display name
 */

/** @param {{ name: string | null, empire: string }} f */
export const fleetName = (f) => f.name ?? t('fleet.foreignName', { empire: f.empire });

/**
 * @param {import('../../perspective/picture.js').PicFleet} f
 * @param {NameOf} name
 */
export function describeFleet(f, name) {
  const dest = f.dest ? name(f.dest) : '';
  const eta = f.eta != null ? fmtYearShort(f.eta) : '';
  const age = fmtDuration(f.age);
  switch (f.certainty) {
    case 'live':
      return f.at ? `${t('fleet.at', { system: name(f.at) })} · ${t('fleet.live')}` : t('fleet.transitLive', { dest, eta });
    case 'actual':
      return f.at ? t('fleet.at', { system: name(f.at) }) : `${t('fleet.transit', { dest, eta })} · ${t(`fleet.burn.${f.burning ?? 'coasting'}`)}`;
    case 'confirmed':
      return t('fleet.confirmed', { system: name(/** @type {string} */ (f.at)), age });
    case 'expected':
      return t('fleet.expected', { dest, eta, age }) + (f.brakingSeenAt != null ? ` · ${t('fleet.brakingSeen')}` : '');
    case 'unconfirmed':
      return t(f.brakingSeenAt != null ? 'fleet.unconfirmedBraking' : 'fleet.unconfirmed', { dest, eta });
  }
}

/**
 * @param {import('../../perspective/picture.js').PicSighting} s
 * @param {NameOf} name
 */
export function describeSighting(s, name) {
  const who = s.own ? t('sighting.own') : t('sighting.foreign', { empire: s.fleetEmpire });
  const near = s.near ? name(s.near) : t('sighting.deepSpace');
  return t(`sighting.${s.phase}`, { who, near, age: fmtDuration(s.age) });
}

/** Parameters holding system ids, resolved to names for display. */
const SYSTEM_PARAMS = ['system', 'near', 'observer', 'from', 'to'];

/**
 * @param {import('../../info/knowledge.js').Dispatch} d
 * @param {NameOf} name
 */
export function describeDispatch(d, name) {
  /** @type {Record<string, string | number>} */
  const params = {};
  for (const [k, v] of Object.entries(d.params ?? {})) params[k] = SYSTEM_PARAMS.includes(k) && typeof v === 'string' && v ? name(v) : v;
  return t(`dispatch.${d.key}`, params);
}

/** The reason the clock paused (a dispatch-like key). @param {{ key: string, params?: Record<string, any> }} r @param {NameOf} name */
export const describePause = (r, name) => describeDispatch({ id: '', key: r.key, params: r.params ?? {}, validAt: 0, receivedAt: 0, via: 'relay', hops: 0 }, name);

/**
 * "G2V · yellow main-sequence dwarf · 5,200–6,000 K"
 * @param {{ spect: string, cls: string }} star
 */
export function describeStar(star) {
  const d = describeSpectral(star.spect, star.cls);
  const kind = t(`spectral.lum.${d.lum}`, { colour: t(`spectral.colour.${d.cls}`) });
  const temp = d.temp ? t('unit.kelvin', { min: fmtNumber(d.temp[0], 0), max: fmtNumber(d.temp[1], 0) }) : '';
  return { cls: d.cls, kind, temp };
}

/** @param {unknown} e */
export function describeError(e) {
  if (e && typeof e === 'object' && 'key' in e) {
    const g = /** @type {{ key: string, params: Record<string, any> }} */ (e);
    return t(`error.${g.key}`, g.params);
  }
  return t('error.unknown', { message: e instanceof Error ? e.message : String(e) });
}
