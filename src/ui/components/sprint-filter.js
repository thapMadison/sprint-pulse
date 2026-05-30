import { el } from '../dom.js';
import { shortSprintName } from '../format.js';

const STATE_ORDER = { active: 0, future: 1, closed: 2 };

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

    for (const sp of sorted) {
      const shortName = shortSprintName(sp.name);
      const btn = el('button', {
        class: `sprint-tab ${activeId === sp.id ? 'active' : ''}`,
        onClick: () => onChange(sp.id),
      }, [
        el('span', { class: `state-dot ${sp.state || 'closed'}` }),
        shortName,
      ]);
      sprintList.appendChild(btn);
    }
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
        state.charAt(0).toUpperCase() + state.slice(1),
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
        el('div', { class: 'filter-label' }, ['Filter']),
        el('div', { class: 'filter-title' }, ['Choose a sprint']),
      ]),
      stateButtons,
    ]),
    el('div', { class: 'sprint-picker-wrapper' }, [
      scrollLeft, sprintList, scrollRight,
    ]),
  ]);
}
