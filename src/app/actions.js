// All side-effects (auth, fetching, parsing, persistence) live here.
// Components dispatch through these functions and read via getState().
import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { todayISO } from '../domain/working-days.js';
import { buildSprintsFromIssues, buildSprintShells, populateSprintIssues } from '../domain/sprint-builder.js';
import { buildLightweightEpics, enrichEpicWithDetail } from '../domain/epic-builder.js';
import { parseFile } from '../data/parsers/index.js';
import {
  signInWithMicrosoft, signOut, isAuthenticated, getWorkerUrl, getJiraUrl,
} from '../services/auth.js';
import * as cache from '../services/data-cache.js';
import {
  fetchSprintFromWorker, fetchSprintListFromWorker, fetchBoardFromWorker,
  fetchEpicsFromWorker, fetchEpicIssuesFromWorker, fetchIssueDetailFromWorker,
} from '../services/jira-api.js';
import { setState, setStateSilent, setEpicRoadmapState, setEpicViewState, setSprintViewState, setLoadProgressState, setDataSourceState, getState, DEFAULT_EPIC_FILTERS } from './state.js';
import { DEMO_EPICS } from '../data/demo.js';
import { VIEW, SOURCE } from './constants.js';

const BOARD_ID_KEY = 'jira_board_id';

// ─────────────────────────── state reset shapes ───────────────────────────
// Centralized "reset" slices so the demo defaults and the Epic-view reset shape
// are defined once and stay in sync across logout / load / refresh / restore.

// The default demo source — shown on first load and after logout.
function demoSourceState() {
  return {
    sprints: DEMO_SPRINTS,
    activeSprintId: 'sp-24',
    today: DEMO_TODAY,
    sourceKey: SOURCE.DEMO,
    sourceId: null,
    sourceLabel: 'Demo · synced',
    lastUpdated: null,
  };
}

// Epic data slice reset to "nothing loaded" — the tab rebuilds when next opened.
function freshEpicData() {
  return {
    epics: [],
    rawEpics: [],
    activeEpicId: null,
    epicLoadProgress: null,
    epicError: null,
  };
}

// Epic UI slice reset (expansion, open detail, filters) — kept separate because
// some flows reset the UI but keep cached/derived epic data (e.g. restore).
function freshEpicUi() {
  return {
    expandedEpicIds: new Set(),
    epicDetailId: null,
    epicFilters: { ...DEFAULT_EPIC_FILTERS },
  };
}

// ─────────────────────────── data-source cache ───────────────────────────
// Snapshot/restore the data-bearing slice of state per source so switching
// sources (or refreshing the page) doesn't re-fetch what's already loaded.
// UI-only state (Set of expanded ids, open detail/panel, filters) is rebuilt
// fresh on restore and deliberately not cached.

function sourceDescriptor() {
  const s = getState();
  return { sourceKey: s.sourceKey, sourceId: s.sourceId, uid: cache.userScope() };
}

function snapshotData(s) {
  return {
    sourceKey: s.sourceKey,
    sourceId: s.sourceId,
    sourceLabel: s.sourceLabel,
    sprints: s.sprints,
    activeSprintId: s.activeSprintId,
    today: s.today,
    rawEpics: s.rawEpics,
    epics: s.epics,
    lastUpdated: s.lastUpdated,
  };
}

// Persist whatever source is active right now (memory + IndexedDB, debounced),
// and record it as the "last source" so the next page load can restore it.
// Demo carries no data — only its pointer is written.
function persistCurrent() {
  const desc = sourceDescriptor();
  cache.setLastSource(desc);
  const key = cache.cacheKeyFor(desc);
  if (!key || key === 'demo') return;
  cache.putCached({ key, ...snapshotData(getState()), updatedAt: Date.now() });
}

