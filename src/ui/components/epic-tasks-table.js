import { el } from '../dom.js';
import { statusLabel, shortSprintName, fmtDateShort } from '../format.js';
import { issueTypeIcon } from './issue-type-icon.js';
import { renderUserCell } from './user-cell.js';
import { STATUS_ORDER } from '../../app/constants.js';

export function renderEpicTasksTable({ epic, jiraUrl, onOpenTask }) {
  if (!epic || !epic.tasks.length) {
    return el('div', { class: 'card' }, [
      el('h3', { class: 'card-title' }, [el('span', {}, ['Tasks'])]),
      el('p', { style: { color: 'var(--ink-3)', padding: '12px 0' } }, ['No tasks under this epic.']),
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

  const rows = tasks.map((t) => {
    const assignee = t.assignee || { color: 'var(--ink-3)', initials: '?', name: 'Unassigned' };
    const keyNode = jiraUrl
      ? el('a', { href: `${jiraUrl}/browse/${t.key}`, target: '_blank', rel: 'noopener noreferrer', class: 'mono-key jira-key-link', onClick: (e) => e.stopPropagation() }, [t.key])
      : el('span', { class: 'mono-key' }, [t.key]);
    const trAttrs = onOpenTask ? { class: 'epic-task-clickable', onClick: () => onOpenTask(t) } : {};
    return el('tr', trAttrs, [
    el('td', {}, [el('span', { class: 'issue-key-cell' }, [
      issueTypeIcon(t.type, { size: 16 }),
      keyNode,
    ])]),
    el('td', { class: 'epic-task-summary' }, [t.summary]),
    el('td', {}, [el('span', { class: 'sprint-chip' }, [
      shortSprintName(t.sprintName) || '—',
    ])]),
    el('td', {}, [renderUserCell(assignee)]),
    el('td', {}, [
      el('span', { class: `status-chip ${t.status}` }, [
        el('span', { class: 'sdot' }),
        statusLabel(t),
      ]),
    ]),
    el('td', { class: 'mono-cell' }, [fmtDateShort(t.startedDate)]),
    el('td', { class: 'mono-cell' }, [fmtDateShort(t.doneDate)]),
    ]);
  });

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, ['Tasks in this Epic']),
      el('span', { class: 'card-subtitle' }, [`${tasks.length} task${tasks.length !== 1 ? 's' : ''}`]),
    ]),
    el('table', { class: 'workload-table epic-tasks-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { style: { width: '90px' } }, ['Key']),
          el('th', {}, ['Summary']),
          el('th', { style: { width: '120px' } }, ['Sprint']),
          el('th', { style: { width: '180px' } }, ['Assignee']),
          el('th', { style: { width: '100px' } }, ['Status']),
          el('th', { style: { width: '70px' } }, ['Started']),
          el('th', { style: { width: '70px' } }, ['Done']),
        ]),
      ]),
      el('tbody', {}, rows),
    ]),
  ]);
}
