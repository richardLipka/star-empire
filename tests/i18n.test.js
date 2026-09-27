import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLocale, keysOf, LOCALES } from '../src/i18n/index.js';
import { ALL_DIRECTIVES, CATEGORIES, COMMON_PARAMS } from '../src/governors/catalog.js';
import { DRIVE_TIERS } from '../src/fleet/drives.js';
import { STATUSES } from '../src/perspective/starStatus.js';
import { SPECTRAL_CLASSES } from '../src/galaxy/spectral.js';
import { AREAS, TECHS, TARGETS, CONDITIONS } from '../src/research/catalog.js';
import { sandbox, sys } from './helpers.js';
import { knowledgeOf } from '../src/info/module.js';
import { sendNote } from '../src/info/orders.js';
import { imposeDirective } from '../src/governors/module.js';
import { createFleet, launchFleet } from '../src/fleet/module.js';

const en = LOCALES.en.messages;
const locales = Object.keys(LOCALES);
const lookup = (tree, key) => key.split('.').reduce((n, k) => (n == null ? n : n[k]), tree);
const placeholders = (v) => new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? []);

afterEach(() => setLocale('en'));

describe('translation files', () => {
  it('every locale has exactly the English keys', () => {
    const base = new Set(keysOf(en));
    for (const code of locales) {
      const keys = new Set(keysOf(LOCALES[code].messages));
      expect([...base].filter((k) => !keys.has(k)), `${code} missing`).toEqual([]);
      expect([...keys].filter((k) => !base.has(k)), `${code} extra`).toEqual([]);
    }
  });

  it('translations use the same placeholders as English', () => {
    for (const code of locales) {
      for (const key of keysOf(en)) {
        expect(placeholders(lookup(LOCALES[code].messages, key)), `${code}:${key}`).toEqual(placeholders(lookup(en, key)));
      }
    }
  });

  it('interpolates, pluralises by locale and falls back', () => {
    expect(t('fleet.at', { system: 'Vega' })).toBe('at Vega');
    expect(t('intel.hops', { count: 1 })).toBe('1 hop');
    expect(t('intel.hops', { count: 3 })).toBe('3 hops');
    setLocale('cs');
    expect(t('intel.hops', { count: 1 })).toBe('1 skok');
    expect(t('intel.hops', { count: 3 })).toBe('3 skoky');
    expect(t('intel.hops', { count: 7 })).toBe('7 skoků');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});

describe('everything the game shows has a text', () => {
  const need = (key) => {
    for (const code of locales) expect(typeof lookup(LOCALES[code].messages, key) !== 'undefined', `${code}: ${key}`).toBe(true);
  };

  it('directives, categories, parameters and options', () => {
    for (const c of CATEGORIES) need(`category.${c.id}`);
    for (const d of ALL_DIRECTIVES) {
      need(`directive.${d.id}.name`);
      need(`directive.${d.id}.desc`);
      for (const p of [...d.params, ...COMMON_PARAMS]) {
        need(`param.${p.id}`);
        for (const o of p.options ?? []) need(`option.${p.id}.${o}`);
      }
    }
  });

  it('drives, statuses, spectral classes, roles, order states, channels', () => {
    for (const d of DRIVE_TIERS) need(`drive.${d.id}`);
    for (const s of STATUSES) need(`status.${s}`);
    for (const c of SPECTRAL_CLASSES) { need(`spectral.class.${c}`); need(`spectral.colour.${c}`); }
    for (const l of ['giant', 'brightGiant', 'subgiant', 'subdwarf', 'dwarf', 'supergiant', 'whiteDwarf', 'star', 'unknown']) need(`spectral.lum.${l}`);
    for (const r of ['generic', 'scout', 'settler', 'courier']) need(`fleet.role.${r}`);
    for (const c of ['live', 'confirmed', 'expected', 'unconfirmed', 'actual']) need(`fleet.certainty.${c}`);
    for (const s of ['inTransit', 'awaitingReport', 'inEffect', 'carriedOut', 'superseded', 'unreachable', 'expired', 'revoked']) need(`orders.status.${s}`);
    for (const v of ['capital', 'relay', 'courier', 'ansible', 'truth']) need(`intel.via.${v}`);
  });

  it('research: every technology, area, effect target, module and condition', () => {
    for (const a of AREAS) { need(`tech.area.${a.id}.name`); need(`tech.area.${a.id}.desc`); need(`option.field.${a.id}`); }
    for (const x of TECHS) { need(`tech.${x.id}.name`); need(`tech.${x.id}.desc`); }
    for (const x of TARGETS) { need(`research.target.${x.id}`); need(`research.module.${x.module}`); }
    for (const c of CONDITIONS) need(`research.condition.${c}`);
    for (const s of ['known', 'reported', 'available', 'needsCondition', 'blocked', 'locked']) need(`research.state.${s}`);
    for (const h of ['research', 'purchase', 'reverse', 'espionage']) need(`research.via.${h}`);
  });

  it('every error the simulation can raise', () => {
    const files = walk('src').filter((f) => f.endsWith('.js'));
    const keys = new Set(files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/new GameError\('(\w+)'/g)].map((m) => m[1])));
    expect(keys.size).toBeGreaterThan(5);
    for (const k of keys) need(`error.${k}`);
  });

  it('every dispatch produced in a busy game', () => {
    const { sim, world, act } = sandbox('i18n');
    act((w, c) => imposeDirective(w, c, { system: 'sol', type: 'expansion.settle', params: { frequency: 'high', maxRange: 12 } }));
    act((w, c) => imposeDirective(w, c, { system: sys('Tau Ceti'), type: 'expansion.explore', params: { frequency: 'high' } }));
    act((w, c) => sendNote(w, c, { empire: 'A', from: sys('Alpha Centauri'), to: 'sol', text: 'x' }));
    act((w, c) => { const f = createFleet(w, c, { empire: 'B', at: sys('Epsilon Indi'), drive: { accelG: 0.3, cruise: 0.3 } }); launchFleet(w, c, { fleet: f.id, to: sys('Tau Ceti') }); });
    sim.advanceTo(200);
    const keys = new Set(knowledgeOf(world, 'A').dispatches.map((d) => d.key));
    expect(keys.size).toBeGreaterThanOrEqual(5);
    for (const k of keys) need(`dispatch.${k}`);
  });
});

