// Portfolio Roadmap: one combined Gantt for all epics.
// - Sticky left column with epic/task meta (chevron, key, name, status, mini progress).
// - Right side renders a date-axis header + bars per row.
// - Click chevron to expand an epic and reveal its task rows underneath.
// - Click epic name to open the side detail panel.
import { el } from '../ui/dom.js';
import { shortSprintName } from '../ui/format.js';
import { issueTypeIcon } from '../ui/components/issue-type-icon.js';
import { filterEpics } from '../domain/epic-filters.js';
import { STATUS_ORDER } from '../app/constants.js';
import { t } from '../app/i18n.js';

const MIN_PX_PER_DAY = 6;
const MAX_PX_PER_DAY = 22;
const TARGET_TRACK_WIDTH = 880;
const LEFT_COL_PX = 280;
const AXIS_HEIGHT_PX = 30;
const SPRINT_LABEL_MIN_PX = 40;

// Track whether we've done the initial scroll-to-today.
// Only scroll once per session — subsequent re-renders preserve user scroll.
let hasScrolledToToday = false;
// Preserve scroll position across re-renders
let savedScrollLeft = 0;

function parseDate(s) {
  return new Date(s + 'T00:00:00');
}
function dateDiffDays(a, b) {
  return Math.round((b - a) / 86400000);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtMonthYear(d) {
  return `${t(`month.${d.getMonth()}`)} ${d.getFullYear()}`;
}
// Compress a sprint name like "GL APP SPRINT 40" → "S40" so labels fit inside
// narrow bands instead of overlapping with the next sprint's label.
function shortSprintLabel(name) {
  const trailing = (name || '').match(/(\d+)\s*$/);
  if (trailing) return `S${trailing[1]}`;
  return (name || '').slice(0, 6);
}

function dateRange(epics, sprints, today) {
  const dates = [today];
  for (const sp of sprints) {
    if (sp.startDate) dates.push(sp.startDate);
    if (sp.endDate) dates.push(sp.endDate);
  }
  for (const e of epics) {
    if (e.startDate) dates.push(e.startDate);
    if (e.endDate) dates.push(e.endDate);
    for (const t of e.tasks) {
      if (t.startedDate) dates.push(t.startedDate);
      if (t.doneDate) dates.push(t.doneDate);
    }
  }
  const sorted = dates.slice().sort();
  return {
    start: addDays(parseDate(sorted[0]), -2),
    end: addDays(parseDate(sorted[sorted.length - 1]), 2),
  };
}

function progressMini(epic) {
  const seg = epic.progress.counts;
  const total = Math.max(1, seg.todo + seg.inprogress + seg.done);
  const pDone = (seg.done / total) * 100;
  const pProg = (seg.inprogress / total) * 100;
  const isLoading = !epic.detailLoaded;
  return el('div', { class: `roadmap-progress ${isLoading ? 'loading' : ''}` }, [
    el('div', { class: 'roadmap-progress-track' }, [
      el('span', { class: 'seg-done', style: { width: `${pDone}%` } }),
      el('span', { class: 'seg-inprog', style: { width: `${pProg}%` } }),
    ]),
    el('div', { class: 'roadmap-progress-meta' }, [
      el('span', { class: 'pct' }, [`${epic.progress.percent}%`]),
      el('span', { class: 'count' }, [`${epic.progress.counts.done}/${epic.progress.totalIssues}`]),
      isLoading ? el('span', { class: 'roadmap-loading-dot' }, ['...']) : null,
    ].filter(Boolean)),
  ]);
}

function statusPill(epic) {
  if (epic.isNoEpic) {
    return el('span', { class: 'roadmap-status-pill loose' }, [t('roadmap.loose')]);
  }
  const label =
    epic.status === 'done' ? t('roadmap.statusDone') :
    epic.status === 'inprogress' ? t('roadmap.statusInProg') :
    t('roadmap.statusTodo');
  return el('span', { class: `roadmap-status-pill ${epic.status}` }, [label]);
}

function chevron(open) {
  const cls = `roadmap-chevron ${open ? 'open' : ''}`;
  return el('span', { class: cls, 'aria-hidden': 'true' }, ['▸']);
}

// Epic bar: a muted track in the status color, with a solid fill showing the
// done-percentage of tasks inside. Ongoing epics get a dashed right edge.
// Shows a shimmer effect when detail is still loading.
function epicBar(epic, dayToPct, today, onClick) {
  const isLoading = !epic.detailLoaded;
  const clickProps = onClick ? { onClick, style: { cursor: 'pointer' } } : {};
  if (!epic.startDate) {
    const emptyContent = isLoading ? t('roadmap.loading') : t('roadmap.notStarted');
    return el('div', { class: `roadmap-bar-empty ${isLoading ? 'loading' : ''}`, ...clickProps }, [emptyContent]);
  }
  const ongoing = !epic.endDate;
  const endStr = epic.endDate || today;
  const left = dayToPct(epic.startDate);
  const right = dayToPct(endStr);
  const width = Math.max(0, right - left);
  const pct = epic.progress.percent || 0;
  const cls = `roadmap-bar epic ${epic.status} ${ongoing ? 'ongoing' : ''} ${isLoading ? 'loading' : ''}`;
  const titleSuffix = isLoading ? `\n${t('roadmap.loadingDetail')}` : '';
  return el('div', {
    class: cls,
    style: { left: `${left}%`, width: `${width}%`, ...(onClick ? { cursor: 'pointer' } : {}) },
    title: `${epic.key} · ${epic.name}\n${epic.startDate} → ${epic.endDate || t('roadmap.barOngoing')}\n${t('roadmap.barProgress')}: ${pct}%${titleSuffix}`,
    ...(onClick ? { onClick } : {}),
  }, [
    el('div', { class: 'roadmap-bar-fill', style: { width: `${pct}%` } }),
    el('span', { class: 'roadmap-bar-pct' }, [`${pct}%`]),
  ]);
}

function taskBar(task, dayToPct, today, sprints) {
  if (!task.startedDate) {
    const sp = sprints.find((s) => s.id === task.sprintId);
    if (sp?.startDate) {
      const left = dayToPct(sp.startDate);
      return el('div', {
        class: 'roadmap-task-dot',
        style: { left: `calc(${left}% - 3px)` },
        title: t('roadmap.taskNotStartedTip', { key: task.key }),
      });
    }
    return null;
  }
  const ongoing = !task.doneDate;
  const endStr = task.doneDate || today;
  const left = dayToPct(task.startedDate);
  const right = dayToPct(endStr);
  // True duration as a % of the timeline. A pixel-based min-width in CSS keeps
  // very short bars visible without inflating their apparent duration.
  const width = Math.max(0, right - left);
  const cls = `roadmap-bar task ${task.status} ${ongoing ? 'ongoing' : ''}`;
  return el('div', {
    class: cls,
    style: { left: `${left}%`, width: `${width}%` },
    title: `${task.key} · ${task.statusName || task.status}\n${t('roadmap.tipStart')}: ${task.startedDate}${task.doneDate ? `\n${t('roadmap.tipDone')}: ${task.doneDate}` : `\n${t('roadmap.tipOngoing')}`}`,
  });
}

// Sprint bands: background tints + separate divider lines at sprint boundaries.
// Separating dividers from backgrounds ensures alignment even with gaps/overlaps.
function sprintBands(sprints, dayToPct, rightTrackPx) {
  const colors = ['band-a', 'band-b', 'band-c'];
  const sorted = sprints
    .filter((sp) => sp.startDate && sp.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const elements = [];

  // Render background bands (no border)
  sorted.forEach((sp, i) => {
    const left = dayToPct(sp.startDate);
    const right = dayToPct(sp.endDate);
    const width = Math.max(0.2, right - left);
    const widthPx = (width / 100) * rightTrackPx;
    const stateCls = sp.state === 'active' ? 'active'
      : sp.state === 'closed' ? 'closed' : 'future';
    const shortName = shortSprintName(sp.name);
    const showLabel = sp.state === 'active' || widthPx >= SPRINT_LABEL_MIN_PX;
    const labelText = shortSprintLabel(shortName);

    elements.push(el('div', {
      class: `roadmap-sprint-band ${colors[i % colors.length]} ${stateCls}`,
      style: { left: `${left}%`, width: `${width}%` },
      title: `${sp.name}\n${sp.startDate} → ${sp.endDate}`,
    }, showLabel ? [
      el('span', { class: 'roadmap-sprint-band-label' }, [labelText]),
    ] : []));
  });

  // Render divider lines at each sprint START (separate from backgrounds)
  sorted.forEach((sp) => {
    const left = dayToPct(sp.startDate);
    const isActive = sp.state === 'active';
    elements.push(el('div', {
      class: `roadmap-sprint-divider ${isActive ? 'active' : ''}`,
      style: { left: `${left}%` },
    }));
  });

  return elements;
}

// Top tier of the date axis: month + year bands stretched across each calendar
// month that overlaps the visible range.
function monthHeader(rangeStart, rangeEnd, dayToPct) {
  const bands = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const safetyLimit = 200;
  let i = 0;
  while (cursor < rangeEnd && i++ < safetyLimit) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const clipStart = cursor < rangeStart ? rangeStart : cursor;
    const clipEnd = nextMonth > rangeEnd ? rangeEnd : nextMonth;
    const left = dayToPct(toIso(clipStart));
    const right = dayToPct(toIso(clipEnd));
    const width = Math.max(0, right - left);
    bands.push(el('div', {
      class: 'roadmap-month-band',
      style: { left: `${left}%`, width: `${width}%` },
    }, [
      el('span', { class: 'roadmap-month-label' }, [fmtMonthYear(cursor)]),
    ]));
    cursor = nextMonth;
  }
  return bands;
}

function todayMarker(today, dayToPct) {
  const pct = dayToPct(today);
  if (pct == null || pct < 0 || pct > 100) return null;
  return el('div', {
    class: 'roadmap-today',
    style: { left: `${pct}%` },
  }, [el('span', { class: 'roadmap-today-label' }, [t('roadmap.today')])]);
}

function epicRow({ epic, expanded, dayToPct, today, jiraUrl, onToggle, onOpenDetail }) {
  const keyNode = (jiraUrl && !epic.isNoEpic)
    ? el('a', { href: `${jiraUrl}/browse/${epic.key}`, target: '_blank', rel: 'noopener noreferrer', class: 'roadmap-key jira-key-link', onClick: (e) => e.stopPropagation() }, [epic.key])
    : el('span', { class: 'roadmap-key' }, [epic.isNoEpic ? t('roadmap.noEpic') : epic.key]);

  const left = el('div', { class: 'roadmap-row-left epic-left' }, [
    el('button', {
      class: `roadmap-chevron-btn ${expanded ? 'open' : ''}`,
      type: 'button',
      'aria-label': expanded ? t('roadmap.collapse') : t('roadmap.expand'),
      onClick: (e) => { e.stopPropagation(); onToggle(epic.id); },
    }, [chevron(expanded)]),
    el('div', { class: 'roadmap-meta roadmap-meta-clickable', onClick: () => onOpenDetail(epic.id) }, [
      el('div', { class: 'roadmap-meta-top' }, [
        epic.isNoEpic ? null : issueTypeIcon('epic', { size: 14, withTitle: false }),
        keyNode,
        statusPill(epic),
      ]),
      el('button', {
        class: 'roadmap-name-btn',
        type: 'button',
        onClick: (e) => { e.stopPropagation(); onOpenDetail(epic.id); },
        title: t('roadmap.openDetails'),
      }, [epic.isNoEpic ? t('roadmap.noEpicName') : epic.name]),
      progressMini(epic),
    ]),
  ]);

  const right = el('div', { class: 'roadmap-row-right' }, [
    epicBar(epic, dayToPct, today, () => onOpenDetail(epic.id)),
  ]);

  return el('div', { class: 'roadmap-row epic-row' }, [left, right]);
}

function taskRow({ task, dayToPct, today, sprints, jiraUrl, onOpenTask }) {
  const keyNode = jiraUrl
    ? el('a', { href: `${jiraUrl}/browse/${task.key}`, target: '_blank', rel: 'noopener noreferrer', class: 'roadmap-task-key jira-key-link', onClick: (e) => e.stopPropagation() }, [task.key])
    : el('span', { class: 'roadmap-task-key' }, [task.key]);

  const leftClass = `roadmap-row-left task-left${onOpenTask ? ' roadmap-task-clickable' : ''}`;
  const left = el('div', { class: leftClass, ...(onOpenTask ? { onClick: () => onOpenTask(task) } : {}) }, [
    el('span', { class: 'roadmap-task-indent' }),
    issueTypeIcon(task.type, { size: 15 }),
    keyNode,
    el('span', { class: 'roadmap-task-summary' }, [task.summary || '']),
    el('span', { class: `roadmap-task-status ${task.status}` }, [
      task.statusName || task.status,
    ]),
  ]);
  const bar = taskBar(task, dayToPct, today, sprints);
  const rightClass = `roadmap-row-right task${onOpenTask ? ' roadmap-task-clickable' : ''}`;
  const right = el('div', { class: rightClass, ...(onOpenTask ? { onClick: () => onOpenTask(task) } : {}) }, bar ? [bar] : []);
  return el('div', { class: 'roadmap-row task-row' }, [left, right]);
}

export function renderEpicRoadmap({
  epics, sprints, today, expandedIds, filters, jiraUrl,
  onToggleExpand, onOpenDetail, onOpenTask,
}) {
  const filtered = filterEpics(epics, filters);

  if (!filtered.length) {
    return el('div', { class: 'card roadmap-card' }, [
      el('h3', { class: 'card-title' }, [
        el('span', {}, [t('roadmap.title')]),
      ]),
      el('p', { class: 'roadmap-empty' }, [
        epics.length
          ? t('roadmap.emptyFiltered')
          : t('roadmap.empty'),
      ]),
    ]);
  }

  const { start, end } = dateRange(filtered, sprints, today);
  const totalDays = Math.max(1, dateDiffDays(start, end));
  const pxPerDay = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, TARGET_TRACK_WIDTH / totalDays));
  const trackWidth = Math.max(TARGET_TRACK_WIDTH, totalDays * pxPerDay);

  const dayToPct = (dateStr) => {
    if (!dateStr) return null;
    const d = parseDate(dateStr);
    return (dateDiffDays(start, d) / totalDays) * 100;
  };

  const rows = [];
  for (const epic of filtered) {
    const expanded = expandedIds.has(epic.id);
    rows.push(epicRow({
      epic, expanded, dayToPct, today, jiraUrl,
      onToggle: onToggleExpand,
      onOpenDetail,
    }));
    if (expanded) {
      const sorted = [...epic.tasks].sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 3;
        const sb = STATUS_ORDER[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return (a.startedDate || '9999').localeCompare(b.startedDate || '9999');
      });
      for (const t of sorted) {
        rows.push(taskRow({ task: t, dayToPct, today, sprints, jiraUrl, onOpenTask }));
      }
    }
  }

  // Single-tier date axis: month + year bands (no day numbers — month-band
  // borders give enough rhythm and dropping the day-tick row removes a lot of
  // overlay DOM that was costing horizontal-scroll perf).
  const axis = el('div', { class: 'roadmap-axis' }, [
    el('div', { class: 'roadmap-axis-months' }, monthHeader(start, end, dayToPct)),
  ]);

  // Background overlay covers right-track area only (escapes the 280px sticky
  // left column). Holds sprint bands that span all rows.
  const rightTrackPx = trackWidth - LEFT_COL_PX;
  const bgOverlay = el('div', { class: 'roadmap-bg-overlay' }, [
    el('div', { class: 'roadmap-sprint-bands' }, sprintBands(sprints, dayToPct, rightTrackPx)),
  ]);

  // Today layer is separate so its z-index can sit above bars but below the
  // sticky left column.
  const todayEl = todayMarker(today, dayToPct);
  const todayLayer = el('div', { class: 'roadmap-today-layer' }, todayEl ? [todayEl] : []);

  const trackInner = el('div', {
    class: 'roadmap-track-inner',
    style: { minWidth: `${trackWidth}px` },
  }, [
    axis,
    bgOverlay,
    todayLayer,
    el('div', { class: 'roadmap-rows' }, rows),
  ]);

  // Capture current scroll position from existing element before it's replaced
  const existingScroll = document.querySelector('.roadmap-scroll');
  if (existingScroll) {
    savedScrollLeft = existingScroll.scrollLeft;
  }

  const scrollEl = el('div', { class: 'roadmap-scroll' }, [trackInner]);

  // Persist scroll position: save on every scroll so we can restore after re-render
  scrollEl.addEventListener('scroll', () => {
    savedScrollLeft = scrollEl.scrollLeft;
  }, { passive: true });

  // After paint: either scroll to Today (first time) or restore saved position
  const todayPctVal = dayToPct(today);
  requestAnimationFrame(() => {
    if (!scrollEl.isConnected) return;
    if (!hasScrolledToToday && todayPctVal != null && todayPctVal >= 0 && todayPctVal <= 100) {
      hasScrolledToToday = true;
      const todayPx = LEFT_COL_PX + (todayPctVal / 100) * (trackWidth - LEFT_COL_PX);
      const RIGHT_PADDING = 160;
      const target = Math.max(0, todayPx - scrollEl.clientWidth + RIGHT_PADDING);
      scrollEl.scrollLeft = target;
      savedScrollLeft = target;
    } else if (savedScrollLeft > 0) {
      // Restore previous scroll position
      scrollEl.scrollLeft = savedScrollLeft;
    }
  });

  const totalTasksExpanded = rows.length - filtered.length;
  return el('div', { class: 'card roadmap-card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, [t('roadmap.title')]),
      el('span', {
        style: {
          font: '400 11px var(--font-mono)', color: 'var(--ink-3)',
          letterSpacing: '0.05em', textTransform: 'none',
        },
      }, [
        t('roadmap.count', { filtered: filtered.length, total: epics.length, count: epics.length }) +
        (totalTasksExpanded ? t('roadmap.tasksShown', { count: totalTasksExpanded }) : ''),
      ]),
    ]),
    scrollEl,
    el('div', { class: 'roadmap-legend' }, [
      el('span', { class: 'legend-item' }, [el('span', { class: 'legend-sw done' }), t('roadmap.legendDone')]),
      el('span', { class: 'legend-item' }, [el('span', { class: 'legend-sw inprog' }), t('roadmap.legendInProgress')]),
      el('span', { class: 'legend-item' }, [el('span', { class: 'legend-sw todo' }), t('roadmap.legendNotStarted')]),
      el('span', { class: 'legend-item' }, [el('span', { class: 'legend-sw ongoing' }), t('roadmap.legendOngoing')]),
      el('span', { class: 'legend-item' }, [el('span', { class: 'legend-sw sprint-band' }), t('roadmap.legendSprintSpan')]),
      el('span', { class: 'legend-item' }, [el('span', { class: 'legend-sw today-line' }), t('roadmap.legendToday')]),
    ]),
  ]);
}
