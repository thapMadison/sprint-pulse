// Tiny theme core. Holds the active colour theme and applies it as a class on the
// <html> element. The dark palette lives in :root (assets/styles.css); the light
// palette is a thin override gated by `html.theme-light` (assets/extras.css). So a
// theme is just "is the theme-light class present or not" — light adds it, dark
// removes it (dark = bare :root).
//
// Side-effects that belong to a user action (persisting, re-rendering) live in
// actions.js, mirroring i18n.js. This module stays a pure-ish helper: in-memory
// state plus a single DOM write in applyTheme, so it's easy to reason about and the
// boot script in index.html can inline the same logic to avoid a flash of light.

export const SUPPORTED_THEMES = ['light', 'dark'];

export const DEFAULT_THEME = 'light';

export const THEME_STORAGE_KEY = 'sprint_pulse_theme';

let activeTheme = DEFAULT_THEME;

export function isSupportedTheme(theme) {
  return SUPPORTED_THEMES.includes(theme);
}

export function getActiveTheme() {
  return activeTheme;
}

// Set the in-memory active theme. Returns the resolved theme actually set (falls
// back to DEFAULT_THEME for an unknown value). Persistence + re-render are the
// caller's job (actions.setTheme); this only records the choice.
export function setActiveTheme(theme) {
  activeTheme = isSupportedTheme(theme) ? theme : DEFAULT_THEME;
  return activeTheme;
}

// Resolve the theme to start with: a previously saved choice wins; otherwise honour
// the OS via prefers-color-scheme; otherwise fall back to light. Every browser API
// is guarded so this is safe in Node (tests) and private mode.
export function resolveInitialTheme() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (isSupportedTheme(saved)) return saved;
    }
  } catch { /* storage may be unavailable (private mode) — fall through */ }

  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return DEFAULT_THEME;
}

// Reflect a theme onto <html>: light gets the `theme-light` override class, dark is
// the bare :root default (class removed). No-op outside the DOM (Node tests).
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('theme-light', theme !== 'dark');
}
