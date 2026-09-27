# Star Empire: Game Design and Architecture

## 1. Vision and atmosphere

The mood sits between Alastair Reynolds' *Revelation Space* and *House of Suns*:

- **Deep time.** A game spans millennia. Colonies are founded, grow, drift apart and break away while their messages are still crossing the dark. The player is not one person but a long-lived institution seated at Sol.
- **Cold, hard physics.** Nothing moves faster than light: not ships, orders or news. Ships are huge and expensive. A braking drive plume seen across the dark is both a message and a threat.
- **Melancholy and scale.** Every report is a ghost of a moment that has already passed. The main tension is between what you know and what is true.
- **Impermanence.** No empire lasts forever. The question is not *whether* it falls but how long, how rich and how populous it was before it did.
- **Relics and the unknown.** Alien ruins, wormholes nobody built, weapons nobody understands.

The pace is a slower strategy game in the spirit of *Master of Orion*, but with realistic movement and light-speed information.

**Naming.** Factions are placeholders for now: Empire **A** (player), **B**, **C** and so on. Final names come later and should be original, inspired by Reynolds but not using his names.

## 2. Core principle: truth vs. belief

```
            ┌──────────────── WORLD (truth) ────────────────┐
            │ stars, planets, colonies, fleets, messages     │
            │ advanced by the simulation, never shown to UI  │
            └───────────────┬───────────────────────────────┘
                            │ information travels at c
                            │ (relay messages, detections, couriers)
                            ▼
   ┌─────────── KNOWLEDGE (per empire) ───────────┐
   │ snapshots: what + validAt + receivedAt + via │──► UI / renderer
   └──────────────────────────────────────────────┘      (player empire only)
                            │
     player directives ─────┘ travel at c from system to system,
                              get checked and executed where they arrive, when they arrive
```

- The **World** holds the true state. Only the simulation reads or writes it.
- Each empire (player and AI alike) owns a **KnowledgeBase** of snapshots: "at time `validAt` entity X looked like this; learned at `receivedAt` via `source`".
- **The UI renders only the player's KnowledgeBase**, so information leaks are impossible by construction.
- Information age appears everywhere: `age = now − validAt`, for example "last report: 11.4 years ago".
- **All reports are true.** There is no deception for now. Knowledge is only *old* or *missing*, never wrong.

## 3. Communication

### Relay stations and messages

- **Messages travel only between star systems**, at c.
- Every colonized system can have a **relay station**. A system with a working relay can **send**. Every system can always **receive**.
- **Relay range depends on technology**: about **20 ly** at the start, extended by research. A message for a system further away is **forwarded along a chain of relays**. Each hop moves at c, so the delay equals the length of the relay path, which can be longer than the straight-line distance. Messages are routed by the shortest path through the relay network the sender knows about.
- The relay network is strategic infrastructure. A system beyond the range of every relay can hear only when some sender's range reaches it, and a system that cannot report back is effectively cut off, which speeds up its drift (§6). Destroying a relay can break chains and force longer routes.
- If a relay is destroyed, the system goes **silent**: it keeps receiving directives but cannot report or forward until the relay is rebuilt. Silence is itself information. Each system has an expected report interval, and the UI flags "report overdue by N years".
- **Fleets cannot receive messages in transit.** A fleet gets orders only while it is in a system, from that system's mailbox. It therefore departs with **sealed orders**: route, objective, battle plan, fallback behavior and what to do on arrival.
- Fleets report through the relay of the system they are in. A fleet with no friendly relay stays silent until it reaches one, or until a battle is seen from afar.
- **Empire-wide directives** are sent to each system separately and arrive at different times. The UI shows the arrival front spreading through the empire.
- Directives carry an issue timestamp. If two arrive out of order, the newer issue time wins.

### How it is implemented (M3)

- `src/info/network.js` builds one empire's communication graph: relay-to-system radio links within range (delay = distance), local hand-over between a docked fleet and its system (no delay), and ansible links between ansible fleets and the hub at the capital (no delay). Wormholes are deliberately absent.
- Messages move hop by hop (`info/hop` events). At each node the route is recomputed from the current network, so a message waits (`stalled`) at a system whose relay is down, and continues when the relay is rebuilt or an ansible fleet docks there. A message addressed to a fleet that cannot be reached is lost.
- The capital's knowledge (`src/info/knowledge.js`) keeps, per system and fleet, the newest report by `validAt`. The UI draws either this knowledge or the truth through `src/perspective/picture.js`, never the world directly.
- Couriers load the latest status and any waiting messages at departure and release them at arrival, which is how news crosses a wormhole.

