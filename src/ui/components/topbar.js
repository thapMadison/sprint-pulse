import { el } from '../dom.js';
import { renderUserMenu } from './user-menu.js';
import { t } from '../../app/i18n.js';

export function renderTopbar({ today, sourceLabel, user, lang, theme, onLogin, onLogout, onLangChange, onThemeToggle }) {
  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-mark' }),
      el('div', {}, [
        el('h1', {}, ['Sprint Pulse']),
        el('p', {}, [t('topbar.tagline')]),
      ]),
    ]),
    el('div', { class: 'topbar-right' }, [
      el('div', { class: 'pill' }, [
        el('span', { class: 'dot' }),
        t('topbar.source', { label: sourceLabel }),
      ]),
      el('div', { class: 'pill' }, [t('topbar.today', { date: today })]),
      // One unified menu folds theme + language + login/logout together.
      renderUserMenu({ user, theme, lang, onLogin, onLogout, onThemeChange: onThemeToggle, onLangChange }),
    ]),
  ]);
}
