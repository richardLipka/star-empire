// @ts-check
import rules from '../data/combat.json';

/**
 * The combat model (docs/FLEETS.md). Pure: the same sides, speed and random
 * stream give the same battle.
 *
 * Fleets meet at up to a large fraction of c. Weapons can bear only while the
 * enemy is within their range, so the time available is
 *   window = 2 × range / closing speed   (seconds, ranges in light-seconds)
 * — a few seconds or less in a flyby, many minutes for an attacker braking
 * into a system. Nothing can be decided during the pass: the battle plans
 * (target priority, point-defence allocation, formation, fight or evade) are
 * set in advance and the outcome follows from them.
 *
 * Sequence (all simultaneous in effect; both sides fire from their state
 * before the pass):
 * 1. missiles, launched in advance, meet the other side's point defence;
 * 2. beams fire while in range (at most `heat` seconds);
 * 3. kinetic slugs cross at the moment of closest approach: their damage grows
 *    with the closing speed, their chance to hit falls with it.
 *
 * @typedef {{ priority: 'warships' | 'unarmed' | 'defences' | 'spread', pd: 'missiles' | 'balanced' | 'slugs', formation: 'wall' | 'column' | 'dispersed', engage: 'fight' | 'evade' }} Plan
 * @typedef {object} Unit
 * @property {string} key                ship id (fleet:index) or 'station'
 * @property {string} design             design id, or 'station'
 * @property {string} [fleet]
 * @property {'warship' | 'unarmed' | 'defence'} role
 * @property {import('../ships/catalog.js').DesignStats} stats
 * @property {number} hp
 * @typedef {{ empire: string, role: 'attacker' | 'defender', plan: Plan, units: Unit[], alerted: boolean }} Side
 * @typedef {{ missiles: number, intercepted: number, missileHits: number, beamShots: number, beamHits: number, kineticShots: number, kineticHits: number, kineticStopped: number, damage: number }} Fire
 * @typedef {{ key: string, design: string, fleet?: string, role: string, hpBefore: number, hpAfter: number, destroyed: boolean }} UnitResult
 * @typedef {{ empire: string, role: string, plan: Plan, alerted: boolean, fired: Fire, units: UnitResult[], lost: number, left: number }} SideResult
 * @typedef {{ speed: number, windows: { missile: number, beam: number, kinetic: number, pd: number }, sides: [SideResult, SideResult], outcome: 'attackerWon' | 'defenderWon' | 'mutual' | 'passed' }} Battle
 */

export const RULES = rules;

/** @type {Plan} */
export const DEFAULT_PLAN = { priority: 'warships', pd: 'balanced', formation: 'wall', engage: 'fight' };

export const PLAN_OPTIONS = {
  priority: ['warships', 'unarmed', 'defences', 'spread'],
  pd: ['missiles', 'balanced', 'slugs'],
  formation: ['wall', 'column', 'dispersed'],
  engage: ['fight', 'evade'],
};

/**
 * Seconds a weapon of this range can bear at this closing speed.
 * @param {number} range light-seconds @param {number} speed fraction of c
 */
export const windowFor = (range, speed) => Math.min(RULES.maxWindow, (2 * range) / Math.max(speed, RULES.braked.speed));

/**
 * @param {Side} attacker @param {Side} defender @param {number} speed closing speed (fraction of c)
 * @param {() => number} rand uniform 0–1
 * @returns {Battle}
 */
