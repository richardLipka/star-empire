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

- **Messages travel only between star systems**, at c, point to point.
- Every colonized system can have a **relay station**. A system with a working relay can **send**. Every system can always **receive**.
- If a relay is destroyed, the system goes **silent**: it keeps receiving directives but cannot report until the relay is rebuilt. Silence is itself information. Each system has an expected report interval, and the UI flags "report overdue by N years".
- **Fleets cannot receive messages in transit.** A fleet gets orders only while it is in a system, from that system's mailbox. It therefore departs with **sealed orders**: route, objective, battle plan, fallback behavior and what to do on arrival.
- Fleets report through the relay of the system they are in. A fleet with no friendly relay stays silent until it reaches one, or until a battle is seen from afar.
- **Empire-wide directives** are sent to each system separately and arrive at different times. The UI shows the arrival front spreading through the empire.
- Directives carry an issue timestamp. If two arrive out of order, the newer issue time wins.

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

## 5. Movement and detection

### Flight profile

Ships accelerate at a constant **1–3 g** up to a cruise speed of about **0.6 c**, coast, then turn and brake at the same rate. Constant-acceleration motion is simulated with closed-form relativistic formulas (1 g ≈ 1.03 ly/yr²):

| Acceleration | Burn time (Earth frame) | Burn distance | Warning at destination* |
|---|---|---|---|
| 1 g | 0.73 yr | 0.24 ly | ~6 months |
| 2 g | 0.36 yr | 0.12 ly | ~3 months |
| 3 g | 0.24 yr | 0.08 ly | ~2 months |

\*Braking time minus light-travel time of the braking-start flash: the only warning a system without a sensor net gets.

Trip times at 1 g: Alpha Centauri (4.4 ly) about 8 years; 10 ly about 17 years; 50 ly about 84 years. Crew time dilation (γ = 1.25 at 0.6 c) is tracked as flavor: crews age less than the empire.

### Detection rules

- **Coasting ships are dark.** They cannot be detected, except by a **sensor net** in range.
- **Braking makes a ship visible.** The plume points forward, at the destination and anything near that line. The destination sees it with light delay, which gives the short warnings in the table above.
- **Launch burns** point the plume back toward the origin, so they are visible from the origin and systems behind it (usually your own space).
- **Sensor nets:** installations at a system, or pickets placed in interstellar space, that detect coasting ships within a radius set by technology. Their detections also travel home at c.
- **Flyby raids:** a fleet that never brakes is never seen by its target, but it passes through at 0.6 c with only seconds to fire and cannot stop or occupy. A fleet that brakes can take a system but announces itself months ahead.

## 6. Loyalty, drift and dissolution

Every colony has a **loyalty** value that drifts over time:

- **Pushes toward independence:** communication latency (round-trip time to the capital), years since the last ship or governor visit, heavy tribute, neglect during war or crisis, a large and self-sufficient population, a distinct local culture that grows with time and distance.
- **Pulls toward the empire:** prosperity, garrison, investment convoys, cultural and influence missions, an appointed governor, shared threats, dependence on imported goods.
- **Stages:** Loyal → Restless → Autonomous (follows only some directives, pays reduced tribute) → **Seceded** (becomes an independent faction run by the AI).
- **Player tools:** influence missions, garrisons, investment, appointing or replacing governors, and *granting autonomy*. Granting autonomy slows drift but loosens control. Seceded worlds can be won back by diplomacy or force.

**Dissolution.** The empire *will* fall eventually, through secession cascades, war, internal decay or catastrophe. The game ends when the empire no longer functions as a state. A proposed rule: the capital system is lost or seceded, *or* the loyal population drops below a set fraction of its peak.

**Score: the Legacy.** Throughout the game the empire's history is recorded:

- **Longevity:** years from founding to dissolution.
- **Prosperity:** integral of economic output over time.
- **Population:** integral of population over time, plus peak population.
- **Reach:** peak number of systems and peak extent in light-years.

The end screen is a **Chronicle**: a timeline of the empire "as it really happened", compared with what the capital knew at each moment. Scores go into a local hall of records.

## 7. Units and scale

- Distance in **light-years** at galactic scale and **AU** in systems. Time in **years**. **c = 1 ly/yr**, so light delay equals distance.
- The universe uses real stars from the **HYG star catalogue** (license and attribution in §11). With 0.6 c ships the bubble fills quickly, so **pacing comes from colony development** (centuries to self-sufficiency) and from the size of the map. The proposed default is **50 ly around Sol**, with smaller maps for short games.
- Known exoplanets come from real data where available; everything else is generated procedurally from a seed per star.
- **Time model:** a continuous, event-driven simulation presented at a *Master of Orion*-like pace. Time advances by chosen steps (1, 10 or 100 years, or "until the next dispatch") with automatic pause on important arrivals.

