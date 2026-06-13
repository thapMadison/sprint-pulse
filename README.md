# Sprint Pulse — Jira Analytics Dashboard

A self-contained, **zero-build vanilla ES-module** dashboard that reads Jira data
and renders sprint + portfolio analytics. No bundler, no framework — `index.html`
loads `src/app/main.js` and the app builds its DOM with small `el()` / `svg()`
helpers.

It has two top-level views:

**Sprint view** — pick a sprint (or the **Backlog**) from the filter bar, then see:

- Sprint info card (name, goal, start/end, working-day duration & remaining)
- Original Estimate / Time Spent / Remaining Effort tiles
- Status-by-category donut (To Do / In Progress / Done)
- **Burndown**, **Burnup**, **Cumulative Flow Diagram**, **Control Chart**
- Per-user workload table (totals + per-issue Estimate / Spent / Remaining;
  click a row to expand, filter by status, search)

> The **Backlog** tab shows issues not assigned to any sprint. Because a backlog
> has no timeline, it renders the hero, status donut and workload table only —
> the four time-series charts are omitted. The Backlog pill is always present for
> a Jira board (its issues load on demand the first time you open it).

**Epic view** — a portfolio roadmap (Gantt-style) across epics with progress bars,
sprint bands, an expandable epic → task breakdown, and per-epic detail panels.

Other niceties: dark/light theme (CSS-only, instant toggle), English/Vietnamese
i18n, an animated background, and a 5-minute background auto-refresh for the Jira
source.

## Run locally

Because the project uses ES modules, serve it over `http://`, not `file://`:

```
# from this directory
python -m http.server 8080
# then open http://localhost:8080
```

Any static server works (`npx serve`, `php -S localhost:8080`, etc.).

## Tests

```
npm install   # dev-only: vitest + jsdom
npm test      # vitest run
```

UI and chart tests are golden-master snapshots (jsdom, no CSS applied). A changed
snapshot means rendered DOM changed — confirm it was intended before updating with
`npx vitest -u`.

## Data sources

The bar between the topbar and the sprint filter switches between three sources:

1. **Demo data** (default) — bundled sprints + epics so the dashboard renders
   immediately on first load, including a sample Backlog.
2. **Connect with Jira** — sign in (Microsoft SSO via Firebase Auth), then enter a
   **Board ID**. All Jira calls go through the Cloudflare Worker proxy (see below);
   the browser never holds Atlassian credentials. Loaded data is cached per-user in
   IndexedDB so re-opening a board (or refreshing the page) is instant.
3. **Import file (CSV / XML / JSON)** — point at an export from Jira:
   - **CSV**: Jira → `Filters` → run a JQL search → `Export Excel CSV (current
     fields)`. The parser understands the standard column set: `Issue key`,
     `Summary`, `Status`, `Status Category`, `Priority`, `Assignee`, `Sprint`,
     `Σ Original Estimate` / `Original Estimate`, `Σ Time Spent`,
     `Σ Remaining Estimate`, plus Issue Type. Time columns may be seconds or
     strings like `1d 4h`.
   - **XML**: Jira's RSS / XML view. Pulls `<key>`, `<summary>`, `<status>`,
     `<assignee>`, the time fields, and the `<customfield name="Sprint">` blob
     (including embedded start/end/state).
   - **JSON**: either an array of pre-shaped issue records, or a Jira REST search
     response of the form `{ "issues": [ { "key": "...", "fields": { ... } } ] }`.

   Issues with no sprint collapse into a single **Backlog** group in every source.

   > **CORS note**: Atlassian Cloud does **not** allow direct browser →
   > `*.atlassian.net` requests. The Jira API path therefore requires the
   > Cloudflare Worker proxy. Import file is the credential-free fallback.

## Cloudflare Worker (Jira API proxy)

`cloudflare-worker/worker-dashboard.js` holds the Jira credentials and exposes a
small REST surface. The browser only ever knows the Worker URL plus a `boardId`.

### Deploy

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Login (a free Cloudflare account works)
wrangler login

# 3. Set the Jira credentials as Worker secrets (never committed)
cd cloudflare-worker
wrangler secret put JIRA_BASE_URL     # https://your-company.atlassian.net
wrangler secret put JIRA_EMAIL        # your-email@company.com
wrangler secret put JIRA_API_TOKEN    # from id.atlassian.com/manage-profile/security/api-tokens

# Optional: override the Sprint custom-field id if your instance isn't the
# Jira Cloud default (customfield_10020). Only used by the /backlog fallback path
# for multi-project boards with no single projectKey.
# wrangler secret put SPRINT_FIELD_ID   # e.g. customfield_10010

# 4. Deploy
wrangler deploy
```

You'll get a URL like `https://jira-proxy.<subdomain>.workers.dev`.

### Configure the frontend

