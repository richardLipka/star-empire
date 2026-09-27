# Star Empire

A strategic and tactical game at empire scale. The player commands an empire spread across several star systems in a universe where nothing travels faster than light.

Orders, reports and starships all move slower than light. News from a distant system is years old when it arrives, and an order sent today lands in a situation that has already changed. The player always acts on old and incomplete information.

Browser game in plain JavaScript (Vite + Three.js), no server.

- [Design and architecture](docs/DESIGN.md)
- [Implementation roadmap](docs/ROADMAP.md)

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev        # dev server with hot reload
npm run check      # lint + typecheck + tests
npm run build      # static build in dist/
```

Every push to `main` runs the checks and deploys the build to GitHub Pages (`.github/workflows/pages.yml`).

## Credits

Star data: [HYG Database](https://github.com/astronexus/HYG-Database) by David Nash (astronexus), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The derived catalogue in `src/data/` is distributed under the same license.
