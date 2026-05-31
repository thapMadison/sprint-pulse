import { el } from '../dom.js';
import { renderEpicHero } from './epic-hero.js';
import { renderEpicTasksTable } from './epic-tasks-table.js';
import { renderDonut } from '../../charts/donut.js';
import { renderPanelShell } from './panel-shell.js';
import { t } from '../../app/i18n.js';

function donutCard(epic) {
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, [t('panel.statusByCategory')]),
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

  // The hero is a 3-column grid (meta card | stat tiles | …); the epic hero
  // only fills the first two, so drop the donut into the 3rd column — same as
  // the sprint view — instead of leaving it in a half-empty side column.
  const hero = renderEpicHero({ epic, today, jiraUrl });
  hero.appendChild(donutCard(epic));

  return renderPanelShell({
    panelClass: 'epic-detail-panel',
    ariaLabel: t('panel.detailsFor', { name: epic.isNoEpic ? t('roadmap.noEpicName') : epic.name }),
    closeLabel: t('panel.closeDetails'),
    onClose,
    onBack,
    body: el('div', { class: 'epic-detail-body' }, [
      hero,
      renderEpicTasksTable({ epic, jiraUrl, onOpenTask }),
    ]),
  });
}
