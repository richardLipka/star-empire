# Star Empire: Implementation Roadmap

Implementation is step by step.

**Status:** M0–M4, M12 (research) and M12.1 (communication security) done, with the M3.1 quality pass and internationalization. Next: see "Suggested next steps" below. Each milestone ends in a runnable, tested state and adds one module or layer. See [DESIGN.md](DESIGN.md) for the design.

## Target directory layout

```
star-empire/
├─ index.html
├─ package.json            # vite, three, vitest
├─ tools/
│  └─ build-star-catalog.js  # HYG CSV → src/data/stars.json (run once, output committed)
├─ src/
│  ├─ main.js              # wires sim, rendering and UI together
│  ├─ app/                 # game host, module list, scenarios
│  ├─ core/                # scheduler, rng, vec3, ids, event bus, serialize, units, time
│  ├─ sim/                 # world, module contract, simulation loop, clock, save/load
│  ├─ galaxy/              # star catalogue, traits, spectral descriptions, measuring
│  ├─ empire/              # empires, presence, relays, exploration (later: directives, loyalty)
│  ├─ fleet/               # flight physics, legs, trip planning, fleets
│  ├─ info/                # relay network, messages, knowledge, orders
│  ├─ detection/           # drive-plume sightings (later: sensor nets)
│  ├─ events/              # wormholes (later: relics, alien tech, ansible rarity)
│  ├─ perspective/         # knowledge/truth pictures, star status, shared descriptions
│  ├─ system/  planet/  economy/  combat/  research/  diplomacy/  ai/   # later milestones
│  ├─ render/              # three.js: viewport, galaxy view, star appearance, overlay/ layers
│  ├─ ui/                  # shell, galaxy screen, map controls, panels/, time, saves, dispatches
│  └─ data/                # stars.json (+ README with CC BY-SA attribution), drives, sensors
└─ tests/                  # mirrors src/, headless simulation tests
```

---

## Phase 1: Prototype, "Expansion under delay" (v0.1)

**Goal:** Empire A starts at Sol and expands by colony ships. Colonies grow and build more colony ships under general directives. Everything the player sees is delayed by light speed.

### M0: Scaffolding
- Vite + Three.js + Vitest, ESLint, JSDoc `@ts-check`.
- Folder skeleton and an empty dark page with a canvas. Scripts: `npm run dev`, `test`, `build`.
- GitHub Actions for tests. Optional deploy to GitHub Pages (needs a paid plan for a private repo); otherwise run the build locally.

### M1: Simulation core (`core/`, `sim/`)
- Game clock in years. Continuous time with pause and adjustable speed (about 1 day/s up to decades per second), plus auto-pause on important dispatches.
- Discrete-event scheduler (binary heap), fixed-step tick for growth.
- Seeded RNG, vec3, IDs, event bus; plain-JSON world state; module registry; save/load plus JSON export.
- **Tests:** event ordering, determinism (same seed gives the same state hash), save/load round trip.

### M2: Universe and galaxy map (`galaxy/`, `render/`)
- `tools/build-star-catalog.js`: HYG → stars within 50 ly (with a map-size option), multiple stars grouped into systems, spectral class and luminosity. Writes `src/data/stars.json` and `src/data/README.md` with CC BY-SA attribution. Adds a credits line to the README and the game.
- Procedural per-system placeholders seeded by star ID: habitability, resource richness.
- 3D galaxy view: vector star points by spectral class, labels, reference plane, drop lines, orbit camera, selection.
- Measuring tool: distance, light delay, and trip time for the current drive technology.
- *Done:* 846 systems (982 stars) within 50 ly, galactic coordinates, placeholder traits, relativistic flight model (`src/fleet/flight.js`) and drive tiers (`src/data/drives.json`).

### M3: Information layer (`info/`, `empire/`, minimal `fleet/` and `events/`) ✔
- Relay stations per system (send and forward only while intact; receive always). Relay range from technology (20 ly at the start). Messages from system to system at c, routed hop by hop along relay chains; the route is recomputed at every relay, so messages wait at a dead relay and continue when it is rebuilt.
- KnowledgeBase per empire (`validAt`, `receivedAt`, `via`, hops). Routine reports every year, fleet departure and arrival reports, overdue flags for silent systems.
- Pulled forward to test the information layer end to end (minimal versions, extended in later milestones):
  - Fleets on relativistic flight legs; launched by an order that must first reach the launching system; no messages in transit.
  - Ansible fleets: instant link to the capital hub, live position, can be redirected in flight (brake, then fly to the new target), and connect an outpost they are docked at.
  - Wormholes: ships jump instantly, messages cannot; couriers carry reports and waiting messages through, so news can beat light.
- Perspective layer (`src/perspective/picture.js`): the map draws either what Empire A knows (old, predicted) or the truth (sandbox).
- UI: info-age colours and labels, relay network, range spheres, messages in flight, fleets with confirmed and predicted positions, wormholes, dispatch log, intelligence panel, sandbox tools, pause on dispatch.
- Sandbox scenario with 60 years of warm-up history: a three-hop chain to Deneb Algedi, Vega only via 61 Cygni or Altair, Arcturus beyond every relay.
- **Tests (54):** light-delay timing, relay chains and hop timing, receive-without-relay, lost and rebuilt relays, fleet profiles and reports, ansible redirect and connection, wormholes and couriers, knowledge vs truth pictures, determinism with save/load.

