import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';
import { statusLabel } from '../format.js';
import { issueTypeIcon } from './issue-type-icon.js';
import { t } from '../../app/i18n.js';

function renderIssueRow(iss, onOpen, jiraUrl) {
  const keyNode = jiraUrl
    ? el('a', { href: `${jiraUrl}/browse/${iss.key}`, target: '_blank', rel: 'noopener noreferrer', class: 'jira-key-link', onClick: (e) => e.stopPropagation() }, [iss.key])
    : el('span', {}, [iss.key]);
  return el('div', { class: 'issue-row issue-row-clickable', onClick: () => onOpen(iss) }, [
    el('span', { class: 'key issue-key-cell' }, [
      issueTypeIcon(iss.type, { size: 16 }),
      keyNode,
    ]),
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
    el('span', { class: 'key', style: { color: 'var(--ink-3)' } }, [t('workload.colKey')]),
    el('span', { class: 'summary', style: hdrStyle }, [t('workload.colSummary')]),
    el('span', { style: hdrStyle }, [t('workload.colStatus')]),
    el('span', { class: 'num-col', style: hdrStyle }, [t('workload.colEst')]),
    el('span', { class: 'num-col', style: hdrStyle }, [t('workload.colSpent')]),
    el('span', { class: 'num-col', style: hdrStyle }, [t('workload.colRemain')]),
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

// Does an issue match the search query (by key or summary)?
function issueMatches(iss, q) {
  if (!q) return true;
  return `${iss.key} ${iss.summary}`.toLowerCase().includes(q);
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

function searchIcon() {
  return svg('svg', {
    class: 'workload-search-icon',
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    svg('circle', { cx: 11, cy: 11, r: 8 }),
    svg('path', { d: 'm21 21-4.3-4.3' }),
  ]);
}

export function renderWorkloadTable({ sprint, jiraUrl, onOpenTask }) {
  const allRows = groupByUser(sprint.issues);
  let expandedUserId = null;
  let query = '';

  const tbody = el('tbody', {}, []);

  function renderBody() {
    tbody.innerHTML = '';

    // When searching, only show users with ≥1 matching task, auto-expand them,
    // and list only the matching tasks inside.
    const searching = query.length > 0;

    for (const row of allRows) {
      const matchingIssues = searching ? row.issues.filter((i) => issueMatches(i, query)) : row.issues;
      if (searching && matchingIssues.length === 0) continue;

      const totalCt = row.issues.length || 1;
      const segDone = (row.counts.done / totalCt) * 100;
      const segInProg = (row.counts.inprogress / totalCt) * 100;
      const segTodo = (row.counts.todo / totalCt) * 100;
      // While searching, every shown user is auto-expanded; otherwise honour the click state.
      const isOpen = searching ? true : expandedUserId === row.user.id;

      const tr = el('tr', {
        class: isOpen ? 'expanded' : '',
        onClick: () => {
          if (searching) return; // expansion is forced while searching
          expandedUserId = isOpen ? null : row.user.id;
          renderBody();
        },
      }, [
        el('td', {}, [
          el('div', { class: 'user-cell' }, [
            el('div', {
              class: 'avatar',
              style: { background: row.user.color },
            }, [row.user.initials]),
            el('div', {}, [
              el('div', { class: 'name' }, [row.user.name]),
              el('div', { class: 'sub' }, [
                searching
                  ? t('workload.matchCount', { matching: matchingIssues.length, total: totalCt })
                  : t('workload.issueCount', { count: totalCt }),
              ]),
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
              ...matchingIssues.map((iss) => renderIssueRow(iss, () => onOpenTask?.(iss), jiraUrl)),
            ]),
          ]),
        ]));
      }
    }

    // No user matched the query.
    if (query && tbody.children.length === 0) {
      tbody.appendChild(el('tr', {}, [
        el('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--ink-3)', padding: '24px' } }, [
          t('workload.noMatch', { query }),
        ]),
      ]));
    }
  }
  renderBody();

  const searchInput = el('input', {
    class: 'workload-search-input',
    type: 'text',
    placeholder: t('workload.search'),
  });
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    renderBody();
  });
  const searchBox = el('div', { class: 'workload-search' }, [searchIcon(), searchInput]);

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, [t('workload.title')]),
      el('span', { class: 'card-subtitle' }, [t('workload.subtitle', { count: allRows.length })]),
    ]),
    searchBox,
    el('table', { class: 'workload-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { style: { width: '240px' } }, [t('workload.thAssignee')]),
          el('th', {}, [t('workload.thStatusDist')]),
          el('th', { style: { textAlign: 'right' } }, [t('workload.thEstimate')]),
          el('th', { style: { textAlign: 'right' } }, [t('workload.thSpent')]),
          el('th', { style: { textAlign: 'right' } }, [t('workload.thRemaining')]),
          el('th', { style: { width: '24px' } }, []),
        ]),
      ]),
      tbody,
    ]),
  ]);
}