// Load a cached snapshot into state. Resets UI-only state to a clean default
// (same fields applyLoadedSprints clears) and repaints the whole page so the
// source bar, tabs and content all reflect the restored source.
function restoreSnapshot(snap, extra = {}) {
  setState({
    sprints: snap.sprints,
    activeSprintId: snap.activeSprintId,
    today: snap.today,
    sourceKey: snap.sourceKey,
    sourceId: snap.sourceId,
    sourceLabel: snap.sourceLabel,
    lastUpdated: snap.lastUpdated || null,
    rawEpics: snap.rawEpics || [],
    epics: snap.epics || [],
    error: null,
    isRefreshing: false,
    epicLoadProgress: null,
    epicError: null,
    activeEpicId: (snap.epics && snap.epics[0]?.id) || null,
    ...freshEpicUi(),
    ...extra,
  });
  // Only rebuild epics if none were cached — otherwise we'd discard the cached
  // (already-enriched) epics with a fresh fetch. Use Refresh to pull anew.
  if (!(snap.epics && snap.epics.length)) reloadEpicsIfActive();
}

// Prefer the human-readable board name; fall back to the numeric id.
function apiSourceLabel(board, boardId) {
  const name = board && board.name ? board.name.trim() : '';
  return name ? `Jira API · ${name}` : `Jira API · Board ${boardId}`;
}

function pickInitialSprintId(sprints) {
  const preferred =
    sprints.find((s) => s.state === 'active') ||
    sprints.find((s) => s.state === 'closed') ||
    sprints[0];
  return preferred ? preferred.id : null;
}

export function setActiveSprint(id) {
  // Switching tabs only affects the sprint content area — repaint just that
  // (filter highlight + charts/skeleton) instead of re-rendering the whole page.
  setSprintViewState({ activeSprintId: id });
  // Lazy-load this sprint's issues + changelog the first time it's viewed.
  if (getState().sourceKey === SOURCE.API) {
    loadSprintDetail(id).catch((e) => {
      console.warn('[Sprint] detail load failed:', e);
    });
  }
}

function markSprintLoaded(sprintId, error) {
  const latest = getState();
  const updated = latest.sprints.map((sp) =>
    sp.id === sprintId ? { ...sp, issuesLoaded: true, issuesError: error || null } : sp
  );
  setSprintViewState({ sprints: updated });
}

// Fetch a single sprint's issues (with changelog) on demand and merge into state.
// Short-circuits when the sprint is already loaded, so re-selecting a tab is free.
async function loadSprintDetail(sprintId) {
  const sprint = getState().sprints.find((sp) => sp.id === sprintId);
  if (!sprint || sprint.issuesLoaded) return;

  const workerUrl = await getWorkerUrl();
  if (!workerUrl) { markSprintLoaded(sprintId, 'Worker URL not configured.'); return; }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) { markSprintLoaded(sprintId, 'Board ID not set.'); return; }

  // Resolve the Jira numeric sprint ID. Shells carry jiraId from /sprints; fall
  // back to a name lookup just in case it's missing.
  let jiraId = sprint.jiraId;
  if (!jiraId) {
    try {
      const list = await fetchSprintListFromWorker(workerUrl, boardId);
      jiraId = (list || []).find((sp) => sp.name === sprint.name)?.id;
    } catch { /* fall through to error below */ }
  }
  if (!jiraId) { markSprintLoaded(sprintId, 'Could not resolve Jira sprint id.'); return; }

  try {
    const data = await fetchSprintFromWorker(workerUrl, jiraId, boardId);
    const latest = getState();
    const updated = latest.sprints.map((sp) =>
      sp.id === sprintId ? populateSprintIssues({ ...sp, jiraId }, data.issues || []) : sp
    );
    setSprintViewState({ sprints: updated });
    // Cache the newly-loaded issues so re-selecting this sprint (or a page
    // refresh) doesn't re-fetch them.
    persistCurrent();
  } catch (e) {
    markSprintLoaded(sprintId, e.message || String(e));
  }
}

export function setApiPanelOpen(open) {
  // Toggling the inline Board ID panel only affects the data-source bar — repaint
  // just that region instead of re-rendering the whole page (avoids the
  // background flash and redrawing every chart for a single click).
  setDataSourceState({ apiPanelOpen: open });
}

export function setView(view) {
  if (view !== 'sprint' && view !== 'epic') return;
  setState({ view });
  if (view === VIEW.EPIC && getState().epics.length === 0) {
    loadEpicsAndChangelogs().catch((e) => {
      console.warn('[Epic] load failed:', e);
    });
  }
}