### Channels

| Channel | Speed | Content |
|---|---|---|
| Relay message | c | Detailed reports and directives, system to system. |
| Detection | c | Braking plumes, sensor-net contacts, battles, colony emissions. Coarse. |
| Courier ship | ship speed | Anything. The only information that can pass through a wormhole. |
| Ansible (rare) | instant | Paired device giving direct control of a fleet or system. |

## 4. Directives (the player's orders)

The player gives **general directives**, not micro-orders. Local governors (AI agents with traits) carry them out. Directives are grouped into categories with submenus:

| Category | Directives (examples) |
|---|---|
| **Economy** | Production focus (balanced, industry, mining, agriculture, research, shipbuilding); infrastructure priority; terraforming program. |
| **Military** | Warship construction level (none, defensive, steady, war footing); readiness (peace, vigilance, fortify, siege); build or rebuild relays, sensor nets and defenses. |
| **Expansion** | Send exploration toward a direction or star; colonize (target criteria: nearest, most habitable, richest, or a direction cone); settlement priority. |
| **Fleet operations** | Launch an attack, defense or escort fleet toward a system; patrol; intercept; assign a battle plan and fallback behavior. |
| **Logistics** | Deliver supplies, colonists, equipment or artefacts from system X to system Y, once or as a recurring convoy. |
| **Governance** | Autonomy level, tribute and taxation, influence actions (see §6), appoint a governor (a governor travels by ship). |
| **Research** | Research focus, blueprint distribution. |
| **Diplomacy** | Ambassador instructions (later milestone). |

- **Targeting:** one system, a set of systems, a region (a sphere around a star or a direction cone from a system), or empire-wide.
- **Properties:** priority, optional expiry date, and a condition ("if hostile ships are detected, then…").
- A governor *interprets* directives through its traits and local conditions. Low loyalty means directives may be delayed, partly followed or ignored.

### How directives work (M4)

- **Catalogue:** `src/data/directives.json` defines the categories, directives, parameters and defaults. Every directive also has *priority* (low/normal/high), *condition* (always / after a foreign plume is seen here / while no threat is seen) and *expiry*. Directives marked `implemented: false` (warships, deliveries, autonomy, economy, terraforming, research, diplomacy) are accepted and acknowledged, but do nothing until their module exists.
- **Issuing** (`src/governors/issue.js`): the player targets one system, our systems within a radius of a system, or the whole empire (as far as the capital knows its holdings). Each target gets its own message, so an empire-wide order spreads out as a front. Unreachable targets are reported at once.
- **Governors** (`src/governors/module.js`): one per held system. Each keeps a *book*: one standing directive per kind, where a newer order replaces an older one and a stale one never overrides. Once a year the governor:
  - drops expired orders and applies standing settings (posture, reporting mode, relay repair policy);
  - rebuilds a destroyed relay by policy (fortified systems twice as fast);
  - runs courier schedules;
  - gives its single shipyard slot to the most important proposal: by priority, then taking turns.
- **Behaviours** (`src/governors/behaviours/`), one file per directive type:
  - *explore:* scouts with a relay module fly to the nearest unexplored systems (optionally toward a system), report from where they arrive, and hop on;
  - *settle:* settlers found outposts. "Most habitable" and "richest" consider only surveyed systems, and a settler finds out on arrival if someone else got there first;
  - *send fleet:* a one-shot order;
  - *courier runs:* out and back on a schedule, carrying news.
- **Acknowledgement:** routine reports quote the governor's book. The capital's view of each order (`src/perspective/directives.js`) is therefore built only from what came back: *in transit* until the planned arrival, *awaiting report*, then *in effect* / *carried out* / *superseded*, or *unreachable* / *expired* / *revoked*.
- **Placeholders until the economy exists:** new ships appear without cost, one per system per 10, 20 or 40 years depending on frequency; relays are rebuilt after 4 or 12 years. Governors share the empire's survey records directly; later, survey records should travel with ships.

