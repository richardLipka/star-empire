// @ts-check
import { defineModule } from '../sim/module.js';
import { random } from '../core/rng.js';
import { distance } from '../core/vec3.js';
import { empireState, setRelay } from '../empire/module.js';
import { fleetState, disbandFleet } from '../fleet/module.js';
import { send, knowledgeOf, recordDispatch, systemSnapshot, absorbSystemReport } from '../info/module.js';
import { colonyAt } from '../colony/module.js';
import { designStats } from '../ships/catalog.js';
import { fleetShips } from '../ships/module.js';
import { loyaltyAt, change } from '../loyalty/module.js';
import { RULES, DEFAULT_PLAN, resolveBattle, resolveStrike } from './model.js';

/**
 * Combat (docs/FLEETS.md). Battles happen where a fleet's voyage tells it to
 * attack; relativistic strikes where it tells an impactor to strike. Both are
 * resolved at once from the plans set in advance (combat/model.js); what
 * happened reaches each side's capital only by light, and only if someone
 * survives to report it:
 * - the defender's system reports home if it is still held;
 * - an attacking fleet reports when it next docks (a fleet in flight cannot
 *   transmit), or at once by ansible.
 *
 * A world struck by a relativistic impactor is a crime all can see: the flash
 * reaches every colony at light speed. The attacker's own colonies are
 * ashamed (loyalty falls), others are afraid, and every empire whose capital
 * hears of it holds a grievance against the attacker.
 *
 * @typedef {import('./model.js').Battle & { id: string, system: string, time: number, attacker: string, defender: string, kind: 'battle' }} BattleRecord
 * @typedef {{ id: string, system: string, time: number, attacker: string, defender: string | null, kind: 'strike', hit: boolean, killed: number, intercept: number, population: number }} StrikeRecord
 * @typedef {BattleRecord | StrikeRecord} CombatRecord
 */

export const combatModule = defineModule({
  id: 'combat',
  dependsOn: ['empire', 'fleet', 'info', 'colony', 'loyalty', 'ships'],
  initState: () => ({
    /** @type {CombatRecord[]} what really happened (truth) */
    records: [],
    /** @type {Record<string, number>} system → when a world there was burnt by a relativistic impact */
    scorched: {},
    /** @type {Record<string, Record<string, boolean>>} strike id → empire → its capital has been told */
    told: {},
  }),

  listeners: {
    'fleet/atWaypoint'(world, { fleet: id, system, action, speed }, ctx) {
      const f = fleetState(world).fleets[id];
      if (!f) return;
      if (action === 'attack') attack(world, ctx, f, system, speed);
      else if (action === 'strike') strike(world, ctx, f, system);
    },
    'fleet/arrived'(world, { fleet: id, system }, ctx) {
      // A fleet in flight cannot transmit: its battle reports go out when it docks.
      const f = fleetState(world).fleets[id];
      if (!f?.pendingReports?.length) return;
      for (const r of f.pendingReports) reportBattle(world, ctx, f.empire, system, r);
      f.pendingReports = [];
    },
    'info/delivered'(world, { message }, ctx) {
      if (message.kind !== 'battle' && message.kind !== 'atrocity') return;
      const emp = empireState(world).empires[message.empire];
      if (!emp || message.target !== emp.capital) return;
      const hops = message.hops.filter((/** @type {any} */ h) => h.kind === 'radio').length;
      const entry = { validAt: message.validAt, receivedAt: ctx.now, via: message.via, hops };
      if (message.kind === 'battle') learnBattle(world, ctx, message.empire, message.payload, entry, message.id);
      else learnAtrocity(world, ctx, message.empire, message.payload, entry, message.id);
    },
  },

  handlers: {
    /** The light of a world's destruction reaches a system. */
    'combat/flash'(world, { system, empire, strike: id, attacker, target }, ctx) {
      const p = empireState(world).presence[system];
      if (!p || p.empire !== empire) return;
      const rec = loyaltyAt(world, system);
      if (rec) change(world, ctx, system, rec, -(empire === attacker ? RULES.atrocity.shame : RULES.atrocity.fear));
      const capital = empireState(world).empires[empire].capital;
      if (system === capital) {
        // The capital sees the flash with its own eyes.
        learnAtrocity(world, ctx, empire, { strike: id, attacker, system: target }, { validAt: ctx.now - distance(ctx.data.catalog.get(system).pos, ctx.data.catalog.get(target).pos), receivedAt: ctx.now, via: 'capital', hops: 0 }, `${id}:${empire}`);
        return;
      }
      const told = (world.state.combat.told[id] ??= {});
      if (told[empire]) return; // the first of its colonies to see it sends word to the capital
      told[empire] = true;
      send(world, ctx, { empire, kind: 'atrocity', origin: system, target: capital, validAt: ctx.now - distance(ctx.data.catalog.get(system).pos, ctx.data.catalog.get(target).pos), payload: { strike: id, attacker, system: target } });
    },
  },
});

