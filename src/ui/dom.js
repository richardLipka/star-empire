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

/**
 * Replace a container's children only if the new content differs. Live parts
 * of panels are re-rendered on a timer; rebuilding unchanged buttons between a
 * user's mouse-down and mouse-up would swallow the click, and would also reset
 * focus, open selects and typed values. `force` always replaces (a redraw the
 * user asked for).
 * @param {Element} container @param {(Node | string | null | undefined | false)[]} nodes @param {boolean} [force]
 */
export function patch(container, nodes, force = false) {
  // Never swap content out from under a press in progress or text being typed;
  // the next refresh catches up.
  if (!force && busy(container)) return false;
  const next = document.createElement('div');
  for (const n of nodes) if (n != null && n !== false) next.append(n);
  if (!force && signature(next) === signature(container)) return false;
  container.replaceChildren(...next.childNodes);
  return true;
}

/** The element a pointer press started on, until it is released. @type {EventTarget | null} */
let pressed = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { pressed = e.target; }, true);
  // Released after the click event has been dispatched.
  const release = () => setTimeout(() => { pressed = null; }, 0);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
}

/** Is the user in the middle of using something inside this container? @param {Element} container */
function busy(container) {
  if (pressed instanceof Node && container.contains(pressed)) return true;
  const active = document.activeElement;
  // Text being typed (a focused select is not held: it would freeze the section after a choice).
  const typing = !!active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(/** @type {HTMLInputElement} */ (active).type)));
  return typing && container.contains(active);
}

/** Markup plus the state of form controls (selection, value, checked are properties, not markup). @param {Element} el */
function signature(el) {
  const controls = [...el.querySelectorAll('input,select,textarea')].map((c) => {
    const x = /** @type {HTMLInputElement} */ (c);
    return `${x.value}|${x.checked ? 1 : 0}`;
  });
  return `${el.innerHTML}#${controls.join(',')}`;
}
