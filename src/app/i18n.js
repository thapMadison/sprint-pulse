// Tiny i18n core. Holds the active language, resolves namespaced keys against the
// active locale's string table, interpolates {token} params, and selects plural
// forms. No framework, no build step — just plain ES-module lookups.
//
// Resolve order for a key: active locale → English → the raw key itself. This
// makes partial translations safe: an untranslated string shows in English rather
// than breaking, and an unknown key shows its key (a visible signal to fix it).
//
// Side-effects (persisting the choice, re-rendering) live in actions.js, NOT here.
// This module is pure lookup so it stays trivially testable in Node.

import en from './locales/en.js';
import vi from './locales/vi.js';

// Registry of bundled locales. Add a language by importing its table and adding an
// entry here plus a metadata row in SUPPORTED_LANGS below.
const TABLES = { en, vi };

// The default + ultimate fallback. Its table is assumed to define every key.
export const DEFAULT_LANG = 'en';

// Twemoji (Twitter emoji) flag SVGs — used instead of raw emoji because Windows
// does not render regional-indicator flag glyphs (they fall back to letter pairs).
// Codepoints are the two regional-indicator letters of the country code.
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg';

// Shown in the language picker, in display order. `label` is the autonym (the name
// of the language in that language) so it reads correctly regardless of active UI.
// `flag` is a Twemoji flag-image URL used as a quick visual cue in the picker.
export const SUPPORTED_LANGS = [
  { code: 'en', label: 'English', flag: `${TWEMOJI_BASE}/1f1ec-1f1e7.svg` },
  { code: 'vi', label: 'Tiếng Việt', flag: `${TWEMOJI_BASE}/1f1fb-1f1f3.svg` },
];

export const LANG_STORAGE_KEY = 'sprint_pulse_lang';

let activeLang = DEFAULT_LANG;

export function getActiveLang() {
  return activeLang;
}

// Set the in-memory active language. Returns the resolved language actually set
// (falls back to DEFAULT_LANG for an unknown code). Persistence + re-render are
// the caller's job (actions.setLanguage); this only flips the lookup target.
export function setActiveLang(code) {
  activeLang = TABLES[code] ? code : DEFAULT_LANG;
  return activeLang;
}

export function isSupported(code) {
  return Boolean(TABLES[code]);
}

// Plural category for a count under a given language. English distinguishes
// one/other; languages without plural inflection (e.g. Vietnamese) always use
// 'other'. Extend this map as languages with richer rules are added.
const PLURAL_RULE = {
  en: (n) => (n === 1 ? 'one' : 'other'),
  vi: () => 'other',
};

function pluralCategory(lang, count) {
  return (PLURAL_RULE[lang] || PLURAL_RULE[DEFAULT_LANG])(count);
}

// Look a key up through the resolve chain, honoring plural suffixes when a numeric
// `count` is supplied (key_one / key_other). Returns null if nothing matches so the
// caller can fall back to the raw key.
function lookup(key, params) {
  const hasCount = params && typeof params.count === 'number';
  for (const lang of [activeLang, DEFAULT_LANG]) {
    const table = TABLES[lang];
    if (!table) continue;
    if (hasCount) {
      const cat = pluralCategory(lang, params.count);
      if (table[`${key}_${cat}`] != null) return table[`${key}_${cat}`];
      if (table[`${key}_other`] != null) return table[`${key}_other`];
    }
    if (table[key] != null) return table[key];
  }
  return null;
}

// Replace {token} placeholders with values from params.
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, token) =>
    params[token] != null ? String(params[token]) : m
  );
}

// Translate a namespaced key. `params` supplies interpolation values and, when it
// includes a numeric `count`, drives plural selection.
//   t('topbar.today', { date: '05 May' })
//   t('epicTasks.count', { count: 3 })
export function t(key, params) {
  const raw = lookup(key, params);
  return interpolate(raw != null ? raw : key, params);
}