/** @param {import('../sim/world.js').World} world @returns {CombatRecord[]} */
export const combatRecords = (world) => world.state.combat?.records ?? [];

/** Worlds burnt by a relativistic impact. @param {import('../sim/world.js').World} world @param {string} system */
export const scorchedAt = (world, system) => world.state.combat?.scorched[system] ?? null;

/**
 * Units of the defending side at a system: its owner's docked fleets and, if
 * the system knows planetary defences, a station.
 * @param {import('../sim/world.js').World} world @param {string} system @param {string} empire
 */
function defenders(world, system, empire) {
  /** @type {import('./model.js').Unit[]} */
  const units = [];
  let plan = null;
  for (const f of Object.values(fleetState(world).fleets)) {
    if (f.empire !== empire || f.status !== 'docked' || f.at !== system) continue;
    if (!f.ships?.length) {
      units.push({ key: `${f.id}:0`, design: 'civilian', fleet: f.id, role: 'unarmed', stats: CIVILIAN, hp: CIVILIAN.hp });
      continue;
    }
    plan ??= f.plan;
    fleetShips(f).forEach((s, i) => {
      if (s.stats) units.push({ key: `${f.id}:${i}`, design: s.d, fleet: f.id, role: s.stats.armed ? 'warship' : 'unarmed', stats: s.stats, hp: s.hp });
    });
  }
  const station = stationOf(world, system);
  if (station) units.push({ key: 'station', design: 'station', role: 'defence', stats: station, hp: station.hp });
  return { units, plan: plan ?? { ...DEFAULT_PLAN } };
}

/** A civilian vessel (settler, scout, courier...). */
const CIVILIAN = designStats({ id: 'civilian', hull: 'corvette', components: [] });

/**
 * Planetary defences of a system, if its technologies provide them.
 * @param {import('../sim/world.js').World} world @param {string} system
 * @returns {import('../ships/catalog.js').DesignStats | null}
 */
export function stationOf(world, system) {
  const p = empireState(world).presence[system];
  const unlocks = p?.capabilities?.unlocks ?? [];
  if (!unlocks.includes('defense.grid')) return null;
  const pop = colonyAt(world, system)?.population ?? 0;
  const hp = RULES.station.hp + RULES.station.hpPerDecade * Math.max(0, Math.log10(Math.max(1, pop / 1000)));
  const s = designStats({ id: 'station', hull: 'corvette', components: [] });
  return {
    ...s, hp, armed: true,
    beams: [{ rate: 2, damage: 0.5, range: 1 }],
    missiles: unlocks.includes('weapon.missile') ? [{ salvo: 12, damage: 3, evade: 0 }] : [],
    pd: 24, pdKinetic: 8,
    beamTaken: unlocks.includes('defense.shield') ? 0.5 : 1,
  };
}

/**
 * Was the system warned? A plume or net sighting in recent years, or a fortified posture.
 * @param {import('../sim/world.js').World} world @param {{ now: number }} ctx @param {string} system
 */
function alerted(world, ctx, system) {
  const book = world.state.governors?.books[system];
  if (!book) return false;
  if (book.settings.posture === 'fortify') return true;
  return book.memory.lastThreatAt != null && ctx.now - book.memory.lastThreatAt <= 10;
}

/**
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system @param {number} speed
 */