### M3.1: Quality pass ✔
- Code review: side panel and map overlay split into small modules (`src/ui/panels/`, `src/render/overlay/`); lint rule keeps all simulation folders headless; per-empire pause-on-dispatch; fleet names per empire; save migration v1 → v2.
- Drive-plume detection (`src/detection/`), pulled forward from M5: burns seen only inside the exhaust cone, light to the observer, then a relay report home.
- Empire B in the sandbox (capital Epsilon Indi), unknown to A; sandbox tool to launch a B fleet.
- Fleet certainty (live, confirmed, expected, unconfirmed, actual) in the map, labels and panel; arrival confirmed only by the destination's relay report. Routine reports refresh docked fleets and reveal foreign fleets at our systems.
- Exploration records (truth and knowledge); survey shown only for explored systems.
- Map colour modes (spectral class, status, info age) with legend counts, highlighting and a symbol key; spectral descriptions for every star.
- Bugs fixed: luminosity class parsing ("III" read as supergiant), repeated pause toasts, docked-fleet reports ageing forever.
- **Tests (68)**, including plume geometry, detection timing and warning, own-fleet certainty transitions, foreign fleets at our systems, status classification, spectral descriptions and save migration.

### M4: Directives engine and governors (`governors/`, `i18n/`) ✔
- Data-driven catalogue (`src/data/directives.json`): 8 categories, 17 directives. Working now: explore, settle, readiness, send fleet, courier runs, reporting mode, relay maintenance. Accepted but not yet effective: warships, deliveries, autonomy, economy focus, terraforming, research focus, diplomatic stance.
- Common parameters: priority, condition (threat seen / no threat), expiry. Targets: one system, a region, or the whole empire, as far as the capital knows its holdings.
- Governors keep a book per system. Newer orders replace older ones. The yearly round handles expiry, standing settings, relay repair, courier schedules, and a shared shipyard slot (by priority, then in turn).
- Scouts and settlers carry relay modules; settlers found outposts with relays. The relay network grows with the empire (in the sandbox, 41 outposts after about 450 years, and isolated Arcturus got connected).
- The capital's view of every order is built only from reports: in transit, awaiting report, in effect, carried out, superseded, unreachable, expired, revoked.
- UI: Orders tab (composer by category, target, parameters, sandbox "apply instantly"; issued list with status chips and revoke), Governor section per system (as last reported), fleet roles, fleet labels thinned by label mode.
- Internationalization: all texts in `src/i18n/locales` (English, Czech), locale formatting, simulation emits keys only, language switch that resumes the game. Enforced by a lint rule and tests.
- Save migration v2 → v3.
- **Tests (96)**, including delivery timing and acknowledgement, fronts and unreachable targets, replacement, revocation and expiry, reporting modes, relay repair policies, explore, settle (and failure), priorities and rotation, conditions, courier runs, determinism over 250 years, locale completeness and placeholder parity, and a hard-coded-text scan.

### M5: Colonies and production (`colony/`) ✔
- See [COLONIES.md](COLONIES.md).
- **Star systems for every star** (`galaxy/planets.js`):
  - known systems are hand-authored (`data/systems.json`); the rest are generated from the spectral class;
  - bolometric habitable zones; habitable worlds rare and never around giants; tidal locking for close-in worlds of red dwarfs.
- **Colonies in every held system:**
  - site choice from habitable world (large bonus) to terraformable, domed hostile world and orbital base (always possible);
  - logistic growth, food, materiel, research output (it replaces the fixed research rates);
  - terraforming.
- **Disasters** (prions, stellar flares by star class, crop and life-support failures, unrest). Small young colonies are fragile, and a colony can die out and lose its system.
- **Colonisation modes:**
  - embryo ships at the start, raising strange, unstable societies;
  - generation arks;
  - cryo sleepers.
- **Ships cost materiel.** The shipyard builds what it can pay for, and fleet orders wait for materiel. *Economy › Production focus* and *Terraforming* are now in effect.
- **15 new technologies and 6 remapped ones.**
- **UI:** people section, survey orrery, population in the overview, colony dispatches, sandbox toggles.
- Save migration v5 → v6.
- **Tests (156).**
- **Still open (moves to M6/M8/M17):**
  - Military › warships;
  - build times;
  - the Legacy stats panel.

### M6: First rival and first drift (`ai/`, `loyalty/`, `empire/`) ✔
- See [POLITICS.md](POLITICS.md).
- **Empire B is played by the AI:**
  - from its own capital's knowledge, only through directives;
  - research, expansion, robotic preparation, food, cultural missions, autonomy;
  - personalities.
- **Loyalty per colony:**
  - pushes: distance, neglect, instability, hardship, self-sufficiency, disasters;
  - pulls: belonging, prosperity, orders, cultural missions, technology.
