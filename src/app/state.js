import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { VIEW, SOURCE } from './constants.js';

// Epic view filters in their "show everything" default. Reused wherever the Epic
// view is reset (new data source, refresh, logout) so the shape lives in one place.
export const DEFAULT_EPIC_FILTERS = { status: 'all', sprintId: 'all', search: '' };

const state = {
  sprints: DEMO_SPRINTS,
  activeSprintId: 'sp-24',
  today: DEMO_TODAY,
  sourceKey: SOURCE.DEMO,
  sourceId: null, // board id (api) or file name (file) — identifies the source for caching
  sourceLabel: 'Demo · synced',
  error: null,
  lastUpdated: null,
  isRefreshing: false,
  user: null,
  showLoginPrompt: false,
  apiPanelOpen: false,
  jiraUrl: (typeof localStorage !== 'undefined' ? localStorage.getItem('sprint_pulse_jira_url') : null) || null,
  pendingBoardId: '',
  loadProgress: null,
  // Epic view state
  view: VIEW.SPRINT,
  activeEpicId: null,
  rawEpics: [],
  epics: [],
  epicLoadProgress: null,
  epicError: null,
  // Roadmap UI state
  expandedEpicIds: new Set(),
  epicDetailId: null,
  epicFilters: { ...DEFAULT_EPIC_FILTERS },
};

export function getState() {
  return state;
}

// A "render channel": a set of listeners plus a setter that patches the shared
// state and notifies only that channel. Scoped channels let a single region
// repaint in isolation instead of re-rendering the whole page — a full re-render
// regenerates the background particles and redraws every chart, which flashes
// the screen and kills in-flight CSS transitions (progress bar width, etc).
function createChannel() {
  const listeners = new Set();
  return {
    set(patch) {
      Object.assign(state, patch);
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const main = createChannel();
const epicRoadmap = createChannel(); // progressive per-epic detail enrichment
const epicView = createChannel();    // Epic tab: filter/expand/detail interactions
const sprintView = createChannel();  // lazy per-sprint issue loading (skeleton → charts)
const loadProgress = createChannel(); // Jira connect/pull/convert progress strip
const dataSource = createChannel();  // inline Board ID panel open/close

// Full-page render.
export const setState = main.set;
export const subscribe = main.subscribe;

// Scoped, isolated repaints (see createChannel for why these exist).
export const setEpicRoadmapState = epicRoadmap.set;
export const subscribeEpicRoadmap = epicRoadmap.subscribe;
export const setEpicViewState = epicView.set;
export const subscribeEpicView = epicView.subscribe;
export const setSprintViewState = sprintView.set;
export const subscribeSprintView = sprintView.subscribe;
export const setLoadProgressState = loadProgress.set;
export const subscribeLoadProgress = loadProgress.subscribe;
export const setDataSourceState = dataSource.set;
export const subscribeDataSource = dataSource.subscribe;

// Mutate without re-rendering. Used for transient UI state (e.g. text in an
// input) that should persist across the next render but not trigger one now.
export function setStateSilent(patch) {
  Object.assign(state, patch);
}

export function activeSprint() {
  return state.sprints.find((s) => s.id === state.activeSprintId) || state.sprints[0];
}

export function activeEpic() {
  if (!state.activeEpicId) return state.epics[0] || null;
  return state.epics.find((e) => e.id === state.activeEpicId) || state.epics[0] || null;
}