## 5. Movement and detection

### Flight profile

Ships accelerate at a constant rate up to cruise speed, coast, then turn and brake at the same rate. Constant-acceleration motion is simulated with closed-form relativistic formulas (1 g ≈ 1.03 ly/yr²).

**Both acceleration and cruise speed come from research:**

- **Cruise speed** starts at **0.1 c** and rises with drive technology to a maximum of **0.6 c**.
- **Acceleration** starts at **0.1 g** and rises with technology.
- Above **1 g**, flights cause **wear**: component damage and higher maintenance for ships, and health, morale and loyalty costs for crews and passengers. Sleeper holds reduce the crew cost. Each fleet's sealed orders pick its acceleration, trading warning time and arrival speed against wear.

| Tier | Burn time | Burn distance | Warning at destination* | Trip 4.4 / 10 / 20 ly |
|---|---|---|---|---|
| Start: 0.1 g, 0.1 c | 0.97 yr | 0.05 ly | ~11 months | 45 / 101 / 201 yr |
| Mid: 0.3 g, 0.3 c | 1.02 yr | 0.16 ly | ~10 months | 16 / 34 / 68 yr |
| Late: 1 g, 0.6 c | 0.73 yr | 0.24 ly | ~6 months | 8 / 17 / 34 yr |
| Late, with wear: 3 g, 0.6 c | 0.24 yr | 0.08 ly | ~2 months | 7 / 17 / 34 yr |

\*Braking time minus light-travel time of the braking-start flash: the only warning a system without a sensor net gets.

At cruise speed, high acceleration mostly shortens the *warning*, not the trip, which is why it is a tactical choice. Crew time dilation (γ = 1.25 at 0.6 c) is tracked as flavor: crews age less than the empire.

### Detection rules

- **Coasting ships are dark.** They cannot be detected, except by a **sensor net** in range.
- **Braking makes a ship visible.** The plume points forward, at the destination and anything near that line. The destination sees it with light delay, which gives the short warnings in the table above.
- **Launch burns** point the plume back toward the origin, so they are visible from the origin and systems behind it (usually your own space).
- **Sensor nets:** installations at a system, or pickets placed in interstellar space, that detect coasting ships within a radius set by technology. Their detections also travel home at c.
- **Flyby raids:** a fleet that never brakes is never seen by its target, but it passes through at 0.6 c with only seconds to fire and cannot stop or occupy. A fleet that brakes can take a system but announces itself months ahead.
- **Docked fleets are in plain sight.** A system's routine report lists every fleet docked there, foreign ones included.

### How detection is implemented

- `src/detection/module.js` schedules an event at the start of every burn (launch and braking, plus the braking leg of a redirect). At that moment it tests every held system: visible if it lies within **25 ly** and within **35°** of the exhaust direction (values in `src/data/sensors.json`; sensor technology will raise them). The light reaches the observer at c, and the observer then sends a *sighting* report to its capital through the relay network, like any message.
- A sighting records the burn position, direction of motion, phase, the drive's empire signature (identity only for own fleets) and the system the burn points at. Sensor nets for coasting ships are still to come (M11).

### What the player sees about fleets

The map and panels always say how a fleet's position is known:

| Certainty | Meaning | Drawn as |
|---|---|---|
| live | ansible link, or at the capital | solid diamond |
| confirmed | docked, reported by the system's relay | solid diamond |
| expected | in transit, predicted from the departure report | hollow diamond on the planned route, grey dot and dotted line to where it was last reported |
| unconfirmed | past its planned arrival, no arrival report yet | red hollow diamond |
| actual | Truth view (sandbox) | solid diamond; orange streak while engines burn |

An arrival is confirmed only when the relay of the system reached reports it, one light delay later. A fleet arriving where there is no relay stays unconfirmed unless it carries an ansible. A braking plume seen at the destination is shown as extra evidence ("braking seen"), but it is not a confirmation.

## 6. Loyalty, drift and dissolution

Every colony has a **loyalty** value that drifts over time:

