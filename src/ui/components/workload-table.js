import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';
import { statusLabel } from '../format.js';

function renderIssueRow(iss) {
  return el('div', { class: 'issue-row' }, [
    el('span', { class: 'key' }, [iss.key]),
    el('span', { class: 'summary' }, [iss.summary]),
    el('span', {}, [
      el('span', { class: `status-chip ${iss.status}` }, [
        el('span', { class: 'sdot' }),
        statusLabel(iss),
      ]),
    ]),
    el('span', { class: 'num-col' }, [`${iss.originalEstimate.toFixed(1)}h`]),
    el('span', { class: 'num-col' }, [`${iss.timeSpent.toFixed(1)}h`]),
    el('span', {
      class: 'num-col',
      style: { color: iss.remainingEstimate > 0 ? 'var(--coral)' : 'var(--ink-3)' },
    }, [`${iss.remainingEstimate.toFixed(1)}h`]),
  ]);
}

function renderIssueListHeader() {
  const hdrStyle = {
    color: 'var(--ink-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };
  return el('div', {
    class: 'issue-row',
    style: { borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '4px' },
  }, [
    el('span', { class: 'key', style: { color: 'var(--ink-3)' } }, ['KEY']),
    el('span', { class: 'summary', style: hdrStyle }, ['Summary']),
    el('span', { style: hdrStyle }, ['Status']),
    el('span', { class: 'num-col', style: hdrStyle }, ['Est.']),
    el('span', { class: 'num-col', style: hdrStyle }, ['Spent']),
    el('span', { class: 'num-col', style: hdrStyle }, ['Remain']),
  ]);
}

function groupByUser(issues) {
  const byUser = new Map();
  for (const iss of issues) {
    const u = iss.assignee;
    if (!byUser.has(u.id)) {
      byUser.set(u.id, {
        user: u, issues: [],
        est: 0, spent: 0, rem: 0,
        counts: { todo: 0, inprogress: 0, done: 0 },
      });
    }
    const row = byUser.get(u.id);
    row.issues.push(iss);
    row.est += iss.originalEstimate;
    row.spent += iss.timeSpent;
    row.rem += iss.remainingEstimate;
    row.counts[iss.status]++;
  }
  return Array.from(byUser.values()).sort((a, b) => b.est - a.est);
}

function chevronCell() {
  const span = el('span', { class: 'expand-icon' }, []);
  span.appendChild(svg('svg', {
    width: 12, height: 12, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5,
  }, [svg('polyline', { points: '9 6 15 12 9 18' })]));
  return el('td', {}, [span]);
}

function numCell(value, accent) {
  return el('td', {
    style: {
      textAlign: 'right',
      fontFamily: 'var(--font-mono)',
      ...(accent ? { color: accent } : {}),
    },
  }, [value]);
}

export function renderWorkloadTable({ sprint }) {
  const rows = groupByUser(sprint.issues);
  let expandedUserId = null;
  const tbody = el('tbody', {}, []);

  function renderBody() {
    tbody.innerHTML = '';
    for (const row of rows) {
      const totalCt = row.issues.length || 1;
      const segDone = (row.counts.done / totalCt) * 100;
      const segInProg = (row.counts.inprogress / totalCt) * 100;
      const segTodo = (row.counts.todo / totalCt) * 100;
      const isOpen = expandedUserId === row.user.id;

      const tr = el('tr', {
        class: isOpen ? 'expanded' : '',
        onClick: () => {
          expandedUserId = isOpen ? null : row.user.id;
          renderBody();
        },
      }, [
        el('td', {}, [
          el('div', { class: 'user-cell' }, [
            el('div', {
              class: 'avatar',
              style: { background: row.user.color, color: 'oklch(0.2 0.02 270)' },
            }, [row.user.initials]),
            el('div', {}, [
              el('div', { class: 'name' }, [row.user.name]),
              el('div', { class: 'sub' }, [`${totalCt} issue${totalCt !== 1 ? 's' : ''}`]),
            ]),
          ]),
        ]),
        el('td', {}, [
          el('div', { class: 'hbar-row' }, [
            el('div', { class: 'hbar' }, [
              el('span', { class: 'seg-done', style: { width: `${segDone}%` } }),
              el('span', { class: 'seg-inprog', style: { width: `${segInProg}%` } }),
              el('span', { class: 'seg-todo', style: { width: `${segTodo}%` } }),
            ]),
            el('span', { class: 'num', style: { fontSize: '11px' } }, [
              el('span', { style: { color: 'var(--lime)' } }, [String(row.counts.done)]),
              ' / ',
              el('span', { style: { color: 'var(--amber)' } }, [String(row.counts.inprogress)]),
              ' / ',
              el('span', { style: { color: 'var(--ink-3)' } }, [String(row.counts.todo)]),
            ]),
          ]),
        ]),
        numCell(`${row.est.toFixed(1)}h`),
        numCell(`${row.spent.toFixed(1)}h`),
        numCell(`${row.rem.toFixed(1)}h`, row.rem > 0 ? 'var(--coral)' : 'var(--ink-3)'),
        chevronCell(),
      ]);
      tbody.appendChild(tr);

      if (isOpen) {
        tbody.appendChild(el('tr', { class: 'expand-detail' }, [
          el('td', { colSpan: 6 }, [
            el('div', { class: 'issue-list' }, [
              renderIssueListHeader(),
              ...row.issues.map(renderIssueRow),
            ]),
          ]),
        ]));
      }
    }
  }
  renderBody();

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, ['User Workload Report']),
      el('span', {
        style: {
          font: '400 11px var(--font-mono)',
          color: 'var(--ink-3)',
          letterSpacing: '0.05em',
          textTransform: 'none',
        },
      }, [`${rows.length} contributors · click row to expand`]),
    ]),
    el('table', { class: 'workload-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { style: { width: '240px' } }, ['Assignee']),
          el('th', {}, ['Status distribution']),
          el('th', { style: { textAlign: 'right' } }, ['Estimate']),
          el('th', { style: { textAlign: 'right' } }, ['Spent']),
          el('th', { style: { textAlign: 'right' } }, ['Remaining']),
          el('th', { style: { width: '24px' } }, []),
        ]),
      ]),
      tbody,
    ]),
  ]);
}
