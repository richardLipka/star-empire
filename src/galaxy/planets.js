// @ts-check
import systemsData from '../data/systems.json';
import { hashUnit } from '../core/rng.js';
import { describeSpectral } from './spectral.js';

/**
 * Star systems: planets, belts and giants around each star.
 * - Known systems (Sol, Proxima, Tau Ceti, ...) come from src/data/systems.json.
 * - All others are generated from the primary star: its luminosity sets the
 *   habitable zone, its class the number and kind of bodies, how often a
 *   temperate world is truly habitable, and tidal locking for close orbits.
 * Deterministic per game seed and system; derived data, never saved.
 *
 * @typedef {'rocky' | 'superEarth' | 'ocean' | 'gasGiant' | 'iceGiant' | 'ice' | 'belt'} BodyType
 * @typedef {'habitable' | 'terraformable' | 'hostile' | null} SiteKind   what people could live on (null: only orbital bases)
 * @typedef {object} Body
 * @property {string} id
 * @property {string} name
 * @property {BodyType} type
 * @property {number} orbit          AU
 * @property {'hot' | 'temperate' | 'cold'} zone
 * @property {SiteKind} site
 * @property {number} quality        0–1: how good a habitable or terraformable world is
 * @property {number} resources      0–1: minerals and volatiles
 * @property {boolean} tidalLock
 * @property {number} star          index of the star it orbits (0: the primary)
 * @typedef {{ cls: string, lum: number, hz: [number, number], hzByStar: Record<number, [number, number]>, bodies: Body[], authored: boolean, giantStar: boolean }} StarSystemModel
 */

/** Typical bodies per class. */
const COUNT = { O: 2, B: 3, A: 4, F: 6, G: 7, K: 6, M: 4, D: 2, '?': 4 };
/** Chance a temperate rocky world is truly habitable. */
const HABITABLE = { F: 0.2, G: 0.35, K: 0.3, M: 0.08 };
/**
 * The catalogue's luminosity is visual; red dwarfs radiate mostly in the
 * infrared, so the energy that sets the habitable zone is much higher.
 * Rough bolometric corrections by class.
 */
const BOLOMETRIC = { O: 20, B: 5, A: 1.2, F: 1, G: 1.05, K: 1.4, M: 25, D: 1, '?': 1 };
/** Luminosity (solar) when the catalogue has none. */
const LUM = { O: 50000, B: 500, A: 15, F: 3, G: 1, K: 0.3, M: 0.02, D: 0.001, '?': 0.1 };
const LETTERS = 'bcdefghijk';

/** @type {Map<string, StarSystemModel>} */
const cache = new Map();

/**
 * @param {string | number} seed
 * @param {import('./catalog.js').StarSystem} system
 * @returns {StarSystemModel}
 */
