# Politics: loyalty, drift, rivals and independent polities (M6)

Distance is the empire's enemy as much as any rival. A colony that hears from home once a decade, raised by machines or grown self-sufficient, stops feeling like part of the empire. First it grows restless, then it goes its own way, and at last it declares independence and becomes a polity of its own, played by the AI. Rival empires play by the same rules: they see only what their capitals know, and they act only through directives that travel at light speed.

Rules: `src/data/loyalty.json` and `src/data/ai.json`. Code: `src/loyalty/` (model and module), `src/ai/module.js`, and independence in `src/empire/module.js`.

## Loyalty

Every colony except a capital has a **loyalty** between 0 and 1. Its starting value depends on how the colony was founded: embryo 0.75, ark 0.85, cryo 0.9. Each month it moves by the balance of these forces (per year, `src/loyalty/model.js`):

| Push (toward independence) | Rule |
|---|---|
| distance | 0.0001 × light-years to the capital |
| neglect | after 40 years without word from home: 0.003 × min(3, (years − 40) / 50) |
| instability | 0.008 × the colony's instability (embryo societies start at 1, fading over centuries) |
| hardship | 0.02 while hungry, 0.03 during unrest |
| self-sufficiency | 0.004 × resilience (large peoples need the empire less) |
| disasters | −0.015 once for each prion outbreak, flare, crop failure or unrest |

| Pull (toward the empire) | Rule |
|---|---|
| belonging | 0.002 |
| prosperity | 0.003 while fed and free of famine and unrest |
| institutions | technology (see below) |
| orders | +0.01 for an order received (at most once a year) |
| cultural mission | +0.2 when a mission arrives |

**Word from home** means any message from the capital (orders, blueprints, notes) or any of our ships arriving. A colony beyond every relay, with no ships calling, is neglected no matter what the player intends.

**The governor's autonomy** (*Governance › Autonomy*) scales the pushes: tight ×1.25, normal ×1, broad ×0.6. A governor with broad autonomy ignores low-priority orders.

### Stages

| Stage | Loyalty | Effect |
|---|---|---|
| Loyal | ≥ 0.6 | follows orders |
| Restless | 0.35–0.6 | ignores low-priority orders; industry ×0.9 |
| Autonomous | < 0.35 | refuses every order except *Governance* ones (such as being granted autonomy) |
| Independence | < 0.15 | a 15 % yearly chance (× technology) to declare independence, if at least 2,000 people can stand alone |

- **Every change of stage is news.** It travels home at light speed as a dispatch ("Tau Ceti is growing restless…"), with a fresh system report.
- **Reports carry the reported loyalty.** The capital sees it as old as the report. Only the *Truth* view (sandbox) shows the forces themselves.
- **Refused orders show as "refused"** in the order list once a report comes back. Orders to a system that has broken away show as "system lost".

### Independence

When a colony declares independence (`secede`):

- **A new polity is born** with the next free faction letter (C, D, E, …). It remembers the empire it broke away from (`parent`), and its seat is the seceding system.
- **Everything but the allegiance stays:** the people, the colony, its research (the lab keeps what it knew), its relay and its survey records. The governor starts afresh.
- **Neighbours join.** Autonomous colonies of the same empire within 10 ly go with it.
- **Each one sends its declaration home first.** After the change, the old empire's relays no longer carry it. The capital learns of it after the light delay, and its map then shows the system as foreign.
- **The new polity is played by the AI** with the *cautious* personality. Its own colonies can drift from it in turn.

**Capitals and dissolution.**
- A capital can die out (a small breakaway polity). Its seat then moves to the nearest system it still holds.
- A polity with no system left **dissolves** (`dissolvedAt`). This is the "empire ends" rule of the design.
- Sol, with its billions, is safe from dying out. It is not safe from being left alone.

## Player tools

