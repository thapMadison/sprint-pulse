# Repository Guidelines

Sprint Pulse is a zero-build, vanilla HTML/CSS/JS Jira analytics dashboard. There is no bundler, no package manager, and no test runner — every file under `src/` is shipped as-is to the browser as an ES module.

## Project Structure & Module Organization

`index.html` is the only entry point; it loads `src/app/main.js`. Modules are layered around a single shared shape — a `Sprint` with normalized `issues[]` (and a derived `Epic` built from those issues).

- `src/app/` — bootstrap and orchestration. `state.js` holds the single mutable `state` plus `setState` / `subscribe`; `render.js` re-renders into `#root` on every change; `actions.js` is the only place side-effects (auth, fetching, parsing, persistence) live.
- `src/data/parsers/` — file adapters. `csv.js` (Jira CSV export, RFC-4180-ish), `xml.js` (Jira RSS/XML via `DOMParser`), `json.js` (REST search response or pre-shaped). `index.js` dispatches by extension. `demo.js` (in `src/data/`) provides the bundled fixture.
- `src/services/` — external integrations. `jira-api.js` talks **only** to the Cloudflare Worker proxy (never directly to Atlassian); `auth.js` lazy-loads the Firebase SDK and handles Microsoft sign-in + App Check; `firebase-config.js` holds public config.
- `src/domain/` — pure logic. `status.js` collapses `statusCategory` → `todo|inprogress|done` (name-based fallback for CSV); `working-days.js` excludes Sat/Sun; `series.js` produces the daily series for every chart; `sprint-builder.js` and `epic-builder.js` group raw issues into the normalized shapes.
- `src/charts/` — SVG renderers. `svg.js` is the shared `svg()` / `path()` / `smoothPath()` helper; each chart file (`burndown`, `burnup`, `cfd`, `control`, `donut`, `epic-timeline`) returns a detached DOM node.
- `src/ui/` — `dom.js` exports the `el()` helper used everywhere; `chart-helpers.js` holds shared axis/scale utilities; `components/` exports one `renderX()` function per file.
- `cloudflare-worker/` — Worker proxy (`worker-dashboard.js` + `wrangler.toml`) that holds Jira credentials and exposes `/all`, `/sprint/:id`, `/sprints`, `/epics`, `/epic/:key`. The browser only knows the Worker URL plus `boardId`.

`assets/styles.css` is the design-system port (treat as 1-for-1 with the source design); `assets/extras.css` is reserved for additions that don't belong in the ported file.

## Build, Test, and Development Commands

No build step. Because of ES modules, `file://` will not work — serve over HTTP from repo root:

```
python -m http.server 8080      # then open http://localhost:8080
# or: npx serve, php -S localhost:8080
```

Deploy / iterate on the Jira proxy:

```
cd cloudflare-worker
wrangler login                  # one-time
wrangler dev                    # local Worker at http://localhost:8787
wrangler deploy                 # publish
```

No automated tests exist; verify changes manually by exercising all four data paths (Demo, Jira API via Worker, file import for CSV/XML/JSON) and both views (Sprint, Epic).

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
