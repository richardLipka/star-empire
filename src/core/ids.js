// @ts-check
/**
 * Sequential, readable IDs. The counter lives in the world so IDs are
 * deterministic and survive save/load.
 * @param {{ nextId: number }} world
 * @param {string} prefix e.g. 'ship', 'msg'
 */
export const newId = (world, prefix) => `${prefix}-${world.nextId++}`;
