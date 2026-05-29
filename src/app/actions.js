// All side-effects (auth, fetching, parsing, persistence) live here.
// Components dispatch through these functions and read via getState().
import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { todayISO } from '../domain/working-days.js';
import { buildSprintsFromIssues, buildSprintShells, populateSprintIssues } from '../domain/sprint-builder.js';
import { buildLightweightEpics, enrichEpicWithDetail } from '../domain/epic-builder.js';
import { parseFile } from '../data/parsers/index.js';
import {
  signInWithMicrosoft, signOut, isAuthenticated, getWorkerUrl,
} from '../services/auth.js';
import {
  fetchSprintFromWorker, fetchSprintListFromWorker, fetchBoardFromWorker,
  fetchEpicsFromWorker, fetchEpicIssuesFromWorker,
} from '../services/jira-api.js';
import { setState, setStateSilent, getState } from './state.js';
import { DEMO_EPICS } from '../data/demo.js';

const BOARD_ID_KEY = 'jira_board_id';

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
  setState({ activeSprintId: id });
  // Lazy-load this sprint's issues + changelog the first time it's viewed.
  if (getState().sourceKey === 'api') {
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
  setState({ sprints: updated });
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
    setState({ sprints: updated });
  } catch (e) {
    markSprintLoaded(sprintId, e.message || String(e));
  }
}

export function setApiPanelOpen(open) {
  setState({ apiPanelOpen: open });
}

