import { el } from '../dom.js';
import { shortSprintName } from '../format.js';
import { t } from '../../app/i18n.js';

const STATUS_OPTIONS = [
  { value: 'all',        labelKey: 'epicFilter.all' },
  { value: 'inprogress', labelKey: 'epicFilter.inprogress' },
  { value: 'todo',       labelKey: 'epicFilter.todo' },
  { value: 'done',       labelKey: 'epicFilter.done' },
];

function statusButtons(value, onChange) {
  return STATUS_OPTIONS.map((opt) =>
    el('button', {
      class: `roadmap-filter-chip ${value === opt.value ? 'active' : ''}`,
      type: 'button',
      onClick: () => onChange(opt.value),
    }, [t(opt.labelKey)])
  );
}

export function renderEpicFilterBar({
  filters, sprints, totalEpics, visibleEpics,
  onStatusChange, onSprintChange, onSearchInput, onClearAll,
}) {
  const sprintSelect = el('select', {
    class: 'roadmap-filter-select',
    onChange: (e) => onSprintChange(e.target.value),
  }, [
    el('option', { value: 'all' }, [t('epicFilter.allSprints')]),
    ...sprints.map((sp) =>
      el('option', { value: sp.id, ...(filters.sprintId === sp.id ? { selected: 'selected' } : {}) },
        [shortSprintName(sp.name)])
    ),
  ]);
  if (filters.sprintId !== 'all') sprintSelect.value = filters.sprintId;

  const searchInput = el('input', {
    type: 'search',
    class: 'roadmap-filter-search',
    placeholder: t('epicFilter.search'),
    value: filters.search || '',
    onInput: (e) => onSearchInput(e.target.value),
  });
  // Re-renders destroy/recreate this input. If the user has typed text, restore
  // focus + caret position so a debounced re-render doesn't interrupt typing.
  if (filters.search) {
    requestAnimationFrame(() => {
      if (document.contains(searchInput)) {
        searchInput.focus();
        const len = searchInput.value.length;
        try { searchInput.setSelectionRange(len, len); } catch { /* no-op */ }
      }
    });
  }

  const hasFilter =
    filters.status !== 'all' || filters.sprintId !== 'all' || (filters.search || '').trim();

  return el('div', { class: 'card roadmap-filter-bar' }, [
    el('div', { class: 'roadmap-filter-group' }, [
      el('span', { class: 'roadmap-filter-label' }, [t('epicFilter.statusLabel')]),
      el('div', { class: 'roadmap-filter-chips' }, statusButtons(filters.status, onStatusChange)),
    ]),
    el('div', { class: 'roadmap-filter-group' }, [
      el('span', { class: 'roadmap-filter-label' }, [t('epicFilter.sprintLabel')]),
      sprintSelect,
    ]),
    el('div', { class: 'roadmap-filter-group roadmap-filter-search-wrap' }, [
      searchInput,
    ]),
    el('div', { class: 'roadmap-filter-meta' }, [
      el('span', { class: 'roadmap-filter-count' }, [
        t('epicFilter.count', { visible: visibleEpics, total: totalEpics, count: totalEpics }),
      ]),
      hasFilter
        ? el('button', {
            class: 'roadmap-filter-clear', type: 'button', onClick: onClearAll,
          }, [t('epicFilter.clear')])
        : null,
    ]),
  ]);
}
