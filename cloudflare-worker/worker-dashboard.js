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

        // Get sprint info
        const sprintInfo = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}`,
          headers
        );

        // Get issues
        const issuesData = await jiraFetch(
          `${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,assignee,timetracking,issuetype,priority&maxResults=200`,
          headers
        );

        // Transform to app format
        const issues = (issuesData.issues || []).map(iss => {
          const f = iss.fields || {};
          const tt = f.timetracking || {};
          const assignee = f.assignee || {};
          return {
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
            sprintName: sprintInfo.name,
            sprintStartDate: sprintInfo.startDate?.slice(0, 10) || null,
            sprintEndDate: sprintInfo.endDate?.slice(0, 10) || null,
            sprintState: (sprintInfo.state || '').toLowerCase(),
            sprintGoal: sprintInfo.goal || '',
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

        const allIssues = [];
        for (const sp of sprints) {
          const issuesData = await jiraFetch(
            `${env.JIRA_BASE_URL}/rest/agile/1.0/sprint/${sp.id}/issue?fields=summary,status,assignee,timetracking,issuetype,priority&maxResults=200`,
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
              sprintName: sp.name,
              sprintStartDate: sp.startDate?.slice(0, 10) || null,
              sprintEndDate: sp.endDate?.slice(0, 10) || null,
              sprintState: (sp.state || '').toLowerCase(),
              sprintGoal: sp.goal || '',
            });
          }
        }

        return json(allIssues, 200, cors);
      }

      return json({ error: 'Not found. Use /sprints, /sprint/:id, or /all' }, 404, cors);

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

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
