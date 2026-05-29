// All side-effects (auth, fetching, parsing, persistence) live here.
// Components dispatch through these functions and read via getState().
import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { todayISO } from '../domain/working-days.js';
import { buildSprintsFromIssues } from '../domain/sprint-builder.js';
import { buildLightweightEpics, enrichEpicWithDetail } from '../domain/epic-builder.js';
import { parseFile } from '../data/parsers/index.js';
import {
  signInWithMicrosoft, signOut, isAuthenticated, getWorkerUrl,
} from '../services/auth.js';
import {
  fetchAllFromWorker, fetchSprintFromWorker, fetchSprintListFromWorker,
  fetchEpicsFromWorker, fetchEpicIssuesFromWorker,
} from '../services/jira-api.js';
import { setState, setStateSilent, getState } from './state.js';
import { DEMO_EPICS } from '../data/demo.js';

const BOARD_ID_KEY = 'jira_board_id';

function pickInitialSprintId(sprints) {
  const preferred =
    sprints.find((s) => s.state === 'active') ||
    sprints.find((s) => s.state === 'closed') ||
    sprints[0];
  return preferred ? preferred.id : null;
}

export function setActiveSprint(id) {
  setState({ activeSprintId: id });
  // Lazy-load changelog for accurate CFD when viewing a Jira-sourced sprint
  if (getState().sourceKey === 'api') {
    loadSprintChangelog(id).catch((e) => {
      console.warn('[CFD] changelog load failed:', e);
    });
  }
}

async function loadSprintChangelog(sprintId) {
  const s = getState();
  const sprint = s.sprints.find((sp) => sp.id === sprintId);
  if (!sprint) return;
  // Empty array is truthy — check length to detect "actually loaded".
  if (sprint.issues.length && sprint.issues[0].statusChanges?.length) return;

  const workerUrl = await getWorkerUrl();
  if (!workerUrl) return;
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) return;

  // Resolve the Jira numeric sprint ID. Old worker /all responses may omit sprintId,
  // so fall back to looking it up by name from /sprints.
  let jiraId = sprint.jiraId;
  if (!jiraId) {
    try {
      const list = await fetchSprintListFromWorker(workerUrl, boardId);
      const found = (list || []).find((sp) => sp.name === sprint.name);
      jiraId = found?.id;
    } catch {
      return;
    }
  }
  if (!jiraId) return;

  const data = await fetchSprintFromWorker(workerUrl, jiraId, boardId);
  const changesByKey = new Map();
  for (const iss of data.issues || []) {
    changesByKey.set(iss.key, iss.statusChanges || []);
  }

  const latest = getState();
  const updated = latest.sprints.map((sp) => {
    if (sp.id !== sprintId) return sp;
    return {
      ...sp,
      jiraId: sp.jiraId || jiraId,
      issues: sp.issues.map((iss) => ({
        ...iss,
        statusChanges: changesByKey.get(iss.key) || [],
      })),
    };
  });
  setState({ sprints: updated });
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
    const raw = await fetchAllFromWorker(workerUrl, boardId);
    if (!raw.length) throw new Error('No issues found. Check Board ID and Worker configuration.');

    setProgress('process');
    const sprints = buildSprintsFromIssues(raw, getState().today);
    applyLoadedSprints(sprints, `Jira API · Board ${boardId}`, 'api', { apiPanelOpen: false });
    await finishProgress();
    loadSprintChangelog(getState().activeSprintId).catch((e) => {
      console.warn('[CFD] changelog load failed:', e);
    });
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
    const raw = await fetchAllFromWorker(workerUrl, boardId);
    if (!raw.length) throw new Error('No issues found. Check Worker environment variables and Board ID.');

    setProgress('process');
    const sprints = buildSprintsFromIssues(raw, getState().today);
    applyLoadedSprints(sprints, `Jira API · Board ${boardId}`, 'api');
    await finishProgress();
    loadSprintChangelog(getState().activeSprintId).catch((e) => {
      console.warn('[CFD] changelog load failed:', e);
    });
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