- **Pushes toward independence:** communication latency (round-trip time to the capital), years since the last ship or governor visit, heavy tribute, neglect during war or crisis, a large and self-sufficient population, a distinct local culture that grows with time and distance.
- **Pulls toward the empire:** prosperity, garrison, investment convoys, cultural and influence missions, an appointed governor, shared threats, dependence on imported goods.
- **Stages:** Loyal → Restless → Autonomous (follows only some directives, pays reduced tribute) → **Seceded** (becomes an independent faction run by the AI).
- **Player tools:** influence missions, garrisons, investment, appointing or replacing governors, and *granting autonomy*. Granting autonomy slows drift but loosens control. Seceded worlds can be won back by diplomacy or force.

**Losing the capital.** If the capital system is lost, the empire does not end, but it weakens:

- Loyalty drops across the empire, and the drop reaches each system when news of the fall arrives there.
- Directives lose authority until a new seat of government is proclaimed at another system, which then carries a legitimacy penalty.
- Rebellions break out, and **rebel factions form**. A faction can hold several systems and is run by the AI.

**Dissolution.** The empire *will* fall eventually, through secession cascades, war, internal decay or catastrophe. **The game ends when no system remains under the empire's control.** Until then even a rump state of one system keeps adding to the Legacy.

**Score: the Legacy.** Throughout the game the empire's history is recorded:

- **Longevity:** years from founding to dissolution.
- **Prosperity:** integral of economic output over time.
- **Population:** integral of population over time, plus peak population.
- **Reach:** peak number of systems and peak extent in light-years.

The end screen is a **Chronicle**: a timeline of the empire "as it really happened", compared with what the capital knew at each moment. Scores go into a local hall of records.

## 7. Units and scale

- Distance in **light-years** at galactic scale and **AU** in systems. Time in **years**. **c = 1 ly/yr**, so light delay equals distance.
- The universe uses real stars from the **HYG star catalogue** (license and attribution in §11). The map is **50 ly around Sol** at first (roughly 1,500–2,000 stars), and may grow later. The catalogue build script takes the radius as a parameter.
- Pacing: early 0.1 c ships need about a century per 10 ly, so the first centuries are slow expansion. Later drives shrink distances, and then colony development (centuries to self-sufficiency) and drift set the pace.
- Known exoplanets come from real data where available; everything else is generated procedurally from a seed per star.
- **Time model:** a **continuous, event-driven simulation** with pause and adjustable speed (from about 1 day/s up to decades per second). The game can auto-pause on important dispatches.

### Starting situation and opponents

- The player (Empire A) starts at **Sol**.
- **Opponents at the start are human**: other human polities (Empires B, C and so on) with their own seats elsewhere in the bubble, plus rebel factions that form during the game.
- **Aliens come later**, through the events module: relics first, then living alien powers.

## 8. Modules

Each module is a folder under `src/`. Simulation logic is kept separate from its UI. Gameplay modules never import rendering code.

### Foundation

| Module | Responsibility |
|---|---|
| `core/` | Game clock, discrete-event scheduler, seeded RNG, vector math, IDs, event bus, serialization. |
| `sim/` | World container, module registry, main loop, save/load. |
| `info/` | Relay messages, relay network and chain routing, system mailboxes, light-speed propagation, KnowledgeBase, exploration records, overdue-report tracking. |
| `detection/` | Drive-plume sightings (and later sensor nets), reported to the capital like any message. |
| `perspective/` | Read-only views for the UI: what an empire knows (`knowledgePicture`) or the truth (`truthPicture`), star status classification, shared descriptions. |
| `empire/` | Empire state, capital, presence and relays, exploration records (later: loyalty and secession, Legacy score). |
| `governors/` | Directive catalogue, issuing and revoking, governors' books, behaviours (explore, settle, send fleet, courier runs, standing settings). |

### Gameplay

