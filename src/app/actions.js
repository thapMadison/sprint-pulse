// All side-effects (auth, fetching, parsing, persistence) live here.
// Components dispatch through these functions and read via getState().
import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { todayISO } from '../domain/working-days.js';
import { buildSprintsFromIssues } from '../domain/sprint-builder.js';
import { parseFile } from '../data/parsers/index.js';
import {
  signInWithMicrosoft, signOut, isAuthenticated, getWorkerUrl,
} from '../services/auth.js';
import { fetchAllFromWorker } from '../services/jira-api.js';
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
    const rawIssues = await parseFile(file);
    if (!rawIssues.length) throw new Error('File parsed but contained no issues.');
    const sprints = buildSprintsFromIssues(rawIssues, getState().today);
    applyLoadedSprints(sprints, `File · ${file.name}`, 'file');
  } catch (e) {
    showError(e.message || String(e));
  }
}

export async function loadFromApi(boardId) {
  if (!boardId) {
    showError('Please enter your Jira Board ID.');
    return false;
  }
  try {
    const workerUrl = await getWorkerUrl();
    if (!workerUrl) throw new Error('Worker URL not configured in Firebase database.');

    localStorage.setItem(BOARD_ID_KEY, boardId);
    const raw = await fetchAllFromWorker(workerUrl, boardId);
    if (!raw.length) throw new Error('No issues found. Check Board ID and Worker configuration.');

    const sprints = buildSprintsFromIssues(raw, getState().today);
    applyLoadedSprints(sprints, `Jira API · Board ${boardId}`, 'api', { apiPanelOpen: false });
    return true;
  } catch (e) {
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
    const workerUrl = await getWorkerUrl();
    if (!workerUrl) throw new Error('Worker URL not configured in Firebase.');
    const raw = await fetchAllFromWorker(workerUrl, boardId);
    if (!raw.length) throw new Error('No issues found. Check Worker environment variables and Board ID.');

    const sprints = buildSprintsFromIssues(raw, getState().today);
    applyLoadedSprints(sprints, `Jira API · Board ${boardId}`, 'api');
  } catch (e) {
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
