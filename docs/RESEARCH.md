# Research module (M12)

Research is how an empire learns new technologies. It is built around the same constraint as everything else in the game: **knowledge travels no faster than light.** A technology works at a system only once it is known *there*.

## Areas

Ten areas, in display order (`src/data/tech/areas.json`):

| Area | Prefix | What it covers |
|---|---|---|
| Engines | `eng` | Drives, reaction mass, acceleration limits |
| Communication | `com` | Relays, sensors, the reach of the empire's voice |
| Informatics | `inf` | Computation, simulation, machine minds |
| Planetary science | `pla` | Surveying, living on and remaking worlds |
| Sociology | `soc` | Medicine, law and loyalty across light-years |
| Projectile weapons | `kin` | Coilguns to relativistic slugs |
| Energy weapons | `nrg` | Lasers, beams and the fields that stop them |
| Missiles and drones | `msl` | Ordnance that thinks, swarms and multiplies |
| Wormhole utilisation | `wor` | Finding, holding open and making wormholes |
| Exotic and alien | `xen` | Relics, alien minds, physics nobody taught us |

The content (126 technologies, including cryptography and interception since M12.1, see [SECURITY.md](SECURITY.md), and colony life since M5, see [COLONIES.md](COLONIES.md), and loyalty and robotic preparation since M6, see [POLITICS.md](POLITICS.md)) takes its mood from gothic hard SF (Alastair Reynolds and others). Names are original: sleeper cohorts, beta-level simulations, relic physics, vault ordnance, consensus networks, and signature discipline against whatever listens for noise.

## How research works