1. **`galaxy/`: interstellar space (3D).** Star catalogue, systems as nodes, ships on constant-acceleration trajectories, messages at c. It shows ships at their last detected position with a predicted path, and systems with the age of their last report.
2. **`system/`: star system (3D).** Keplerian orbits on rails. Used for system management and as the stage for battles.
3. **`planet/`: planet management.** Surface and orbital installations, population, habitability and terraforming, production chains.
4. **`fleet/`: fleets and ship design.** Hulls and components, fleet composition, sealed orders, transit planning.
5. **`combat/`: engagement planning.** Battles are decided in seconds at relativistic closing speeds. The player prepares formations, approach vectors, weapon schedules and point-defense priorities as part of a fleet's sealed orders. A deterministic high-resolution simulation resolves the crossing, and the report travels home at c.
6. **`research/`: technology.** A tab of the Empire screen plus a galaxy overlay. Research happens at specific worlds, and **blueprints propagate at c** through relays before other colonies can use them. Key early lines are drive technology (acceleration and cruise speed), relay range and wear tolerance.
7. **`diplomacy/`: ambassadors.** Written instructions (goals, concessions, red lines). The ambassador negotiates locally, and treaties take effect at each system when the news arrives there.
8. **`economy/`: resources and trade.** A rich resource model per body. Habitable and terraformed worlds are the main source of food and population. Interstellar trade is slow, expensive cargo hauling, worth it only for rare goods.
9. **`events/`: special events.** Wormholes (ships pass instantly, messages do not, so couriers become a faster-than-light channel), alien relics and technology, unique weapons, ansibles.
10. **`ai/`: other factions.** Rival empires and seceded colonies, playing under the same rules and the same fog.

### Presentation

| Module | Responsibility |
|---|---|
| `render/` | Three.js scenes (galaxy, system, battle replay) in one vector style. |
| `ui/` | Screens, directive menus, panels (DOM, plus SVG for 2D diagrams). |
| `data/` | JSON content: star catalogue, resources, recipes, components, techs, directive definitions, events. |

### Screens

- **Galaxy** (main): 3D map, time controls, messages and detections in flight. Stars can be coloured by **spectral class** (labels show spectral types), by **status** as the empire knows it (capital, outpost with relay, outpost without relay, relay down, foreign, explored, unexplored), or by **information age**. The legend shows counts and highlights categories when clicked. A panel describes each star (spectral type, colour, temperature, luminosity); survey results are shown only once a system has been explored.
- **Dispatches**: inbox and outbox, each entry showing *when it happened* and *when it arrived*.
- **Directives**: category → submenu → target → parameters, plus a list of directives in flight and their arrival fronts.
- **System**, **Planet**, **Fleet** (design, sealed orders, battle plans).
- **Empire**: research, governors, loyalty map, Legacy statistics.
- **Diplomacy**, and the **Chronicle** (end of game).

## 9. Module contract

Implemented in `src/sim/module.js` and `src/sim/simulation.js`. A module is a plain object:

```js
export const colonyModule = defineModule({
  id: 'colony',
  dependsOn: ['galaxy'],               // must be registered earlier in src/app/modules.js
  initState(world, ctx) { return {} }, // becomes world.state.colony (new game only)
  start(world, ctx) {},                // after every initState: schedule first events
  tick(world, dt, ctx) {},             // fixed step (one month by default): growth, economy, loyalty
  handlers: {                          // scheduled events; keys must start with 'colony/'
    'colony/founded'(world, payload, ctx) {},
  },
  listeners: {                         // notifications from any module, e.g. ctx.notify('fleet/arrived', ...)
    'fleet/arrived'(world, payload, ctx) {},
  },
});
```

`ctx` provides `now`, the seeded `rng`, `scheduleAt` / `scheduleIn`, `notify` (to other modules and the UI), `requestPause` (auto-pause), `newId`, and static `data` such as the star catalogue.

- World state is plain JSON. Static content (the star catalogue, content tables) lives in `ctx.data`, not in saves.
- Events at the same instant run in scheduling order, and events run before a tick at the same instant. Results do not depend on frame rate or step size: the tests check that the same seed gives the same state hash, and that a game saved and reloaded continues identically.
- Directive handling (§4) will be added to the contract in M4.

## 10. Technology

### Libraries

