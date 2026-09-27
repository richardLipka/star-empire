// @ts-check
/**
 * Tiny DOM helper: `h('button.btn', { onclick }, 'Pause')`.
 * @param {string} tag  element name with optional `.class` suffixes
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | number | null | undefined | false)} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

/**
 * Definition list of label/value rows.
 * @param {[string, string | number][]} rows
 */
export const kv = (rows) => h('dl.kv', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
