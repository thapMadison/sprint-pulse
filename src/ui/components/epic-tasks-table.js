import { el } from '../dom.js';

const STATUS_LABEL = { inprogress: 'In Prog', todo: 'To Do', done: 'Done' };

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function statusLabel(iss) {
  return iss.statusName || STATUS_LABEL[iss.status] || 'Done';
}

export function renderEpicTasksTable({ epic }) {
  if (!epic || !epic.tasks.length) {
    return el('div', { class: 'card' }, [
      el('h3', { class: 'card-title' }, [el('span', {}, ['Tasks'])]),
      el('p', { style: { color: 'var(--ink-3)', padding: '12px 0' } }, ['No tasks under this epic.']),
    ]);
  }

  // Sort: in-progress → todo → done; within each, by sprint then key
  const STATUS_ORDER = { inprogress: 0, todo: 1, done: 2 };
  const tasks = [...epic.tasks].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 3;
    const sb = STATUS_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    if (a.sprintName !== b.sprintName) return (a.sprintName || '').localeCompare(b.sprintName || '');
    return a.key.localeCompare(b.key);
  });

  const rows = tasks.map((t) => el('tr', {}, [
    el('td', {}, [el('span', { class: 'mono-key' }, [t.key])]),
    el('td', { class: 'epic-task-summary' }, [t.summary]),
    el('td', {}, [el('span', { class: 'sprint-chip' }, [
      (t.sprintName || '').split(' — ')[0] || t.sprintName || '—',
    ])]),
    el('td', {}, [
      el('div', { class: 'user-cell-mini' }, [
        el('div', {
          class: 'avatar-mini',
          style: { background: t.assignee.color, color: 'oklch(0.2 0.02 270)' },
        }, [t.assignee.initials]),
        el('span', {}, [t.assignee.name]),
      ]),
    ]),
    el('td', {}, [
      el('span', { class: `status-chip ${t.status}` }, [
        el('span', { class: 'sdot' }),
        statusLabel(t),
      ]),
    ]),
    el('td', { class: 'mono-cell' }, [fmtDate(t.startedDate)]),
    el('td', { class: 'mono-cell' }, [fmtDate(t.doneDate)]),
  ]));

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, ['Tasks in this Epic']),
      el('span', {
        style: {
          font: '400 11px var(--font-mono)', color: 'var(--ink-3)',
          letterSpacing: '0.05em', textTransform: 'none',
        },
      }, [`${tasks.length} task${tasks.length !== 1 ? 's' : ''}`]),
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
