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
    report: '#a9bccd',     // reports in flight
    order: '#e8b04a',      // directives and fleet orders
    note: '#c9d4dc',
    wormhole: '#c77dff',
    ansible: '#8ff0c0',
    plume: '#ff8a3d',      // drive plumes
  },
  /** Star colours in the "Status" view. */
  status: {
    capital: '#ffd27a',
    relay: '#e8b04a',
    outpost: '#b98f4a',
    relayDown: '#d9694a',
    foreign: '#5fb3c9',
    explored: '#d8e2ea',
    unexplored: '#3e4a55',
  },
  /** Star colours in the "Politics" view (our colonies by reported loyalty; foreign ones by faction). */
  politics: {
    capital: '#ffd27a',
    loyal: '#8fdf6a',
    restless: '#e8c34a',
    autonomous: '#d9694a',
    unreported: '#7d8a96',
  },
  /** Star colours in the "Economy" view (people, and trouble). */
  economy: {
    billions: '#fff1c4',
    millions: '#f0c060',
    thousands: '#c08a3e',
    few: '#7a5f3a',
    hungry: '#d9694a',
    unreported: '#56636e',
    foreign: '#3f6470',
  },
  /** Held-nothing stars in the political and economic views. */
  quiet: '#26313a',
  /** Information older than this (years) is drawn fully faded. */
  staleAfterYears: 40,
  /** One hue per faction, keyed by faction letter. */
  factions: {
    A: '#e8b04a',
    B: '#5fb3c9',
    C: '#b98ad9',
    D: '#8fbf6a',
    E: '#d98a9f',
    F: '#9fd9c0',
    G: '#c9b27a',
    H: '#8aa0e8',
  },
  /** Faction colour for polities beyond the named ones. */
  factionOther: '#a8a8b8',
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
