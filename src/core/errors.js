// @ts-check
/**
 * An error the player may see. It carries a translation key (under `error.`)
 * and parameters instead of text; the UI translates it.
 */
export class GameError extends Error {
  /** @param {string} key @param {Record<string, string | number>} [params] */
  constructor(key, params = {}) {
    super(`${key} ${JSON.stringify(params)}`);
    this.name = 'GameError';
    this.key = key;
    this.params = params;
  }
}
