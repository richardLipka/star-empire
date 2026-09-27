# Star Empire: Implementation Roadmap

Implementation is step by step.

**Status:** M0–M3 done, plus the M3.1 quality pass (detection, rival, map views). Next: M4, the directives engine. Each milestone ends in a runnable, tested state and adds one module or layer. See [DESIGN.md](DESIGN.md) for the design.

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

### M4: Directives engine, first slice (`empire/`, `ui/`)
- Directive model: category, type, target (system, set of systems, region or cone, empire-wide), parameters, priority, expiry, issue time.
- Data-driven directive definitions in `src/data/directives.json` feed the category and submenu UI.
- Governors: a simple AI that turns active directives into local actions.
- Prototype directives: **Economy › production focus (growth / shipbuilding)** and **Expansion › colonize (nearest / most habitable / direction cone)**.
- The arrival front of empire-wide directives is shown on the galaxy map.

### M5: Colonies and colony ships (`colony/`, `fleet/`)
- Colony: population, industry, one abstract resource ("materiel"), growth driven by habitability. Centuries to self-sufficiency.
- Colony ship with sealed orders (target plus fallback). Relativistic constant-acceleration profile using the starting drive (0.1 g, cruise 0.1 c); acceleration and cruise speed are parameters, ready for research later. Founds a colony on arrival.
- Galaxy view: detected braking plumes as flashes (own fleets with predicted paths exist since M3).
- Stats panel with running Legacy components (years, population, output, systems).
- **v0.1 done:** the player sets directives and watches the empire spread through a delay they can feel.

### M6: First rival and first drift (`ai/`, `empire/`)
- Human Empire B starts at another star with the same rules and the same fog. Contested colony targets. Braking detections of each other's ships.
- Basic loyalty: latency and neglect push, prosperity pulls. Stages Loyal → Restless → Autonomous → Seceded; a seceded colony becomes an independent AI faction.
- Loss of the capital: empire-wide loyalty shock arriving with the news, proclaiming a new seat, rebellions forming multi-system factions.
- Dissolution when no system remains, and a first simple Chronicle screen.
- This proves that fog of war and drift both matter before the game gains depth.

---

## Phase 2: Depth, one module per milestone

| # | Milestone | Main content |
|---|---|---|
| M7 | `system/` | Kepler orbits on rails, real and generated planets, 3D orrery, system screen. |
| M8 | `planet/` + `economy/` | Deposits, surface and orbital installations, production chains, food and population, terraforming. The colony model migrates here. |
| M9 | `fleet/` | Hulls and components, ship designer, fleet organization, full sealed-orders editor, acceleration choice with wear above 1 g. Economy › shipbuilding, Military and Logistics directives. |
| M10 | `combat/` | Battle-plan editor, deterministic crossing simulation, flyby raids vs. braking assaults, battle reports home at c, vector replay. |
| M11 | Detection depth | Sensor nets and pickets, relay destruction and rebuilding, Military › readiness and fortify directives. |
| M12 | `research/` | Tech tree on the Empire screen, research worlds, blueprints spreading via relays, galaxy overlay. Drive tiers (0.1 g / 0.1 c up to 0.6 c), relay range, wear tolerance. |
| M13 | Governance depth | Governor traits, appointment by ship, influence missions, granting autonomy, reintegrating seceded worlds. |
| M14 | `diplomacy/` | Factions, embassies, ambassador instructions, treaties taking effect on arrival. |
| M15 | Trade and logistics | Cargo hauling of rare goods, recurring convoys (supplies, people, artefacts). |
| M16 | `events/` | Wormhole discovery and knowledge (basic wormholes exist since M3), alien relics and technology, unique weapons, ansible rarity and construction. First alien powers enter the game here. |
| M17 | Game shape | Full Legacy scoring, hall of records, full Chronicle, onboarding scenario, balancing. |

## Working rules

- Simulation code never touches the DOM or Three.js, and every sim feature gets headless tests.
- The UI reads only the player's KnowledgeBase, never the World.
- Content lives in `src/data/*.json`, not in code.
- One milestone at a time: finish, test, commit, then move on.
- Commits carry no AI co-author trailers.
