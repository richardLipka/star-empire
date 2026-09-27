// @ts-check
import { WORLD_VERSION } from './world.js';

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
  const data = JSON.parse(text);
  if (data?.format !== FORMAT || !data.world) throw new Error('Not a Star Empire save file');
  let world = data.world;
  while (world.version < WORLD_VERSION) {
    const migrate = migrations[world.version];
    if (!migrate) throw new Error(`No migration from save version ${world.version}`);
    world = migrate(world);
  }
  if (world.version > WORLD_VERSION) throw new Error(`Save version ${world.version} is newer than this game`);
  return world;
}
