import { el } from '../dom.js';
import { t } from '../../app/i18n.js';

export function renderUserMenu(user, onLogout) {
  const initial = user.displayName?.charAt(0) || user.email?.charAt(0) || '?';
  const name = user.displayName || t('userMenu.defaultName');
  const email = user.email || '';

  const chevron = el('span', { class: 'user-chevron' }, ['▾']);
  const trigger = el('button', { class: 'pill user-pill', type: 'button' }, [
    el('span', { class: 'user-avatar' }, [initial]),
    el('span', { class: 'user-name' }, [name]),
    chevron,
  ]);

  const dropdown = el('div', { class: 'user-dropdown' }, [
    el('div', { class: 'user-dropdown-header' }, [
      el('div', { class: 'user-avatar lg' }, [initial]),
      el('div', { class: 'user-meta' }, [
        el('div', { class: 'user-meta-name' }, [name]),
        email ? el('div', { class: 'user-meta-email' }, [email]) : null,
      ].filter(Boolean)),
    ]),
    el('div', { class: 'user-dropdown-divider' }, []),
    el('button', { class: 'user-dropdown-item logout', type: 'button', onClick: onLogout }, [
      el('span', { class: 'logout-icon' }, ['⎋']),
      t('userMenu.logout'),
    ]),
  ]);

  const wrap = el('div', { class: 'user-menu' }, [trigger, dropdown]);

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
