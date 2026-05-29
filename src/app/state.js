import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';

const state = {
  sprints: DEMO_SPRINTS,
  activeSprintId: 'sp-24',
  today: DEMO_TODAY,
  sourceKey: 'demo',
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

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  subscribers.forEach((fn) => fn(state));
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
