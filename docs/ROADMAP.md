# Star Empire: Implementation Roadmap

Implementation is step by step. Each milestone ends in a runnable, tested state and adds one module or layer. See [DESIGN.md](DESIGN.md) for the design.

## Target directory layout

```
star-empire/
├─ index.html
├─ package.json            # vite, three, vitest
├─ tools/
│  └─ build-star-catalog.js  # HYG CSV → src/data/stars.json (run once, output committed)
├─ src/
│  ├─ main.js              # bootstraps sim + UI
│  ├─ core/                # clock, scheduler, rng, vec3, ids, events, serialize
│  ├─ sim/                 # world, module registry, loop, save/load
│  ├─ info/                # relays, mailboxes, messages, knowledge base, detection
│  ├─ empire/              # empire, capital, governors, directives, loyalty, legacy
│  ├─ galaxy/              # stars, interstellar movement
│  ├─ colony/              # prototype colony model (later absorbed into planet/)
│  ├─ fleet/               # ships, fleets, flight profiles, sealed orders
│  ├─ system/  planet/  economy/  combat/  research/  diplomacy/  events/  ai/   # later milestones
│  ├─ render/              # three.js scenes and vector style
│  ├─ ui/                  # screens, directive menus, time controls, dispatches
│  └─ data/                # stars.json (+ README with CC BY-SA attribution), content JSON
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
- Game clock in years. Stepping by 1, 10 or 100 years or "until the next dispatch", plus continuous play at chosen speeds, with auto-pause.
- Discrete-event scheduler (binary heap), fixed-step tick for growth.
- Seeded RNG, vec3, IDs, event bus; plain-JSON world state; module registry; save/load plus JSON export.
- **Tests:** event ordering, determinism (same seed gives the same state hash), save/load round trip.

### M2: Universe and galaxy map (`galaxy/`, `render/`)
- `tools/build-star-catalog.js`: HYG → stars within 50 ly (with a map-size option), multiple stars grouped into systems, spectral class and luminosity. Writes `src/data/stars.json` and `src/data/README.md` with CC BY-SA attribution. Adds a credits line to the README and the game.
- Procedural per-system placeholders seeded by star ID: habitability, resource richness.
- 3D galaxy view: vector star points by spectral class, labels, reference plane, drop lines, orbit camera, selection.
- Measuring tool: distance, light delay, and trip time at 1, 2 or 3 g.

### M3: Information layer (`info/`)
- Relay stations per system (send only while intact; receive always). Messages from system to system at c. A mailbox per system.
- KnowledgeBase per empire. Periodic status reports and event reports. Overdue-report flags for silent systems.
- UI: report-age label on every known system, styling that fades with age, messages in flight, Dispatches panel (event time and arrival time).
- **Tests:** a report from Alpha Centauri arrives 4.37 years later; a system with a destroyed relay still receives but stops sending; out-of-order directives resolve by issue time.

### M4: Directives engine, first slice (`empire/`, `ui/`)
- Directive model: category, type, target (system, set of systems, region or cone, empire-wide), parameters, priority, expiry, issue time.
- Data-driven directive definitions in `src/data/directives.json` feed the category and submenu UI.
- Governors: a simple AI that turns active directives into local actions.
- Prototype directives: **Economy › production focus (growth / shipbuilding)** and **Expansion › colonize (nearest / most habitable / direction cone)**.
- The arrival front of empire-wide directives is shown on the galaxy map.

### M5: Colonies and colony ships (`colony/`, `fleet/`)
- Colony: population, industry, one abstract resource ("materiel"), growth driven by habitability. Centuries to self-sufficiency.
- Colony ship with sealed orders (target plus fallback). Relativistic constant-acceleration profile (1–3 g, cruise 0.6 c). Founds a colony on arrival.
- Detection: braking plume visible to the destination and the forward cone; launch plume visible toward the origin. Each detection travels to observers at c.
- Galaxy view: own ships shown at their last reported departure with a predicted path; detected plumes as flashes.
- Stats panel with running Legacy components (years, population, output, systems).
- **v0.1 done:** the player sets directives and watches the empire spread through a delay they can feel.

### M6: First rival and first drift (`ai/`, `empire/`)
- Empire B starts at another star with the same rules and the same fog. Contested colony targets. Braking detections of each other's ships.
- Basic loyalty: latency and neglect push, prosperity pulls. Stages Loyal → Restless → Autonomous → Seceded; a seceded colony becomes an independent AI faction.
- Dissolution check and a first simple Chronicle screen.
- This proves that fog of war and drift both matter before the game gains depth.

---

## Phase 2: Depth, one module per milestone

| # | Milestone | Main content |
|---|---|---|
| M7 | `system/` | Kepler orbits on rails, real and generated planets, 3D orrery, system screen. |
| M8 | `planet/` + `economy/` | Deposits, surface and orbital installations, production chains, food and population, terraforming. The colony model migrates here. |
| M9 | `fleet/` | Hulls and components, ship designer, fleet organization, full sealed-orders editor. Economy › shipbuilding, Military and Logistics directives. |
| M10 | `combat/` | Battle-plan editor, deterministic crossing simulation, flyby raids vs. braking assaults, battle reports home at c, vector replay. |
| M11 | Detection depth | Sensor nets and pickets, relay destruction and rebuilding, Military › readiness and fortify directives. |
| M12 | `research/` | Tech tree on the Empire screen, research worlds, blueprints spreading via relays, galaxy overlay. |
| M13 | Governance depth | Governor traits, appointment by ship, influence missions, granting autonomy, reintegrating seceded worlds. |
| M14 | `diplomacy/` | Factions, embassies, ambassador instructions, treaties taking effect on arrival. |
| M15 | Trade and logistics | Cargo hauling of rare goods, recurring convoys (supplies, people, artefacts). |
| M16 | `events/` | Wormholes (ships only, courier FTL), alien relics and technology, unique weapons, ansibles. |
| M17 | Game shape | Full Legacy scoring, hall of records, full Chronicle, onboarding scenario, balancing. |

## Working rules

- Simulation code never touches the DOM or Three.js, and every sim feature gets headless tests.
- The UI reads only the player's KnowledgeBase, never the World.
- Content lives in `src/data/*.json`, not in code.
- One milestone at a time: finish, test, commit, then move on.
- Commits carry no AI co-author trailers.
