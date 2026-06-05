import { el } from '../dom.js';
import { statusLabel, shortSprintName, fmtDateShort, jiraLink } from '../format.js';
import { issueTypeIcon } from './issue-type-icon.js';
import { renderUserCell } from './user-cell.js';
import { STATUS_ORDER } from '../../app/constants.js';
import { t } from '../../app/i18n.js';
import { getState } from '../../app/state.js';
import { effectiveColorMap } from '../../domain/status-colors.js';

export function renderEpicTasksTable({ epic, jiraUrl, onOpenTask }) {
  if (!epic || !epic.tasks.length) {
    return el('div', { class: 'card' }, [
      el('h3', { class: 'card-title' }, [el('span', {}, [t('epicTasks.titleShort')])]),
      el('p', { style: { color: 'var(--ink-3)', padding: '12px 0' } }, [t('epicTasks.empty')]),
    ]);
  }

  // Sort: in-progress → todo → done; within each, by sprint then key
  const tasks = [...epic.tasks].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 3;
    const sb = STATUS_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    if (a.sprintName !== b.sprintName) return (a.sprintName || '').localeCompare(b.sprintName || '');
    return a.key.localeCompare(b.key);
  });

  const colorMap = effectiveColorMap(getState().statusColorMap, epic.tasks);
  const rows = tasks.map((task) => {
    const assignee = task.assignee || { color: 'var(--ink-3)', initials: '?', name: t('task.unassigned') };
    const keyNode = jiraUrl
      ? jiraLink({ jiraUrl, key: task.key, class: 'mono-key jira-key-link', stopClick: true })
      : el('span', { class: 'mono-key' }, [task.key]);
    const trAttrs = onOpenTask ? { class: 'epic-task-clickable', onClick: () => onOpenTask(task) } : {};
    const chipColor = colorMap[task.statusName] || null;
    const chipStyle = chipColor ? {
      background: `color-mix(in oklch, ${chipColor} 18%, transparent)`,
      color: chipColor,
    } : {};
    const sdotStyle = chipColor ? { background: chipColor } : {};
    return el('tr', trAttrs, [
    el('td', {}, [el('span', { class: 'issue-key-cell' }, [
      issueTypeIcon(task.type, { size: 16 }),
      keyNode,
    ])]),
    el('td', { class: 'epic-task-summary' }, [task.summary]),
    el('td', {}, [el('span', { class: 'sprint-chip' }, [
      shortSprintName(task.sprintName) || '—',
    ])]),
    el('td', {}, [renderUserCell(assignee)]),
    el('td', {}, [
      el('span', { class: `status-chip ${task.status}`, style: chipStyle }, [
        el('span', { class: 'sdot', style: sdotStyle }),
        statusLabel(task),
      ]),
    ]),
    el('td', { class: 'mono-cell' }, [fmtDateShort(task.startedDate)]),
    el('td', { class: 'mono-cell' }, [fmtDateShort(task.doneDate)]),
    ]);
  });

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, [t('epicTasks.title')]),
      el('span', { class: 'card-subtitle' }, [t('epicTasks.count', { count: tasks.length })]),
    ]),
    el('table', { class: 'workload-table epic-tasks-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { style: { width: '90px' } }, [t('epicTasks.colKey')]),
          el('th', {}, [t('epicTasks.colSummary')]),
          el('th', { style: { width: '120px' } }, [t('epicTasks.colSprint')]),
          el('th', { style: { width: '180px' } }, [t('epicTasks.colAssignee')]),
          el('th', { style: { width: '100px' } }, [t('epicTasks.colStatus')]),
          el('th', { style: { width: '70px' } }, [t('epicTasks.colStarted')]),
          el('th', { style: { width: '70px' } }, [t('epicTasks.colDone')]),
        ]),
      ]),
      el('tbody', {}, rows),
    ]),
  ]);
}
