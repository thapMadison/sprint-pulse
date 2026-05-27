// Jira Sprint API client via Cloudflare Worker.
// The Worker holds the Jira credentials — the browser only knows its URL + boardId.

export async function fetchAllFromWorker(workerUrl, boardId) {
  if (!workerUrl) throw new Error('Worker URL not configured.');

  const base = workerUrl.replace(/\/$/, '');
  const endpoint = boardId
    ? `${base}/all?boardId=${encodeURIComponent(boardId)}`
    : `${base}/all`;

  const res = await fetch(endpoint);
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
