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

`drives.json`: drive technology tiers (acceleration and cruise speed). Game content, same license as the code.
