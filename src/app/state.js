import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';

const state = {
  sprints: DEMO_SPRINTS,
  activeSprintId: 'sp-24',
  today: DEMO_TODAY,
  sourceKey: 'demo',
  sourceId: null, // board id (api) or file name (file) — identifies the source for caching
  sourceLabel: 'Demo · synced',
  error: null,
  lastUpdated: null,
  isRefreshing: false,
  user: null,
  showLoginPrompt: false,
  apiPanelOpen: false,
  pendingBoardId: '',
  loadProgress: null,
  // Epic view state
  view: 'sprint',
  activeEpicId: null,
  rawEpics: [],
  epics: [],
  epicLoadProgress: null,
  epicError: null,
  // Roadmap UI state
  expandedEpicIds: new Set(),
  epicDetailId: null,
  epicFilters: { status: 'all', sprintId: 'all', search: '' },
};

const subscribers = new Set();
const epicRoadmapSubscribers = new Set();
const epicViewSubscribers = new Set();
const sprintViewSubscribers = new Set();
const loadProgressSubscribers = new Set();
const dataSourceSubscribers = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  subscribers.forEach((fn) => fn(state));
}

// Update state and notify ONLY the epic-roadmap listeners — used by the
// progressive per-epic detail loading so each enrichment repaints just the
// Portfolio Roadmap node instead of re-rendering the whole page (avoids jank).
export function setEpicRoadmapState(patch) {
  Object.assign(state, patch);
  epicRoadmapSubscribers.forEach((fn) => fn(state));
}

export function subscribeEpicRoadmap(fn) {
  epicRoadmapSubscribers.add(fn);
  return () => epicRoadmapSubscribers.delete(fn);
}

// Update state and notify ONLY the epic-view listeners — used for Epic tab
// interactions (expand/collapse, filter, search, open/close detail) and epic
// load completions, so the whole Epic view content (filter bar + roadmap +
// detail panel) repaints in isolation instead of re-rendering the entire page,
// which would regenerate the background particles and flash the screen.
export function setEpicViewState(patch) {
  Object.assign(state, patch);
  epicViewSubscribers.forEach((fn) => fn(state));
}

export function subscribeEpicView(fn) {
  epicViewSubscribers.add(fn);
  return () => epicViewSubscribers.delete(fn);
}

// Update state and notify ONLY the sprint-view listeners — used when lazily
// loading a sprint's issues so the swap from skeleton → charts repaints just
// the sprint content area instead of re-rendering the whole page (avoids jank).
export function setSprintViewState(patch) {
  Object.assign(state, patch);
  sprintViewSubscribers.forEach((fn) => fn(state));
}

export function subscribeSprintView(fn) {
  sprintViewSubscribers.add(fn);
  return () => sprintViewSubscribers.delete(fn);
}

// Update state and notify ONLY the load-progress listeners — used while the
// Jira connect/pull/convert steps stream in so the progress strip is updated
// in place (width, label, step dots) instead of re-rendering the whole page,
// which would recreate the bar element and kill its width transition (jank).
export function setLoadProgressState(patch) {
  Object.assign(state, patch);
  loadProgressSubscribers.forEach((fn) => fn(state));
}

export function subscribeLoadProgress(fn) {
  loadProgressSubscribers.add(fn);
  return () => loadProgressSubscribers.delete(fn);
}

// Update state and notify ONLY the data-source listeners — used to open/close
// the inline Board ID panel so just the data-source bar repaints instead of the
// whole page (which would regenerate the background particles and flash, and
// needlessly redraw every chart for a single toggle).
export function setDataSourceState(patch) {
  Object.assign(state, patch);
  dataSourceSubscribers.forEach((fn) => fn(state));
}

export function subscribeDataSource(fn) {
  dataSourceSubscribers.add(fn);
  return () => dataSourceSubscribers.delete(fn);
}

// Mutate without re-rendering. Used for transient UI state (e.g. text in an
// input) that should persist across the next render but not trigger one now.
export function setStateSilent(patch) {
  Object.assign(state, patch);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function activeSprint() {
  return state.sprints.find((s) => s.id === state.activeSprintId) || state.sprints[0];
}

export function activeEpic() {
  if (!state.activeEpicId) return state.epics[0] || null;
  return state.epics.find((e) => e.id === state.activeEpicId) || state.epics[0] || null;
}
