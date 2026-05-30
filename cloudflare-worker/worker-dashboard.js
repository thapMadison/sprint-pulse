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

        // Fetch all child issues with changelog
        const childJql = encodeURIComponent(`parent = ${epicKey} ORDER BY created ASC`);
        const issuesData = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/api/3/search/jql?jql=${childJql}&fields=summary,status,assignee,timetracking,issuetype,priority,created,customfield_10020&expand=changelog&maxResults=200`,
          headers
        );

        const rawIssues = issuesData.issues || [];

        // Build statusCategory map from all statuses in the result set
        const statusCategoryByName = {};
        for (const iss of rawIssues) {
          const st = iss.fields?.status;
          if (st?.name && st?.statusCategory) {
            statusCategoryByName[st.name] = st.statusCategory;
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
            statusChanges: extractStatusChanges(iss.changelog, f.created, status, statusCategoryByName),
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

      return json({ error: 'Not found. Use /board, /sprints, /sprint/:id, /all, /epics, /epic/:key, or /issue/:key' }, 404, cors);

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