export function setActiveEpic(id) {
  setState({ activeEpicId: id });
}

export function toggleEpicExpanded(id) {
  const next = new Set(getState().expandedEpicIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  // Repaint only the Epic view, not the whole page (avoids the background flash).
  setEpicViewState({ expandedEpicIds: next });
}

export function openEpicDetail(id) {
  setEpicViewState({ epicDetailId: id });
}

export function closeEpicDetail() {
  setEpicViewState({ epicDetailId: null });
}

export function setEpicFilter(patch) {
  setEpicViewState({ epicFilters: { ...getState().epicFilters, ...patch } });
}

// Update search text silently then schedule a debounced repaint so the roadmap
// actually filters while the user keeps typing without losing focus.
let _epicSearchDebounce = null;
export function setEpicSearchSilent(value) {
  const s = getState();
  setStateSilent({ epicFilters: { ...s.epicFilters, search: value } });
  if (_epicSearchDebounce) clearTimeout(_epicSearchDebounce);
  _epicSearchDebounce = setTimeout(() => setEpicViewState({}), 220);
}

// Two-phase epic loading for better UX:
// Phase 1: Render immediately with lightweight epics (fallback dates from sprint boundaries)
// Phase 2: Progressive load detail per epic for accurate changelog-derived dates
async function loadEpicsAndChangelogs() {
  const s = getState();
  const source = s.sourceKey;

  // Demo mode: build from already-present statusChanges + DEMO_EPICS (all detail available)
  if (source === SOURCE.DEMO) {
    const epics = buildLightweightEpics(s.sprints, DEMO_EPICS, s.today)
      .map((e) => ({ ...e, detailLoaded: true }));
    setEpicViewState({
      rawEpics: DEMO_EPICS,
      epics,
      activeEpicId: epics[0]?.id || null,
      expandedEpicIds: new Set(),
      epicError: null,
      epicLoadProgress: null,
    });
    return;
  }

  // File mode: no API available, build from parsed epicKey (all detail we have)
  if (source === SOURCE.FILE) {
    const epics = buildLightweightEpics(s.sprints, [], s.today)
      .map((e) => ({ ...e, detailLoaded: true }));
    setEpicViewState({
      rawEpics: [],
      epics,
      activeEpicId: epics[0]?.id || null,
      expandedEpicIds: new Set(),
      epicError: null,
      epicLoadProgress: null,
    });
    persistCurrent();
    return;
  }

  // API mode: two-phase loading
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    setEpicViewState({ epicError: 'Worker URL not configured.' });
    return;
  }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) {
    setEpicViewState({ epicError: 'Board ID not set.' });
    return;
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Immediate render with lightweight epics
    // ═══════════════════════════════════════════════════════════════════════
    setEpicViewState({ epicError: null, epicLoadProgress: { phase: 1, label: 'Loading epic list…' } });

    let rawEpics = [];
    try {
      rawEpics = await fetchEpicsFromWorker(workerUrl, boardId);
    } catch (e) {
      console.warn('[Epic] /epics fetch failed, falling back to derived names:', e);
    }

    const lightweightEpics = buildLightweightEpics(s.sprints, rawEpics, s.today);
    setEpicViewState({
      rawEpics,
      epics: lightweightEpics,
      activeEpicId: lightweightEpics[0]?.id || null,
      expandedEpicIds: new Set(),
      epicLoadProgress: null,
      epicError: null,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Progressive detail loading per epic
    // ═══════════════════════════════════════════════════════════════════════
    // Prioritize: in-progress epics first, then todo, then done
    // Skip NO_EPIC (tasks without epic parent) - they don't have a Jira epic key
    const epicsToLoad = lightweightEpics
      .filter((e) => !e.isNoEpic && !e.detailLoaded)
      .sort((a, b) => {
        const ORDER = { inprogress: 0, todo: 1, done: 2 };
        return (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3);
      });

    for (const epic of epicsToLoad) {
      try {
        const detailData = await fetchEpicIssuesFromWorker(workerUrl, epic.key, boardId);
        const latest = getState();
        const enrichedEpic = enrichEpicWithDetail(epic, detailData, latest.today);

        // Update the single epic in the array without re-sorting (preserve order).
        // Repaint only the roadmap node so the rest of the page doesn't jank —
        // unless this epic's detail panel is open, in which case repaint the
        // whole Epic view (filter bar + roadmap + panel), still not the page.
        const updatedEpics = latest.epics.map((e) =>
          e.id === epic.id ? enrichedEpic : e
        );
        if (latest.epicDetailId === epic.id) {
          setEpicViewState({ epics: updatedEpics });
        } else {
          setEpicRoadmapState({ epics: updatedEpics });
        }
      } catch (e) {
        console.warn(`[Epic] detail load failed for ${epic.key}:`, e);
        // Mark as loaded (with error) so UI stops showing spinner
        const latest = getState();
        const updatedEpics = latest.epics.map((e) =>
          e.id === epic.id ? { ...e, detailLoaded: true, detailError: e.message } : e
        );
        setEpicRoadmapState({ epics: updatedEpics });
      }
      // Keep the cached snapshot in step with the enriched epics (debounced).
      persistCurrent();
    }
  } catch (e) {
    setEpicViewState({
      epicLoadProgress: null,
      epicError: e.message || String(e),
    });
  }
}

// After a fresh data load the Epic tab's state was reset to empty. If the user
// is currently on that tab, rebuild now — switching tabs is what normally
// triggers the load, but the tab didn't change so we trigger it explicitly.
function reloadEpicsIfActive() {
  if (getState().view === VIEW.EPIC) {
    loadEpicsAndChangelogs().catch((e) => {
      console.warn('[Epic] reload after data load failed:', e);
    });
  }
}

// Trigger epic detail loading if any non-isNoEpic epic hasn't been enriched yet.
// Called when an epic panel is opened outside the epic view (nav stack).
export function ensureEpicsLoaded() {
  const s = getState();
  if (!s.epicLoadProgress && s.epics.some((e) => !e.isNoEpic && !e.detailLoaded)) {
    loadEpicsAndChangelogs().catch((e) => {
      setEpicViewState({ epicError: e.message || String(e) });
    });
  }
}

export function setPendingBoardId(v) {
  // No re-render — would steal focus from the input the user is typing into.
  setStateSilent({ pendingBoardId: v });
}

export function clearError() {
  setState({ error: null });
}

const LOAD_STEPS = {
  connect:  { label: 'Connecting to Jira…',     percent: 15 },
  fetch:    { label: 'Pulling sprint data…',    percent: 55 },
  process:  { label: 'Converting issues…',      percent: 85 },
  done:     { label: 'Done',                    percent: 100 },
  parse:    { label: 'Reading file…',           percent: 35 },
};

function setProgress(step, flow) {
  if (!step) {
    // Removing the bar changes page layout — needs a full render.
    setState({ loadProgress: null });
    return;
  }
  const meta = LOAD_STEPS[step];
  const prevFlow = getState().loadProgress?.flow;
  // Route through the load-progress channel so an already-mounted strip is
  // updated in place (smooth width transition) rather than rebuilt; the very
  // first step falls back to a full render to create the bar.
  setLoadProgressState({
    loadProgress: {
      step, label: meta.label, percent: meta.percent,
      flow: flow || prevFlow || 'api',
    },
  });
}

// Hold the "Done" state briefly so the user sees 100% before it disappears.
async function finishProgress() {
  setProgress('done');
  await new Promise((r) => setTimeout(r, 450));
  setProgress(null);
}

export function showError(message) {
  setState({ error: message, isRefreshing: false });
}

export function requireLogin() {
  setState({ showLoginPrompt: true });
}

export async function login() {
  try {
    await signInWithMicrosoft();
  } catch (e) {
    setState({ error: `Login failed: ${e.message}` });
  }
}

export async function logout() {
  try {
    // Capture the uid before sign-out so we can wipe that user's cached Jira/
    // file data — it must not linger for the next person on a shared machine.
    const uid = cache.userScope();
    await signOut();
    localStorage.removeItem(BOARD_ID_KEY);
    await cache.clearUser(uid);
    cache.clearLastSource();
    setState({
      user: null,
      ...demoSourceState(),
      error: null,
      isRefreshing: false,
      apiPanelOpen: false,
      pendingBoardId: '',
      loadProgress: null,
      view: VIEW.SPRINT,
      ...freshEpicData(),
      ...freshEpicUi(),
    });
  } catch (e) {
    setState({ error: `Logout failed: ${e.message}` });
  }
}

export function loadDemo() {
  // Preserve the source we're leaving so switching back to it is instant.
  persistCurrent();
  setState({
    ...demoSourceState(),
    error: null,
    isRefreshing: false,
    apiPanelOpen: false,
    ...freshEpicData(),
  });
  // Record demo as the active source (pointer only — demo carries no data).
  cache.setLastSource(sourceDescriptor());
  reloadEpicsIfActive();
}

export async function loadFromFile(file) {
  try {
    // Preserve the source we're leaving so switching back to it is instant.
    persistCurrent();
    setProgress('parse', 'file');
    const rawIssues = await parseFile(file);
    if (!rawIssues.length) throw new Error('File parsed but contained no issues.');
    setProgress('process');
    const sprints = buildSprintsFromIssues(rawIssues, getState().today);
    // Close the Jira board panel if it was left open — otherwise the Board ID
    // input lingers and both "Connect with Jira" and "Import" show as active.
    // A freshly imported file is always re-parsed (it may have changed on disk);
    // the cache write below is only used to restore it after a page refresh.
    applyLoadedSprints(sprints, `File · ${file.name}`, 'file', { apiPanelOpen: false, sourceId: file.name });
    persistCurrent();
    await finishProgress();
    reloadEpicsIfActive();
  } catch (e) {
    setProgress(null);
    showError(e.message || String(e));
  }
}

// Shared body of the API load + refresh flows: connect → fetch board+sprints →
// build shells → load the active sprint's issues → persist → finish. The two
// callers differ only in their applyLoadedSprints extras and which sprint stays
// active afterwards, passed in via `opts`.
async function fetchAndApplyBoard(boardId, { extra = {}, keepActiveId = null } = {}) {
  setProgress('connect', 'api');
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) throw new Error('Worker URL not configured in Firebase database.');
  const jiraUrl = await getJiraUrl().catch(() => null);

  localStorage.setItem(BOARD_ID_KEY, boardId);
  setProgress('fetch');
  // Board name (for the label) + sprint list in parallel. Board name is
  // best-effort; fall back to the id on failure.
  const [board, rawSprints] = await Promise.all([
    fetchBoardFromWorker(workerUrl, boardId).catch(() => null),
    fetchSprintListFromWorker(workerUrl, boardId),
  ]);
  if (!rawSprints || !rawSprints.length) {
    throw new Error('No sprints found. Check Board ID and Worker configuration.');
  }

  setProgress('process');
  const sprints = buildSprintShells(rawSprints, getState().today);
  applyLoadedSprints(sprints, apiSourceLabel(board, boardId), 'api', { sourceId: boardId, jiraUrl, ...extra });
  // Keep the user on the sprint they were viewing if it still exists.
  if (keepActiveId && sprints.some((sp) => sp.id === keepActiveId)) {
    setStateSilent({ activeSprintId: keepActiveId });
  }
  await loadSprintDetail(getState().activeSprintId);
  persistCurrent();
  await finishProgress();
  reloadEpicsIfActive();
}

