import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { VIEW, SOURCE } from './constants.js';
import { DEFAULT_LANG, LANG_STORAGE_KEY, setActiveLang, t } from './i18n.js';
import { resolveInitialTheme, setActiveTheme } from './theme.js';

// Epic view filters in their "show everything" default. Reused wherever the Epic
// view is reset (new data source, refresh, logout) so the shape lives in one place.
export const DEFAULT_EPIC_FILTERS = { status: 'all', sprintId: 'all', search: '' };

// Resolve the persisted language and activate it before building the initial
// state, so the first paint (including the demo source label below) is already
// in the user's chosen language. main.js re-syncs <html lang> on boot too.
const initialLang = (typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null) || DEFAULT_LANG;
setActiveLang(initialLang);

// Resolve the colour theme the same way: saved choice → OS preference → light. The
// inline boot script in index.html already painted with this class; we just record
// it in-memory so state.theme below stays in sync. See src/app/theme.js.
const initialTheme = resolveInitialTheme();
setActiveTheme(initialTheme);

const state = {
  sprints: DEMO_SPRINTS,
  activeSprintId: 'sp-24',
  today: DEMO_TODAY,
  sourceKey: SOURCE.DEMO,
  sourceId: null, // board id (api) or file name (file) — identifies the source for caching
  sourceLabel: t('action.demoSynced'),
  error: null,
  lastUpdated: null,
  isRefreshing: false,
  user: null,
  showLoginPrompt: false,
  apiPanelOpen: false,
  jiraUrl: (typeof localStorage !== 'undefined' ? localStorage.getItem('sprint_pulse_jira_url') : null) || null,
  lang: (typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null) || DEFAULT_LANG,
  theme: initialTheme,
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

// One-shot "don't replay entry animations on the next full render" flag. A
// language switch re-renders the whole page; without this the charts would replay
// their 1.6s draw-in and the stat bars their grow, which reads as jank for a mere
// text swap. setLanguage arms it; render() consumes it once (adds `.no-anim` to
// the app shell for that render only). First paint and sprint switching leave it
// unset, so those still animate.
let _suppressIntroAnim = false;
export function suppressIntroAnimOnce() { _suppressIntroAnim = true; }
export function consumeSuppressIntroAnim() {
  const v = _suppressIntroAnim;
  _suppressIntroAnim = false;
  return v;
}

// Same one-shot, but for the scoped Sprint-content repaint (rerenderSprintView).
// A background auto-refresh patches the sprint charts via setSprintViewState,
// which replaceChildren()s the mount and would replay the 1.6s chart draw-in —
// jank for a silent update. silentRefresh arms this right before the patch;
// rerenderSprintView consumes it once to add `.no-anim` to the mount for that
// repaint only, so a user-driven sprint switch still animates normally.
let _suppressSprintAnim = false;
export function suppressSprintAnimOnce() { _suppressSprintAnim = true; }
export function consumeSuppressSprintAnim() {
  const v = _suppressSprintAnim;
  _suppressSprintAnim = false;
  return v;
}

export function activeSprint() {
  return state.sprints.find((s) => s.id === state.activeSprintId) || state.sprints[0];
}

export function activeEpic() {
  if (!state.activeEpicId) return state.epics[0] || null;
  return state.epics.find((e) => e.id === state.activeEpicId) || state.epics[0] || null;
}
