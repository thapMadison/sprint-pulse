# Sprint Pulse — Jira Analytics Dashboard

A self-contained **vanilla HTML/CSS/JS** dashboard that reads Jira sprint data and renders:

- Sprint filter (active / closed / future)
- Sprint info card (name, start/end, working-day duration, working-day remaining)
- Original Estimate (h), Time Spent (h), Remaining Effort tiles
- Status by Category donut (To Do / In Progress / Done)
- **Burndown**, **Burnup**, **Cumulative Flow Diagram**, **Control Chart**
- Per-user workload table (totals + per-issue Estimate / Spent / Remaining; click a row to expand)

No build step, no framework — just open `index.html` through a small static server.

## Run locally

Because the project uses ES modules, you need to serve it over `http://`, not `file://`.

```
# from this directory
python -m http.server 8080
# then open http://localhost:8080
```

Any static server works (`npx serve`, `php -S localhost:8080`, etc.).

## Data sources

The bar between the topbar and the sprint filter lets you switch between:

1. **Demo data** (default) — three bundled sprints from the design so you can see the dashboard immediately.
2. **Connect with Jira** — enter your Atlassian Cloud base URL, email, API token, and Board ID. The page calls:
   ```
   GET {base}/rest/agile/1.0/board/{boardId}/sprint?state=active,closed,future
   GET {base}/rest/agile/1.0/sprint/{sprintId}/issue?fields=summary,status,assignee,timetracking,issuetype,priority
   ```
   Credentials are kept in memory only — nothing is saved to disk or localStorage.

   Get an API token at https://id.atlassian.com/manage-profile/security/api-tokens.

   > **CORS note**: Atlassian Cloud does **not** allow direct browser → `*.atlassian.net` requests. To use the Jira API, deploy the included Cloudflare Worker proxy (see below) or fall back to **Import file**.

## Deploying the Cloudflare Worker (for Jira API access)

The `cloudflare-worker/` folder contains a proxy that bypasses CORS restrictions.

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Login to Cloudflare (free account works)
wrangler login

# 3. Deploy
cd cloudflare-worker
wrangler deploy
```

After deployment, you'll get a URL like `https://jira-proxy.<subdomain>.workers.dev`.

**Configure the frontend:**
1. Open `src/data/jira-api.js`
2. Set `PROXY_URL` to your Worker URL:
   ```js
   const PROXY_URL = 'https://jira-proxy.your-subdomain.workers.dev';
   ```

**Add your production domain** to `ALLOWED_ORIGINS` in `cloudflare-worker/worker-dashboard.js` before deploying to production.

3. **Import CSV / XML / JSON file** — point at an export from Jira:
   - **CSV**: Jira → `Filters` → run a JQL search → `Export Excel CSV (current fields)`. The parser understands the standard column set: `Issue key`, `Summary`, `Status`, `Status Category`, `Priority`, `Assignee`, `Sprint`, `Σ Original Estimate` / `Original Estimate`, `Σ Time Spent`, `Σ Remaining Estimate`, plus Issue Type. Time columns may be either seconds or strings like `1d 4h`.
   - **XML**: Jira's RSS / XML view (`https://<host>/sr/jira.issueviews:searchrequest-xml/...`). Pulls `<key>`, `<summary>`, `<status>`, `<assignee>`, `<timeoriginalestimate seconds="…">`, `<timespent seconds="…">`, `<timeestimate seconds="…">`, and the `<customfield name="Sprint">` blob (including embedded start/end/state).
   - **JSON**: either an array of pre-shaped issue records, or a Jira REST search response of the form `{ "issues": [ { "key": "...", "fields": { ... } }, ... ] }`.

## What gets computed client-side

| Metric | Logic |
| --- | --- |
| Original Estimate (h) | Σ `issue.originalEstimate` |
| Time Spent (h) | Σ `issue.timeSpent` |
| Remaining Effort (h) | Σ `issue.remainingEstimate` |
| Duration | Working days between sprint start & end (excludes Sat/Sun) |
| Remaining | Working days from today to sprint end (0 if closed, full duration if future) |
| Status counts | Mapped from `statusCategory.key` (`new`/`indeterminate`/`done`) → `todo`/`inprogress`/`done`, with a name-based fallback for CSV exports |
| Burndown | Ideal linear line vs. interpolated actual remaining series |
| Burnup | Sprint scope (with mid-sprint creep on active) vs. cumulative completed |
| CFD | Per-day cumulative counts of Done / In Progress / To Do |
| Control Chart | Cycle time per completed issue + mean ± 2σ band, outliers flagged |

## Project layout

```
index.html                    — entry; loads ES module src/main.js
assets/
  styles.css                  — design system (ported 1-for-1 from the design bundle)
  extras.css                  — adds styles for data-source bar + inline API panel
src/
  main.js                     — bootstrap, state, render
  domain/
    working-days.js           — workingDaysBetween, workingDaysRemaining
    status.js                 — normalize Jira status → todo|inprogress|done; build SPRINTS
    series.js                 — generateDailySeries (burndown/burnup/CFD/control)
  data/
    demo.js                   — bundled demo SPRINTS
    jira-api.js               — REST client (Basic auth)
    csv-parser.js             — Jira CSV export parser (RFC-4180-ish)
    xml-parser.js             — Jira XML/RSS export parser (DOMParser)
  components/
    background.js             — animated blobs + grid noise + particles
    topbar.js                 — brand + status pills
    data-source.js            — Demo / API / File switcher with inline API form
    sprint-filter.js          — sprint tab picker
    sprint-hero.js            — sprint card + 3 stat tiles
    workload-table.js         — expandable user table
  charts/
    svg.js                    — small DOM/SVG helpers (svg, el, path/smoothPath)
    burndown.js / burnup.js / cfd.js / control.js / donut.js
```

## Why JSON over CSV / XML / Excel?

The dashboard's underlying model needs nested data (issue → worklogs, sprint metadata, status category). JSON from the Jira REST API preserves that structure with no parsing loss, which is why the live API path is the recommended primary source. CSV and XML are first-class fallbacks for when CORS / network access is not available, and we map them to the same internal shape so all four charts work identically across sources.

## Design credit

Visual design ported from the `claude.ai/design` "Sprint Pulse" bundle (HTML/CSS/JS prototype). All visuals, colour tokens, and chart styles are kept 1-for-1 with the original; the Tweaks panel and "Data Source · Format Strategy" cards were intentionally dropped per scope.
