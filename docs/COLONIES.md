# Colonies and production (M5)

Every system an empire holds has people. They live where the star allows, grow when fed, work, research and die. Early on, **life is fragile**: small colonies are hit hardest by disease, flares and failed harvests, and a colony that falls below a few dozen people is gone, along with the system.

The rules live in `src/data/colonies.json`. The simulation is in `src/colony/`: `model.js` holds the pure rules and `module.js` the state and the monthly tick.

## Star systems

Each star has a system of bodies (`src/galaxy/planets.js`). The system is derived from the game seed, is deterministic and is never saved.

- **Known systems** come from `src/data/systems.json`: Sol's planets, Proxima b and d (which orbit Proxima, not Rigil Kentaurus), Tau Ceti, Epsilon Eridani, Barnard's Star, Lalande 21185, Ross 128, Luyten's Star, GJ 1061, Wolf 1061, Epsilon Indi, Gl 876, and the debris discs of Fomalhaut and Vega.
- **All other systems** are generated from the primary star:
  - **Habitable zone.** It comes from the *bolometric* luminosity. The catalogue gives visual luminosity, so red dwarfs, which shine mostly in the infrared, are corrected upward (×25 for class M). Without this correction Proxima b would be frozen.
  - **Number of bodies.** It depends on the class: O/B stars have few, G/K stars have many, and giants have lost most of theirs.
  - **Body type.** It depends on the zone: hot rocky worlds and super-Earths, temperate rocky worlds, oceans and some giants, and cold giants, ice worlds and belts.
  - **Habitable worlds.** A temperate rocky world is truly habitable with probability 35 % around G stars, 30 % around K, 20 % around F and 8 % around M (and then of lower quality). Giant stars have none: whatever lived there burned. About 20 of 846 systems end up with a living world.
  - **Terraformable worlds.** These are temperate worlds that are not alive, or rocky worlds just outside the zone.
  - **Tidal locking.** Close-in worlds of M dwarfs (and very close ones of K dwarfs) are tidally locked, which means more flare exposure.
- **Traits for survey displays and settler choices** (`systemTraits`): habitability and richness are derived from the bodies. An orbital base is always possible, so habitability never drops below 0.03.

## Where people live

`chooseSite` picks the best site in a system, in this order:

| Site | Capacity | Food | Industry | Notes |
|---|---|---|---|---|
| habitable world | 12 bn × quality | 1.35 | 1.0 | open-air agriculture; crop failures possible |
| terraformed world | 3 bn × quality | 1.25 | 1.0 | a terraformable world after centuries of work |
| terraformable world | 1 M | 0.8 | 1.1 | under domes until terraformed |
| hostile world | 300 k | 0.75 | 1.15 | domes on dead rock |
| orbital base | 100 k | 0.72 | 1.2 | always possible: near a giant, in a belt, or around the star alone |

- **Food** is what the site produces over what its people need.
- **Closed sites** (domes and stations) cannot feed themselves without **closed life support**, a start technology that adds +0.3. Hydroponics add more.
- **Capacity multipliers** come from technology: domes, orbital habitats, gas-giant skimming, arcologies.

## Life of a colony (monthly)

