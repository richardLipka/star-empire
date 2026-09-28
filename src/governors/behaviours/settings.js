// @ts-check
/**
 * Standing settings a governor applies while the directive is in force:
 * military posture, reporting mode, relay repair policy, research and
 * economy focus and the terraforming programme. With no directive,
 * the defaults apply.
 */
export const DEFAULT_SETTINGS = { posture: 'vigilance', reporting: 'routine', relayRepair: 'normal', researchFocus: 'none', economyFocus: 'balanced', terraform: 'full', autonomy: 'normal' };

/** directive type → (params) → settings it imposes */
export const SETTINGS = {
  'military.readiness': (/** @type {any} */ p) => ({ posture: p.posture }),
  'governance.reporting': (/** @type {any} */ p) => ({ reporting: p.mode }),
  'governance.relay': (/** @type {any} */ p) => ({ relayRepair: p.repair }),
  'research.focus': (/** @type {any} */ p) => ({ researchFocus: p.field }),
  'economy.focus': (/** @type {any} */ p) => ({ economyFocus: p.focus }),
  'economy.terraform': (/** @type {any} */ p) => ({ terraform: p.program }),
  'governance.autonomy': (/** @type {any} */ p) => ({ autonomy: p.level }),
};
