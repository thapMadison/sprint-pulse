import { initFirebase, onAuthStateChange } from '../services/auth.js';
import { setState, subscribe, subscribeEpicRoadmap, subscribeEpicView, subscribeSprintView, subscribeLoadProgress, subscribeDataSource, getState } from './state.js';
import { render, rerenderEpicRoadmap, rerenderEpicView, rerenderSprintView, rerenderProgress, rerenderDataSource, rerenderFAB } from './render.js';
import { restoreLastSource, flushCache } from './actions.js';
import { setActiveLang } from './i18n.js';

// Sync the i18n core + <html lang> with the persisted language before first paint
// so the initial render is in the user's chosen language.
setActiveLang(getState().lang);
document.documentElement.lang = getState().lang;

subscribe(render);
subscribeEpicRoadmap(rerenderEpicRoadmap);
subscribeEpicView(rerenderEpicView);
subscribeSprintView(rerenderSprintView);
subscribeLoadProgress(rerenderProgress);
subscribeDataSource(rerenderDataSource);

// Keep the floating Refresh FAB in step with refresh state. refreshFromApi flips
// isRefreshing via the main channel (full render handles it), and lands the new
// lastUpdated / isRefreshing:false via the sprint-view channel — subscribe to
// both so the FAB's status + spinner update in place either way.
subscribeSprintView(rerenderFAB);
subscribeLoadProgress(rerenderFAB);

initFirebase().then(() => {
  onAuthStateChange((user) => {
    setState({ user });
    // Once auth resolves, restore the data source the user was last on (Jira
    // board / file) instead of leaving them on demo. No-op after it succeeds.
    restoreLastSource(user).catch((e) => console.warn('[boot] restore failed:', e));
  });
}).catch((e) => {
  console.error('Firebase init error:', e);
});

// Flush any debounced cache writes before the tab goes away so lazily-loaded
// sprint/epic data survives a refresh even if the timer hasn't fired yet.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushCache();
});
window.addEventListener('pagehide', flushCache);

render();
