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

export function renderEpicDetailPanel({ epic, today, onClose, jiraUrl, onOpenTask, onBack }) {
  if (!epic) return null;

  const backdrop = el('div', {
    class: 'epic-detail-backdrop',
    onClick: onClose,
  });

  const backBtn = onBack ? el('button', {
    class: 'panel-back-btn',
    type: 'button',
    'aria-label': 'Go back',
    onClick: onBack,
  }, ['←']) : null;

  const closeBtn = el('button', {
    class: 'epic-detail-close',
    type: 'button',
    'aria-label': 'Close details',
    onClick: onClose,
  }, ['×']);

  // The hero is a 3-column grid (meta card | stat tiles | …); the epic hero
  // only fills the first two, so drop the donut into the 3rd column — same as
  // the sprint view — instead of leaving it in a half-empty side column.
  const hero = renderEpicHero({ epic, today, jiraUrl });
  hero.appendChild(donutCard(epic));

  const panel = el('aside', {
    class: 'epic-detail-panel',
    role: 'dialog',
    'aria-label': `Details for ${epic.name}`,
  }, [
    backBtn, closeBtn,
    el('div', { class: 'epic-detail-body' }, [
      hero,
      renderEpicTasksTable({ epic, jiraUrl, onOpenTask }),
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
