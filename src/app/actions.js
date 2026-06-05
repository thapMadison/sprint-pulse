// All side-effects (auth, fetching, parsing, persistence) live here.
// Components dispatch through these functions and read via getState().
import { DEMO_SPRINTS, DEMO_TODAY } from '../data/demo.js';
import { todayISO } from '../domain/working-days.js';
import { buildSprintsFromIssues, buildSprintShells, populateSprintIssues } from '../domain/sprint-builder.js';
import { buildLightweightEpics, enrichEpicWithDetail, buildStubEpic } from '../domain/epic-builder.js';
import { parseFile } from '../data/parsers/index.js';
import {
  signInWithMicrosoft, signOut, isAuthenticated, getWorkerUrl, getJiraUrl,
} from '../services/auth.js';
import * as cache from '../services/data-cache.js';
import {
  fetchSprintFromWorker, fetchSprintListFromWorker, fetchBoardFromWorker,
  fetchEpicsFromWorker, fetchEpicIssuesFromWorker, fetchIssueDetailFromWorker,
  fetchStatusesFromWorker,
} from '../services/jira-api.js';
import { buildColorMapFromIssues, buildStatusColorMap } from '../domain/status-colors.js';
import { setState, setStateSilent, setEpicRoadmapState, setEpicViewState, setSprintViewState, setLoadProgressState, setDataSourceState, setViewState, setErrorState, setTopbarState, getState, suppressIntroAnimOnce, suppressSprintAnimOnce, DEFAULT_EPIC_FILTERS } from './state.js';
import { DEMO_EPICS } from '../data/demo.js';
import { VIEW, SOURCE } from './constants.js';
import { startAutoRefresh, stopAutoRefresh } from './auto-refresh.js';
import { setActiveLang, isSupported, LANG_STORAGE_KEY, t } from './i18n.js';
import { setActiveTheme, isSupportedTheme, applyTheme, THEME_STORAGE_KEY } from './theme.js';

const BOARD_ID_KEY = 'jira_board_id';

// Persist a single setting to localStorage, tolerating unavailable storage
// (private mode) — the write is a nicety, not load-bearing. Shared by the
// language/theme switchers below.
function persistSetting(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch { /* storage may be unavailable (private mode) — non-fatal */ }
}

// Resolve the Worker URL + saved board id together — the pair every Jira API
// call needs. Returns null when either is missing so callers that fail silently
// (background refresh, lazy detail) can just bail. Callers that surface a
// user-facing message check the two pieces individually instead.
async function resolveApiContext() {
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) return null;
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) return null;
  return { workerUrl, boardId };
}

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
    sourceLabel: t('action.demoSynced'),
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
    statusColorMap: s.statusColorMap,
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
    statusColorMap: snap.statusColorMap || {},
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
  // Restoring a Jira board (boot or board-switch) — start background refresh.
  if (snap.sourceKey === SOURCE.API) startAutoRefresh();
}

// Prefer the human-readable board name; fall back to the numeric id.
function apiSourceLabel(board, boardId) {
  const name = board && board.name ? board.name.trim() : '';
  return name ? t('action.jiraApiName', { name }) : t('action.jiraApiBoard', { boardId });
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
  if (!workerUrl) { markSprintLoaded(sprintId, t('action.workerNotConfigured')); return; }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) { markSprintLoaded(sprintId, t('action.boardIdNotSet')); return; }

  // Resolve the Jira numeric sprint ID. Shells carry jiraId from /sprints; fall
  // back to a name lookup just in case it's missing.
  let jiraId = sprint.jiraId;
  if (!jiraId) {
    try {
      const list = await fetchSprintListFromWorker(workerUrl, boardId);
      jiraId = (list || []).find((sp) => sp.name === sprint.name)?.id;
    } catch { /* fall through to error below */ }
  }
  if (!jiraId) { markSprintLoaded(sprintId, t('action.couldNotResolveSprint')); return; }

  try {
    const data = await fetchSprintFromWorker(workerUrl, jiraId, boardId);
    const latest = getState();
    const updated = latest.sprints.map((sp) =>
      sp.id === sprintId ? populateSprintIssues({ ...sp, jiraId }, data.issues || []) : sp
    );
    setSprintViewState({ sprints: updated });

    // Fallback colour map from loaded sprint issues — only when the authoritative
    // board-wide map (built from the project's full status list in fetchAndApplyBoard)
    // is unavailable, e.g. multi-project / JQL boards with no single projectKey.
    if (Object.keys(getState().statusColorMap).length === 0) {
      const allIssues = updated.flatMap((sp) => sp.issues || []);
      if (allIssues.length) setStateSilent({ statusColorMap: buildColorMapFromIssues(allIssues) });
    }

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
  // Route through the view channel — only #view-mount + tab active classes repaint;
  // topbar / data-source bar / footer / FABs are untouched (no chart re-animation).
  setViewState({ view });
  if (view === VIEW.EPIC && getState().epics.length === 0) {
    loadEpicsAndChangelogs().catch((e) => {
      console.warn('[Epic] load failed:', e);
    });
  }
}