function attack(world, ctx, f, system, speed) {
  const owner = empireState(world).presence[system]?.empire ?? null;
  if (!owner || owner === f.empire || !f.ships?.length) return;
  const def = defenders(world, system, owner);
  // Keys carry the ship's position in the fleet (losses are applied by it).
  /** @type {import('./model.js').Unit[]} */
  const mine = fleetShips(f).map((s, i) => ({
    key: `${f.id}:${i}`, design: s.d, fleet: f.id, role: /** @type {'warship' | 'unarmed'} */ (s.stats?.armed ? 'warship' : 'unarmed'),
    stats: /** @type {import('../ships/catalog.js').DesignStats} */ (s.stats), hp: s.hp,
  })).filter((u) => u.stats);
  const battle = resolveBattle(
    { empire: f.empire, role: 'attacker', plan: f.plan ?? { ...DEFAULT_PLAN }, units: mine, alerted: true },
    { empire: owner, role: 'defender', plan: def.plan, units: def.units, alerted: alerted(world, ctx, system) },
    speed, () => random(ctx.rng),
  );
  /** @type {BattleRecord} */
  const rec = { ...battle, id: ctx.newId('battle'), system, time: ctx.now, attacker: f.empire, defender: owner, kind: 'battle' };
  applyLosses(world, ctx, [...battle.sides[0].units, ...battle.sides[1].units]);
  // A system stripped of its defences loses its relay too.
  const stationLost = battle.sides[1].units.some((u) => u.key === 'station' && u.destroyed);
  if ((stationLost || battle.outcome === 'attackerWon') && empireState(world).presence[system]?.relay === 'ok') setRelay(world, ctx, { system, state: 'destroyed' });
  // An attacker that braked in and won bombards the colony: people die, and
  // the colony blames the empire that could not protect it.
  if (battle.outcome === 'attackerWon' && speed <= RULES.braked.speed * 2) {
    const colony = colonyAt(world, system);
    if (colony) colony.population *= 1 - RULES.bombardment.kill;
    const loyalty = loyaltyAt(world, system);
    if (loyalty) change(world, ctx, system, loyalty, -RULES.bombardment.loyalty);
  }
  remember(world, rec);
  ctx.notify('combat/battle', { id: rec.id, system, attacker: f.empire, defender: owner, outcome: battle.outcome });
  // The defender's system reports home, if it is still held.
  if (empireState(world).presence[system]?.empire === owner) reportBattle(world, ctx, owner, system, rec);
  // The attacker's survivors report when they can.
  const survivor = fleetState(world).fleets[f.id];
  if (survivor) {
    if (survivor.ansible || survivor.status === 'docked') reportBattle(world, ctx, f.empire, survivor.ansible ? survivor.id : system, rec);
    else (survivor.pendingReports ??= []).push(rec);
  }
}

/**
 * Ships destroyed are removed; fleets with none left are gone.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('./model.js').UnitResult[]} units
 */
function applyLosses(world, ctx, units) {
  /** @type {Map<string, import('./model.js').UnitResult[]>} */
  const byFleet = new Map();
  for (const u of units) {
    if (!u.fleet) continue;
    if (!byFleet.has(u.fleet)) byFleet.set(u.fleet, []);
    /** @type {import('./model.js').UnitResult[]} */ (byFleet.get(u.fleet)).push(u);
  }
  for (const [id, list] of byFleet) {
    const f = fleetState(world).fleets[id];
    if (!f) continue;
    if (!f.ships?.length) {
      if (list.every((u) => u.destroyed)) disbandFleet(world, ctx, id); // a civilian vessel caught in the fire
      continue;
    }
    const ships = f.ships;
    f.ships = ships.map((s, i) => {
      const u = list.find((x) => x.key === `${id}:${i}`);
      return u ? { ...s, hp: u.hpAfter } : s;
    }).filter((s, i) => !list.find((x) => x.key === `${id}:${i}`)?.destroyed);
    if (!f.ships.length) disbandFleet(world, ctx, id);
  }
}

/**
 * A relativistic impactor reaches its target world.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {import('../fleet/module.js').Fleet} f @param {string} system
 */
function strike(world, ctx, f, system) {
  const owner = empireState(world).presence[system]?.empire ?? null;
  const colony = colonyAt(world, system);
  let pd = 0;
  for (const g of Object.values(fleetState(world).fleets)) {
    if (g.empire !== owner || g.status !== 'docked' || g.at !== system) continue;
    for (const s of fleetShips(g)) pd += (s.stats?.pdKinetic ?? 0) + (s.stats && s.stats.kineticTaken < 1 ? 10 : 0);
  }
  pd += stationOf(world, system)?.pdKinetic ?? 0;
  const population = colony?.population ?? 0;
  const result = resolveStrike({ alerted: owner ? alerted(world, ctx, system) : false, pd }, population, () => random(ctx.rng));
  disbandFleet(world, ctx, f.id); // the impactor is spent either way
  /** @type {StrikeRecord} */
  const rec = { id: ctx.newId('strike'), system, time: ctx.now, attacker: f.empire, defender: owner, kind: 'strike', hit: result.hit, killed: result.killed, intercept: result.intercept, population: Math.round(population) };
  remember(world, rec);
  ctx.notify('combat/strike', { id: rec.id, system, attacker: f.empire, hit: result.hit });
  if (!result.hit) {
    if (owner) reportBattle(world, ctx, owner, system, rec);
    return;
  }
  world.state.combat.scorched[system] = ctx.now;
  if (colony) colony.population = Math.max(0, colony.population - result.killed);
  // Everything docked there is gone; so is the relay.
  for (const g of Object.values(fleetState(world).fleets)) if (g.status === 'docked' && g.at === system) disbandFleet(world, ctx, g.id);
  if (owner && empireState(world).presence[system]?.relay === 'ok') setRelay(world, ctx, { system, state: 'destroyed' });
  if (owner) reportBattle(world, ctx, owner, system, rec);
  // The flash is seen everywhere, at the speed of light.
  const here = ctx.data.catalog.get(system).pos;
  for (const [s, p] of Object.entries(empireState(world).presence)) {
    ctx.scheduleIn(distance(ctx.data.catalog.get(s).pos, here), 'combat/flash', { system: s, empire: p.empire, strike: rec.id, attacker: f.empire, target: system });
  }
}

