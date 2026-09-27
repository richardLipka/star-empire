// @ts-check
import { t } from '../../i18n/index.js';
import { DRIVE_TIERS } from '../../fleet/drives.js';
import { directiveDef } from '../../governors/catalog.js';

/**
 * Directive parameters as short text: "Range: 20 ly · Toward: Vega".
 * @param {string} type @param {Record<string, any>} params @param {(id: string) => string} name
 */
export function paramSummary(type, params, name) {
  return directiveDef(type).params
    .filter((p) => params[p.id] != null)
    .map((p) => `${t(`param.${p.id}`)}: ${paramValue(p, params[p.id], name)}`)
    .join(' · ');
}

/**
 * @param {import('../../governors/catalog.js').ParamDef} p @param {any} v @param {(id: string) => string} name
 */
export function paramValue(p, v, name) {
  switch (p.type) {
    case 'enum': return t(`option.${p.id}.${v}`);
    case 'boolean': return t(v ? 'option.yes' : 'option.no');
    case 'system': return name(v);
    case 'drive': return typeof v === 'number' ? t(`drive.${DRIVE_TIERS[v].id}`) : t('drive.spec', { g: v.accelG, c: v.cruise });
    default: return unitText(p.unit, v);
  }
}

/** @param {string | undefined} unit @param {number} n */
export function unitText(unit, n) {
  if (unit === 'ly') return t('unit.ly', { n });
  if (unit === 'y') return t('unit.years', { n });
  return String(n);
}
