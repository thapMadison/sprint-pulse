import { el } from '../dom.js';
import { renderEpicHero } from './epic-hero.js';
import { renderEpicTasksTable } from './epic-tasks-table.js';
import { renderDonut } from '../../charts/donut.js';

function donutCard(epic) {
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, ['Status by Category']),
      el('span', { class: 'accent' }),
    ]),
    renderDonut({
      counts: epic.progress.counts,
      hoursByStatus: epic.progress.hours,
      totalIssues: epic.progress.totalIssues,
    }),
  ]);
}

export function renderEpicDetailPanel({ epic, today, onClose }) {
  if (!epic) return null;

  const backdrop = el('div', {
    class: 'epic-detail-backdrop',
    onClick: onClose,
  });

  const closeBtn = el('button', {
    class: 'epic-detail-close',
    type: 'button',
    'aria-label': 'Close details',
    onClick: onClose,
  }, ['×']);

  const panel = el('aside', {
    class: 'epic-detail-panel',
    role: 'dialog',
    'aria-label': `Details for ${epic.name}`,
  }, [
    closeBtn,
    el('div', { class: 'epic-detail-body' }, [
      renderEpicHero({ epic, today }),
      donutCard(epic),
      renderEpicTasksTable({ epic }),
    ]),
  ]);

  // Stop click on the panel from bubbling to backdrop
  panel.addEventListener('click', (e) => e.stopPropagation());

  // Close on Escape
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', onKey);
  // Detach when panel disappears: best-effort via a one-shot observer
  setTimeout(() => {
    if (!document.body.contains(panel)) {
      document.removeEventListener('keydown', onKey);
    }
  }, 50);

  return el('div', { class: 'epic-detail-overlay' }, [backdrop, panel]);
}