/** @param {import('../sim/world.js').World} world @param {CombatRecord} rec */
function remember(world, rec) {
  const list = world.state.combat.records;
  list.push(rec);
  if (list.length > RULES.memory) list.splice(0, list.length - RULES.memory);
  const kept = new Set(list.map((r) => r.id));
  for (const id of Object.keys(world.state.combat.told)) if (!kept.has(id)) delete world.state.combat.told[id];
}

/**
 * Send a battle report from where it can leave (a system, or an ansible fleet).
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {string} origin @param {CombatRecord} rec
 */
function reportBattle(world, ctx, empire, origin, rec) {
  const capital = empireState(world).empires[empire]?.capital;
  if (!capital) return;
  const data = origin.startsWith('fleet-') ? null : systemSnapshot(world, rec.system);
  send(world, ctx, { empire, kind: 'battle', origin, target: capital, validAt: rec.time, payload: { record: rec, data } });
}

/**
 * The capital takes in a battle report.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {{ record: CombatRecord, data: any }} payload @param {any} entry @param {string} id
 */
function learnBattle(world, ctx, empire, { record, data }, entry, id) {
  const k = knowledgeOf(world, empire);
  const list = (k.battles ??= []);
  if (list.some((b) => b.record.id === record.id)) return; // already heard from the other side of it
  list.push({ record, receivedAt: entry.receivedAt, validAt: entry.validAt });
  if (list.length > RULES.memory) list.splice(0, list.length - RULES.memory);
  if (data) absorbSystemReport(world, ctx, empire, record.system, entry, data);
  const other = record.attacker === empire ? record.defender : record.attacker;
  let key;
  /** @type {Record<string, string | number>} */
  const params = { system: record.system, empire: other ?? '' };
  if (record.kind === 'strike') {
    key = record.attacker === empire ? (record.hit ? 'combat.strikeHit' : 'combat.strikeMissed') : record.hit ? 'combat.struck' : 'combat.strikeStopped';
    params.killed = record.killed;
  } else {
    const us = record.sides.find((s) => s.empire === empire);
    const them = record.sides.find((s) => s.empire !== empire);
    params.lost = us?.lost ?? 0;
    params.killed = them?.lost ?? 0;
    key = `combat.${record.attacker === empire ? 'attacked' : 'defended'}.${record.outcome}`;
  }
  recordDispatch(world, ctx, empire, { id, key, params, ...entry });
}

/**
 * The capital hears of a world destroyed: a grievance against the attacker.
 * @param {import('../sim/world.js').World} world @param {import('../sim/module.js').SimContext} ctx
 * @param {string} empire @param {{ strike: string, attacker: string, system: string }} p @param {any} entry @param {string} id
 */
function learnAtrocity(world, ctx, empire, { strike: sid, attacker, system }, entry, id) {
  const k = knowledgeOf(world, empire);
  const known = (k.atrocities ??= []);
  if (known.includes(sid)) return; // already heard (seen from the capital, or told by a colony)
  known.push(sid);
  if (attacker !== empire) {
    const g = (k.grievances ??= {});
    g[attacker] = (g[attacker] ?? 0) + RULES.atrocity.grievance;
  }
  recordDispatch(world, ctx, empire, { id, key: attacker === empire ? 'combat.ourAtrocity' : 'combat.atrocity', params: { system, empire: attacker }, ...entry });
}

/**
 * Grievances an empire's capital holds (against whom, how many worlds).
 * @param {import('../sim/world.js').World} world @param {string} empire
 * @returns {Record<string, number>}
 */
export const grievancesOf = (world, empire) => knowledgeOf(world, empire).grievances ?? {};
