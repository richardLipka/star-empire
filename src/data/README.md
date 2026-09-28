# Game data

## `stars.json`: star catalogue

Derived from the **HYG Database v4.1** by David Nash (astronexus),
<https://github.com/astronexus/HYG-Database>, licensed under
[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Changes made: stars filtered to within 50 light-years of Sol, positions converted
from equatorial parsecs to galactic light-years, multiple stars (and stars closer
than 0.3 ly to a brighter primary) grouped into systems, and names normalized.

`stars.json` is a derivative work and is distributed under **CC BY-SA 4.0**.
It is regenerated with `npm run catalog` (see `tools/build-star-catalog.js`).

## Other files

`drives.json`: drive technology tiers (acceleration and cruise speed).
`sensors.json`: drive-plume detection range and cone.
`directives.json`: the catalogue of orders governors understand (categories, parameters, placeholder capacities).
`colonies.json`: colony rules (sites, growth, output, focus, disasters, colonisation modes, societies; see docs/COLONIES.md).
`systems.json`: hand-authored planetary systems of known stars (Sol, Alpha Centauri, Tau Ceti, Epsilon Eridani and others); all other systems are generated.
`loyalty.json`: loyalty and drift rules (pushes, pulls, stages, secession; see docs/POLITICS.md).
`ai.json`: AI personalities and thresholds for rival and independent polities.
`ships.json`: hulls, components, stock designs, approaches and warship levels (see docs/FLEETS.md).
`combat.json`: the combat model's numbers: windows, accuracy, formations, surprise, stations, strikes and atrocities.
`tech/`: research areas, one file of technologies per area, and the registry of effect targets and research rules (see docs/RESEARCH.md).

These are game content under the same licence as the code. Their display texts live in `src/i18n/locales/`, never in the data files.
