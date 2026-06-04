# CLAUDE.md

Guidance for Claude Code working in this repo. **[AGENTS.md](AGENTS.md) is the
full guide** (architecture, build/test commands, layering rules, security) —
read it first. This file adds the conventions that are easy to violate and the
shared helpers you should reuse instead of re-deriving logic.

## TL;DR

Sprint Pulse is a zero-build, vanilla ES-module Jira analytics dashboard. No
bundler, no framework. `index.html` → `src/app/main.js`. DOM is built with
`el()` (`src/ui/dom.js`) and `svg()` (`src/charts/svg.js`). Side-effects live
only in `src/app/actions.js`. Tests are Vitest; UI/charts use golden-master
snapshots.

## Golden rule: reuse the shared helpers — don't duplicate logic

Before writing a piece of logic, check whether one of these already does it. If
you find the same logic in two places, extract it to the matching home below
rather than copy-pasting. (This file's existence is the result of one such pass.)

### Cross-cutting helpers

- **Jira issue/epic links** — `jiraLink({ jiraUrl, key, class, children?, stopClick? })`
  in [src/ui/format.js](src/ui/format.js). The single source for the
  `<base>/browse/<KEY>` anchor (target/rel/href shape). Used by the workload
  table, epic tasks table, heroes, roadmap and task panel. Never hand-write the
  `el('a', { href: \`${jiraUrl}/browse/...\` })` shape again — `class` and
  `children` differ per call site, so pass them in.
- **Other formatting** — `src/ui/format.js` also holds `statusLabel`,
  `shortSprintName`, `fmtDateSlash` / `fmtDateShort` / `fmtDateTime`, `initials`,
  `timeAgo`. `src/ui/hero-helpers.js` holds the date/meta cells shared by the
  Sprint and Epic hero cards.
- **Stub / empty epic** — `buildStubEpic(key, { name?, summary?, today?, detailLoaded? })`
  and `emptyEpicProgress()` in [src/domain/epic-builder.js](src/domain/epic-builder.js).
  Use these for the placeholder epic shown while detail loads (see
  `actions.buildEpicFromDetail` and `render.renderNavTop`) — don't inline the
  zeroed `progress` object.
- **Shared UI modules** — `panel-shell.js` (backdrop + close + Escape), `user-cell.js`,
  `issue-type-icon.js`, `scroll-visibility.js` (FAB scroll show/hide, shared by
  both FABs), `view-tabs.js` (`renderTabBtn`/icons reused by the FAB variant).
- **Shared chart code** — `svg.js` (`svg`/`path`/`smoothPath`), `chart-helpers.js`
  (axis/scale), `area-line-chart.js` (burndown & burnup are thin configs over it).

### actions.js (side-effect layer) helpers

- **`resolveApiContext()`** — returns `{ workerUrl, boardId }` or `null`. The
  pair every Jira API call needs. Use it in flows that bail silently when config
  is missing (background refresh, lazy detail). Flows that surface a distinct
  user-facing message per missing piece check the two individually on purpose —
  leave those as-is.
- **`persistSetting(key, value)`** — localStorage write that tolerates private
  mode. Used by `setLanguage` / `setTheme`.
- **State-reset shapes** — `demoSourceState()`, `freshEpicData()`, `freshEpicUi()`
  keep logout/load/refresh/restore in sync. Reuse them; don't re-list the fields.

## Cross-cutting systems (have a "don't break this" gotcha)

- **i18n** (`src/app/i18n.js`, `locales/*.js`): every user-facing string goes
  through `t('key', params?)`. Module-level const objects (e.g. `CHART_TOOLTIPS`,
  `LOAD_STEPS`) must store i18n **keys**, not `t()` results, and resolve at render
  time — otherwise they freeze to the boot language. Watch for callback params
  named `t` shadowing the import.
- **Theme** (`src/app/theme.js`, dark-first `:root` + `html.theme-light`
  override): theme switching is **render-free** — every colour is a CSS `var(--*)`,
  so `setTheme` only flips the class + persists (`setStateSilent`), no `render()`.
  Don't reintroduce a full render on theme change. New components: style the base
  rule for dark; add a `.theme-light .foo` override only if light differs.
- **Render channels** (`src/app/state.js`): a full `setState` re-renders the whole
  page (re-randomizes the background particles, replays chart draw-ins). Prefer
  the scoped setters (`setSprintViewState`, `setEpicViewState`,
  `setEpicRoadmapState`, `setLoadProgressState`, `setDataSourceState`) to repaint
  one region. Use `setStateSilent` for transient input state.
- **Auto-refresh** (`src/app/auto-refresh.js` + `actions.silentRefresh`): a 5-min
  setTimeout-chain poller for the API source that patches only changed regions via
  scoped channels (never `setState`), with backoff and tab-visibility pausing.

## Tests

Run `npm test`. The rule (from AGENTS.md): **tests stay green with no snapshot
changes** — a changed snapshot means rendered DOM changed, so confirm it was
intended before accepting with `npx vitest -u`. Snapshot tests run in jsdom and
do **not** apply CSS, so an inline-style→CSS-class move legitimately changes the
captured HTML even when pixels are identical. Pure refactors (extracting a helper
that emits byte-identical DOM, like `jiraLink`) must leave snapshots untouched.

## Style

ES modules, 2-space indent, single quotes, semicolons, trailing commas in
multi-line literals. Files kebab-case; exported functions camelCase; renderer
entry points `renderX`. Match the surrounding file.
