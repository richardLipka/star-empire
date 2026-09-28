# Fleets, ship design and combat (M9)

Fleets move at a tenth of light or more, and meet at a large fraction of it. Weapons can act only while the enemy is within range, so a battle lasts seconds, often less than one. Nobody can decide anything during it. **The tactical game is preparation:**
- the design of the ships;
- the battle plan (target priority, point-defence allocation, formation, fight or evade);
- the approach (braking in, flying by, or creeping in on gentle burns);
- the route.

Everything must be ordered in advance, because orders travel at light speed and a fleet in flight cannot receive them. The result is computed automatically, and it reaches each capital only by light, and only if someone survives to report it.

Data: `src/data/ships.json` and `src/data/combat.json`. Code:
- `src/ships/` (catalogue and module);
- `src/combat/` (pure model and module);
- `src/fleet/` (voyages, flyby profiles, orders and mailboxes);
- `src/detection/` (sensor nets, faint stealth plumes);
- `src/ui/fleets/` (the Fleets screen).

## Ship design

**Hulls:**

| Hull | Slots | Hull points | Cost | Needs |
|---|---|---|---|---|
| corvette | 2 | 6 | 30 | — |
| frigate | 4 | 14 | 70 | *Frigate spaceframes* |
| cruiser | 7 | 32 | 180 | *Capital spaceframes* |
| impactor | 0 | 1 | 60 | *Relativistic kill vehicles*; unmanned, 3 g to 0.85 c, cannot brake |

**Components** fill the slots:
- **missiles:** missile rack, drone swarm, antimatter missiles, replicator swarm. A salvo of *n*; some evade point defence.
- **kinetic guns:** coilgun, railgun, flechette (also point defence), vault gun. Damage grows with the closing speed; the chance to hit falls with it.
- **beams:** laser, particle beam, graser. Rate, damage and range.
- **point defence:** flak, PD laser, interceptor drones (also against slugs and impactors).
- **armour and screens:** armour, Whipple shield (kinetic), debris screen (kinetic and missiles), field shielding (beams).
- **decoys** (a fraction of aimed fire misses) and **battle computers** (accuracy).

`designStats` gives hull points, cost, weapons, point defence, damage taken and one *strength* number for comparisons.

**Designs:**
- Every empire has the stock designs *Picket* (corvette: missiles and flak), *Lancer*, *Warden* and *Impactor*.
- It can draw its own in the Designs tab. A design is an idea at the capital; it reaches a shipyard **inside the build order** (*Fleet › Build ships*, `fleet.build`), so interception can reveal it.
- The yard builds only designs whose technologies it knows, paying materiel per ship. What cannot be paid for yet is built as materiel comes in.

***Military › Warship construction*** is now in effect. It keeps a home guard at the system of the strongest design the yard can build and afford: none, defensive (2), steady (5) or war footing (10), one ship a year.

## Voyages and approaches

A fleet is sent on a **voyage**: a list of waypoints, each to visit, attack or strike (impactors). There are three approaches:

| Approach | How | Seen | Battle |
|---|---|---|---|
| normal | accelerate, coast, brake into each waypoint | the braking plume points at the target: it is warned long before (years) | braking in: a slow battle (up to 30 s of fire; missiles in several salvos) |
| flyby | no braking: pass at cruise speed, brake beyond, fly on; after the last waypoint, return home | no plume ahead: the target is often **surprised** (half effect) | seconds or less |
| stealth | burns of 0.01 g, cruise at most 0.04 c (needs *Cold-exhaust drives*) | plume brightness scales with √acceleration: seen only from close | braking in, slow |

**How visible a plume is.** Its range grows with the square root of the burn's acceleration relative to 0.1 g (at most ×2). A 1 g burn is seen from twice as far; a 0.01 g stealth burn from a third as far.

**Sensor nets** (*Sensor nets* 1.5 ly, *Deep sensor nets* +3 ly) see every foreign fleet in flight within their radius, burning or not, four times a year. They report home like any sighting and alert the system.

## Orders to fleets

The capital sends orders to a fleet (Fleets screen, `orderFleet`): a new **battle plan**, or a **voyage**.

- **A fleet the network reaches** (docked at one of our systems, or carrying an ansible) gets the order by light, or at once.
- **A fleet in flight cannot receive anything.** The order goes to the system where the capital believes it will next dock (its **mailbox**) and waits there. It takes effect when the fleet docks. Orders for a fleet that is lost are dropped; orders nobody collects are forgotten after 300 years. An ansible fleet in flight keeps the voyage for when it docks.
- **The capital remembers the voyages it ordered.** The map shows such a fleet at its predicted position (*expected*, flagged *planned*) even before any report has come back, from when the order should take effect until its arrival.
- **Voyages pass through several systems.** The whole route is planned at once, so the prediction covers all of it.

The screen shows:
- when an order would reach the fleet;
- for each waypoint of a draft voyage: arrival year, closing speed, how long beams and slugs can bear, and whether a braking plume warns the target;
- how far the approach's plumes are seen, and when the fleet will be home.

## Combat model

`resolveBattle(attacker, defender, speed, rand)` in `src/combat/model.js`. It is pure and deterministic for a given random stream.

