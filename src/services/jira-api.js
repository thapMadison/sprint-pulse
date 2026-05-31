// Jira Sprint API client via Cloudflare Worker.
// The Worker holds the Jira credentials — the browser only knows its URL + boardId.

async function workerGet(workerUrl, path) {
  if (!workerUrl) throw new Error('Worker URL not configured.');
  const base = workerUrl.replace(/\/$/, '');
  const res = await fetch(base + path);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let errorMsg;
    try {
      errorMsg = JSON.parse(body).error || body;
    } catch {
      errorMsg = body;
    }
    throw new Error(`Worker error ${res.status}: ${String(errorMsg).slice(0, 200)}`);
  }
  return res.json();
}

// Fetch single sprint with changelog. Used for CFD when user switches sprint.
export async function fetchSprintFromWorker(workerUrl, sprintId, boardId) {
  const path = `/sprint/${encodeURIComponent(sprintId)}?boardId=${encodeURIComponent(boardId)}`;
  return workerGet(workerUrl, path);
}

export async function fetchSprintListFromWorker(workerUrl, boardId) {
  return workerGet(workerUrl, `/sprints?boardId=${encodeURIComponent(boardId)}`);
}

// Fetch board metadata (name/type) for display labels.
export async function fetchBoardFromWorker(workerUrl, boardId) {
  return workerGet(workerUrl, `/board?boardId=${encodeURIComponent(boardId)}`);
}

// Fetch all Epic-type issues for the board's project.
export async function fetchEpicsFromWorker(workerUrl, boardId) {
  return workerGet(workerUrl, `/epics?boardId=${encodeURIComponent(boardId)}`);
}

// Fetch all child issues of a specific epic with changelog.
// Used for progressive loading: load detail per epic for accurate dates.
export async function fetchEpicIssuesFromWorker(workerUrl, epicKey, boardId) {
  return workerGet(workerUrl, `/epic/${encodeURIComponent(epicKey)}?boardId=${encodeURIComponent(boardId)}`);
}

// Fetch full detail for a single issue (description, comments, reporter, labels,
// dates). Loaded lazily when the user opens the task detail panel.
export async function fetchIssueDetailFromWorker(workerUrl, issueKey, boardId) {
  return workerGet(workerUrl, `/issue/${encodeURIComponent(issueKey)}?boardId=${encodeURIComponent(boardId)}`);
}
