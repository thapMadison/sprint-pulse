import { el } from '../dom.js';
import { initials as initialsOf } from '../format.js';
import { t } from '../../app/i18n.js';

// Avatar + name chip used in tables and the task detail panel. The dark text
// colour gives the coloured avatar background enough contrast; it lives here
// (and in CSS via .avatar-mini) instead of being re-typed at every call site.
//
// Pass a `user` with { name, color, initials? }. When `initials` is absent it's
// derived from the name. `size: 'mini'` (default) renders the compact variant.
export function renderUserCell(user, { cellClass = 'user-cell-mini', avatarClass = 'avatar-mini' } = {}) {
  const name = user?.name || t('common.unknown');
  const text = user?.initials || initialsOf(user?.name);
  return el('div', { class: cellClass }, [
    el('div', { class: avatarClass, style: { background: user?.color || 'var(--ink-3)' } }, [text]),
    el('span', {}, [name]),
  ]);
}
