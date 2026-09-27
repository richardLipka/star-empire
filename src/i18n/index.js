// @ts-check
import en from './locales/en.json';
import cs from './locales/cs.json';

/**
 * Translation. Every text shown to the player lives in `locales/*.json`;
 * code refers to texts by key. Keys are dotted paths into the JSON.
 *
 * - Interpolation: "Arrived at {system}" with `{ system: 'Tau Ceti' }`.
 * - Plurals: a key may hold `{ "one": "...", "few": "...", "other": "..." }`,
 *   chosen by `params.count` with the locale's Intl.PluralRules.
 * - Missing keys fall back to English, then to the key itself.
 *
 * Simulation code never imports this: it produces keys and parameters,
 * and the UI turns them into text.
 */

/** @type {Record<string, { name: string, messages: Record<string, any> }>} */
export const LOCALES = {
  en: { name: 'English', messages: en },
  cs: { name: 'Čeština', messages: cs },
};
export const DEFAULT_LOCALE = 'en';

let current = DEFAULT_LOCALE;
/** @type {Intl.PluralRules} */
let plurals = new Intl.PluralRules(current);
/** @type {Intl.NumberFormat} */
let numbers = new Intl.NumberFormat(current);

/** @param {string} locale */
export function setLocale(locale) {
  current = LOCALES[locale] ? locale : DEFAULT_LOCALE;
  plurals = new Intl.PluralRules(current);
  numbers = new Intl.NumberFormat(current);
}

export const getLocale = () => current;

/** @param {Record<string, any>} messages @param {string} key */
function lookup(messages, key) {
  /** @type {any} */
  let node = messages;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/** @param {string} key */
export const has = (key) => lookup(LOCALES[current].messages, key) !== undefined || lookup(en, key) !== undefined;

/**
 * @param {string} key
 * @param {Record<string, string | number | null | undefined>} [params]
 */
export function t(key, params = {}) {
  let msg = lookup(LOCALES[current].messages, key) ?? lookup(en, key);
  if (msg && typeof msg === 'object') {
    const count = Number(params.count ?? 0);
    msg = msg[plurals.select(count)] ?? msg.other;
  }
  if (typeof msg !== 'string') return key;
  return msg.replace(/\{(\w+)\}/g, (_, name) => {
    const v = params[name];
    if (v == null) return '';
    return typeof v === 'number' ? numbers.format(v) : String(v);
  });
}

/** All leaf keys of a message tree (for completeness checks). @param {Record<string, any>} tree */
export function keysOf(tree, prefix = '') {
  /** @type {string[]} */
  const out = [];
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const isPlural = v && typeof v === 'object' && 'other' in v;
    if (v && typeof v === 'object' && !isPlural) out.push(...keysOf(v, key));
    else out.push(key);
  }
  return out;
}