// Switch UI language. Flips the i18n lookup target, persists the choice, and
// triggers a full re-render so every component re-reads its strings. No-op for an
// unsupported code. Side-effects (localStorage, render) live here per AGENTS.md.
export function setLanguage(code) {
  if (!isSupported(code) || code === getState().lang) return;
  const lang = setActiveLang(code);
  persistSetting(LANG_STORAGE_KEY, lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  // The re-render below only swaps text — suppress chart/bar entry animations for
  // that one render so a language change doesn't replay the draw-in (jank).
  suppressIntroAnimOnce();
  setState({ lang });
}

// Switch colour theme. The theme is 100% CSS — every colour (incl. chart strokes)
// is a `var(--*)` the browser re-resolves the instant `applyTheme` flips the
// `theme-light` class on <html>, with CSS transitions for free. So there is NOTHING
// to re-render: record the choice SILENTLY (no main-channel render) to avoid the
// whole-page rebuild (background re-randomized, charts re-animated) that caused the
// jank. The switch button updates its own class on click (see user-menu.js).
// No-op for an unsupported or unchanged value. Side-effects live here per AGENTS.md.
export function setTheme(theme) {
  if (!isSupportedTheme(theme) || theme === getState().theme) return;
  const resolved = setActiveTheme(theme);
  persistSetting(THEME_STORAGE_KEY, resolved);
  applyTheme(resolved);
  setStateSilent({ theme: resolved });
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
    setEpicViewState({ epicError: t('action.workerNotConfigured') });
    return;
  }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) {
    setEpicViewState({ epicError: t('action.boardIdNotSet') });
    return;
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Immediate render with lightweight epics
    // ═══════════════════════════════════════════════════════════════════════
    setEpicViewState({ epicError: null, epicLoadProgress: { phase: 1, labelKey: 'action.loadingEpicList' } });

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
        const enrichedEpic = await fetchEnrichedEpic(epic, workerUrl, boardId);
        // Update the single epic without re-sorting (preserve order). Repaint only
        // the roadmap node unless this epic's detail panel is open (then full view).
        patchEpicInState(epic.id, enrichedEpic);
      } catch (e) {
        console.warn(`[Epic] detail load failed for ${epic.key}:`, e);
        // Mark as loaded (with error) so UI stops showing spinner.
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

// ── Shared epic fetch/patch helpers ─────────────────────────────────────────
// Dedup the fetch+enrich step used by loadEpicsAndChangelogs (Phase 2),
// refreshEpicsOnly (auto-refresh), and loadSingleEpic (on-demand single epic).

// Fetch detail for one epic from the worker and enrich it with today's date.
async function fetchEnrichedEpic(epic, workerUrl, boardId) {
  const detail = await fetchEpicIssuesFromWorker(workerUrl, epic.key, boardId);
  return enrichEpicWithDetail(epic, detail, getState().today);
}

// Swap one enriched epic into state and repaint only the affected region:
// if the epic's detail panel is open → full Epic view (filter+roadmap+panel);
// otherwise → roadmap only.
function patchEpicInState(epicId, enrichedEpic) {
  const latest = getState();
  const updated = latest.epics.map((e) => (e.id === epicId ? enrichedEpic : e));
  if (latest.epicDetailId === epicId) setEpicViewState({ epics: updated });
  else setEpicRoadmapState({ epics: updated });
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

// Load detail for a single epic by key — used when opening epic panel.
// Prioritizes the requested epic, then triggers full load for remaining epics.
async function loadSingleEpic(epicKey) {
  const s = getState();
  const source = s.sourceKey;

  // Demo/File mode: no API, trigger full load which marks all as detailLoaded
  if (source === SOURCE.DEMO || source === SOURCE.FILE) {
    return loadEpicsAndChangelogs();
  }

  const ctx = await resolveApiContext();
  if (!ctx) return;
  const { workerUrl, boardId } = ctx;

  try {
    const detailData = await fetchEpicIssuesFromWorker(workerUrl, epicKey, boardId);
    const latest = getState();
    const epic = latest.epics.find((e) => e.key === epicKey);

    let enrichedEpic;
    if (epic) {
      // Epic exists in list — enrich it. Preserve existing routing (roadmap only)
      // to keep behaviour identical; patchEpicInState would also check epicDetailId
      // but loadSingleEpic is typically triggered before the panel opens (epicDetailId
      // is null), so the outcome is the same. Documented here for future cleanup.
      enrichedEpic = enrichEpicWithDetail(epic, detailData, latest.today);
      const updatedEpics = latest.epics.map((e) =>
        e.id === epic.id ? enrichedEpic : e
      );
      setEpicRoadmapState({ epics: updatedEpics });
    } else {
      // Epic not in list — build a new one from detail data
      enrichedEpic = buildEpicFromDetail(epicKey, detailData, latest.today);
      const updatedEpics = [...latest.epics, enrichedEpic];
      setEpicRoadmapState({ epics: updatedEpics });
    }

    // Fallback only: when the authoritative board-wide map is unavailable, merge
    // epic tasks into the colour map so statuses that only appear in historical
    // sprints get the same colour across sprint and epic views.
    if (Object.keys(getState().statusColorMap).length === 0) {
      const allIssues = [
        ...getState().sprints.flatMap((sp) => sp.issues || []),
        ...(enrichedEpic.tasks || []),
      ];
      if (allIssues.length) setStateSilent({ statusColorMap: buildColorMapFromIssues(allIssues) });
    }
  } catch (e) {
    console.warn(`[Epic] single epic load failed for ${epicKey}:`, e);
  }
}

// Build epic object from API detail data when epic isn't in list yet
function buildEpicFromDetail(epicKey, detailData, today) {
  if (!detailData || !detailData.issues || !detailData.issues.length) {
    return buildStubEpic(epicKey, { today, detailLoaded: true });
  }

  // Use enrichEpicWithDetail with a minimal stub
  const stub = buildStubEpic(epicKey, {
    name: detailData.epicName || detailData.issues[0]?.epicName || epicKey,
    summary: detailData.epicSummary || '',
    today,
  });
  return enrichEpicWithDetail(stub, detailData, today);
}

// Load detail for a specific epicKey — always loads this epic first, then triggers full load.
export function ensureEpicKeyLoaded(epicKey) {
  // Load the requested epic immediately (parallel with full load if needed)
  loadSingleEpic(epicKey).catch((e) => {
    console.warn(`[Epic] ensureEpicKeyLoaded failed for ${epicKey}:`, e);
  });

  // Then trigger full load for remaining epics (if not already running)
  const s = getState();
  const needsFullLoad = !s.epics.length || s.epics.some((e) => !e.isNoEpic && !e.detailLoaded && e.key !== epicKey);
  if (!s.epicLoadProgress && needsFullLoad) {
    loadEpicsAndChangelogs().catch((e) => {
      setEpicViewState({ epicError: e.message || String(e) });
    });
  }
}

export function setPendingBoardId(v) {
  // No re-render — would steal focus from the input the user is typing into.
  setStateSilent({ pendingBoardId: v });
}

const LOAD_STEPS = {
  connect:  { labelKey: 'action.connectingToJira',  percent: 15 },
  fetch:    { labelKey: 'action.pullingSprintData', percent: 55 },
  process:  { labelKey: 'action.convertingIssues',  percent: 85 },
  done:     { labelKey: 'action.done',              percent: 100 },
  parse:    { labelKey: 'action.readingFile',       percent: 35 },
};

function setProgress(step, flow) {
  if (!step) {
    // Clear the strip via the dataSource channel — only the bar needs to repaint.
    // (The strip lives inside the data-source bar; rerenderDataSource rebuilds it.)
    setDataSourceState({ loadProgress: null });
    return;
  }
  const meta = LOAD_STEPS[step];
  const prevFlow = getState().loadProgress?.flow;
  // Route through the load-progress channel so an already-mounted strip is
  // updated in place (smooth width transition) rather than rebuilt; the very
  // first step falls back to a full render to create the bar.
  setLoadProgressState({
    loadProgress: {
      step, labelKey: meta.labelKey, percent: meta.percent,
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
  // Record silently, then repaint only the banner mount and the data-source bar
  // (to stop the refresh spinner) — no full render needed just for a banner.
  setStateSilent({ error: message, isRefreshing: false });
  setErrorState({});        // rerenderError fills #app-error-mount
  setDataSourceState({});   // rerenderDataSource removes spinner on FAB/button
}

export function clearError() {
  setStateSilent({ error: null });
  setErrorState({});        // rerenderError clears #app-error-mount
}

export function requireLogin() {
  // showLoginPrompt has no reader in the render tree (grep confirms) — record
  // silently to avoid a spurious full render on every "Connect Jira" click.
  setStateSilent({ showLoginPrompt: true });
}

export async function login() {
  try {
    await signInWithMicrosoft();
  } catch (e) {
    showError(t('action.loginFailed', { error: e.message }));
  }
}

export async function logout() {
  try {
    // Capture the uid before sign-out so we can wipe that user's cached Jira/
    // file data — it must not linger for the next person on a shared machine.
    const uid = cache.userScope();
    stopAutoRefresh(); // leaving the API source — no more background polling
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
    showError(t('action.logoutFailed', { error: e.message }));
  }
}

export function loadDemo() {
  // Preserve the source we're leaving so switching back to it is instant.
  persistCurrent();
  stopAutoRefresh(); // demo has no API source to poll
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
    stopAutoRefresh(); // file source has no API to poll
    setProgress('parse', 'file');
    const rawIssues = await parseFile(file);
    if (!rawIssues.length) throw new Error(t('action.fileNoIssues'));
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
  if (!workerUrl) throw new Error(t('action.workerNotConfiguredFirebase'));
  const jiraUrl = await getJiraUrl().catch(() => null);

  localStorage.setItem(BOARD_ID_KEY, boardId);
  setProgress('fetch');
  // Board name + status list are best-effort; fall back gracefully on failure.
  const [board, rawSprints, statuses] = await Promise.all([
    fetchBoardFromWorker(workerUrl, boardId).catch(() => null),
    fetchSprintListFromWorker(workerUrl, boardId),
    fetchStatusesFromWorker(workerUrl, boardId).catch(() => []),
  ]);
  if (!rawSprints || !rawSprints.length) {
    throw new Error(t('action.noSprintsCheckConfig'));
  }

  // Authoritative board-wide status→colour map from the project's full workflow
  // status list. Set once up front so every status (incl. ones only seen in
  // history) gets a stable colour; the per-sprint/epic fallbacks below only fill
  // in when this is empty (e.g. multi-project boards with no single projectKey).
  if (statuses && statuses.length) {
    setStateSilent({ statusColorMap: buildStatusColorMap(statuses) });
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
  // Kick off (or reset, when called from manual Refresh) the background poller.
  startAutoRefresh();
}

export async function loadFromApi(boardId) {
  if (!boardId) {
    showError(t('action.enterBoardId'));
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
    showError(t('action.loginToRefresh'));
    requireLogin();
    return;
  }
  const boardId = localStorage.getItem(BOARD_ID_KEY);
  if (!boardId) {
    showError(t('action.boardIdNotSetConnect'));
    return;
  }

  // Only the data-source bar + Refresh FAB read isRefreshing — both already
  // subscribe to the dataSource channel, so route through there (no full render).
  setDataSourceState({ isRefreshing: true });
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

// ─────────────────────────── background auto-refresh ───────────────────────────
// silentRefresh() is the poller's per-cycle entry point (see auto-refresh.js). It
// pulls fresh Jira data and patches ONLY the regions that actually changed, via
// the scoped render channels — never setState (full render) or applyLoadedSprints
// (which resets epic UI state). Open panels, scroll, expanded epics and filters
// are all preserved. Background failures only console.warn (never showError, which
// would full-render a banner); the top-level fetch error propagates so the timer
// can back off.

let _silentCycle = 0;

// Cheap structural signature of the sprint list (+ the active sprint's issues) so
// we can skip the repaint entirely when nothing changed — no rebuild, no flash.
function sprintsSignature(sprints, activeId) {
  const meta = sprints.map((sp) => `${sp.id}:${sp.state}:${sp.startDate}:${sp.endDate}:${sp.name}`).join('|');
  const active = sprints.find((sp) => sp.id === activeId);
  const issues = active && active.issuesLoaded
    ? active.issues.map((i) => `${i.key}:${i.status}:${i.originalEstimate}:${i.timeSpent}`).sort().join(',')
    : '';
  return `${meta}#${issues}`;
}

function sprintsChanged(oldSprints, nextSprints, activeId) {
  return sprintsSignature(oldSprints, activeId) !== sprintsSignature(nextSprints, activeId);
}

// Which epics to re-enrich this cycle: in-progress ones every cycle (they change
// most), plus a full sweep every 4th cycle (~20 min) to catch todo→in-progress
// transitions. Keeps Epic-tab request volume low on boards with many epics.
function shouldRefreshEpic(epic) {
  if (epic.isNoEpic) return false;
  return epic.status === 'inprogress' || _silentCycle % 4 === 0;
}

function epicChanged(prev, next) {
  const p = prev.progress || {};
  const n = next.progress || {};
  return prev.status !== next.status
    || prev.startDate !== next.startDate
    || prev.endDate !== next.endDate
    || (prev.tasks?.length || 0) !== (next.tasks?.length || 0)
    || p.percent !== n.percent
    || JSON.stringify(p.counts) !== JSON.stringify(n.counts);
}

export async function silentRefresh() {
  const s = getState();
  if (s.sourceKey !== SOURCE.API) {
    console.log('[AutoRefresh] silentRefresh skipped — not API source:', s.sourceKey);
    return;
  }
  if (s.isRefreshing || s.loadProgress || s.epicLoadProgress) {
    console.log('[AutoRefresh] silentRefresh skipped — manual refresh/load in progress');
    return;
  }
  if (!isAuthenticated()) {
    console.log('[AutoRefresh] silentRefresh skipped — not authenticated');
    return;
  }
  if (!localStorage.getItem(BOARD_ID_KEY)) {
    console.log('[AutoRefresh] silentRefresh skipped — no boardId');
    return;
  }

  _silentCycle++;
  console.log(`[AutoRefresh] silentRefresh cycle #${_silentCycle} (view: ${s.view})`);
  await refreshSprintsOnly();  // top-level fetch errors propagate → auto-refresh backs off
  await refreshEpicsOnly();    // no-op unless on the Epic tab

  // Bump the "updated X ago" freshness marker once per successful cycle (even when
  // data was unchanged — we're verified current as of now). Routes through the
  // data-source channel so the bar AND the Refresh FAB update text in place; the
  // sprint content is left untouched. No isRefreshing flip (would spin the FAB).
  setStateSilent({ lastUpdated: new Date() });
  persistCurrent();   // save updated timestamp to cache so F5 restore shows correct age
  setDataSourceState({});
  console.log('[AutoRefresh] timestamp bumped → "Updated just now"');
}

async function refreshSprintsOnly() {
  const ctx = await resolveApiContext();
  if (!ctx) return;
  const { workerUrl, boardId } = ctx;

  console.log('[AutoRefresh] fetching sprint list...');
  const rawSprints = await fetchSprintListFromWorker(workerUrl, boardId);
  if (!rawSprints || !rawSprints.length) {
    console.log('[AutoRefresh] sprint list empty — skipping');
    return;
  }
  console.log(`[AutoRefresh] sprint list ok (${rawSprints.length} sprints)`);

  const old = getState().sprints;
  // Rebuild shells from the fresh list, but carry over already-loaded issues for
  // any sprint the user has viewed (match by jiraId, fall back to slug id) so they
  // don't revert to a skeleton. Sprints never viewed stay unloaded shells.
  const merged = buildSprintShells(rawSprints, getState().today).map((shell) => {
    const prev = old.find((o) => (o.jiraId && shell.jiraId && o.jiraId === shell.jiraId) || o.id === shell.id);
    if (prev && prev.issuesLoaded) {
      return { ...shell, issues: prev.issues, issuesLoaded: true, issuesError: prev.issuesError || null };
    }
    return shell;
  });

  // Re-fetch issues for the sprint the user is actually looking at.
  const activeId = getState().activeSprintId;
  const activeSprint = merged.find((sp) => sp.id === activeId);
  console.log(`[AutoRefresh] fetching active sprint issues (${activeSprint?.name || activeId})...`);
  const i = merged.findIndex((sp) => sp.id === activeId);
  if (i >= 0 && merged[i].jiraId) {
    try {
      const data = await fetchSprintFromWorker(workerUrl, merged[i].jiraId, boardId);
      merged[i] = populateSprintIssues(merged[i], data.issues || []);
      console.log(`[AutoRefresh] active sprint issues ok (${merged[i].issues.length} issues)`);
    } catch (e) {
      console.warn('[SilentRefresh] active sprint:', e);
    }
  }

  if (sprintsChanged(old, merged, activeId)) {
    console.log('[AutoRefresh] sprint data changed → patching UI (no-anim)');
    suppressSprintAnimOnce();                 // patch the charts without replaying the draw-in
    setSprintViewState({ sprints: merged });  // repaints only #sprint-content-mount
    persistCurrent();
  } else {
    console.log('[AutoRefresh] sprint data unchanged — no repaint');
  }
}

async function refreshEpicsOnly() {
  const s = getState();
  if (s.view !== VIEW.EPIC) {
    console.log('[AutoRefresh] epic refresh skipped — not on Epic tab');
    return;
  }
  if (!s.epics.length) {
    console.log('[AutoRefresh] epic refresh skipped — no epics loaded yet');
    return;
  }
  const ctx = await resolveApiContext();
  if (!ctx) return;
  const { workerUrl, boardId } = ctx;

  const toRefresh = s.epics.filter(shouldRefreshEpic);
  console.log(`[AutoRefresh] epic refresh: ${toRefresh.length} epic(s) (cycle #${_silentCycle}, sweep=${_silentCycle % 4 === 0}): ${toRefresh.map(e => e.key).join(', ')}`);

  let patched = false;
  // Sequential (await in the loop) so we never fire a burst of /epic calls.
  for (const epic of toRefresh) {
    try {
      console.log(`[AutoRefresh]   fetching ${epic.key}...`);
      const enriched = await fetchEnrichedEpic(epic, workerUrl, boardId);
      if (!epicChanged(epic, enriched)) {
        console.log(`[AutoRefresh]   ${epic.key} — no change`);
        continue;
      }
      console.log(`[AutoRefresh]   ${epic.key} — changed, patching`);
      patchEpicInState(epic.id, enriched);
      patched = true;
    } catch (e) {
      console.warn(`[SilentRefresh] epic ${epic.key}:`, e);
    }
  }
  if (patched) persistCurrent();
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
  const ctx = await resolveApiContext();
  if (!ctx) return null;
  const { workerUrl, boardId } = ctx;
  return fetchIssueDetailFromWorker(workerUrl, issueKey, boardId);
}

// Force pending cache writes to disk — call when the tab is hidden/unloaded so
// lazily-loaded data isn't lost before the debounced write fires.
export function flushCache() {
  cache.flush();
}
