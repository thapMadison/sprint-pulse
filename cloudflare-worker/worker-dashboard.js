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
      // GET /sprints - List all sprints for the board
      if (path === '/sprints' || path === '/') {
        const data = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=50`,
          headers
        );
        return json(data.values || [], 200, cors);
      }

      // GET /sprint/:id - Get issues for a specific sprint
      const sprintMatch = path.match(/^\/sprint\/(\d+)$/);
      if (sprintMatch) {
        const sprintId = sprintMatch[1];

        const [sprintInfo, issuesData] = await Promise.all([
          jiraFetch(`${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}`, headers),
          jiraFetch(
            `${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,assignee,timetracking,issuetype,priority,created,parent&expand=changelog&maxResults=200`,
            headers
          ),
        ]);

        const rawIssues = issuesData.issues || [];

        // Build name → statusCategory map from ALL current statuses of issues in this sprint.
        // This covers every status currently in use in the workflow without an extra API call.
        const statusCategoryByName = {};
        for (const iss of rawIssues) {
          const st = iss.fields?.status;
          if (st?.name && st?.statusCategory) {
            statusCategoryByName[st.name] = st.statusCategory;
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
            statusChanges: extractStatusChanges(iss.changelog, f.created, status, statusCategoryByName),
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
            `${env.JIRA_BASE_URL}/rest/api/3/search?jql=${jql}&fields=summary,status&maxResults=200`,
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

      return json({ error: 'Not found. Use /sprints, /sprint/:id, /all, or /epics' }, 404, cors);

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

function toHours(sec) {
  return Math.round(((Number(sec) || 0) / 3600) * 100) / 100;
}

function statusWithCategory(name, map) {
  const category = name && map ? map[name] : null;
  return category ? { name, statusCategory: category } : { name };
}

function extractStatusChanges(changelog, createdDate, initialStatus, statusCategoryByName) {
  const changes = [];

  // Find the FIRST status change to know what the issue was created as.
  // If there's any 'status' change in history, the earliest from-status is the initial.
  let firstChange = null;
  if (changelog && changelog.histories) {
    const sorted = [...changelog.histories].sort((a, b) =>
      (a.created || '').localeCompare(b.created || '')
    );
    for (const h of sorted) {
      for (const item of h.items || []) {
        if (item.field === 'status') {
          firstChange = item;
          break;
        }
      }
      if (firstChange) break;
    }
  }

  // Add initial status when issue was created
  if (createdDate) {
    const initName = firstChange ? firstChange.fromString : (initialStatus?.name || 'To Do');
    changes.push({
      date: createdDate.slice(0, 10),
      toStatus: statusWithCategory(initName, statusCategoryByName),
    });
  }

  if (changelog && changelog.histories) {
    for (const history of changelog.histories) {
      const date = history.created?.slice(0, 10);
      if (!date) continue;

      for (const item of history.items || []) {
        if (item.field === 'status') {
          changes.push({
            date,
            fromStatus: item.fromString ? statusWithCategory(item.fromString, statusCategoryByName) : null,
            toStatus: statusWithCategory(item.toString, statusCategoryByName),
          });
        }
      }
    }
  }

  // Sort by date
  changes.sort((a, b) => a.date.localeCompare(b.date));
  return changes;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
