// @ts-check
import { WORLD_VERSION } from './world.js';
import { GameError } from '../core/errors.js';

const FORMAT = 'star-empire-save';

/**
 * Upgrades from an older world version to the next one, keyed by the old version.
 * @type {Record<number, (world: any) => any>}
 */
const migrations = {
  /** v1 → v2: exploration records and drive-plume detection. */
  1: (w) => {
    w.state.empire.explored ??= {};
    for (const k of Object.values(w.state.info?.knowledge ?? {})) /** @type {any} */ (k).explored ??= {};
    if (w.state.info) w.state.info.pauseOnDispatch = w.state.info.pauseOnDispatch ? 'A' : null;
    if (w.modules.includes('info') && !w.modules.includes('detection')) {
      w.modules.splice(w.modules.indexOf('info') + 1, 0, 'detection');
      w.state.detection = { sightings: {} };
    }
    return { ...w, version: 2 };
  },
  /** v2 → v3: governors, fleet roles, reporting modes, structured dispatches. */
  2: (w) => {
    for (const p of Object.values(w.state.empire.presence)) /** @type {any} */ (p).reporting ??= 'routine';
    for (const f of Object.values(w.state.fleet.fleets)) Object.assign(f, { transmitter: false, role: 'generic', mission: null, ...f });
    for (const e of Object.values(w.state.empire.empires)) delete /** @type {any} */ (e).name;
    for (const k of Object.values(w.state.info?.knowledge ?? {})) {
      /** @type {any} */ (k).dispatches = /** @type {any[]} */ (/** @type {any} */ (k).dispatches).map((d) => ('key' in d ? d : { ...d, key: 'legacy', params: { text: d.text } }));
    }
    for (const b of Object.values(w.state.governors?.books ?? {})) /** @type {any} */ (b).memory.lastLaunch ??= {};
    if (!w.modules.includes('governors')) {
      w.modules.push('governors');
      w.state.governors = { books: {}, issued: {} };
    }
    return { ...w, version: 3 };
  },
  /** v3 → v4: research. Existing systems start with the start technologies. */
  3: (w) => {
    if (!w.modules.includes('research')) {
      w.modules.push('research');
      w.state.research = { labs: {}, conditions: {} };
    }
    for (const b of Object.values(w.state.governors?.books ?? {})) /** @type {any} */ (b).settings.researchFocus ??= 'none';
    return { ...w, version: 4 }; // research records are created lazily for existing systems
  },
  /** v4 → v5: security (interception). Old messages count as unencrypted. */
  4: (w) => {
    for (const m of Object.values(w.state.info.messages)) /** @type {any} */ (m).cipher ??= 0;
    if (w.state.research) w.state.research.supplied ??= {};
    for (const recs of Object.values(w.state.governors?.issued ?? {})) for (const r of Object.values(recs)) /** @type {any} */ (r).delivery ??= 'relay';
    if (!w.modules.includes('security')) {
      w.modules.push('security');
      w.state.security = { intercepts: {}, links: {} };
    }
    return { ...w, version: 5 };
  },
  /** v5 → v6: colonies. Held systems get their people on the next tick (capitals an old people). */
  5: (w) => {
    if (!w.modules.includes('colony')) {
      const at = w.modules.indexOf('governors'); // colonies run before governors (module order)
      w.modules.splice(at < 0 ? w.modules.length : at, 0, 'colony');
      w.state.colony = { colonies: {}, pending: {}, risks: true };
    }
    for (const b of Object.values(w.state.governors?.books ?? {})) {
      const book = /** @type {any} */ (b);
      book.settings.economyFocus ??= 'balanced';
      book.settings.terraform ??= 'full';
      book.memory.pendingSends ??= [];
    }
    return { ...w, version: 6 };
  },
  /** v6 → v7: loyalty, AI, robotic preparation, independent polities. */
  6: (w) => {
    const insertAfter = (/** @type {string} */ id, /** @type {string} */ after) => {
      if (w.modules.includes(id)) return;
      const at = w.modules.indexOf(after);
      w.modules.splice(at < 0 ? w.modules.length : at + 1, 0, id);
    };
    insertAfter('loyalty', 'governors');
    w.state.loyalty ??= { records: {} };
    if (!w.modules.includes('ai')) w.modules.push('ai');
    w.state.ai ??= { controllers: {} };
    w.state.colony.preparations ??= {};
    w.state.empire.nextIndependent ??= 1;
    for (const e of Object.values(w.state.empire.empires)) {
      const emp = /** @type {any} */ (e);
      emp.parent ??= null;
      emp.founded ??= 0;
      emp.dissolvedAt ??= null;
    }
    for (const b of Object.values(w.state.governors?.books ?? {})) /** @type {any} */ (b).settings.autonomy ??= 'normal';
    return { ...w, version: 7 }; // loyalty records start on the next tick; capabilities gain defaults when next recomputed
  },
};

/**
 * @param {import('./world.js').World} world
 * @param {{ label?: string }} [meta]
 */
export function serializeWorld(world, meta = {}) {
  return JSON.stringify({ format: FORMAT, savedAt: new Date().toISOString(), label: meta.label ?? '', world });
}

/**
 * Parse a save file and bring it up to the current world version.
 * @param {string} text
 * @returns {import('./world.js').World}
 */
export function deserializeWorld(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GameError('saveFormat');
  }
  if (data?.format !== FORMAT || !data.world) throw new GameError('saveFormat');
  let world = data.world;
  while (world.version < WORLD_VERSION) {
    const migrate = migrations[world.version];
    if (!migrate) throw new GameError('saveTooOld', { version: world.version });
    world = migrate(world);
  }
  if (world.version > WORLD_VERSION) throw new GameError('saveTooNew', { version: world.version });
  return world;
}
