import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';
import { statusLabel, jiraLink } from '../format.js';
import { issueTypeIcon } from './issue-type-icon.js';
import { t } from '../../app/i18n.js';
import { getState } from '../../app/state.js';
import { resolveStatusColors, effectiveColorMap } from '../../domain/status-colors.js';

function renderIssueRow(iss, onOpen, jiraUrl, colorMap) {
  const keyNode = jiraUrl
    ? jiraLink({ jiraUrl, key: iss.key, class: 'jira-key-link', stopClick: true })
    : el('span', {}, [iss.key]);
  const chipColor = colorMap[iss.statusName] || null;
  const chipStyle = chipColor ? {
    background: `color-mix(in oklch, ${chipColor} 18%, transparent)`,
    color: chipColor,
  } : {};
  const sdotStyle = chipColor ? { background: chipColor } : {};
  return el('div', { class: 'issue-row issue-row-clickable', onClick: () => onOpen(iss) }, [
    el('span', { class: 'key issue-key-cell' }, [
      issueTypeIcon(iss.type, { size: 16 }),
      keyNode,
    ]),
    el('span', { class: 'summary' }, [iss.summary]),
    el('span', {}, [
      el('span', { class: `status-chip ${iss.status}`, style: chipStyle }, [
        el('span', { class: 'sdot', style: sdotStyle }),
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

function chevronSvg() {
  return svg('svg', { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }, [
    svg('polyline', { points: '6 9 12 15 18 9' }),
  ]);
}

function checkmarkSvg() {
  return svg('svg', {
    width: 10, height: 10, viewBox: '0 0 10 10',
    fill: 'none', stroke: 'white', 'stroke-width': 1.8,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [svg('polyline', { points: '1.5 5.2 3.8 7.5 8.5 2' })]);
}

function buildStatusDropdown(slices, onFilterChange) {
  let selectedStatuses = new Set();
  let isOpen = false;

  const labelSpan = el('span', {}, [t('workload.filterAllStatuses')]);
  const chevron = el('span', { class: 'wl-status-chevron' }, []);
  chevron.appendChild(chevronSvg());

  const btn = el('button', { class: 'wl-status-btn', type: 'button', 'aria-expanded': 'false' }, [labelSpan, chevron]);

  function getBtnLabel(set) {
    if (set.size === 0) return t('workload.filterAllStatuses');
    if (set.size === 1) return [...set][0];
    return t('workload.filterNSelected', { count: set.size });
  }

  function updateBtn(set) {
    labelSpan.textContent = getBtnLabel(set);
    btn.classList.toggle('active', set.size > 0);
    btn.setAttribute('aria-expanded', String(isOpen));
    clearBtn.style.display = set.size > 0 ? '' : 'none';
  }

  // Build item elements
  const itemEls = slices.map(({ label, color, count }) => {
    const checkEl = el('span', { class: 'wl-status-check' });
    const dotEl = el('span', { class: 'wl-status-dot', style: { background: color } });
    const nameEl = el('span', { class: 'wl-status-name' }, [label]);
    const countEl = el('span', { class: 'wl-status-count' }, [String(count)]);
    const item = el('div', { class: 'wl-status-item', role: 'checkbox', 'aria-checked': 'false' }, [
      checkEl, dotEl, nameEl, countEl,
    ]);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const newSet = new Set(selectedStatuses);
      const checked = !newSet.has(label);
      if (checked) { newSet.add(label); checkEl.appendChild(checkmarkSvg()); }
      else { newSet.delete(label); checkEl.innerHTML = ''; }
      selectedStatuses = newSet;
      item.classList.toggle('checked', checked);
      item.setAttribute('aria-checked', String(checked));
      updateBtn(newSet);
      onFilterChange(newSet);
    });
    return { item, checkEl, label };
  });

  const clearBtn = el('button', { class: 'wl-status-clear', type: 'button' }, [t('workload.filterClear')]);
  clearBtn.style.display = 'none';
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedStatuses = new Set();
    itemEls.forEach(({ item, checkEl }) => {
      item.classList.remove('checked');
      item.setAttribute('aria-checked', 'false');
      checkEl.innerHTML = '';
    });
    updateBtn(selectedStatuses);
    onFilterChange(selectedStatuses);
    close();
  });

  const dropdown = el('div', { class: 'wl-status-dropdown' }, [
    ...itemEls.map(({ item }) => item),
    el('div', { class: 'wl-status-divider' }),
    clearBtn,
  ]);

  function close() {
    isOpen = false;
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    dropdown.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  const wrap = el('div', { class: 'wl-status-filter' }, [btn, dropdown]);

  // Close on outside click; self-clean when element is removed from DOM.
  function outsideClick() {
    if (!wrap.isConnected) { document.removeEventListener('click', outsideClick); return; }
    if (isOpen) close();
  }
  document.addEventListener('click', outsideClick);

  return wrap;
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
  const colorMap = effectiveColorMap(getState().statusColorMap, sprint.issues);
  let expandedUserId = null;
  let query = '';
  let selectedStatuses = new Set();

  const tbody = el('tbody', {}, []);

  function renderBody() {
    tbody.innerHTML = '';

    // When searching, only show users with ≥1 matching task, auto-expand them,
    // and list only the matching tasks inside.
    const searching = query.length > 0;
    const filtering = selectedStatuses.size > 0;

    for (const row of allRows) {
      let matchingIssues = row.issues;
      if (filtering) matchingIssues = matchingIssues.filter((i) => selectedStatuses.has(i.statusName || i.status));
      if (searching) matchingIssues = matchingIssues.filter((i) => issueMatches(i, query));
      if ((searching || filtering) && matchingIssues.length === 0) continue;

      const totalCt = row.issues.length || 1;
      // While searching or filtering, every shown user is auto-expanded; otherwise honour the click state.
      const isOpen = (searching || filtering) ? true : expandedUserId === row.user.id;

      const slices = resolveStatusColors(row.issues, colorMap);
      const hbarSegs = slices.map(({ color, count }) =>
        el('span', { style: { width: `${(count / totalCt) * 100}%`, background: color } })
      );
      // Numeric summary stays as done / inprogress / todo category totals.

      const tr = el('tr', {
        class: isOpen ? 'expanded' : '',
        onClick: () => {
          if (searching || filtering) return; // expansion is forced while filtering
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
                (searching || filtering)
                  ? t('workload.matchCount', { matching: matchingIssues.length, total: totalCt })
                  : t('workload.issueCount', { count: totalCt }),
              ]),
            ]),
          ]),
        ]),
        el('td', {}, [
          el('div', { class: 'hbar-row' }, [
            el('div', { class: 'hbar' }, hbarSegs),
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
              ...matchingIssues.map((iss) => renderIssueRow(iss, () => onOpenTask?.(iss), jiraUrl, colorMap)),
            ]),
          ]),
        ]));
      }
    }

    // No user matched the active filters.
    if ((query || filtering) && tbody.children.length === 0) {
      tbody.appendChild(el('tr', {}, [
        el('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--ink-3)', padding: '24px' } }, [
          query ? t('workload.noMatch', { query }) : t('workload.noMatchStatus'),
        ]),
      ]));
    }
  }

  const searchInput = el('input', {
    class: 'workload-search-input',
    type: 'text',
    placeholder: t('workload.search'),
  });
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    renderBody();
  });
  const searchWrap = el('div', { class: 'workload-search roadmap-filter-search-wrap' }, [searchIcon(), searchInput]);

  // Build dropdown from all sprint issues (not filtered) so all statuses are visible.
  const allSlices = resolveStatusColors(sprint.issues, colorMap);
  const statusDropdown = buildStatusDropdown(allSlices, (newSet) => {
    selectedStatuses = newSet;
    renderBody();
  });

  renderBody();

  const filterBar = el('div', { class: 'workload-filter-bar' }, [
    el('div', { class: 'roadmap-filter-group' }, [
      el('span', { class: 'roadmap-filter-label' }, [t('workload.filterLabel')]),
      statusDropdown,
    ]),
    searchWrap,
  ]);

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, [t('workload.title')]),
      el('span', { class: 'card-subtitle' }, [t('workload.subtitle', { count: allRows.length })]),
    ]),
    filterBar,
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