The frontend reads its Worker URL and Jira base URL from **Firebase Realtime
Database** (so they aren't hardcoded in the client), under:

```
tools/{TOOL_ID}/config/worker-url   → https://jira-proxy.<subdomain>.workers.dev
tools/{TOOL_ID}/config/jira-url      → https://your-company.atlassian.net
```

`jira-url` is used to build `…/browse/<KEY>` links to issues and epics.

### Allowed origins

Add your production domain to `ALLOWED_ORIGINS` in
`cloudflare-worker/worker-dashboard.js` before deploying to production (localhost
origins are already listed for dev).

### Endpoints

All take `?boardId=xxx`. Each returns issues in one normalized shape, so the
client's sprint/epic builders treat every source identically.

| Endpoint | Returns |
| --- | --- |
| `GET /board` | Board metadata (id, name, type) for display labels |
| `GET /sprints` | The board's sprint list (active / closed / future) |
| `GET /backlog` | Backlog issues: project items with no sprint, not Done, type Task/Story/Bug, tagged `sprintState: 'backlog'` |
| `GET /sprint/:id` | One sprint's issues + changelog + status-category maps |
| `GET /all` | Every sprint's issues (no changelog) — bulk initial load |
| `GET /statuses` | The project's full workflow status list → authoritative colour map |
| `GET /epics` | Epic issues visible on the board |
| `GET /epic/:key` | An epic's child issues + changelog |
| `GET /issue/:key` | Full single-issue detail (description, comments, labels, dates) |

## Debugging

When the **Jira API** source is active, a background poller refreshes every 5
minutes (with failure backoff and tab-visibility pausing). Its verbose tracing is
off by default. Enable it at runtime from the browser devtools console — no reload:

```js
localStorage.setItem('sprint_pulse_debug', '1');   // enable
localStorage.removeItem('sprint_pulse_debug');      // disable
```

With the flag on you'll see `[AutoRefresh] …` traces per cycle (skip reasons,
fetches, change detection, per-epic refresh, next-tick delay). Error logs always
print regardless of the flag.

## What gets computed client-side

| Metric | Logic |
| --- | --- |
| Original Estimate (h) | Σ `issue.originalEstimate` |
| Time Spent (h) | Σ `issue.timeSpent` |
| Remaining Effort (h) | Σ `issue.remainingEstimate` |
| Duration | Working days between sprint start & end (excludes Sat/Sun) |
| Remaining | Working days from today to sprint end (0 if closed, full duration if future) |
| Status counts | `statusCategory.key` (`new`/`indeterminate`/`done`) → `todo`/`inprogress`/`done`, with a name-based fallback for CSV exports |
| Burndown | Ideal linear line vs. changelog-derived (or interpolated) actual remaining |
| Burnup | Sprint scope (with mid-sprint creep on active) vs. cumulative completed |
| CFD | Per-day cumulative counts of Done / In Progress / To Do |
| Control Chart | Cycle time per completed issue + mean ± 2σ band, outliers flagged |
| Epic roadmap | Per-epic start/end derived from child-issue changelog; progress = done/total |

## Project layout

```
index.html                       — entry; loads src/app/main.js
assets/
  styles.css                     — design system (dark-first; .theme-light overrides)
  extras.css                     — data-source bar, inline API panel, filters, etc.
src/
  app/
    main.js                      — bootstrap, render-channel wiring
    state.js                     — central state + scoped render channels
    actions.js                   — ALL side-effects (auth, fetch, parse, persist)
    render.js                    — renderers + scoped repaints
    auto-refresh.js              — 5-min background poller
    i18n.js  locales/{en,vi}.js  — t() text system
    theme.js  constants.js  debug.js
  domain/
    sprint-builder.js            — group issues → sprints; build shells + Backlog shell
    epic-builder.js              — build epics + progress/date enrichment
    series.js                    — generateDailySeries (burndown/burnup/CFD/control)
    status.js  status-colors.js  working-days.js  epic-filters.js
  data/
    demo.js                      — bundled demo sprints + epics (incl. Backlog)
    parsers/{csv,xml,json}.js    — file-import parsers → normalized issues
  services/
    auth.js                      — Firebase Auth + RTDB config (worker/jira URLs)
    jira-api.js                  — Worker REST client
    data-cache.js                — per-user IndexedDB snapshot cache
    firebase-config.js
  ui/
    dom.js  format.js  hero-helpers.js  chart-helpers.js
    components/                  — topbar, data-source-bar, sprint-filter,
                                   sprint-hero, workload-table, view-tabs,
                                   epic-*, task-detail-panel, FABs, …
  charts/
    svg.js  area-line-chart.js
    burndown.js  burnup.js  cfd.js  control.js  donut.js  epic-roadmap.js
cloudflare-worker/
  worker-dashboard.js            — Jira API proxy (see Endpoints above)
  wrangler.toml
```

See [AGENTS.md](AGENTS.md) for the full architecture, layering rules, and
conventions, and [CLAUDE.md](CLAUDE.md) for the shared-helper reuse guide.

## Why JSON over CSV / XML?

The model needs nested data (issue → changelog, sprint metadata, status category).
JSON from the Jira REST API preserves that with no parsing loss, which is why the
live API path is the recommended primary source. CSV and XML are first-class
fallbacks for when CORS / network access isn't available; all sources map to the
same internal shape so every chart works identically.