export async function loadFromApi(boardId) {
  if (!boardId) {
    showError('Please enter your Jira Board ID.');
    return false;
  }
  // Preserve the source we're leaving (e.g. another board) before switching.
  persistCurrent();

  // If this board was already loaded this session (or on a previous visit),
  // restore it instantly and skip every network round-trip. Use Refresh to pull
  // fresh data.
  const cacheKey = cache.cacheKeyFor({ sourceKey: SOURCE.API, sourceId: boardId, uid: cache.userScope() });
  if (cacheKey) {
    const snap = await cache.getCached(cacheKey);
    if (snap && snap.sprints && snap.sprints.length) {
      localStorage.setItem(BOARD_ID_KEY, boardId);
      restoreSnapshot(snap, { apiPanelOpen: false });
      cache.setLastSource(sourceDescriptor());
      getJiraUrl().then((url) => setStateSilent({ jiraUrl: url })).catch(() => {});
      return true;
    }
  }

  try {
    await fetchAndApplyBoard(boardId, { extra: { apiPanelOpen: false } });
    return true;
  } catch (e) {
    setProgress(null);
    showError(e.message || String(e));
    return false;
  }
}

export async function refreshFromApi() {
  if (!isAuthenticated()) {
    showError('Please login to refresh data.');
    requireLogin();
    return;
  }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) {
    showError('Board ID not set. Please connect to Jira API first and enter your Board ID.');
    return;
  }

  setState({ isRefreshing: true });
  try {
    await fetchAndApplyBoard(boardId, { keepActiveId: getState().activeSprintId });
  } catch (e) {
    setProgress(null);
    showError(e.message || String(e));
  }
}

