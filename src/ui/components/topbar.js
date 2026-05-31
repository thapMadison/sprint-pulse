import { el } from '../dom.js';
import { renderUserMenu } from './user-menu.js';
import { renderLanguagePicker } from './language-picker.js';
import { t } from '../../app/i18n.js';

export function renderTopbar({ today, sourceLabel, user, lang, onLogin, onLogout, onLangChange }) {
  const authSection = user
    ? renderUserMenu(user, onLogout)
    : el('button', { class: 'pill auth-btn login', onClick: onLogin }, [
        el('span', { class: 'ms-icon' }, []),
        t('topbar.login'),
      ]);

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
      renderLanguagePicker({ active: lang, onChange: onLangChange }),
      authSection,
    ]),
  ]);
}