## 8. Modules

Each module is a folder under `src/`. Simulation logic is kept separate from its UI. Gameplay modules never import rendering code.

### Foundation

| Module | Responsibility |
|---|---|
| `core/` | Game clock, discrete-event scheduler, seeded RNG, vector math, IDs, event bus, serialization. |
| `sim/` | World container, module registry, main loop, save/load. |
| `info/` | Relay messages, system mailboxes, light-speed propagation, KnowledgeBase, detection (plumes, sensor nets), overdue-report tracking. |
| `empire/` | Empire state, capital, governors, **directives engine** (categories, targeting, interpretation), loyalty and secession, Legacy score. |

### Gameplay

1. **`galaxy/`: interstellar space (3D).** Star catalogue, systems as nodes, ships on constant-acceleration trajectories, messages at c. It shows ships at their last detected position with a predicted path, and systems with the age of their last report.
2. **`system/`: star system (3D).** Keplerian orbits on rails. Used for system management and as the stage for battles.
3. **`planet/`: planet management.** Surface and orbital installations, population, habitability and terraforming, production chains.
4. **`fleet/`: fleets and ship design.** Hulls and components, fleet composition, sealed orders, transit planning.
5. **`combat/`: engagement planning.** Battles are decided in seconds at relativistic closing speeds. The player prepares formations, approach vectors, weapon schedules and point-defense priorities as part of a fleet's sealed orders. A deterministic high-resolution simulation resolves the crossing, and the report travels home at c.
6. **`research/`: technology.** A tab of the Empire screen plus a galaxy overlay. Research happens at specific worlds, and **blueprints propagate at c** through relays before other colonies can use them.
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

- **Galaxy** (main): 3D map, time controls, report-age overlays, messages and detections in flight.
- **Dispatches**: inbox and outbox, each entry showing *when it happened* and *when it arrived*.
- **Directives**: category → submenu → target → parameters, plus a list of directives in flight and their arrival fronts.
- **System**, **Planet**, **Fleet** (design, sealed orders, battle plans).
- **Empire**: research, governors, loyalty map, Legacy statistics.
- **Diplomacy**, and the **Chronicle** (end of game).

## 9. Module contract

```js
export default {
  id: 'colony',
  initState(world, rng) {},       // add its slice to world state
  tick(world, dt, ctx) {},        // fixed-step update (growth, economy, loyalty)
  handlers: {                     // discrete events from the scheduler
    'colony/founded': (world, ev, ctx) => {},
  },
  directives: {                   // executed when a directive arrives at a system
    'expansion/colonize': { validate(world, d, system) {}, execute(world, d, system, ctx) {} },
  },
};
```

- World state is plain JSON-serializable objects.
- All randomness goes through the seeded RNG: the same seed and the same directives always produce the same game.
- Modules communicate only through events and directives.

## 10. Technology

- Plain **JavaScript** ES modules, JSDoc with `// @ts-check`.
- **Vite** builds static files. No server: the game runs from GitHub Pages or locally.
- **Three.js** for 3D (`Line2` for vector lines, `CSS2DRenderer` for labels).
- **Vitest** for headless simulation tests.
- Saves in IndexedDB or localStorage, plus JSON export and import.
- **Style:** modernist and vector-based. Dark background, one accent hue per faction, monospace labels, thin strokes. Information age is shown by desaturation and dashes.

## 11. Data and licensing

- Star data comes from the **HYG Database** by David Nash / astronexus (<https://github.com/astronexus/HYG-Database>), which is licensed **CC BY-SA**. The exact version is recorded when the data file is built.
- `tools/build-star-catalog.js` produces `src/data/stars.json`. That file is a derivative work, so it ships under the same CC BY-SA license, with attribution in `src/data/README.md`, the main README and the in-game credits screen.
- Game code is licensed separately (license still to be chosen).

## 12. Settled decisions

- Orders are general directives, grouped by category, carried out by governors.
- Colonies drift and can secede; the player can influence them.
- Ships use 1–3 g constant acceleration to about 0.6 c. They are visible when braking, or to sensor nets.
- Messages go only between systems. A destroyed relay stops sending but not receiving.
- No false reports.
- Millennia-scale game with a slow, *Master of Orion*-like pace. Score is the Legacy until dissolution, with no victory points.
- Real stars from HYG, with attribution.
- Factions named A, B, C for now.
