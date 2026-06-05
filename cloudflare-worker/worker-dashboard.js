// Cloudflare Worker - Jira Sprint API
// Credentials stored as Environment Variables (set in Settings > Variables)
//
// Environment Variables needed:
//   JIRA_BASE_URL  = https://your-company.atlassian.net
//   JIRA_EMAIL     = your-email@company.com
//   JIRA_API_TOKEN = your-api-token
//
// boardId is passed from client via ?boardId=xxx query param

const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  // Add your production domains:
  // 'https://your-app.github.io',
  // 'https://your-app.pages.dev',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function authHeader(email, token) {
  return 'Basic ' + btoa(email + ':' + token);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Get boardId from query param (passed by client)
    const boardId = url.searchParams.get('boardId');

    // Validate env vars
    if (!env.JIRA_BASE_URL || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
      return json({ error: 'Missing environment variables (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN). Configure in Worker Settings.' }, 500, cors);
    }
    if (!boardId) {
      return json({ error: 'Missing boardId. Pass ?boardId=xxx in the request URL.' }, 400, cors);
    }

    const headers = {
      'Authorization': authHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN),
      'Accept': 'application/json',
    };

    try {
      // GET /board - Board metadata (name/type) for display labels.
      if (path === '/board') {
        const data = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}`,
          headers
        );
        return json({ id: data.id, name: data.name || null, type: data.type || null }, 200, cors);
      }

      // GET /sprints - List all sprints for the board
      if (path === '/sprints' || path === '/') {
        const data = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=50`,
          headers
        );
        return json(data.values || [], 200, cors);
      }

      // GET /statuses - Full project workflow status list with categories. Lets the
      // client build an authoritative board-wide status→colour map (buildStatusColorMap)
      // instead of inferring categories from whichever statuses happen to be current.
      // Returns [] for boards without a single projectKey (client falls back to issues).
      if (path === '/statuses') {
        const maps = await fetchProjectStatusMaps(env, headers, boardId);
        // ?debug=1 surfaces the resolved projectKey + count for diagnosing empty results.
        if (url.searchParams.get('debug')) {
          return json({ projectKey: maps.projectKey, count: maps.list.length, list: maps.list }, 200, cors);
        }
        return json(maps.list, 200, cors);
      }

      // GET /sprint/:id - Get issues for a specific sprint
      const sprintMatch = path.match(/^\/sprint\/(\d+)$/);
      if (sprintMatch) {
        const sprintId = sprintMatch[1];

        const [sprintInfo, issuesData, workflowMaps] = await Promise.all([
          jiraFetch(`${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}`, headers),
          jiraFetch(
            `${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,assignee,timetracking,issuetype,priority,created,updated,parent&expand=changelog&maxResults=200`,
            headers
          ),
          fetchProjectStatusMaps(env, headers, boardId),
        ]);

        const rawIssues = issuesData.issues || [];

        // Authoritative name→category AND id→category maps. Base = the project's full
        // workflow status list (covers history-only statuses no current issue holds),
        // overlaid with current-issue statuses (also authoritative; guarantees each
        // issue's live status is present even if the project list lagged). The id map
        // resolves changelog transitions via item.from / item.to.
        const statusCategoryByName = { ...workflowMaps.byName };
        const statusCategoryById = { ...workflowMaps.byId };
        for (const iss of rawIssues) {
          const st = iss.fields?.status;
          if (st?.name && st?.statusCategory) {
            statusCategoryByName[st.name] = st.statusCategory;
          }
          if (st?.id && st?.statusCategory) {
            statusCategoryById[String(st.id)] = st.statusCategory;
          }
        }

        // Transform to app format
        const issues = rawIssues.map(iss => {
          const f = iss.fields || {};
          const tt = f.timetracking || {};
          const assignee = f.assignee || {};
          const status = f.status || { name: 'To Do', statusCategory: { key: 'new' } };
          return {
            key: iss.key,
            summary: f.summary || '',
            type: f.issuetype?.name || 'Task',
            priority: f.priority?.name || 'Medium',
            status,
            assigneeName: assignee.displayName || 'Unassigned',
            assigneeId: assignee.accountId || '',
            originalEstimate: toHours(tt.originalEstimateSeconds),
            timeSpent: toHours(tt.timeSpentSeconds),
            remainingEstimate: toHours(tt.remainingEstimateSeconds),
            sprintName: sprintInfo.name,
            sprintStartDate: sprintInfo.startDate?.slice(0, 10) || null,
            sprintEndDate: sprintInfo.endDate?.slice(0, 10) || null,
            sprintState: (sprintInfo.state || '').toLowerCase(),
            sprintGoal: sprintInfo.goal || '',
            statusChanges: extractStatusChanges(iss.changelog, f.created, f.updated, status, statusCategoryByName, statusCategoryById),
            epicKey: f.parent?.key || null,
            epicName: f.parent?.fields?.summary || null,
          };
        });

        return json({
          sprint: {
            id: sprintInfo.id,
            name: sprintInfo.name,
            state: sprintInfo.state,
            startDate: sprintInfo.startDate,
            endDate: sprintInfo.endDate,
            goal: sprintInfo.goal,
          },
          statusCategoryByName,
          issues,
        }, 200, cors);
      }

      // GET /all - Get all sprints with issues (for initial load)
      if (path === '/all') {
        const sprintsData = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=50`,
          headers
        );
        const sprints = sprintsData.values || [];

        // No changelog here - it makes the response too large and causes timeouts.
        // Changelog is fetched on-demand per-sprint via /sprint/:id.
        const allIssues = [];
        for (const sp of sprints) {
          const issuesData = await jiraFetch(
            `${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sp.id}/issue?fields=summary,status,assignee,timetracking,issuetype,priority,parent&maxResults=200`,
            headers
          );
          for (const iss of issuesData.issues || []) {
            const f = iss.fields || {};
            const tt = f.timetracking || {};
            const assignee = f.assignee || {};
            allIssues.push({
              key: iss.key,
              summary: f.summary || '',
              type: f.issuetype?.name || 'Task',
              priority: f.priority?.name || 'Medium',
              status: f.status || { name: 'To Do', statusCategory: { key: 'new' } },
              assigneeName: assignee.displayName || 'Unassigned',
              assigneeId: assignee.accountId || '',
              originalEstimate: toHours(tt.originalEstimateSeconds),
              timeSpent: toHours(tt.timeSpentSeconds),
              remainingEstimate: toHours(tt.remainingEstimateSeconds),
              sprintId: sp.id,
              sprintName: sp.name,
              sprintStartDate: sp.startDate?.slice(0, 10) || null,
              sprintEndDate: sp.endDate?.slice(0, 10) || null,
              sprintState: (sp.state || '').toLowerCase(),
              sprintGoal: sp.goal || '',
              epicKey: f.parent?.key || null,
              epicName: f.parent?.fields?.summary || null,
            });
          }
        }

        return json(allIssues, 200, cors);
      }

      // GET /epics - List Epic issues visible on the board.
      // Preferred path: resolve a projectKey from board configuration and run a
      // project-wide JQL search (gets all epics in the project, including ones
      // with no current child issues on the board).
      // Fallback path: boards without a `location.projectKey` — e.g. boards
      // backed by a multi-project JQL filter, or kanban boards configured
      // without a single project context — use Jira's agile `/board/{id}/epic`
      // endpoint, which returns epics scoped to the board itself.
      if (path === '/epics') {
        const boardCfg = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/configuration`,
          headers
        );
        const projectKey = boardCfg?.location?.projectKey;

        if (projectKey) {
          const jql = encodeURIComponent(`project = ${projectKey} AND issuetype = Epic`);
          const epicData = await jiraFetch(
            `${env.JIRA_BASE_URL}/rest/api/3/search/jql?jql=${jql}&fields=summary,status&maxResults=200`,
            headers
          );
          const epics = (epicData.issues || []).map((iss) => {
            const f = iss.fields || {};
            return {
              key: iss.key,
              name: f.summary || iss.key,
              summary: f.summary || '',
              status: f.status || { name: 'To Do', statusCategory: { key: 'new' } },
            };
          });
          return json(epics, 200, cors);
        }

        // Fallback: paginate through `/board/{id}/epic`. The endpoint returns
        // { values, isLast, startAt } and exposes `done: boolean` per epic —
        // no full status object, so synthesize one matching the shape the
        // epic-builder downstream consumes (status.name + status.statusCategory.key).
        const collected = [];
        let startAt = 0;
        const PAGE = 50;
        for (let i = 0; i < 10; i++) {
          const page = await jiraFetch(
            `${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/epic?startAt=${startAt}&maxResults=${PAGE}`,
            headers
          );
          const values = page?.values || [];
          collected.push(...values);
          if (page?.isLast || values.length < PAGE) break;
          startAt += values.length;
        }

        const epics = collected.map((iss) => ({
          key: iss.key,
          name: iss.name || iss.key,
          summary: iss.summary || iss.name || '',
          status: iss.done
            ? { name: 'Done', statusCategory: { key: 'done' } }
            : { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        }));
        return json(epics, 200, cors);
      }

      // GET /epic/:epicKey - Get all child issues of an epic with changelog.
      // Used for progressive loading in the Epic tab: fetch detail per epic
      // rather than per sprint, so each epic's roadmap bar can render as soon
      // as its data arrives.
      const epicIssuesMatch = path.match(/^\/epic\/([A-Z]+-\d+)$/i);
      if (epicIssuesMatch) {
        const epicKey = epicIssuesMatch[1].toUpperCase();

        // Fetch epic metadata first
        const epicJql = encodeURIComponent(`key = ${epicKey}`);
        const epicData = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/api/3/search/jql?jql=${epicJql}&fields=summary,status`,
          headers
        );
        const epicIssue = epicData.issues?.[0];
        if (!epicIssue) {
          return json({ error: `Epic ${epicKey} not found` }, 404, cors);
        }

        // Fetch all child issues with changelog + the project's full status list
        // (authoritative category source for history-only statuses).
        const childJql = encodeURIComponent(`parent = ${epicKey} ORDER BY created ASC`);
        const [issuesData, workflowMaps] = await Promise.all([
          jiraFetch(
            `${env.JIRA_BASE_URL}/rest/api/3/search/jql?jql=${childJql}&fields=summary,status,assignee,timetracking,issuetype,priority,created,updated,customfield_10020&expand=changelog&maxResults=200`,
            headers
          ),
          fetchProjectStatusMaps(env, headers, boardId),
        ]);

        const rawIssues = issuesData.issues || [];

        // Authoritative maps: project workflow base, overlaid with current-issue statuses.
        const statusCategoryByName = { ...workflowMaps.byName };
        const statusCategoryById = { ...workflowMaps.byId };
        for (const iss of rawIssues) {
          const st = iss.fields?.status;
          if (st?.name && st?.statusCategory) {
            statusCategoryByName[st.name] = st.statusCategory;
          }
          if (st?.id && st?.statusCategory) {
            statusCategoryById[String(st.id)] = st.statusCategory;
          }
        }

        // Transform issues
        const issues = rawIssues.map((iss) => {
          const f = iss.fields || {};
          const tt = f.timetracking || {};
          const assignee = f.assignee || {};
          const status = f.status || { name: 'To Do', statusCategory: { key: 'new' } };

          // Extract sprint info from customfield_10020 (sprint field)
          const sprintField = f.customfield_10020;
          const activeSprint = Array.isArray(sprintField)
            ? sprintField.find((s) => s.state === 'active') || sprintField[sprintField.length - 1]
            : null;

          return {
            key: iss.key,
            summary: f.summary || '',
            type: f.issuetype?.name || 'Task',
            priority: f.priority?.name || 'Medium',
            status,
            assigneeName: assignee.displayName || 'Unassigned',
            assigneeId: assignee.accountId || '',
            originalEstimate: toHours(tt.originalEstimateSeconds),
            timeSpent: toHours(tt.timeSpentSeconds),
            remainingEstimate: toHours(tt.remainingEstimateSeconds),
            sprintId: activeSprint?.id || null,
            sprintName: activeSprint?.name || null,
            sprintStartDate: activeSprint?.startDate?.slice(0, 10) || null,
            sprintEndDate: activeSprint?.endDate?.slice(0, 10) || null,
            sprintState: (activeSprint?.state || '').toLowerCase(),
            epicKey,
            epicName: epicIssue.fields?.summary || epicKey,
            statusChanges: extractStatusChanges(iss.changelog, f.created, f.updated, status, statusCategoryByName, statusCategoryById),
          };
        });

        return json({
          epic: {
            key: epicKey,
            name: epicIssue.fields?.summary || epicKey,
            status: epicIssue.fields?.status || { name: 'To Do', statusCategory: { key: 'new' } },
          },
          issues,
          statusCategoryByName,
        }, 200, cors);
      }

      // GET /issue/:key - Full detail for a single issue, fetched lazily when
      // the user opens the task detail panel. Returns the rich fields the list
      // endpoints omit (description, comments, reporter, labels, dates).
      const issueMatch = path.match(/^\/issue\/([A-Z][A-Z0-9]+-\d+)$/i);
      if (issueMatch) {
        const issueKey = issueMatch[1].toUpperCase();
        const fields = 'summary,status,assignee,reporter,issuetype,priority,timetracking,created,updated,duedate,labels,components,parent,description';
        const data = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}&expand=renderedFields`,
          headers
        );
        const f = data.fields || {};
        const tt = f.timetracking || {};
        const assignee = f.assignee || {};
        const reporter = f.reporter || {};

        // Comments come from a separate sub-resource (most recent 50).
        let comments = [];
        try {
          const commentData = await jiraFetch(
            `${env.JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?maxResults=50&orderBy=created`,
            headers
          );
          comments = (commentData.comments || []).map((c) => ({
            id: c.id,
            authorName: c.author?.displayName || 'Unknown',
            created: c.created || null,
            updated: c.updated || null,
            body: adfToText(c.body),
          }));
        } catch {
          // Comments are best-effort; an error here shouldn't fail the whole panel.
        }

        return json({
          key: data.key,
          summary: f.summary || '',
          type: f.issuetype?.name || 'Task',
          priority: f.priority?.name || null,
          status: f.status || null,
          assigneeName: assignee.displayName || 'Unassigned',
          reporterName: reporter.displayName || null,
          description: adfToText(f.description),
          labels: f.labels || [],
          components: (f.components || []).map((c) => c.name).filter(Boolean),
          created: f.created || null,
          updated: f.updated || null,
          dueDate: f.duedate || null,
          originalEstimate: toHours(tt.originalEstimateSeconds),
          timeSpent: toHours(tt.timeSpentSeconds),
          remainingEstimate: toHours(tt.remainingEstimateSeconds),
          epicKey: f.parent?.key || null,
          epicName: f.parent?.fields?.summary || null,
          comments,
        }, 200, cors);
      }

      return json({ error: 'Not found. Use /board, /sprints, /statuses, /sprint/:id, /all, /epics, /epic/:key, or /issue/:key' }, 404, cors);

    } catch (error) {
      return json({ error: error.message }, 500, cors);
    }
  },
};