| Need | Choice | Why |
|---|---|---|
| 3D (galaxy, systems, battle replay) | **Three.js** | The standard WebGL library for the web: mature, well documented, tree-shakable, and has the add-ons this style needs. Babylon.js is heavier and aimed at game-engine features we don't use; raw WebGL or regl would mean writing that plumbing ourselves. |
| Camera | `three/addons` **OrbitControls** | Orbit, zoom and pan around a selected star. |
| Text labels | `three/addons` **CSS2DRenderer** | Crisp DOM text that follows 3D points, styled with CSS. |
| Thick and dashed vector lines (later) | `three/addons` **Line2 / LineMaterial** | Constant-pixel-width and dashed lines for paths, uncertainty and info age. |
| Stars | Custom `THREE.Points` shader | One draw call for thousands of stars, drawn as crisp anti-aliased discs. |
| 2D screens (planet, production chains, tech tree, battle plans) | **Plain SVG** | Vector by nature, stylable with CSS, no dependency. If layouts get hard, add **d3-hierarchy** or **d3-force** for layout only. |
| UI panels | **Plain DOM modules** | Small, explicit components. No framework until the UI proves it needs one. |
| Build and dev server | **Vite** | Static output for GitHub Pages; fast dev reload. |
| Tests | **Vitest** | Same module system as Vite; runs the simulation headless in Node. |
| Quality | **ESLint** + **TypeScript checker on JSDoc** (`npm run typecheck`) | Type safety without a TypeScript build step. ESLint also enforces the layering rule below. |

### Layering

```
core/  ←  sim/  ←  gameplay modules (galaxy/, fleet/, info/, empire/, ...)
                          ↑ read-only
                   render/ + ui/   (presentation)
                          ↑
                       main.js     (wires everything together)
```

- `core/`, `sim/` and gameplay modules are **headless**: no DOM, no Three.js. ESLint rejects such imports.
- Presentation reads simulation state and sends commands. It never mutates the world directly.
- `main.js` is the only place that knows about every layer.

### Internationalization

- Every text the player sees lives in `src/i18n/locales/<lang>.json`, which currently holds English and Czech. Code refers to texts by key; `t(key, params)` interpolates `{name}` placeholders and chooses plural forms (`one` / `few` / `many` / `other`) by the locale's rules. Missing keys fall back to English.
- Numbers, years, durations and distances are formatted per locale (`src/i18n/format.js`), so Czech gets decimal commas and its own unit abbreviations.
- **Content and control are separate.** Simulation code never produces text: dispatches, pause reasons and errors are keys with parameters (system ids, fleet names), and `GameError` carries a key. Data files (directives, drives) hold ids, not names. The UI turns all of these into sentences (`src/ui/text/`). The renderer only places labels the UI gives it.
- **Enforced:** ESLint forbids importing i18n from simulation folders. Tests check that every locale has exactly the English keys and placeholders, that every directive, option, status, drive, error and produced dispatch has a text, and that UI and rendering code contain no English sentences.
- **Adding a language:** copy `en.json`, translate it, and register it in `src/i18n/index.js`. The tests list anything missing.
- Changing the language in the top bar reloads the page. The running game is stashed and resumes where it was.

### Other

- Saves in localStorage (IndexedDB later if saves grow), plus JSON export and import.
- **Style:** modernist and vector-based. Dark background, one accent hue per faction, monospace labels, thin strokes. Information age is shown by desaturation and dashes. All colours live in `src/render/theme.js`.

## 11. Data and licensing

- Star data comes from the **HYG Database** by David Nash / astronexus (<https://github.com/astronexus/HYG-Database>), which is licensed **CC BY-SA 4.0**. We use HYG v4.1; the build script records the version in the data file.
- `tools/build-star-catalog.js` produces `src/data/stars.json`. That file is a derivative work, so it ships under the same CC BY-SA license, with attribution in `src/data/README.md`, the main README and the in-game credits screen.
- Game code is licensed separately (license still to be chosen).

## 12. Settled decisions

- Orders are general directives, grouped by category, carried out by governors.
- Colonies drift and can secede; the player can influence them.
- Ships use constant acceleration: 0.1 g at the start, higher with research, with wear above 1 g. Cruise speed runs from 0.1 c up to 0.6 c with research. Ships are visible when braking, or to sensor nets.
- Messages go only between systems. Relay range starts at about 20 ly and grows with technology; relay chains forward messages further. A destroyed relay stops sending but not receiving.
- No false reports.
- Millennia-scale game with a slow, *Master of Orion*-like pace in continuous time, with pause and speed-up.
- Losing the capital weakens the empire and triggers rebel factions. The game ends when no system remains. Score is the Legacy, with no victory points.
- Map: 50 ly around Sol to start.
- Opponents: human polities at the start, aliens later.
- Real stars from HYG, with attribution.
- Factions named A, B, C for now.
