import { el } from '../dom.js';
import { renderUserMenu } from './user-menu.js';

export function renderTopbar({ today, sourceLabel, user, onLogin, onLogout }) {
  const authSection = user
    ? renderUserMenu(user, onLogout)
    : el('button', { class: 'pill auth-btn login', onClick: onLogin }, [
        el('span', { class: 'ms-icon' }, []),
        'Login with Microsoft',
      ]);

  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark' }),
      el('div', {}, [
        el('h1', {}, ['Sprint Pulse']),
        el('p', {}, ['Jira Analytics · v0.4']),
      ]),
    ]),
    el('div', { class: 'topbar-right' }, [
      el('div', { class: 'pill' }, [
        el('span', { class: 'dot' }),
        `Source · ${sourceLabel}`,
      ]),
      el('div', { class: 'pill' }, [`Today ${today}`]),
      authSection,
    ]),
  ]);
}
