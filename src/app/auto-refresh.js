// Background auto-refresh timer for the Jira (API) source.
//
// Pulls fresh sprint/epic data on an interval and patches only the regions that
// changed (see silentRefresh in actions.js) so the page never re-renders, charts
// don't flash, and open panels / scroll / expanded epics are preserved.
//
// Design notes:
//   • setTimeout-chain (not setInterval) so cycles never overlap and each cycle
//     can pick its own delay (backoff).
//   • Backoff on failure (e.g. a 429): the wait doubles up to MAX, and resets to
//     BASE on the next success — so if Jira starts throttling we ease off instead
//     of hammering. See the rate-limit analysis in the plan.
//   • Paused while the tab is hidden (the tick checks visibility and skips the
//     network work), and refreshes once immediately when the tab becomes visible.
//   • The visibility listener is wired lazily inside startAutoRefresh and guarded
//     by `typeof document` so importing this module has no side effects (keeps the
//     node-env test suite importing actions.js clean).

import { silentRefresh } from './actions.js';
import { refreshLog } from './debug.js';

const BASE = 5 * 60 * 1000;   // 5 minutes — see plan's Jira rate-limit analysis
const FIRST = 30 * 1000;      // 30 seconds — first cycle fires quickly after page load
const MAX = 4 * BASE;         // backoff ceiling = 20 minutes

let _id = null;
let _enabled = false;
let _inFlight = false;
let _wait = BASE;
let _wired = false;
let _firstCycle = true;       // first cycle after startAutoRefresh() uses FIRST delay

const ts = () => new Date().toLocaleTimeString();

export function startAutoRefresh() {
  _enabled = true;
  _wait = BASE;
  _firstCycle = true;           // reset so next start always does the quick first-check
  wireVisibility();
  schedule();
  refreshLog(`[AutoRefresh] started — first cycle in ${FIRST / 1000}s, then every ${BASE / 1000}s`);
}

export function stopAutoRefresh() {
  _enabled = false;
  if (_id) { clearTimeout(_id); _id = null; }
  refreshLog(`[AutoRefresh] stopped`);
}

function schedule() {
  if (_id) { clearTimeout(_id); _id = null; }
  if (!_enabled) return;
  const delay = _firstCycle ? FIRST : _wait;
  _id = setTimeout(tick, delay);
  refreshLog(`[AutoRefresh] next tick in ${delay / 1000}s (at ~${new Date(Date.now() + delay).toLocaleTimeString()})`);
}

async function tick() {
  // Skip the network work while hidden (still reschedules so we resume on return);
  // skip if a previous cycle is somehow still running (slow worker).
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    refreshLog(`[AutoRefresh] ${ts()} — tab hidden, skipping (will refresh on return)`);
    schedule();
    return;
  }
  if (_inFlight) {
    refreshLog(`[AutoRefresh] ${ts()} — previous cycle still running, skipping`);
    schedule();
    return;
  }
  _firstCycle = false;          // subsequent calls use _wait (5 min)
  _inFlight = true;
  refreshLog(`[AutoRefresh] ${ts()} — cycle start`);
  try {
    await silentRefresh();
    _wait = BASE;
    refreshLog(`[AutoRefresh] ${ts()} — cycle done ✓ (next in ${_wait / 1000}s)`);
  } catch (e) {
    _wait = Math.min(_wait * 2, MAX);
    console.warn(`[AutoRefresh] ${ts()} — cycle failed, backoff → ${_wait / 1000}s:`, e);
  } finally {
    _inFlight = false;
  }
  schedule();
}

function wireVisibility() {
  if (_wired || typeof document === 'undefined') return;
  _wired = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _enabled && !_inFlight) {
      refreshLog(`[AutoRefresh] ${ts()} — tab visible again, refreshing now`);
      _wait = BASE;
      tick();
    }
  });
}