export function setView(view) {
  if (view !== 'sprint' && view !== 'epic') return;
  setState({ view });
  if (view === 'epic' && getState().epics.length === 0) {
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
  setState({ expandedEpicIds: next });
}

export function openEpicDetail(id) {
  setState({ epicDetailId: id });
}

export function closeEpicDetail() {
  setState({ epicDetailId: null });
}

export function setEpicFilter(patch) {
  setState({ epicFilters: { ...getState().epicFilters, ...patch } });
}

// Update search text silently then schedule a debounced re-render so the
// roadmap actually filters while the user keeps typing without losing focus.
let _epicSearchDebounce = null;
export function setEpicSearchSilent(value) {
  const s = getState();
  setStateSilent({ epicFilters: { ...s.epicFilters, search: value } });
  if (_epicSearchDebounce) clearTimeout(_epicSearchDebounce);
  _epicSearchDebounce = setTimeout(() => setState({}), 220);
}

// Two-phase epic loading for better UX:
// Phase 1: Render immediately with lightweight epics (fallback dates from sprint boundaries)
// Phase 2: Progressive load detail per epic for accurate changelog-derived dates
async function loadEpicsAndChangelogs() {
  const s = getState();
  const source = s.sourceKey;

  // Demo mode: build from already-present statusChanges + DEMO_EPICS (all detail available)
  if (source === 'demo') {
    const epics = buildLightweightEpics(s.sprints, DEMO_EPICS, s.today)
      .map((e) => ({ ...e, detailLoaded: true }));
    setState({
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
  if (source === 'file') {
    const epics = buildLightweightEpics(s.sprints, [], s.today)
      .map((e) => ({ ...e, detailLoaded: true }));
    setState({
      rawEpics: [],
      epics,
      activeEpicId: epics[0]?.id || null,
      expandedEpicIds: new Set(),
      epicError: null,
      epicLoadProgress: null,
    });
    return;
  }

  // API mode: two-phase loading
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    setState({ epicError: 'Worker URL not configured.' });
    return;
  }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) {
    setState({ epicError: 'Board ID not set.' });
    return;
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Immediate render with lightweight epics
    // ═══════════════════════════════════════════════════════════════════════
    setState({ epicError: null, epicLoadProgress: { phase: 1, label: 'Loading epic list…' } });

    let rawEpics = [];
    try {
      rawEpics = await fetchEpicsFromWorker(workerUrl, boardId);
    } catch (e) {
      console.warn('[Epic] /epics fetch failed, falling back to derived names:', e);
    }

    const lightweightEpics = buildLightweightEpics(s.sprints, rawEpics, s.today);
    setState({
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

        // Update the single epic in the array without re-sorting (preserve order)
        const updatedEpics = latest.epics.map((e) =>
          e.id === epic.id ? enrichedEpic : e
        );
        setState({ epics: updatedEpics });
      } catch (e) {
        console.warn(`[Epic] detail load failed for ${epic.key}:`, e);
        // Mark as loaded (with error) so UI stops showing spinner
        const latest = getState();
        const updatedEpics = latest.epics.map((e) =>
          e.id === epic.id ? { ...e, detailLoaded: true, detailError: e.message } : e
        );
        setState({ epics: updatedEpics });
      }
    }
  } catch (e) {
    setState({
      epicLoadProgress: null,
      epicError: e.message || String(e),
    });
  }
}

// After a fresh data load the Epic tab's state was reset to empty. If the user
// is currently on that tab, rebuild now — switching tabs is what normally
// triggers the load, but the tab didn't change so we trigger it explicitly.
function reloadEpicsIfActive() {
  if (getState().view === 'epic') {
    loadEpicsAndChangelogs().catch((e) => {
      console.warn('[Epic] reload after data load failed:', e);
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
    setState({ loadProgress: null });
    return;
  }
  const meta = LOAD_STEPS[step];
  const prevFlow = getState().loadProgress?.flow;
  setState({
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
    await signOut();
    localStorage.removeItem(BOARD_ID_KEY);
    setState({
      user: null,
      sprints: DEMO_SPRINTS,
      activeSprintId: 'sp-24',
      today: DEMO_TODAY,
      sourceKey: 'demo',
      sourceLabel: 'Demo · synced',
      lastUpdated: null,
      error: null,
      isRefreshing: false,
      apiPanelOpen: false,
      pendingBoardId: '',
      loadProgress: null,
      view: 'sprint',
      epics: [],
      rawEpics: [],
      activeEpicId: null,
      epicLoadProgress: null,
      epicError: null,
      expandedEpicIds: new Set(),
      epicDetailId: null,
      epicFilters: { status: 'all', sprintId: 'all', search: '' },
    });
  } catch (e) {
    setState({ error: `Logout failed: ${e.message}` });
  }
}

export function loadDemo() {
  setState({
    sprints: DEMO_SPRINTS,
    activeSprintId: 'sp-24',
    today: DEMO_TODAY,
    sourceKey: 'demo',
    sourceLabel: 'Demo · synced',
    lastUpdated: null,
    error: null,
    isRefreshing: false,
    apiPanelOpen: false,
    epics: [],
    rawEpics: [],
    activeEpicId: null,
    epicLoadProgress: null,
    epicError: null,
  });
  reloadEpicsIfActive();
}

export async function loadFromFile(file) {
  try {
    setProgress('parse', 'file');
    const rawIssues = await parseFile(file);
    if (!rawIssues.length) throw new Error('File parsed but contained no issues.');
    setProgress('process');
    const sprints = buildSprintsFromIssues(rawIssues, getState().today);
    applyLoadedSprints(sprints, `File · ${file.name}`, 'file');
    await finishProgress();
    reloadEpicsIfActive();
  } catch (e) {
    setProgress(null);
    showError(e.message || String(e));
  }
}

export async function loadFromApi(boardId) {
  if (!boardId) {
    showError('Please enter your Jira Board ID.');
    return false;
  }
  try {
    setProgress('connect', 'api');
    const workerUrl = await getWorkerUrl();
    if (!workerUrl) throw new Error('Worker URL not configured in Firebase database.');

    localStorage.setItem(BOARD_ID_KEY, boardId);
    setProgress('fetch');
    // Step 1: board name (for the label) + sprint list, in parallel → render the
    // filter immediately. Board name is best-effort; fall back to the id on failure.
    const [board, rawSprints] = await Promise.all([
      fetchBoardFromWorker(workerUrl, boardId).catch(() => null),
      fetchSprintListFromWorker(workerUrl, boardId),
    ]);
    if (!rawSprints || !rawSprints.length) {
      throw new Error('No sprints found. Check Board ID and Worker configuration.');
    }

    setProgress('process');
    const sprints = buildSprintShells(rawSprints, getState().today);
    applyLoadedSprints(sprints, apiSourceLabel(board, boardId), 'api', { apiPanelOpen: false });
    // Step 2: load only the default (active) sprint's issues for the first paint.
    await loadSprintDetail(getState().activeSprintId);
    await finishProgress();
    reloadEpicsIfActive();
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
    setProgress('connect', 'api');
    const workerUrl = await getWorkerUrl();
    if (!workerUrl) throw new Error('Worker URL not configured in Firebase.');
    setProgress('fetch');
    const [board, rawSprints] = await Promise.all([
      fetchBoardFromWorker(workerUrl, boardId).catch(() => null),
      fetchSprintListFromWorker(workerUrl, boardId),
    ]);
    if (!rawSprints || !rawSprints.length) {
      throw new Error('No sprints found. Check Worker environment variables and Board ID.');
    }

    setProgress('process');
    const prevActive = getState().activeSprintId;
    const sprints = buildSprintShells(rawSprints, getState().today);
    applyLoadedSprints(sprints, apiSourceLabel(board, boardId), 'api');
    // Keep the user on the sprint they were viewing if it still exists.
    if (sprints.some((sp) => sp.id === prevActive)) {
      setStateSilent({ activeSprintId: prevActive });
    }
    await loadSprintDetail(getState().activeSprintId);
    await finishProgress();
    reloadEpicsIfActive();
  } catch (e) {
    setProgress(null);
    showError(e.message || String(e));
  }
}

function applyLoadedSprints(sprints, sourceLabel, sourceKey, extra = {}) {
  setState({
    sprints,
    activeSprintId: pickInitialSprintId(sprints),
    today: todayISO(),
    sourceKey,
    sourceLabel,
    lastUpdated: new Date(),
    error: null,
    isRefreshing: false,
    // Reset epic-derived state — will rebuild next time user enters Epic tab
    epics: [],
    rawEpics: [],
    activeEpicId: null,
    epicLoadProgress: null,
    epicError: null,
    expandedEpicIds: new Set(),
    epicDetailId: null,
    epicFilters: { status: 'all', sprintId: 'all', search: '' },
    ...extra,
  });
}

export function getSavedBoardId() {
  return localStorage.getItem(BOARD_ID_KEY) || '';
}