- **Growth** is logistic toward capacity. It is faster with a food surplus (`rate × min(1, 0.5 + 3 × (food − 1))`). Above capacity the population declines gently. A starving colony shrinks by 25 % × the shortfall per year.
- **Materiel** (industry) accumulates in the colony's store: `2 × (people / 1000)^0.4 × site × richness × technology × focus` per year. It pays for ships.
- **Research** is `0.2 × log10(1 + people / 1000)` points per year, times the focus and research-rate technologies. Sol's ten billion give about 1.4; a colony of 30,000 gives about 0.3. The research module uses this instead of its old fixed rates.
- **Terraforming.** Once *Full terraforming* is known at the system (and the governor's *Terraforming* setting is "full programme", the default), a terraformable world becomes a terraformed one in 400 years, or 200 with atmosphere processors.
- **Instability** starts with the society (below) and fades over centuries (e-folding 180 years).

## Disasters

Each colony rolls once a year. Chances and losses are in `risks`, and technologies multiply them (`risk.*` targets).

| Disaster | Chance | Effect | Worse for | Technology |
|---|---|---|---|---|
| Prion outbreak | 1.5 % × up to 4 for small colonies | 8–35 % dead | small colonies, ark peoples (×1.5) | prion therapeutics, gene banks |
| Stellar flare | by star class (M 4 %, A 3 %, G 0.6 %…) × exposure | 3–20 % dead | M dwarfs, orbital bases (×1.6), tidally locked worlds | storm shelters, flare forecasting |
| Crop failure / life-support failure | 3 % open-air, 1.5 % closed | food halved for 1–3 years | — | resilient crops |
| Unrest | 6 % × instability | work halves for 2–6 years, 5 % dead | embryo societies | founding traditions, tutor intelligences |

**Resilience.** Large peoples weather disasters better: `resilience = min(1, log10(1 + people/1000) / 6)`. It lowers the chance of prion outbreaks and crop failures (up to −70 %), the losses and the famine (up to −85 %). A crop failure on Earth is a bad year; on a young colony it is a catastrophe.

**Extinction.** Below 25 people (with no frozen embryos left), the colony dies out. Its last news goes to the capital, and the system is lost (`abandonPresence`, event `empire/presenceLost`). The capital itself never dies out.

Every disaster is a `colony` message to the capital, carrying a fresh system report. It arrives at light speed and becomes a dispatch. News from a colony beyond every relay waits until the network reaches it.

## Colonisation modes

How colonists travel shapes the society they found (`modes`, `society`):

| Mode | Unlocked by | Colonists | Cost | Society |
|---|---|---|---|---|
| **Embryo ship** | *Machine nurseries* (start) | 150, plus 2,000 frozen embryos decanted at 40 a year | 60 | raised by machines: strange and unstable (instability 1.0) |
| **Generation ark** | *Orbital habitats* | 4,000 | 400 | a closed people from centuries aboard: prion-prone (×1.5), instability 0.35 |
| **Cryo sleepers** | *Cryo-sleep cohorts* | 2,500 | 180 | a settled society (instability 0.1) |

- **At the start only embryo ships are known.** The first wave of expansion therefore founds small, strange, fragile colonies. In a 400-year test run about one embryo colony in six dies out.
- **Cryo sleep changes the game.** Colonies arrive settled and stable.
- **Unrest in an embryo society** is reported as *strangeness*: the machine-raised grow restless.
- **Drift toward independence** (M6/M13) will build on this instability.

The *Settle* directive has a **Colony ships** parameter:
- *best available* (the default): cryo if known; else an ark when the system can pay for one; else embryos;
- or a specific mode. A mode that is not known here launches nothing.

## Robotic preparation (M6)

*Expansion › Prepare sites* (needs *Seeder robotics*, tier 1) sends **seeders** (cost 80) ahead of the colonists. Seeders are robot ships with no people aboard. The directive's parameters are criteria (nearest, habitable, rich), frequency, range and direction. It targets surveyed, empty systems not already being prepared.

1. **On landing** the robots start building habitats, nurseries and fields. The seeder reports *work begun*.
2. **The work takes 25 years** (×0.5 with *Self-replicating builders*) and **can fail**:
   - the base chance is 25 %, +10 % at M and A stars, +20 % at O and B stars;
   - *Hardened robotics* ×0.5, *Self-replicators* ×0.7.
   - The failure comes at a random moment during the work. **60 % of failures are silent:** the capital still believes the site is being prepared.
3. **On success** the seeder reports *site ready*. The robots stay as part of the site.

*Settle › prepared sites* sends colonists to sites the capital believes prepared (working or ready). **Embryo ships sent there travel light:** they cost ×0.7, because they rely on the robots' nurseries.

What colonists find:

| Site | Effect |
|---|---|
| ready | *prepared* = 1: food +0.25, capacity ×1.5, prion, flare and crop risks ×0.5 for 100 years, embryo decanting ×2, instability ×0.6; a terraformable world starts with the seeders' terraforming head start |
| still being prepared | the same bonuses in proportion to the work done |
| failed, but believed prepared | **no bonus**, and embryo ships that travelled light **lose half their frozen stock**; the dispatch says the colonists found no prepared site |

**Terraforming for embryo colonies:**
- *Microbial seeding* (+25 % head start) and *Ecopoiesis* (+15 %): seeders begin terraforming before anyone lands.
- With *Ecopoiesis*, a colony on a seeded world keeps terraforming at half speed, even without *Full terraforming*.
- *Gaian engineering* makes all terraforming half again as fast.

## Ships cost materiel

- Every ship a governor builds is paid from the system's store:
  - scout 25, courier 12, seeder 80, envoy (cultural mission) 50, other ships 45;
  - colony ships by mode (see the table above).
- **The shipyard** still launches at most one ship per interval. It builds the highest-priority proposal it can **pay for**; unaffordable proposals wait.
- **Courier runs** are retried the next year.
- ***Send fleet* orders** wait in the governor's memory until they can be paid for.

## Production focus

The directive *Economy › Production focus* is now in effect. It multiplies industry, food, research and ship costs:

| Focus | Industry | Food | Research | Ship cost |
|---|---|---|---|---|
| balanced | 1 | 1 | 1 | 1 |
| industry | 1.4 | 1 | 0.8 | 1 |
| mining | 1.25 | 1 | 0.9 | 0.9 |
| agriculture | 0.8 | 1.3 | 0.9 | 1 |
| research | 0.8 | 1 | 1.6 | 1 |
| shipbuilding | 1.1 | 1 | 0.8 | 0.75 |

*Economy › Terraforming* ("none", "survey", "full programme") decides whether a governor terraforms once it can.

## Technologies (M5 additions)

- **Planetary science:**
  - *closed life support* (start);
  - *hydroponics*, *pressure domes*, *storm shelters*, *asteroid mining* (tier 2);
  - *flare forecasting*, *resilient crops*, *industrial automation* (tier 3);
  - *arcologies* (tier 5).
- **Sociology:**
  - *machine nurseries* (start);
  - *population genetics* (theory);
  - *prion therapeutics*, *gene banks*, *founding traditions*, *tutor intelligences*.
- **Remapped:**
  - *Cryo-sleep cohorts* unlocks cryo colony ships;
  - *Orbital habitats* unlocks generation arks and doubles orbital capacity;
  - *Longevity* speeds growth;
  - *Gas giant skimming* enlarges stations;
  - *Atmosphere processors* halve terraforming time;
  - *Full terraforming* is now implemented.

The effect targets are `colony.*` (capacity per site, food, closed-habitat food, growth, industry, modes), `risk.*` and `planet.terraform` / `planet.processors`.

## What the player sees

- **System panel › People:**
  - population of capacity, where they live, how they were founded, society, food, industry, materiel, research, frozen embryos, instability, terraforming;
  - current troubles (famine, rationing, unrest).
  - In the capital's view this is the last report, with its date and age; in *Truth* it is the colony itself.
- **Survey:** the habitable zone, notable worlds, and an **orrery**: orbits on a logarithmic scale, one row per star with bodies (Proxima gets its own), the habitable zone as a band, and the colony's world ringed.
- **Overview:** population (as reported) and colonies in trouble.
- **Dispatches** for every disaster, extinction and completed terraforming.
- **Sandbox tools:** switch colony disasters on or off; add 500 materiel.

## Integration

- **Module order:** galaxy, empire, wormholes, fleet, info, detection, **colony**, governors, research, security.
- **Reports:** colony state rides on every system report (`extendSystemSnapshot`). The security module reads intercepted colony news like any report.
- **Save version 6.** Colonies are created lazily for held systems in older saves. Capitals become an old people at 80 % of capacity; other systems get cryo sleepers.
- **Tests:**
  - `tests/planets.test.js`: determinism, known systems, spectral patterns, site choice, traits;
  - `tests/colony.test.js`: rules, growth, output, fragility, knowledge lag, extinction, disasters, determinism, modes, embryo decanting, costs, pending orders, focus, terraforming.
  - Test sandboxes switch disasters off unless a test asks for them (`sandbox(seed, { risks: true })`).

## Later

- **M6 (done, see [POLITICS.md](POLITICS.md)):** loyalty built on instability. Embryo societies drift toward independence first. A restless colony works less (industry ×0.9).
- **M8:**
  - bodies become real places with installations;
  - materiel splits into resources;
  - food moves between systems;
  - colonists can be delivered (*Logistics › Deliver*).
- **M15:** trade in rare goods, and relief convoys to famine-struck colonies.