function applyLoadedSprints(sprints, sourceLabel, sourceKey, extra = {}) {
  // This always runs while the load progress strip is on screen (api / refresh
  // / file flows). Routing through the sprint-view channel repaints ONLY the
  // sprint content area with the new data and leaves the data-source bar — and
  // its animating progress strip — untouched, so the bar doesn't get recreated
  // mid-load (which killed its width transition and restarted the spinner). The
  // single full render happens later when finishProgress clears the strip.
  setSprintViewState({
    sprints,
    activeSprintId: pickInitialSprintId(sprints),
    today: todayISO(),
    sourceKey,
    sourceId: null, // overridden via `extra` for api (board id) / file (name)
    sourceLabel,
    lastUpdated: new Date(),
    error: null,
    isRefreshing: false,
    // Reset epic-derived state — will rebuild next time user enters Epic tab.
    ...freshEpicData(),
    ...freshEpicUi(),
    ...extra,
  });
}

export function getSavedBoardId() {
  return localStorage.getItem(BOARD_ID_KEY) || '';
}

// Boards this user has cached, most-recent first — powers the quick-switch chips
// in the Jira panel. Empty when logged out.
export function getRecentBoards() {
  return cache.listBoards(cache.userScope());
}

// On page load, restore the source the user was last on instead of defaulting to
// demo. Called from each auth-state change until it succeeds once:
//   • demo / no pointer → nothing to do (demo is already showing).
//   • api/file pointer → needs the matching signed-in user; if auth hasn't
//     resolved yet we wait (don't consume the one-shot) for a later callback.
let _bootRestoreDone = false;
export async function restoreLastSource(user) {
  if (_bootRestoreDone) return;

  const pointer = cache.getLastSource();
  if (!pointer || pointer.sourceKey === SOURCE.DEMO) { _bootRestoreDone = true; return; }

  // api/file data is namespaced per user — only restore for its owner.
  if (!user) return; // auth still resolving; wait for the next callback
  if (pointer.uid !== user.uid) { _bootRestoreDone = true; return; }

  _bootRestoreDone = true;
  const key = cache.cacheKeyFor({ sourceKey: pointer.sourceKey, sourceId: pointer.sourceId, uid: user.uid });
  const snap = await cache.getCached(key);
  if (!snap || !snap.sprints || !snap.sprints.length) return;

  if (pointer.sourceKey === SOURCE.API && pointer.sourceId) {
    localStorage.setItem(BOARD_ID_KEY, pointer.sourceId);
  }
  restoreSnapshot(snap);
}

// Lazily fetch full detail (description, comments, reporter, labels, dates) for
// a single issue when the task detail panel opens. Only the Jira API source can
// supply these — demo/file return null so the panel just shows what it has.
export async function fetchTaskDetail(issueKey) {
  if (getState().sourceKey !== 'api') return null;
  if (!isAuthenticated()) return null;
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) return null;
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) return null;
  return fetchIssueDetailFromWorker(workerUrl, issueKey, boardId);
}

// Force pending cache writes to disk — call when the tab is hidden/unloaded so
// lazily-loaded data isn't lost before the debounced write fires.
export function flushCache() {
  cache.flush();
}
