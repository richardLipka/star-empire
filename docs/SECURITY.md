# Communication security (M12.1)

Relay messages cross light-years as laser beams, and beams spill. Any system of another empire close enough to a beam's path can overhear it. **Ships are slower but safe**: couriers and ansibles cannot be overheard.

## Interception

- Every **radio hop** is exposed; local hand-overs and ansible links are not. A foreign-held system overhears a hop if it lies within `spillLy × beam spill of the transmitting relay + listening reach of the listener` of the segment between the two relays (`toSegment` in `src/core/vec3.js`).
  - `spillLy` is 1 ly (`src/data/security.json`).
  - Beam spill is 1, and 0.5 with *Tight-beam discipline*.
  - Listening reach is +1.5 ly with *Beam-spill interception* and +3 ly with *Deep listening arrays*.
- The listener hears it when the beam's light reaches it: at departure time plus the distance along the beam to its nearest point plus the distance across to the listener.
- **Cipher vs decryption.** Every message carries the cipher level of the system where it was written (`presence.capabilities.cipher`). A listener reads it if its decryption level is at least that. Otherwise it only notices the traffic.
- The listener sends what it learnt home as an `intercept` report, which is a radio message and can itself be overheard.

## What the capital learns

| Case | Result |
|---|---|
| Any interception (traffic analysis) | Both ends of the hop are marked as held by the sender: the transmitter with a working relay, the receiver without. Foreign systems appear on the map (status *Held by another empire*, received *via interception*). One dispatch per newly noticed link. |
| Report read | The system's state, including the fleets docked there. |
| Fleet report read | The foreign fleet and its planned route: it appears on the map as *expected*, like our own fleets. |
| Order read | The directive and its parameters, logged with a dispatch ("Intercepted order of Empire B to Gl 832: Readiness"). |
| Blueprint read | **The technology is stolen**: acquired at the capital by espionage, even if it was closed off to our own research, and it spreads from there. |

Everything is symmetric: rivals overhear our traffic the same way. The map's **Security** layer marks our relay links that lie within the spill of foreign systems. In the *Empire knows* view only foreign systems we know of count, and their listening technology is assumed basic; the *Truth* view uses everything. The overview panel counts foreign traffic overheard (and read) and our exposed links.

## Being safe: couriers

- **Orders by courier:** the order composer has *Delivery: relay / courier ship*. By courier, each target system gets a courier from the capital carrying the order. It is slower than light, cannot be overheard, and flies home afterwards. Revocations follow the same way.
- **Reports by courier:** give a system *Reporting: radio silence* plus *Logistics › Courier runs* to the capital. It then sends nothing by radio, and its news travels in ships.
- **Ansibles** are instantaneous and cannot be overheard, but rare (M16).

## Technology

| Technology | Area | Effect |
|---|---|---|
| Classical ciphers (start) | Informatics | cipher 1, decryption 1 |
| Key distribution protocols | Informatics | cipher +1 |
| Cryptanalysis | Informatics | decryption +1 |
| Lattice cryptography (theory) → Lattice-sealed relays | Informatics | cipher +2 |
| Beta-level codebreakers | Informatics | decryption +2 |
| Quantum-keyed channels | Communication | cipher +2 |
| Tight-beam discipline | Communication | beam spill ×0.5 |
| Beam-spill interception | Communication | listening reach +1.5 ly |
| Deep listening arrays | Communication | listening reach +3 ly |
| Agent networks | Sociology | espionage agents (arrives with diplomacy, M14) |

Like all technologies, these act per system and only where they are known. A listening post needs the listening blueprints to reach it. When a report shows a system is missing technologies the capital knows, for example a new outpost, the capital sends the missing blueprints.

## Code

- `src/security/module.js`: hop listener, `security/overheard` events, intercept reports, absorption at the capital.
- `src/perspective/security.js`: exposed links and counts.
- `src/info/module.js`:
  - `createMessage` (with the message's `cipher`);
  - the `info/hopStarted` notification for radio hops;
  - exported `absorbSystemReport`.
- `src/governors/issue.js`: `delivery: 'courier'`.
- Tests: `tests/security.test.js` covers:
  - geometry and capabilities;
  - hearing time;
  - traffic analysis and reading;
  - strong ciphers;
  - stolen orders and blueprints;
  - courier orders not overheard;
  - tight beams;
  - exposure in the knowledge and truth views;
  - determinism.