export function resolveBattle(attacker, defender, speed, rand) {
  const v = Math.max(speed, RULES.braked.speed);
  const windows = { missile: windowFor(2, v), beam: windowFor(1, v), kinetic: windowFor(0.2, v), pd: windowFor(0.5, v) };
  const a = volley(attacker, defender, v, windows, rand);
  const d = volley(defender, attacker, v, windows, rand);
  const aUnits = apply(attacker, d.packets, defender.plan);
  const dUnits = apply(defender, a.packets, attacker.plan);
  const alive = (/** @type {UnitResult[]} */ us) => us.filter((u) => !u.destroyed && u.role !== 'unarmed').length;
  const side = (/** @type {Side} */ s, /** @type {Fire} */ fired, /** @type {UnitResult[]} */ units) => ({
    empire: s.empire, role: s.role, plan: s.plan, alerted: s.alerted, fired, units,
    lost: units.filter((u) => u.destroyed).length, left: units.filter((u) => !u.destroyed).length,
  });
  const aLeft = alive(aUnits);
  const dLeft = alive(dUnits);
  const outcome = aLeft && !dLeft ? 'attackerWon' : dLeft && !aLeft ? 'defenderWon' : !aLeft && !dLeft ? 'mutual' : 'passed';
  return { speed: v, windows, sides: [side(attacker, a.fired, aUnits), side(defender, d.fired, dUnits)], outcome };
}

/**
 * What one side sends at the other.
 * @param {Side} from @param {Side} to @param {number} v
 * @param {{ missile: number, beam: number, kinetic: number, pd: number }} w @param {() => number} rand
 */
function volley(from, to, v, w, rand) {
  /** @type {Record<string, { out: number, in: number, missiles?: number }>} */
  const formations = RULES.formations;
  const f = formations[from.plan.formation] ?? formations.wall;
  const tf = formations[to.plan.formation] ?? formations.wall;
  const surprise = (/** @type {Side} */ s) => (s.alerted ? 1 : RULES.surprise);
  const out = f.out * (from.plan.engage === 'evade' ? RULES.evade.out : 1) * surprise(from);
  const exposure = tf.in * (to.plan.engage === 'evade' ? RULES.evade.in : 1);
  const live = from.units.filter((u) => u.hp > 0);
  const targets = to.units.filter((u) => u.hp > 0);
  const ecm = targets.length ? targets.reduce((a, u) => a + u.stats.ecm, 0) / targets.length : 0;
  const accuracy = live.length ? live.reduce((a, u) => a + u.stats.accuracy, 0) / live.length : 1;
  const jitter = () => 0.8 + 0.4 * rand();
  /** @type {Fire} */
  const fired = { missiles: 0, intercepted: 0, missileHits: 0, beamShots: 0, beamHits: 0, kineticShots: 0, kineticHits: 0, kineticStopped: 0, damage: 0 };
  /** @type {{ type: 'missile' | 'beam' | 'kinetic', amount: number }[]} */
  const packets = [];

  // The other side's point defence, split between missiles and slugs by its
  // plan; it engages each salvo afresh.
  const salvos = Math.min(RULES.maxSalvos, 1 + Math.floor((w.missile / 60) * RULES.missileSalvosPerMinute));
  const pdEff = Math.min(1, w.pd / RULES.pdWindow) * surprise(to);
  const share = { missiles: 0.85, balanced: 0.55, slugs: 0.2 }[to.plan.pd] ?? 0.55;
  let pdMissiles = targets.reduce((a, u) => a + u.stats.pd, 0) * pdEff * share * salvos;
  const pdSlugs = targets.reduce((a, u) => a + u.stats.pd * 0.3 + u.stats.pdKinetic, 0) * pdEff * (1 - share);

  // 1. Missiles.
  for (const u of live) {
    for (const m of u.stats.missiles) {
      const n = m.salvo * salvos * out;
      if (n <= 0) continue;
      const stoppable = n * (1 - m.evade);
      const stopped = Math.min(stoppable, pdMissiles);
      pdMissiles -= stopped;
      const through = n - stopped;
      const hits = through * RULES.accuracy.missile * (1 - ecm) * exposure * (tf.missiles ?? 1) * jitter();
      fired.missiles += n;
      fired.intercepted += stopped;
      fired.missileHits += hits;
      packets.push({ type: 'missile', amount: hits * m.damage });
    }
  }
  // 2. Beams.
  for (const u of live) {
    for (const b of u.stats.beams) {
      const shots = b.rate * Math.min(RULES.heat, windowFor(b.range, v)) * out;
      const hits = shots * RULES.accuracy.beam * accuracy * (1 - ecm) * exposure * jitter();
      fired.beamShots += shots;
      fired.beamHits += hits;
      packets.push({ type: 'beam', amount: hits * b.damage });
    }
  }
  // 3. Kinetics at the crossing.
  let slugsLeft = pdSlugs;
  for (const u of live) {
    for (const k of u.stats.kinetics) {
      const shots = k.rate * Math.min(RULES.heat, windowFor(k.range, v)) * out;
      let hits = (shots * RULES.accuracy.kinetic * accuracy * (1 - ecm) * exposure * jitter()) / (1 + RULES.kineticEvasion * v);
      const stopped = Math.min(hits * 0.5, slugsLeft);
      slugsLeft -= stopped;
      hits -= stopped;
      fired.kineticShots += shots;
      fired.kineticHits += hits;
      fired.kineticStopped += stopped;
      packets.push({ type: 'kinetic', amount: hits * k.damage * (1 + RULES.kineticSpeedBonus * v) });
    }
  }
  fired.damage = packets.reduce((a, p) => a + p.amount, 0);
  for (const k of /** @type {(keyof Fire)[]} */ (Object.keys(fired))) fired[k] = Math.round(fired[k] * 10) / 10;
  return { fired, packets };
}

