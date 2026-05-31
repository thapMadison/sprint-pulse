import { el } from '../dom.js';
import { shortSprintName } from '../format.js';
import { t } from '../../app/i18n.js';

const STATE_ORDER = { active: 0, future: 1, closed: 2 };
const STATE_LABEL_KEY = { all: 'sprintFilter.all', active: 'sprintFilter.active', future: 'sprintFilter.future', closed: 'sprintFilter.closed' };

// Scroll the horizontal sprint list so the given tab sits in the centre.
function centerTab(sprintList, btn) {
  if (!btn) return;
  requestAnimationFrame(() => {
    sprintList.scrollLeft = btn.offsetLeft - sprintList.clientWidth / 2 + btn.offsetWidth / 2;
  });
}

export function renderSprintFilter({ sprints, activeId, onChange }) {
  const groups = {
    active: sprints.filter((s) => s.state === 'active'),
    future: sprints.filter((s) => s.state === 'future'),
    closed: sprints.filter((s) => s.state === 'closed'),
  };

  let stateFilter = 'all';
  const stateButtons = el('div', { class: 'state-filter' }, []);
  const sprintList = el('div', { class: 'sprint-list' }, []);

  function renderSprintList(filter) {
    sprintList.innerHTML = '';
    const filtered = filter === 'all' ? sprints : groups[filter] || [];

    const sorted = [...filtered].sort((a, b) => {
      const sa = STATE_ORDER[a.state] ?? 2;
      const sb = STATE_ORDER[b.state] ?? 2;
      if (sa !== sb) return sa - sb;
      return (b.startDate || '').localeCompare(a.startDate || '');
    });

    let activeBtn = null;
    for (const sp of sorted) {
      const shortName = shortSprintName(sp.name);
      const btn = el('button', {
        class: `sprint-tab ${activeId === sp.id ? 'active' : ''}`,
        'data-sprint-id': sp.id,
        onClick: () => onChange(sp.id),
      }, [
        el('span', { class: `state-dot ${sp.state || 'closed'}` }),
        shortName,
      ]);
      if (activeId === sp.id) activeBtn = btn;
      sprintList.appendChild(btn);
    }

    centerTab(sprintList, activeBtn);
  }

  function renderStateButtons() {
    stateButtons.innerHTML = '';
    const counts = {
      all: sprints.length,
      active: groups.active.length,
      future: groups.future.length,
      closed: groups.closed.length,
    };
    for (const state of ['all', 'active', 'future', 'closed']) {
      if (state !== 'all' && counts[state] === 0) continue;
      const isSelected = stateFilter === state;
      const btn = el('button', {
        class: `state-btn state-${state} ${isSelected ? 'selected' : ''}`,
        onClick: () => {
          stateFilter = state;
          renderStateButtons();
          renderSprintList(state);
        },
      }, [
        t(STATE_LABEL_KEY[state]),
        el('span', { class: 'count' }, [String(counts[state])]),
      ]);
      stateButtons.appendChild(btn);
    }
  }

  renderStateButtons();
  renderSprintList('all');

  const scrollLeft = el('button', {
    class: 'scroll-btn left',
    onClick: () => sprintList.scrollBy({ left: -200, behavior: 'smooth' }),
  }, ['‹']);
  const scrollRight = el('button', {
    class: 'scroll-btn right',
    onClick: () => sprintList.scrollBy({ left: 200, behavior: 'smooth' }),
  }, ['›']);

  return el('div', { class: 'sprint-filter-container' }, [
    el('div', { class: 'filter-header' }, [
      el('div', {}, [
        el('div', { class: 'filter-label' }, [t('sprintFilter.label')]),
        el('div', { class: 'filter-title' }, [t('sprintFilter.title')]),
      ]),
      stateButtons,
    ]),
    el('div', { class: 'sprint-picker-wrapper' }, [
      scrollLeft, sprintList, scrollRight,
    ]),
  ]);
}

// Move the active-tab highlight in place, without rebuilding the filter — so the
// state-filter pill selection and the horizontal scroll position are preserved.
// Re-centres the newly active tab. Safe no-op when the filter isn't mounted.
export function updateSprintFilterActive(activeId) {
  const sprintList = document.querySelector('.sprint-filter-container .sprint-list');
  if (!sprintList) return;
  const prev = sprintList.querySelector('.sprint-tab.active');
  if (prev) prev.classList.remove('active');
  const next = sprintList.querySelector(`.sprint-tab[data-sprint-id="${activeId}"]`);
  if (next) {
    next.classList.add('active');
    centerTab(sprintList, next);
  }
}