- **Stages:** restless (ignores low-priority orders), autonomous (refuses orders), independence. The new polity gets the next faction letter, keeps people and knowledge, is joined by autonomous neighbours, is played by the AI, and news of it reaches the capital by light. Refused orders show as refused.
- **Capitals that die out** move their seat; a polity with no system left dissolves.
- **Robotic preparation missions:**
  - seeders prepare sites for colonists (big bonuses, especially for embryo ships), and can fail, often silently;
  - colonists expecting a prepared site may land on an unprepared one;
  - *Settle › prepared sites*.
- **14 new technologies:**
  - sociology: loyalty, embryo societies;
  - planetary: seeding and terraforming for embryo colonies.
  - Charters and consensus now act on loyalty.
- **Map colour modes** *Politics* and *Economy*; loyalty in the People section; forces in *Truth*; overview counts; sandbox tools.
- **Performance:**
  - routes memoized per network;
  - networks cached across time unless ansibles fly;
  - fleet index for snapshots;
  - cheaper report extensions.
  - A 500-year sandbox with two AI empires runs in about 3 s headless.
- Save migration v6 → v7.
- **Tests (174).**
- **Still open:**
  - loss of the capital as an empire-wide loyalty shock (M13);
  - the Chronicle screen (M17);
  - contested targets beyond first-come (M10).

---

## Phase 2: Depth, one module per milestone

| # | Milestone | Main content |
|---|---|---|
| M7 | `system/` | Kepler orbits on rails, real and generated planets, 3D orrery, system screen. |
| M8 | `planet/` + `economy/` | Deposits, surface and orbital installations, production chains, food and population, terraforming. The colony model migrates here. |
| M9 | `fleet/` | Hulls and components, ship designer, fleet organization, full sealed-orders editor, acceleration choice with wear above 1 g. Economy › shipbuilding, Military and Logistics directives. |
| M10 | `combat/` | Battle-plan editor, deterministic crossing simulation, flyby raids vs. braking assaults, battle reports home at c, vector replay. |
| M11 | Detection depth | Sensor nets and pickets, relay destruction and rebuilding, Military › readiness and fortify directives. |
| M12 ✔ | `research/` | Done early, see [RESEARCH.md](RESEARCH.md): 10 areas and 87 technologies as data (112 since M5). Breakthroughs reveal one of three candidates and close off applications. Blueprints travel by light and with ships. Effects on drives, relay range, sensors, plume visibility and research rate. Tech-web screen. |
| M13 | Governance depth | Governor traits, appointment by ship, influence missions, granting autonomy, reintegrating seceded worlds. |
| M14 | `diplomacy/` | Factions, embassies, ambassador instructions, treaties taking effect on arrival. |
| M15 | Trade and logistics | Cargo hauling of rare goods, recurring convoys (supplies, people, artefacts). |
| M16 | `events/` | Wormhole discovery and knowledge (basic wormholes exist since M3), alien relics and technology, unique weapons, ansible rarity and construction. First alien powers enter the game here. |
| M17 | Game shape | Full Legacy scoring, hall of records, full Chronicle, onboarding scenario, balancing. |

### M12.1: Communication security ✔
- Interception of radio hops by foreign systems within the beam spill; cipher vs decryption levels; traffic analysis reveals foreign systems; read reports, fleet movements and orders; stolen blueprints. See [SECURITY.md](SECURITY.md).
- Orders by courier (slower, cannot be overheard); ten new technologies (ciphers, cryptanalysis, codebreakers, quantum keys, tight beams, listening arrays, agents).
- Security map layer (exposed links) and counts; the capital sends missing blueprints to systems that lack them.
- **Tests (134).**

## Suggested next steps (after M6)

In this order, because each one makes the next meaningful:

1. ~~M5 Colonies and production~~ done.
2. ~~M6 Loyalty and drift, plus AI for Empire B~~ done. Empire B gets governors and its own directive-issuing AI, using the same modules as the player. Colony loyalty is driven by latency, neglect and prosperity. This is the core tension of the design, and the governors module already provides the hooks (books, settings, the "autonomy" directive).
3. **M9 Fleets (ship design and sealed orders), then M10 combat.** Once rivals expand, contested systems need warships and battle plans. Detection (M3.1) already gives the warning times.
4. ~~M12 Research~~ done. What remains for research: real output from institutes (M8), and trade, espionage and salvage as channels for closed-off technologies (M10, M14).
5. **M7 Star systems and M8 planets.** Bodies already exist (M5). What remains: Kepler orbits and a 3D system view, installations per body, resources beyond materiel, food and colonists moving between systems.
6. **Early infrastructure work (can start any time):**
   - a performance pass for many fleets: spatial index for detection, fewer notifications;
   - a first onboarding / tutorial scenario;
   - survey records that travel with ships instead of being shared instantly between governors.

## Working rules

- Simulation code never touches the DOM or Three.js, and every sim feature gets headless tests.
- The UI reads only the player's KnowledgeBase, never the World.
- Content lives in `src/data/*.json`, not in code.
- One milestone at a time: finish, test, commit, then move on.
- Commits carry no AI co-author trailers.
- Every new module extends the research tree (see RESEARCH.md, "The tree grows with the game").