- **Keep in touch.** Any order resets neglect and adds a little loyalty. Research blueprints and ships count too.
- ***Governance › Cultural missions*** (needs *Cultural missions*) sends envoy ships (cost 50) to the least loyal colonies the capital knows of: restless ones, wavering ones (below 75 %) or every colony. Each colony gets at most one mission every 40 years. A mission restores 20 points.
- ***Governance › Autonomy*:** broad autonomy eases the pressure on distant colonies. Autonomous colonies still accept this order.
- **Technology** (sociology):
  - *Common calendar* (distance ×0.8);
  - *Home broadcasts* (+0.2 pts per year);
  - *Colonial charters* (push ×0.75, secession ×0.6);
  - *Federal compact* (secession ×0.4, push ×0.9);
  - *Consensus networks* (+0.4 pts per year, push ×0.8);
  - *Memetic engineering* (+0.4 pts per year, unrest ×0.7).
  - For embryo societies: *Nursery curricula* (instability ×0.6) and *Surrogate minds* (×0.5, unrest ×0.7).

## Rival AI

The AI (`src/ai/module.js`) plays an empire with the same restrictions as the player:

- **It sees only its own capital's knowledge:** reports as old as they are, its own lab and capabilities.
- **It acts only through `issueDirective`.** Orders travel at light speed and restless colonies may ignore them.
- **Every 8 years it thinks:**
  - **Research:** keeps a focus in an area with open candidates, chosen by personality weights. It sometimes switches, and always switches when stalled.
  - **Expansion:**
    - a standing *Explore* at the capital;
    - a standing *Settle* at the capital;
    - while it knows only embryo ships and has seeder robotics, *Prepare sites*, then settling *prepared sites*;
    - after some decades, *Settle* from every colony.
  - **Economy:** *Agriculture* for colonies reported hungry, *Balanced* again once fed.
  - **Loyalty:** *Cultural missions* when it has them, and *broad autonomy* for colonies reported autonomous (normal again once loyal).
- **It remembers what it ordered** and does not repeat itself.

Personalities (`ai.json`): *expansionist* (Empire B: engines and planetary science, wide and fast), *scholar* (informatics), *cautious* (independent polities: sociology and planetary science, slow to expand).

## Map and panels

- **Colour › Politics:**
  - our capital, our colonies by reported loyalty (loyal, restless, autonomous, not reported);
  - every other polity in its faction colour;
  - labels show the stage or the polity. The legend filters as usual.
- **Colour › Economy:**
  - our systems by population (billions, millions, thousands, a few hundred) and trouble (hungry, famine or unrest), with star size growing with population;
  - foreign systems in one colour;
  - labels show population.
- **People section:**
  - loyalty and stage;
  - in *Truth*, each force in percentage points per year.
- **Intel section:** a polity's origin ("broke away from Empire A in …"), and the reported state of a robotic preparation at an empty system.
- **Overview:** restless and autonomous colonies, and the polities known.
- **Governor:** the autonomy setting.
- **Sandbox tools:** −25 % loyalty; declare independence.

## Integration

- **Module order:** …, colony, governors, **loyalty**, research, security, **ai**.
- **A system changing hands** (`transferPresence`) keeps its colony and its lab. Every module treats an ownership change by `empire/presenceChanged` with a different empire.
- **Governors** check loyalty before accepting an order (`obeys`) and record refusals in their book, which reports carry.
- **Save version 7.**
- **Tests:** `tests/politics.test.js`.
  - Loyalty rules; drift and neglect; reported loyalty.
  - Obedience and refusal; independence with joining neighbours and news by light; dissolution.
  - Cultural missions; robotic preparation (success and failure).
  - AI directives, expansion and hunger; determinism and save/load with AI, loyalty and disasters; map views.
  - Test sandboxes run without Empire B's AI unless a test asks for it (`sandbox(seed, { ai: true })`).

## Balance notes (sandbox, disasters on)

- A player who never sends an order loses most colonies within about two centuries: neglect, then independence.
- An AI-run empire (orders, missions, autonomy for the far ones) grows past 25 systems in 600 years. It loses a few colonies to breakaway polities, which grow and fragment in turn.
- Embryo colonies drift fastest (instability). Ark colonies near home are stable. Far ones need contact.

## Later

- **M13 governance:** governor traits and appointment, reintegration of seceded worlds, tribute, loss of the capital as a loyalty shock carried by the news.
- **M14 diplomacy:** relations with independents and rivals, treaties, recognition.
- **M10 combat:** contested systems and conquest (`transferPresence` is ready for it).
