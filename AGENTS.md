# Repository Guidelines

Sprint Pulse is a zero-build, vanilla HTML/CSS/JS Jira analytics dashboard. There is no bundler, no package manager, and no test runner — every file you see is shipped as-is to the browser.

## Project Structure & Module Organization

`index.html` is the only entry point; it loads `src/main.js` as an ES module. Everything else is layered behind a single shared internal shape (a `Sprint` with normalized `issues[]`):

- `src/data/` — adapters that produce that shape. `jira-api.js` (REST + Basic auth), `csv-parser.js` (Jira CSV export, RFC-4180-ish), `xml-parser.js` (Jira RSS/XML via `DOMParser`), and `demo.js` (bundled fixture).
- `src/domain/` — pure logic on the normalized shape. `status.js` collapses Jira `statusCategory` → `todo|inprogress|done` (with a name-based fallback for CSV exports that lack category keys), `working-days.js` excludes Sat/Sun, `series.js` generates the daily series consumed by every chart.
- `src/charts/` — SVG renderers. `svg.js` is the shared `el()` / `svg()` / `path()` helper; each chart file (`burndown`, `burnup`, `cfd`, `control`, `donut`) returns a detached DOM node.
- `src/components/` — same `el()`-based render pattern; each exports a single `render*` function that returns a DOM node.
- `src/main.js` — holds the single mutable `state` object and a top-level `render()` that re-renders into `#root` on every state change.

`assets/styles.css` is the design-system port (treat as 1-for-1 with the source design); `assets/extras.css` is reserved for additions that don't belong in the ported file.

## Build, Test, and Development Commands

There is no build step. Because of ES modules, `file://` will not work — serve over HTTP:

```
python -m http.server 8080      # then open http://localhost:8080
# or: npx serve, php -S localhost:8080, etc.
```

No automated tests exist; verify changes manually by exercising all three data sources (Demo, Jira API, file import) in the data-source bar.

## Coding Style & Naming Conventions

- ES modules, 2-space indent, single quotes, semicolons, trailing commas in multi-line literals — match the surrounding files.
- No framework: build DOM via the `el()` / `svg()` helpers in `src/charts/svg.js`. Do not introduce JSX, React, or a templating library.
- Files are kebab-case; exported functions are camelCase; renderer entry points are `renderX`.
- Keep data adapters pure: they must output the same normalized `Sprint` shape so the charts work identically across sources.

## Adding a New Data Source

Add a parser under `src/data/` that returns `Sprint[]` matching the shape produced by `demo.js`, then wire a new tab into `src/components/data-source.js` and dispatch its `onLoad({ sprints, sourceLabel, sourceKey })` callback. Do not store credentials — the API path keeps them in memory only.
