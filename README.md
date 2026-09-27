# Star Empire

A strategic and tactical game at empire scale. The player commands an empire spread across several star systems in a universe where nothing travels faster than light.

Orders, reports and starships all move slower than light. News from a distant system is years old when it arrives, and an order sent today lands in a situation that has already changed. The player always acts on old and incomplete information.

Browser game in plain JavaScript (Vite + Three.js), no server.

- [Design and architecture](docs/DESIGN.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Research module](docs/RESEARCH.md)
- [Communication security](docs/SECURITY.md)
- [Game data and licences](src/data/README.md)

Current state (M4 + M12): a 3D map of the real stars within 50 light-years of Sol. Empire A's relay network carries reports and orders at light speed, hop by hop. The player gives **general directives to governors** (explore, settle, readiness, courier runs, reporting, relay maintenance and more, in eight categories). Each directive reaches its system at light speed, and its status (in transit, awaiting report, in effect…) is known only from the reports that come back. Scouts survey, settlers found outposts, and the empire grows on its own. **Research** spans ten areas and 87 technologies. Each breakthrough reveals one technology and closes off rival applications, blueprints spread at light speed, and the research screen shows the whole technology web. **Relay traffic can be overheard** by foreign listening posts near a beam. Ciphers and codebreakers decide what can be read, and couriers are slower but safe. The map shows what the capital knows and how old it is, coloured by spectral class, status or information age. Drive plumes are detected only when the exhaust points at an observer. The interface is available in **English and Czech**, and all texts live in `src/i18n/locales/`.

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
