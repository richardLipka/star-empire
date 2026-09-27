// @ts-check
/**
 * Standing settings a governor applies while the directive is in force:
 * military posture, reporting mode and relay repair policy. With no directive,
 * the defaults apply.
 */
export const DEFAULT_SETTINGS = { posture: 'vigilance', reporting: 'routine', relayRepair: 'normal', researchFocus: 'none' };

/** directive type → (params) → settings it imposes */
export const SETTINGS = {
  'military.readiness': (/** @type {any} */ p) => ({ posture: p.posture }),
  'governance.reporting': (/** @type {any} */ p) => ({ reporting: p.mode }),
  'governance.relay': (/** @type {any} */ p) => ({ relayRepair: p.repair }),
  'research.focus': (/** @type {any} */ p) => ({ researchFocus: p.field }),
};
