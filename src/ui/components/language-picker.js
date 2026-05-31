import { el } from '../dom.js';
import { SUPPORTED_LANGS, t } from '../../app/i18n.js';

// Topbar language picker — a small pill dropdown mirroring the user-menu pattern
// (click to toggle, click-outside to close). Lists SUPPORTED_LANGS by autonym and
// calls onChange(code) with the chosen language; the active one is marked.
export function renderLanguagePicker({ active, onChange }) {
  const current = SUPPORTED_LANGS.find((l) => l.code === active) || SUPPORTED_LANGS[0];

  // A Twemoji flag image. `alt` is empty since the adjacent label already names
  // the language (the flag is purely decorative for assistive tech).
  const flagImg = (l) =>
    el('img', { class: 'lang-flag', src: l.flag, alt: '', loading: 'lazy', width: '20', height: '15' });

  const trigger = el('button', {
    class: 'pill lang-pill',
    type: 'button',
    'aria-label': t('lang.label'),
  }, [
    flagImg(current),
    el('span', { class: 'lang-current' }, [current.label]),
    el('span', { class: 'user-chevron' }, ['▾']),
  ]);

  const dropdown = el('div', { class: 'lang-dropdown' },
    SUPPORTED_LANGS.map((l) =>
      el('button', {
        class: `lang-option ${l.code === active ? 'active' : ''}`,
        type: 'button',
        'data-code': l.code,
        onClick: () => onChange(l.code),
      }, [
        flagImg(l),
        el('span', { class: 'lang-option-label' }, [l.label]),
        el('span', { class: 'lang-check' }, ['✓']),
      ])
    )
  );

  const wrap = el('div', { class: 'lang-menu' }, [trigger, dropdown]);

  let open = false;
  const setOpen = (v) => {
    open = v;
    wrap.classList.toggle('open', open);
  };
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });
  dropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    if (open) setOpen(false);
  });

  return wrap;
}