1. **Focus.** Each system researches the area its governor was told to (directive *Research › Research focus*, `research.focus`). The research screen sends this order to the whole empire or to the capital; like every order, it travels at light speed. With no focus, a system does not research.
2. **Progress.** A system earns research points from its people (M5, see [COLONIES.md](COLONIES.md)): `0.2 × log10(1 + population / 1000)` per year (about 1.4 for Sol's ten billion, 0.3 for a colony of 30,000), multiplied by its production focus and its research-rate technologies. `rules.capitalRate` and `outpostRate` remain only as a fallback for systems without a colony.
3. **Breakthrough.** The cost grows with each technology of that area already known there: `baseCost × costGrowth^n`. When progress pays it:
   - up to **three candidates** are drawn from the *frontier*: technologies of the area not known and not closed off, whose prerequisites are known here and whose conditions are met. Lower tiers are likelier;
   - **one is revealed**;
   - **the other applications are closed off** for the empire's own research. Theories drawn but not revealed stay open, because they are understanding rather than hardware (`rules.blockTheories`).
4. **Stalling.** If the frontier is empty, progress waits at full. The area needs prerequisites from other areas, and the screen says so.
5. **Closed-off technologies** can only be obtained by **purchase** (diplomacy, M14), **reverse engineering** of captured ships (combat, M10) or **espionage** (M14), through `acquireTech(world, ctx, { empire, system, tech, how })`. The research screen offers these as sandbox buttons until those modules exist.

## How knowledge spreads

- A breakthrough is known at once where it was made. Its blueprint travels **to the capital** by relay. The capital announces it (dispatch *Breakthrough at X*) and **passes it on to every system it knows it holds**.
- Ships carry the blueprints of the system they left (`fleet.blueprints`). A settler's new outpost starts with what its founders brought, and any ship arriving at one of our systems shares what it carries.
- Routine reports quote what each system knows and researches. The capital's research view (`src/perspective/research.js`) is built from its own lab plus those reports:
  - *known* — known at the capital;
  - *reported* — known elsewhere, blueprint on its way;
  - *available* — can be researched;
  - *needs condition*;
  - *closed off*;
  - *prerequisites missing*.

## What technologies do now

Effects are applied per system to `presence.capabilities` (`src/research/effects.js`). Other modules read those capabilities without depending on research:

| Target | Consumer | Effect |
|---|---|---|
| `drive.<tier>` | governors, fleets | ships built here get the best known drive |
| `relay.range` | info | this relay reaches further (a link exists if either end reaches) |
| `sensor.range`, `sensor.angle` | detection | this system sees plumes farther and in a wider cone |
| `plume.visibility` | detection | fleets launched here are seen from less far |
| `research.rate` | research | faster progress here |
| `crypto.cipher`, `crypto.decrypt` | security | cipher level of messages sent from here; decryption level of this listening post |
| `intercept.range`, `beam.spill` | security | how far this system listens; how much this relay's beam spills |
| `colony.capacity.<site>`, `colony.food`, `colony.closedFood`, `colony.growth`, `colony.industry` | colony | how many people a site holds, how well they eat, grow and work |
| `colony.mode.embryo`, `.ark`, `.cryo` | colony, governors | which colony ships can be built here |
| `risk.prion`, `risk.radiation`, `risk.crops`, `risk.unrest` | colony | chance (or harm) of each disaster |
| `planet.terraform`, `planet.processors` | colony | terraforming, and at double speed |
| `planet.ecopoiesis`, `planet.terraformSpeed` | colony | seeded worlds keep terraforming; terraforming speed |
| `colony.prepare`, `prepare.failure`, `prepare.time`, `prepare.headStart` | governors, colony | robotic preparation missions: whether, how reliable, how fast, how much terraforming they begin |
| `colony.instability` | colony | instability of embryo-born societies at founding |
| `loyalty.missions` | governors | cultural missions |
| `loyalty.push`, `loyalty.pull`, `loyalty.latency`, `loyalty.secession` | loyalty | pressures toward independence, yearly loyalty, estrangement by distance, chance of secession |

Other targets are declared now and take effect when their module arrives (`src/data/tech/targets.json`, `implemented: false`):
- `ship.*` — fleet design, M9;
- `weapon.*` — combat, M10;
- other `planet.*` — planets, M8;
- `population.*` — the nanotech plague, M16;
- other `loyalty.*` and `governor.*` — governance, M13;
- `espionage.*` — diplomacy, M14;
- `wormhole.*`, `relic.*`, `aliens.*` and `ansible.*` — events, M16.

The UI shows each effect with where it applies ("arrives with combat (M10)").

## Data format

One file per area in `src/data/tech/<area>.json`:

```json
{
  "area": "engines",
  "techs": [
    { "id": "eng.antimatter", "kind": "theory", "tier": 3, "requires": ["eng.nozzle", "nrg.particle"], "effects": [] },
    { "id": "eng.am-drive", "kind": "application", "tier": 4, "requires": ["eng.antimatter", "pla.containment"],
      "effects": [{ "kind": "unlock", "target": "drive.antimatter-1" }] },
    { "id": "xen.relic-physics", "kind": "theory", "tier": 4, "requires": ["xen.xenoarch", "nrg.xray"], "conditions": ["relic"], "effects": [] }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | `<area prefix>.<name>`; texts are `tech.<prefix>.<name>.name` / `.desc` in `src/i18n/locales/tech.<lang>.json` |
| `kind` | `theory` (abstract) or `application` (conditioned by theories) |
| `tier` | depth 1–6, used for layout and draw weights; a prerequisite's tier is never higher |
| `requires` | all must be known; may be in any area |
| `conditions` | world conditions also needed (`relic`, `aliens`; granted by events, or in the sandbox) |
| `effects` | `{ "kind": "unlock", "target": "..." }` or `{ "kind": "modifier", "target": "...", "op": "add" \| "mul", "value": n }` |
| `start` | known by every empire from the beginning |

The *influences* of a technology are derived rather than written by hand: the areas of the technologies it leads to, and the modules its effects act on.

### Adding or changing a technology

1. Add or edit the entry in its area file.
2. Add its name and description to `tech.en.json` and `tech.cs.json` (and any other locale).
3. If it acts on something new, add the target to `src/data/tech/targets.json` (with `implemented` and the consuming module), and read it in `src/research/effects.js` if it is a modifier the game already uses.
4. Run `npm test`. The catalogue tests check:
   - ids are unique and prerequisites exist;
   - there are no cycles, and no prerequisite is deeper than its dependant;
   - every application has a theory prerequisite;
   - every technology is reachable from the start technologies;
   - every effect target is registered, and every drive is researchable;
   - every text exists in every language.
5. Rules (costs, rates, number of candidates, whether theories can be closed off) are in `targets.json › rules`.

## Visualisation

The research screen (button *Research* in the top bar, or key **R**) has three columns:

- **Left:** the focus selector (whole empire or capital only), the capital's current area and progress (or "stalled"), all areas with *known / total* and how many systems report working on each (click one to highlight it), and the legend.
- **Centre: the technology web** (`src/ui/research/`). Tiers are columns, left to right, and each area is a horizontal band in its colour.
  - Shape: **theory = pill with italic label**, **application = sharp rectangle**.
  - State: known = filled; reported = half-filled; available = bright outline; current candidates = gold outline; needs condition = dotted; closed off = red dashed and struck through; prerequisites missing = dim.
  - Edges run from prerequisite to technology. Edges crossing areas are dashed in the colour of the source area.
  - Hovering a technology lights up its whole chain of prerequisites and consequences. Zoom with − / + / Fit.
- **Right: details** — description, state, prerequisites and what it leads to (clickable), effects and where they apply, influences, spread ("known at 3 of 9 systems"), how to obtain it, and sandbox acquisition.

The layout (`layout.js`) is a pure function and tested (no overlaps, correct columns and bands). The SVG is built once, and each refresh only changes classes, so hover and selection survive.

## Integration

- **Simulation:** `src/research/module.js` (registered after `governors`), plus `catalog.js` and `effects.js`.
- **Perspective:** `src/perspective/research.js`.
- **UI:** `src/ui/research/`.
- **Directive:** `research.focus`, now implemented, with options `none` plus the ten areas.
- **Save version 4.** Research records are created lazily for systems in older saves.
- **Tests:** `tests/research.test.js` (catalogue rules, capabilities, breakthroughs and closing off, stalling, conditions, rates, blueprint travel, relay and drive effects, acquisition, settlers carrying blueprints, the research picture, orders and determinism), `tests/researchLayout.test.js`, and research coverage in `tests/i18n.test.js`.

## The tree grows with the game

**Standing rule: every new module extends the research tree.** When a module is implemented:

1. Mark its targets in `targets.json` as `implemented: true` and consume them (usually through `presence.capabilities` in `effects.js`).
2. Add the technologies it needs, as theories and applications. Prefer prerequisites from other areas where they make sense. M12.1 (security), for example, added ciphers and codebreakers to informatics and listening arrays to communication.
3. Update the effect table above and the module's own document.

Planned additions:

| Module | Technologies to add |
|---|---|
| ~~M5 colonies~~ | done: life support, hydroponics, domes, shelters, flare forecasting, resilient crops, automation, asteroid mining, arcologies, machine nurseries, population genetics, prion therapeutics, gene banks, founding traditions, tutor intelligences |
| M8 planets | institutes, terraforming stages, orbital industry |
| M9 / M10 fleets and combat | hull classes, armour, point defence, battle computers, salvage and reverse engineering |
| ~~M6 politics~~ | done: common calendar, home broadcasts, developmental psychology, nursery curricula, surrogate minds, diaspora studies, federal compact, memetic engineering (charters and consensus now act on loyalty); seeder robotics, hardened robotics, microbial seeding, self-replicating builders, ecopoiesis, Gaian engineering |
| M13 governance | simulated governors, governor traits, reintegration |
| M14 diplomacy | agents, embassies, trade protocols, counter-intelligence |
| M16 events | relic studies per relic type, alien contact lines, wormhole engineering, ansible construction |

## Ideas for later

- Research institutes as buildings (M8) on top of the population-based rate.
- Espionage and trade as real channels for closed-off technologies, with their own delays.
- Reverse engineering after battles: salvage from a destroyed foreign fleet reveals one of its technologies.
- Alien relics (M16) granting `relic` at a specific system, so relic physics can only start there and spreads from there.