- **Window.** A weapon of range *R* light-seconds bears for `2R / closing speed` seconds (at most 15 minutes). A flyby at 0.1 c gives beams (1 ls) 20 s and slugs (0.2 ls) 4 s; at 0.5 c, 4 s and 0.8 s. Braking in (0.0005 c) is a long battle. Guns and beams fire at most 30 s (heat).
- **Missiles** are launched in advance, one salvo per minute of window (at most 4). The other side's point defence, split by its plan between missiles and slugs, meets each salvo and stops what does not evade. Survivors hit at 85 % minus decoys.
- **Beams:** shots = rate × time in range; hits × accuracy × computers × (1 − decoys).
- **Kinetics:** hit chance / (1 + 8 v); damage × (1 + 50 v). Point defence against slugs stops some.
- **Plans:**
  - **priority:** warships, unarmed (transports), planetary defences, or spread fire;
  - **point defence:** against missiles, balanced, against slugs;
  - **formation:** wall +20 % fire / +10 % hits taken; column −15 % / −20 %; dispersed −10 % fire, −30 % missile hits;
  - **engagement:** fight, or evade (hold fire, 60 % of incoming).
- **Alert.** An attacker is always ready. A defender is **alerted** if its system saw a foreign plume or a net contact in the last 10 years, or its posture is *fortify*. Otherwise it is **surprised** and fights at half effect.
- **Both sides fire from their state before the pass;** damage lands by the firing side's priority, with 20 % overkill wasted.
- **Planetary defences** (*Orbital batteries*): a station with lasers, missiles and point defence, hull points growing with population. *Planetary field shields* halve beam damage.
- **Outcome:** attacker won, defender held, mutual destruction, or both survived.
  - Destroyed ships are removed; an empty fleet is gone.
  - A system whose defences fall, or whose defenders lose, loses its relay.
  - An attacker that **braked in and won bombards the colony**: 10 % of the people die, and its loyalty to its own empire falls by 10 points.

### Reports

- **The defender's system** reports home at once if still held.
- **An attacking fleet** reports when it next docks, or at once by ansible. A flyby raid's report comes home with it, often a century later.
- **Reports** are kept in the capital's knowledge (`knowledge.battles`), produce dispatches, and are shown in the **Battles** tab: a timeline of the engagement to scale around closest approach, and each side's plan, alert, fire and losses.

## Relativistic strikes

An **impactor** sent to *strike* a system flies by at 0.85 c and hits the world.

- **Interception.** Only an alerted system with point defence against slugs (interceptors, flechettes, debris screens, batteries) has any chance: up to 60 %, usually far less.
- **A hit** kills 85–100 % of the people, destroys the relay and everything docked there, and **scorches** the world. Colonists can only live there under domes afterwards.
- **Destroying a world is the gravest crime.** Its flash reaches every colony of every empire at light speed:
  - **the attacker's own colonies** lose 15 points of loyalty (shame);
  - **everyone else's colonies** lose 3 (fear);
  - **each empire's capital** learns of it when the flash reaches it or when the first of its colonies to see it sends word, and **holds a grievance** against the attacker (`knowledge.grievances`, shown in the overview).
- **An AI empire with a grievance:**
  - goes to war footing (warships *war*, readiness *fortify*);
  - raids the nearest known system of the wrongdoer within 20 ly with its home guard, one raid at a time, returning home afterwards;
  - never strikes a world itself.

## Technologies (M9)

Implemented targets: every `weapon.*` (components and the impactor), `ship.frigate`, `ship.cruiser`, `ship.stealthApproach`, `ship.pdLaser`, `ship.interceptors`, `ship.whipple`, `ship.battleComputer`, `ship.shielding`, `ship.decoys`, `ship.debrisScreen`, `sensor.net`, `defense.grid`, `defense.shield`.

New technologies (11):
- *Frigate spaceframes*, *Capital spaceframes*, *Cold-exhaust drives* (engines);
- *Sensor nets*, *Deep sensor nets* (communication);
- *Battle computers* (informatics);
- *Point-defence lasers*, *Planetary field shields* (energy);
- *Interceptor drones* (missiles);
- *Whipple shields*, *Orbital batteries* (projectile).

## Sandbox

- Both capitals start with a **Home Guard** of four pickets. Sol also has the **First Squadron** of three pickets for the player.
- Test sandboxes remove the starting warships unless a test asks for them (`sandbox(seed, { fleets: true })`).

## Tests

`tests/fleets.test.js`:
- flyby profiles (and that they survive JSON);
- voyages (normal, flyby home, strike, stealth);
- design stats, buildability and best design;
- build orders carrying their design;
- warship construction;
- combat windows, determinism and plan effects (evade, point-defence allocation, surprise);
- a braked attack with reports by light, and a flyby with the report waiting until the fleet docks;
- mailbox orders for a fleet in flight, and planned positions at the capital;
- sensor nets;
- a strike with shame, grievance and the AI's reaction;
- save/load mid-voyage.

## Later

- **M10 depth:** conquest (`transferPresence` is ready), blockades, fleets meeting in deep space, battle replays.
- **M11 depth:** sensor pickets and relay attacks as missions.
- **M14:** grievances feed diplomacy.
- **M15:** fuel scoops and light sails.
