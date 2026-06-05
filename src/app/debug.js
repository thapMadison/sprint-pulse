// Opt-in verbose tracing for the background auto-refresh poller. Silent by
// default; enable at runtime with
//   localStorage.setItem('sprint_pulse_debug', '1')
// (no reload needed) to diagnose polling / backoff. Guarded so importing in the
// node test env (no localStorage) and private mode are both no-ops.
export function refreshLog(...args) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('sprint_pulse_debug')) {
      console.log(...args);
    }
  } catch { /* no storage — stay silent */ }
}
