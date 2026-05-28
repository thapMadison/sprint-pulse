// All side-effects (auth, fetching, parsing, persistence) live here.
// Components dispatch through these functions and read via getState().
import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { todayISO } from '../domain/working-days.js';
import { buildSprintsFromIssues } from '../domain/sprint-builder.js';
import { parseFile } from '../data/parsers/index.js';
import {
  signInWithMicrosoft, signOut, isAuthenticated, getWorkerUrl,
} from '../services/auth.js';
import {
  fetchAllFromWorker, fetchSprintFromWorker, fetchSprintListFromWorker,
} from '../services/jira-api.js';
import { setState, setStateSilent, getState } from './state.js';

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
    ...extra,
  });
}

export function getSavedBoardId() {
  return localStorage.getItem(BOARD_ID_KEY) || '';
}