export function systemBodies(seed, system) {
  const key = `${seed}|${system.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const primary = system.stars[0];
  const cls = primary?.cls ?? '?';
  const bolometric = (/** @type {{ lum: number, cls: string } | undefined} */ star) => {
    const c = /** @type {keyof typeof BOLOMETRIC} */ (star?.cls ?? '?');
    const visual = star && Number.isFinite(star.lum) && star.lum > 0 ? star.lum : LUM[c] ?? 0.1;
    return visual * (BOLOMETRIC[c] ?? 1);
  };
  const lum = bolometric(primary);
  const hz = /** @type {[number, number]} */ ([Math.sqrt(lum / 1.1), Math.sqrt(lum / 0.53)]);
  const giantStar = ['giant', 'brightGiant', 'supergiant'].includes(describeSpectral(primary?.spect ?? '', cls).lum);
  const u = (/** @type {string} */ k) => hashUnit(seed, `${system.id}:${k}`);
  const zoneOf = (/** @type {number} */ orbit) => /** @type {Body['zone']} */ (orbit < hz[0] ? 'hot' : orbit <= hz[1] ? 'temperate' : 'cold');

  const authored = /** @type {Record<string, any[]>} */ (systemsData.systems)[system.name];
  /** @type {Body[]} */
  let bodies;
  /** @type {Record<number, [number, number]>} */
  const hzByStar = { 0: /** @type {[number, number]} */ (hz.map(round)) };
  if (authored) {
    bodies = authored.map((b, i) => {
      // Orbits around another component (Proxima) use that star's zone.
      const l = b.star != null ? bolometric(system.stars[b.star]) : lum;
      if (b.star) hzByStar[b.star] ??= [round(Math.sqrt(l / 1.1)), round(Math.sqrt(l / 0.53))];
      /** @type {Body['zone']} */
      const zone = b.orbit < Math.sqrt(l / 1.1) ? 'hot' : b.orbit <= Math.sqrt(l / 0.53) ? 'temperate' : 'cold';
      return {
        id: `${system.id}:${i}`, name: b.name, type: b.type, orbit: b.orbit, zone,
        site: b.site ?? (b.type === 'rocky' || b.type === 'superEarth' || b.type === 'ice' ? 'hostile' : null),
        quality: b.quality ?? 0, resources: b.resources ?? defaultResources(b.type, u(`res${i}`)), tidalLock: !!b.tidalLock, star: b.star ?? 0,
      };
    });
  } else {
    const n = Math.max(0, Math.round((COUNT[/** @type {keyof typeof COUNT} */ (cls)] ?? 4) * (giantStar ? 0.4 : 1) * (0.3 + 1.2 * u('count'))));
    bodies = [];
    let orbit = Math.max(0.015, 0.12 * Math.sqrt(lum) * (0.4 + u('a0')));
    for (let i = 0; i < n; i++) {
      const zone = zoneOf(orbit);
      const type = pickType(zone, u(`type${i}`), cls);
      const b = {
        id: `${system.id}:${i}`, name: type === 'belt' ? `${system.name} belt ${i + 1}` : `${system.name} ${LETTERS[i] ?? i}`,
        type, orbit: round(orbit), zone, site: /** @type {SiteKind} */ (null), quality: 0,
        resources: defaultResources(type, u(`res${i}`)),
        tidalLock: (cls === 'M' && orbit < 0.3) || (cls === 'K' && orbit < 0.1), star: 0,
      };
      if (type === 'rocky' || type === 'superEarth' || type === 'ocean' || type === 'ice') {
        const livable = !giantStar && cls in HABITABLE;
        if (zone === 'temperate' && livable && type !== 'ice' && u(`hab${i}`) < HABITABLE[/** @type {keyof typeof HABITABLE} */ (cls)]) {
          b.site = 'habitable';
          b.quality = round((0.5 + 0.5 * u(`q${i}`)) * (cls === 'M' ? 0.6 : 1));
        } else if (livable && (zone === 'temperate' || (zone === 'cold' && orbit <= hz[1] * 1.6) || (zone === 'hot' && orbit >= hz[0] * 0.7))) {
          b.site = 'terraformable';
          b.quality = round(0.15 + 0.45 * u(`q${i}`));
        } else {
          b.site = 'hostile';
        }
      }
      bodies.push(b);
      orbit *= 1.45 + 0.7 * u(`ratio${i}`);
    }
  }
  const model = { cls, lum, hz: hzByStar[0], hzByStar, bodies, authored: !!authored, giantStar };
  cache.set(key, model);
  return model;
}

/** @param {string} zone @param {number} r @param {string} cls @returns {BodyType} */
function pickType(zone, r, cls) {
  if (cls === 'D') return r < 0.6 ? 'belt' : 'rocky';
  if (zone === 'hot') return r < 0.5 ? 'rocky' : r < 0.85 ? 'superEarth' : 'gasGiant';
  if (zone === 'temperate') return r < 0.35 ? 'rocky' : r < 0.62 ? 'superEarth' : r < 0.74 ? 'ocean' : r < 0.9 ? 'gasGiant' : 'belt';
  return r < 0.3 ? 'gasGiant' : r < 0.55 ? 'iceGiant' : r < 0.78 ? 'ice' : 'belt';
}

/** @param {string} type @param {number} r */
function defaultResources(type, r) {
  const base = { belt: 0.7, rocky: 0.5, superEarth: 0.55, ocean: 0.3, ice: 0.4, gasGiant: 0.45, iceGiant: 0.4 }[type] ?? 0.4;
  return round(Math.min(1, base * (0.6 + 0.8 * r)));
}

const round = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
