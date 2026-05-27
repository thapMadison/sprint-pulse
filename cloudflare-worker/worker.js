// Cloudflare Worker - Jira API Proxy
// Bypasses CORS by proxying requests server-side

const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  // Add your production domain here:
  // 'https://your-app.github.io',
  // 'https://your-app.pages.dev',
];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Jira-Base-Url',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only allow GET and POST
    if (!['GET', 'POST'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    try {
      // Get Jira base URL from header
      const jiraBaseUrl = request.headers.get('X-Jira-Base-Url');
      if (!jiraBaseUrl) {
        return new Response(
          JSON.stringify({ error: 'Missing X-Jira-Base-Url header' }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      // Get the path from the request URL
      const url = new URL(request.url);
      const jiraPath = url.pathname + url.search;

      // Build Jira URL
      const jiraUrl = jiraBaseUrl.replace(/\/$/, '') + jiraPath;

      // Forward the request to Jira
      const jiraResponse = await fetch(jiraUrl, {
        method: request.method,
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: request.method === 'POST' ? await request.text() : undefined,
      });

      // Return Jira response with CORS headers
      const responseBody = await jiraResponse.text();
      return new Response(responseBody, {
        status: jiraResponse.status,
        headers: {
          ...cors,
          'Content-Type': jiraResponse.headers.get('Content-Type') || 'application/json',
        },
      });

    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
  },
};
