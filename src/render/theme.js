// @ts-check
/**
 * Visual tokens shared by the DOM (as CSS custom properties) and the WebGL
 * renderer. Change colours here only.
 */
export const theme = {
  bg: '#05070a',
  panel: '#0b0f14',
  panelEdge: '#1c2530',
  text: '#c9d4dc',
  textDim: '#6b7a86',
  line: '#2a3a47',
  lineStrong: '#4d6576',
  accent: '#e8b04a',
  warn: '#d9694a',
  /** Information layer. */
  info: {
    stale: '#3b4650',      // oldest information fades to this
    overdue: '#d9694a',    // reports missing
    report: '#7fc8d8',     // routine reports in flight
    order: '#e8b04a',      // directives and fleet orders
    note: '#c9d4dc',
    wormhole: '#c77dff',
    ansible: '#8ff0c0',
  },
  /** Information older than this (years) is drawn fully faded. */
  staleAfterYears: 40,
  /** One hue per faction, keyed by faction letter. */
  factions: {
    A: '#e8b04a',
    B: '#5fb3c9',
    C: '#b98ad9',
    D: '#8fbf6a',
  },
  /** Star colours by spectral class (O B A F G K M, plus white dwarfs and unknown). */
  spectral: {
    O: '#9bb0ff',
    B: '#aabfff',
    A: '#d5e0ff',
    F: '#f8f7ff',
    G: '#ffe9b0',
    K: '#ffc27a',
    M: '#ff9a6a',
    D: '#c8d4e0',
    '?': '#8a96a0',
  },
  font: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
};

/**
 * Publish the tokens as CSS custom properties on the document root.
 * @param {HTMLElement} root
 */
export function applyThemeToCss(root) {
  const vars = {
    '--bg': theme.bg,
    '--panel': theme.panel,
    '--panel-edge': theme.panelEdge,
    '--text': theme.text,
    '--text-dim': theme.textDim,
    '--line': theme.line,
    '--line-strong': theme.lineStrong,
    '--accent': theme.accent,
    '--warn': theme.warn,
    '--font': theme.font,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