/**
 * Damage lands by the firing side's target priority.
 * @param {Side} side @param {{ type: 'missile' | 'beam' | 'kinetic', amount: number }[]} packets @param {Plan} enemyPlan
 * @returns {UnitResult[]}
 */
function apply(side, packets, enemyPlan) {
  const hp = side.units.map((u) => u.hp);
  const rank = (/** @type {Unit} */ u) => {
    const order = { warships: ['warship', 'defence', 'unarmed'], unarmed: ['unarmed', 'warship', 'defence'], defences: ['defence', 'warship', 'unarmed'], spread: [] }[enemyPlan.priority] ?? [];
    return order.indexOf(u.role);
  };
  const taken = (/** @type {Unit} */ u, /** @type {string} */ type) => (type === 'beam' ? u.stats.beamTaken : type === 'kinetic' ? u.stats.kineticTaken : u.stats.missileTaken);
  const order = side.units.map((u, i) => i).filter((i) => hp[i] > 0).sort((x, y) => rank(side.units[x]) - rank(side.units[y]) || x - y);
  for (const p of packets) {
    let left = p.amount;
    if (enemyPlan.priority === 'spread') {
      const total = order.reduce((a, i) => a + Math.max(0, hp[i]), 0);
      for (const i of order) if (hp[i] > 0 && total > 0) hp[i] -= (left * hp[i]) / total * taken(side.units[i], p.type);
      continue;
    }
    for (const i of order) {
      if (left <= 0) break;
      if (hp[i] <= 0) continue;
      const t = taken(side.units[i], p.type);
      const need = (hp[i] / t) * (1 + RULES.overkill);
      if (left >= need) {
        hp[i] = 0;
        left -= need;
      } else {
        hp[i] -= left * t;
        left = 0;
      }
    }
  }
  return side.units.map((u, i) => ({
    key: u.key, design: u.design, fleet: u.fleet, role: u.role,
    hpBefore: round(u.hp), hpAfter: round(Math.max(0, hp[i])), destroyed: hp[i] <= 1e-9,
  }));
}

const round = (/** @type {number} */ x) => Math.round(x * 10) / 10;

/**
 * A relativistic impact on a world: does it get through, and how many die?
 * @param {{ alerted: boolean, pd: number }} defence  point defence and debris screens of the system and its docked fleets
 * @param {number} population @param {() => number} rand
 */
export function resolveStrike(defence, population, rand) {
  const s = RULES.strike;
  const intercept = defence.alerted ? Math.min(0.6, s.intercept * Math.log10(1 + defence.pd)) : 0;
  if (rand() < intercept) return { hit: false, intercept, killed: 0 };
  const [lo, hi] = s.kill;
  const killed = Math.round(population * (lo + (hi - lo) * rand()));
  return { hit: true, intercept, killed };
}