describe('no hard-coded text in the interface', () => {
  it('UI and rendering code contain no English sentences outside the locale files', () => {
    const offenders = [];
    for (const file of [...walk('src/ui'), ...walk('src/render')].filter((f) => f.endsWith('.js'))) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^import .*$/gm, '');
      for (const m of code.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)) {
        const text = (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, '');
        if (looksLikeProse(text)) offenders.push(`${file}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Two or more words of letters, not a class list, CSS, selector or key. */
function looksLikeProse(s) {
  if (/[:;{}=<>"]/.test(s)) return false; // CSS, markup, font stacks
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (words.every((w) => /^[a-z0-9.-]+$/.test(w) && (w.includes('-') || w.includes('.')))) return false; // class lists
  return words.filter((w) => /^[A-Za-z]{3,}[.,!?]?$/.test(w)).length >= 2;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('research dispatch wording', () => {
  it('names the technology and counts closed-off applications with plurals', async () => {
    const { describeDispatch } = await import('../src/ui/text/describe.js');
    const name = (id) => (id === 'sol' ? 'Sol' : id);
    /** @returns {any} */
    const d = (blocked) => ({ id: 'x', key: 'research.breakthrough', params: { tech: 'eng.torch-2', system: 'sol', blocked, how: 'research' }, validAt: 0, receivedAt: 0, via: 'capital', hops: 0 });
    expect(describeDispatch(d(0), name)).toBe('Breakthrough at Sol: Advanced fusion torch');
    expect(describeDispatch(d(1), name)).toBe('Breakthrough at Sol: Advanced fusion torch (1 rival application closed off)');
    expect(describeDispatch(d(2), name)).toBe('Breakthrough at Sol: Advanced fusion torch (2 rival applications closed off)');
    setLocale('cs');
    expect(describeDispatch(d(2), name)).toBe('Průlom u Sol: Pokročilý fúzní pohon (uzavřeny 2 konkurenční aplikace)');
  });
});