async function jiraFetch(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jira API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Module-level cache of project status maps, keyed by projectKey. A Worker reuses
// its isolate across requests, so this avoids re-fetching the (rarely-changing)
// workflow status list on every sprint/epic request that lands on the same isolate.
const PROJECT_STATUS_CACHE = new Map();

// Resolve the board's project key/id. The agile "board" and "board configuration"
// endpoints expose the project under different field names (board → location.projectKey,
// configuration → location.key), so try both with several aliases. Returns null for
// multi-project / JQL boards with no single project context.
async function resolveBoardProjectKey(env, headers, boardId) {
  const pick = (loc) =>
    loc?.projectKey || loc?.key || loc?.projectId || loc?.id || null;

  try {
    const board = await jiraFetch(`${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}`, headers);
    const k = pick(board?.location);
    if (k) return String(k);
  } catch { /* try configuration next */ }

  try {
    const cfg = await jiraFetch(`${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/configuration`, headers);
    const k = pick(cfg?.location);
    if (k) return String(k);
  } catch { /* give up */ }

  return null;
}

// Resolve the board's project and fetch its full workflow status list so EVERY
// status name/id (current OR history-only) maps to an authoritative Jira
// statusCategory. Returns { byName, byId, list, projectKey }. On any failure (e.g. a
// multi-project / JQL board with no single projectKey) returns empty maps, so the
// caller falls back to current-issue-derived maps + the client name heuristic.
async function fetchProjectStatusMaps(env, headers, boardId) {
  const empty = { byName: {}, byId: {}, list: [], projectKey: null };

  const projectKey = await resolveBoardProjectKey(env, headers, boardId);
  if (!projectKey) return empty;

  if (PROJECT_STATUS_CACHE.has(projectKey)) {
    return PROJECT_STATUS_CACHE.get(projectKey);
  }

  let data;
  try {
    data = await jiraFetch(
      `${env.JIRA_BASE_URL}/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`,
      headers
    );
  } catch {
    return { ...empty, projectKey };
  }

  // Shape: [{ id, name (issue type), statuses: [{ id, name, statusCategory }] }]
  const byName = {};
  const byId = {};
  const seen = new Set();
  const list = [];
  for (const issueType of Array.isArray(data) ? data : []) {
    for (const st of issueType.statuses || []) {
      if (st?.name && st?.statusCategory) byName[st.name] = st.statusCategory;
      if (st?.id && st?.statusCategory) byId[String(st.id)] = st.statusCategory;
      const dedupKey = `${st?.id}|${st?.name}`;
      if (st?.name && !seen.has(dedupKey)) {
        seen.add(dedupKey);
        list.push({ id: st.id || null, name: st.name, categoryKey: st.statusCategory?.key || 'new' });
      }
    }
  }

  const result = { byName, byId, list, projectKey };
  PROJECT_STATUS_CACHE.set(projectKey, result);
  return result;
}

function toHours(sec) {
  return Math.round(((Number(sec) || 0) / 3600) * 100) / 100;
}

// Flatten Atlassian Document Format (ADF) into readable plain text. Jira REST
// API v3 returns description/comment bodies as ADF JSON; we walk the node tree
// and join text, inserting line breaks for block-level nodes and list markers.
function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;

  const lines = [];

  function walk(n, listPrefix) {
    if (!n || typeof n !== 'object') return;
    const type = n.type;

    if (type === 'text') {
      lines.push(n.text || '');
      return;
    }
    if (type === 'hardBreak') {
      lines.push('\n');
      return;
    }
    if (type === 'listItem') {
      lines.push(`\n${listPrefix || '• '}`);
      (n.content || []).forEach((c) => walk(c, listPrefix));
      return;
    }
    if (type === 'bulletList') {
      (n.content || []).forEach((c) => walk(c, '• '));
      lines.push('\n');
      return;
    }
    if (type === 'orderedList') {
      let i = 1;
      (n.content || []).forEach((c) => walk(c, `${i++}. `));
      lines.push('\n');
      return;
    }
    if (type === 'paragraph' || type === 'heading') {
      (n.content || []).forEach((c) => walk(c, listPrefix));
      lines.push('\n');
      return;
    }
    // Generic container (doc, blockquote, panel, tableCell, etc.)
    (n.content || []).forEach((c) => walk(c, listPrefix));
  }

  walk(node, null);
  return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

// Resolve a status object with its category. Tries name map first, then ID map
// (for historical statuses no longer current on any issue), then falls back to
// the name-heuristic in normalizeStatus on the client side.
function statusWithCategory(name, id, nameMap, idMap) {
  if (name && nameMap?.[name]) {
    return { name, statusCategory: nameMap[name] };
  }
  const idKey = id != null ? String(id) : null;
  if (idKey && idMap?.[idKey]) {
    return { name, statusCategory: idMap[idKey] };
  }
  return { name };
}

function extractStatusChanges(changelog, createdDate, updatedDate, initialStatus, statusCategoryByName, statusCategoryById) {
  const changes = [];

  // Sort histories ascending by full timestamp so same-day entries stay in
  // chronological order after the final sort-by-date below.
  const sortedHistories = changelog?.histories
    ? [...changelog.histories].sort((a, b) => (a.created || '').localeCompare(b.created || ''))
    : [];

  // Find the FIRST status change to know what the issue was created as.
  let firstChange = null;
  for (const h of sortedHistories) {
    for (const item of h.items || []) {
      if (item.field === 'status') { firstChange = item; break; }
    }
    if (firstChange) break;
  }

  // Add initial status when issue was created
  if (createdDate) {
    const initName = firstChange ? firstChange.fromString : (initialStatus?.name || 'To Do');
    const initId = firstChange ? firstChange.from : (initialStatus?.id ?? null);
    changes.push({
      date: createdDate.slice(0, 10),
      toStatus: statusWithCategory(initName, initId, statusCategoryByName, statusCategoryById),
    });
  }

  for (const history of sortedHistories) {
    const date = history.created?.slice(0, 10);
    if (!date) continue;
    for (const item of history.items || []) {
      if (item.field === 'status') {
        changes.push({
          date,
          fromStatus: item.fromString
            ? statusWithCategory(item.fromString, item.from, statusCategoryByName, statusCategoryById)
            : null,
          toStatus: statusWithCategory(item.toString, item.to, statusCategoryByName, statusCategoryById),
        });
      }
    }
  }

  // Sort by date (stable — same-day order preserved from sortedHistories above)
  changes.sort((a, b) => a.date.localeCompare(b.date));

  // If Jira's changelog is truncated the last recorded transition may not match
  // the issue's current status. Add a synthetic entry so the history panel and
  // chart logic see the real current state.
  const lastEntry = changes[changes.length - 1];
  const currentName = initialStatus?.name;
  if (currentName && lastEntry && lastEntry.toStatus?.name !== currentName) {
    const syntheticDate = updatedDate ? updatedDate.slice(0, 10) : lastEntry.date;
    changes.push({
      date: syntheticDate,
      toStatus: statusWithCategory(currentName, initialStatus?.id ?? null, statusCategoryByName, statusCategoryById),
    });
    changes.sort((a, b) => a.date.localeCompare(b.date));
  }

  return changes;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
