import { initFirebase, onAuthStateChange } from '../services/auth.js';
import { setState, subscribe, subscribeEpicRoadmap, subscribeEpicView, subscribeSprintView, subscribeLoadProgress, subscribeDataSource } from './state.js';
import { render, rerenderEpicRoadmap, rerenderEpicView, rerenderSprintView, rerenderProgress, rerenderDataSource } from './render.js';
import { restoreLastSource, flushCache } from './actions.js';

subscribe(render);
subscribeEpicRoadmap(rerenderEpicRoadmap);
subscribeEpicView(rerenderEpicView);
subscribeSprintView(rerenderSprintView);
subscribeLoadProgress(rerenderProgress);
subscribeDataSource(rerenderDataSource);

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
