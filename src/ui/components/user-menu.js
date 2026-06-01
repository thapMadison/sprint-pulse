import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';
import { SUPPORTED_LANGS, t } from '../../app/i18n.js';

// Unified account menu: always-visible topbar pill containing theme switch,
// language picker, and login/logout — collapses three former controls into one.

// Person glyph for the logged-out trigger avatar.
const personIcon = () =>
  svg('svg', {
    viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'white',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  }, [
    svg('path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }),
    svg('circle', { cx: '12', cy: '7', r: '4' }),
  ]);

// Day/night toggle switch ported from theme-switch-export.
// Structure: track > stars + night clouds + day clouds + knob (sun/moon).
// The button flips its OWN is-dark/is-light class on click so the knob slides and
// the sky crossfades instantly — setTheme only toggles the <html> theme class and
// persists, it does NOT re-render (theme is pure CSS), so the switch must reflect
// its new state itself rather than waiting for a rebuild.
function buildThemeSwitch(activeTheme, onThemeChange) {
  let isDark = activeTheme === 'dark';

  const nightClouds = svg('svg', { viewBox: '0 0 72 34', preserveAspectRatio: 'xMidYMax slice' }, [
    svg('g', { fill: 'oklch(0.62 0.08 295)', opacity: '0.45' }, [
      svg('ellipse', { cx: '50', cy: '33', rx: '15', ry: '8' }),
    ]),
    svg('g', { fill: 'oklch(0.72 0.07 295)', opacity: '0.5' }, [
      svg('ellipse', { cx: '56', cy: '29', rx: '13', ry: '8' }),
      svg('ellipse', { cx: '44', cy: '31', rx: '11', ry: '7' }),
      svg('ellipse', { cx: '67', cy: '30', rx: '9',  ry: '6' }),
    ]),
  ]);

  const dayClouds = svg('svg', { viewBox: '0 0 72 34', preserveAspectRatio: 'xMidYMax slice' }, [
    svg('g', { fill: 'oklch(0.99 0.01 230)', opacity: '0.55' }, [
      svg('ellipse', { cx: '8',  cy: '29', rx: '9',  ry: '6' }),
      svg('ellipse', { cx: '58', cy: '30', rx: '11', ry: '7' }),
    ]),
    svg('g', { fill: 'oklch(1 0 0)', opacity: '0.92' }, [
      svg('ellipse', { cx: '16', cy: '33', rx: '13', ry: '9' }),
      svg('ellipse', { cx: '31', cy: '34', rx: '14', ry: '9' }),
      svg('ellipse', { cx: '46', cy: '34', rx: '13', ry: '8' }),
    ]),
  ]);

  const knobSun = el('span', { class: 'theme-switch-knob-sun', 'aria-hidden': 'true' }, [
    svg('svg', {
      viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round',
    }, [
      svg('circle', { cx: '12', cy: '12', r: '4.5' }),
      svg('path', { d: 'M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' }),
    ]),
  ]);

  const knobMoon = el('span', { class: 'theme-switch-knob-moon', 'aria-hidden': 'true' }, [
    svg('svg', { viewBox: '0 0 24 24', width: '13', height: '13', fill: 'currentColor' }, [
      svg('path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }),
    ]),
  ]);

  const btn = el('button', {
    class: `theme-switch ${isDark ? 'is-dark' : 'is-light'}`,
    type: 'button',
    role: 'switch',
    'aria-checked': String(isDark),
    'aria-label': isDark ? t('theme.light') : t('theme.dark'),
    onClick: () => {
      isDark = !isDark;
      // Reflect the new state on the switch itself (no re-render happens — theme
      // is pure CSS), then let setTheme flip the <html> class + persist.
      btn.classList.toggle('is-dark', isDark);
      btn.classList.toggle('is-light', !isDark);
      btn.setAttribute('aria-checked', String(isDark));
      btn.setAttribute('aria-label', isDark ? t('theme.light') : t('theme.dark'));
      onThemeChange?.(isDark ? 'dark' : 'light');
    },
  }, [
    el('span', { class: 'theme-switch-track' }, [
      el('span', { class: 'theme-switch-stars', 'aria-hidden': 'true' }, [
        el('i', {}), el('i', {}), el('i', {}), el('i', {}),
      ]),
      el('span', { class: 'theme-switch-clouds night', 'aria-hidden': 'true' }, [nightClouds]),
      el('span', { class: 'theme-switch-clouds day',   'aria-hidden': 'true' }, [dayClouds]),
      // el('span', { class: 'tsw-lbl tsw-lbl-light', 'aria-hidden': 'true' }, [t('theme.light')]),
      // el('span', { class: 'tsw-lbl tsw-lbl-dark',  'aria-hidden': 'true' }, [t('theme.dark')]),
      el('span', { class: 'theme-switch-knob' }, [knobSun, knobMoon]),
    ]),
  ]);

  return btn;
}

export function renderUserMenu({ user, theme, lang, onLogin, onLogout, onThemeChange, onLangChange }) {
  const loggedIn = Boolean(user);
  const initial  = loggedIn ? (user.displayName?.charAt(0) || user.email?.charAt(0) || '?') : null;
  const name     = loggedIn ? (user.displayName || t('userMenu.defaultName')) : null;
  const email    = loggedIn ? (user.email || '') : '';

  // ── Topbar trigger pill ────────────────────────────────────────────────────
  const trigger = el('button', {
    class: 'pill user-pill', type: 'button', 'aria-label': t('menu.label'),
  }, [
    loggedIn
      ? el('span', { class: 'user-avatar' }, [initial])
      : el('span', { class: 'user-avatar guest' }, [personIcon()]),
    loggedIn ? el('span', { class: 'user-name' }, [name]) : null,
    el('span', { class: 'user-chevron' }, ['▾']),
  ].filter(Boolean));

  // ── Theme section — animated day/night toggle switch ──────────────────────
  const activeTheme = theme === 'dark' ? 'dark' : 'light';
  const themeSwitch = buildThemeSwitch(activeTheme, onThemeChange);
  const themeSection = el('div', { class: 'menu-section' }, [
    el('div', { class: 'menu-section-label' }, [t('theme.label')]),
    themeSwitch,
  ]);

  // ── Language section + overlay ─────────────────────────────────────────────
  const flagImg = (l) =>
    el('img', { class: 'lang-flag', src: l.flag, alt: '', loading: 'lazy', width: '20', height: '15' });
  const activeLang = SUPPORTED_LANGS.find((l) => l.code === lang) || SUPPORTED_LANGS[0];

  const langTrigger = el('button', { class: 'lang-trigger', type: 'button' }, [
    flagImg(activeLang),
    el('span', { class: 'lang-trigger-label' }, [activeLang.label]),
    el('span', { class: 'lang-trigger-chevron' }, ['▾']),
  ]);

  const langBack = el('button', { class: 'lang-back', type: 'button' }, [
    el('span', { class: 'lang-back-arrow' }, ['‹']),
    el('span', {}, [t('lang.label')]),
  ]);

  const langOverlay = el('div', { class: 'lang-overlay' }, [
    el('div', { class: 'lang-overlay-header' }, [langBack]),
    el('div', { class: 'lang-overlay-list' },
      SUPPORTED_LANGS.map((l) =>
        el('button', {
          class: `lang-list-item ${l.code === lang ? 'active' : ''}`,
          type: 'button',
          onClick: () => { onLangChange?.(l.code); setLangOpen(false); },
        }, [
          flagImg(l),
          el('span', { class: 'lang-option-label' }, [l.label]),
          el('span', { class: 'lang-check' }, ['✓']),
        ])
      )
    ),
  ]);

  const langSection = el('div', { class: 'menu-section' }, [
    el('div', { class: 'menu-section-label' }, [t('lang.label')]),
    langTrigger,
  ]);

  // ── Auth action ────────────────────────────────────────────────────────────
  const authItem = loggedIn
    ? el('button', { class: 'user-dropdown-item logout', type: 'button', onClick: onLogout }, [
        el('span', { class: 'logout-icon' }, ['⎋']),
        t('userMenu.logout'),
      ])
    : el('button', { class: 'user-dropdown-item login', type: 'button', onClick: onLogin }, [
        el('span', { class: 'ms-icon' }, []),
        t('topbar.login'),
      ]);

  // ── Dropdown ───────────────────────────────────────────────────────────────
  const dropdown = el('div', { class: 'user-dropdown' }, [
    loggedIn
      ? el('div', { class: 'user-dropdown-header' }, [
          el('div', { class: 'user-avatar lg' }, [initial]),
          el('div', { class: 'user-meta' }, [
            el('div', { class: 'user-meta-name' }, [name]),
            email ? el('div', { class: 'user-meta-email' }, [email]) : null,
          ].filter(Boolean)),
        ])
      : null,
    authItem,
    el('div', { class: 'user-dropdown-divider' }, []),
    themeSection,
    langSection,
    langOverlay,
  ].filter(Boolean));

  // ── Main open/close ────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'user-menu' }, [trigger, dropdown]);

  let open = false;
  const setOpen = (v) => {
    open = v;
    wrap.classList.toggle('open', v);
    if (!v) setLangOpen(false);
  };
  trigger.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  dropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { if (open) setOpen(false); });

  // ── Language overlay open/close ────────────────────────────────────────────
  let langOpen = false;
  const setLangOpen = (v) => {
    langOpen = v;
    dropdown.classList.toggle('lang-open', v);
  };
  langTrigger.addEventListener('click', (e) => { e.stopPropagation(); setLangOpen(!langOpen); });
  langBack.addEventListener('click',    (e) => { e.stopPropagation(); setLangOpen(false); });
  langOverlay.addEventListener('click', (e) => e.stopPropagation());

  return wrap;
}
