# Star Empire

A strategic and tactical game at empire scale. The player commands an empire spread across several star systems in a universe where nothing travels faster than light.

Orders, reports and starships all move slower than light. News from a distant system is years old when it arrives, and an order sent today lands in a situation that has already changed. The player always acts on old and incomplete information.

Browser game in plain JavaScript (Vite + Three.js), no server.

- [Design and architecture](docs/DESIGN.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Game data and licences](src/data/README.md)

Current state (M2): a 3D map of the real stars within 50 light-years of Sol, with game time, save/load, and a measuring tool for distance, light delay and trip times.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev        # dev server with hot reload
npm run check      # lint + typecheck + tests
npm run build      # static build in dist/
```

`npm run catalog` rebuilds the star catalogue from HYG (add `-- --radius 80` for a larger map; behind a proxy set `NODE_USE_ENV_PROXY=1`).

Every push to `main` runs the checks and deploys the build to GitHub Pages (`.github/workflows/pages.yml`).

## Credits

Star data: [HYG Database](https://github.com/astronexus/HYG-Database) by David Nash (astronexus), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The derived catalogue in `src/data/` is distributed under the same license.
