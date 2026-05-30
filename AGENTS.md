# Repository Guidelines

Sprint Pulse is a zero-build, vanilla HTML/CSS/JS Jira analytics dashboard. Every file under `src/` is shipped as-is to the browser as an ES module — no bundler, no transpile step. The only tooling is a **dev-only** test runner (Vitest); `package.json` and `node_modules` are never deployed (GitHub Pages serves the static files only).

## Project Structure & Module Organization

`index.html` is the only entry point; it loads `src/app/main.js`. Modules are layered around a single shared shape — a `Sprint` with normalized `issues[]` (and a derived `Epic` built from those issues).

- `src/app/` — bootstrap and orchestration. `state.js` holds the single mutable `state` plus `setState` / `subscribe`, and a `createChannel()` factory backing the scoped setters (`setEpicViewState`, `setSprintViewState`, …) that repaint one region in isolation; `render.js` re-renders into `#root` on every change; `actions.js` is the only place side-effects (auth, fetching, parsing, persistence) live.
- `src/data/parsers/` — file adapters. `csv.js` (Jira CSV export, RFC-4180-ish), `xml.js` (Jira RSS/XML via `DOMParser`), `json.js` (REST search response or pre-shaped). `index.js` dispatches by extension. `demo.js` (in `src/data/`) provides the bundled fixture.
- `src/services/` — external integrations. `jira-api.js` talks **only** to the Cloudflare Worker proxy (never directly to Atlassian); `auth.js` lazy-loads the Firebase SDK and handles Microsoft sign-in + App Check; `firebase-config.js` holds public config; `data-cache.js` caches loaded data per source in an in-memory `Map` plus IndexedDB (namespaced `u:<uid>:…` while signed in) so switching sources or refreshing avoids re-fetching.
- `src/domain/` — pure logic. `status.js` collapses `statusCategory` → `todo|inprogress|done` (name-based fallback for CSV); `working-days.js` excludes Sat/Sun; `series.js` produces the daily series for every chart; `sprint-builder.js` and `epic-builder.js` group raw issues into the normalized shapes.
- `src/charts/` — SVG renderers. `svg.js` is the shared `svg()` / `path()` / `smoothPath()` helper; each chart file (`burndown`, `burnup`, `cfd`, `control`, `donut`, `epic-roadmap`) returns a detached DOM node. `burndown`/`burnup` are thin configs over the shared `area-line-chart.js` renderer.
- `src/ui/` — `dom.js` exports the `el()` helper used everywhere; `chart-helpers.js` holds shared axis/scale utilities; `hero-helpers.js` holds the date/meta cells shared by the Sprint and Epic hero cards; `format.js` holds shared label helpers (`statusLabel`, `shortSprintName`); `components/` exports one `renderX()` function per file.
- `cloudflare-worker/` — Worker proxy (`worker-dashboard.js` + `wrangler.toml`) that holds Jira credentials and exposes `/board`, `/sprints`, `/sprint/:id`, `/all`, `/epics`, `/epic/:key`. The browser only knows the Worker URL plus `boardId`.

`assets/styles.css` is the design-system port (treat as 1-for-1 with the source design); `assets/extras.css` is reserved for additions that don't belong in the ported file.

## Build, Test, and Development Commands

No build step. Because of ES modules, `file://` will not work — serve over HTTP from repo root:

```
python -m http.server 8080      # then open http://localhost:8080
# or: npx serve, php -S localhost:8080
```

Run the test suite (requires `npm install` once for the dev dependencies):

```
npm test                        # run once
npm run test:watch              # watch mode
npm run coverage                # v8 coverage report
npx vitest run tests/domain/series.test.js   # a single file
```

Deploy / iterate on the Jira proxy:

```
cd cloudflare-worker
wrangler login                  # one-time
wrangler dev                    # local Worker at http://localhost:8787
wrangler deploy                 # publish
```

## Testing Guidelines

Tests live in `tests/`, mirroring `src/`, named `*.test.js`. Vitest runs in Node for pure logic; files that build DOM (charts, components) or need `DOMParser` (`xml.js`) opt in with a `// @vitest-environment jsdom` header (see `tests/charts/`, `tests/ui/`, `tests/data/xml.test.js`). Coverage spans the pure layers (`domain/`, all `data/parsers/`, `app/state.js`) plus golden-master snapshots of every chart, hero and component's DOM output; only the network/Firebase services (`jira-api.js`, `auth.js`, `data-cache.js`) and event-handler behavior are left to manual testing. When refactoring a covered area, the rule is **tests stay green with no snapshot changes** — a changed snapshot means behavior changed, so confirm it was intended (`npx vitest -u` to accept). After touching the IO/event layers, still do a manual smoke pass: exercise all four data paths (Demo, Jira API via Worker, file import for CSV/XML/JSON) and both views (Sprint, Epic).

## Coding Style & Naming Conventions

- ES modules, 2-space indent, single quotes, semicolons, trailing commas in multi-line literals — match the surrounding files.
- No framework: build DOM via `el()` (`src/ui/dom.js`) and `svg()` (`src/charts/svg.js`). Do not introduce JSX, React, or a templating library.
- Files are kebab-case; exported functions are camelCase; renderer entry points are `renderX`.
- Side-effects belong in `src/app/actions.js`; components dispatch through actions and read via `getState()`. Mutate state with `setState` (re-renders) or `setStateSilent` (transient UI state only).
- Keep data adapters pure: they must output the same raw-issue shape consumed by `sprint-builder.js` so charts work identically across sources.

## Commit & Pull Request Guidelines

History uses short imperative lowercase subjects, often prefixed with a verb (`update`, `fix`, `add`, `enable`) and an area (`update UI: Board ID field`, `fix timezone & sync real data for charts`). Keep subjects under ~70 chars; no Conventional Commits prefix is used. No PR template — write a 1–2 line summary describing user-visible effect, and call out any change touching `cloudflare-worker/` or `firebase-config.js` since those affect deployed surface area.

## Security Notes

Never commit Jira credentials or Firebase secrets. Jira auth lives in the Worker's secrets (`wrangler secret put`); the browser never sees Atlassian tokens. Add new production origins to `ALLOWED_ORIGINS` in `cloudflare-worker/worker-dashboard.js` before deploying.
