import { el } from '../dom.js';

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return `${String(dt.getDate()).padStart(2, '0')} ${dt.toLocaleString('en', { month: 'short' })}`;
}
function fmtDow(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleString('en', { weekday: 'short' });
}
function daysBetween(a, b) {
  if (!a || !b) return 0;
  const x = new Date(a + 'T00:00:00');
  const y = new Date(b + 'T00:00:00');
  return Math.max(0, Math.round((y - x) / 86400000));
}

function metaItem(label, value, sub, valueStyle) {
  return el('div', { class: 'meta-item' }, [
    el('div', { class: 'meta-label' }, [label]),
    el('div', { class: 'meta-value', style: valueStyle || null }, value),
    el('div', { class: 'meta-sub' }, [sub]),
  ]);
}

function dayUnit() {
  return el('span', {
    style: { fontSize: '13px', color: 'var(--ink-3)', marginLeft: '4px' },
  }, ['d']);
}

function statusBadge(epic) {
  if (epic.isNoEpic) {
    return el('span', { class: 'epic-hero-badge' }, ['Loose tasks']);
  }
  const label =
    epic.status === 'done' ? 'Done' :
    epic.status === 'inprogress' ? 'In Progress' :
    'Not Started';
  return el('span', { class: `epic-hero-badge ${epic.status}` }, [
    el('span', { class: 'pulse' }),
    label,
  ]);
}

function statTile({ label, value, sub, accentBg, fillPct }) {
  const valueChildren = Array.isArray(value) ? value : [value];
  return el('div', { class: 'card stat-tile' }, [
    el('div', { class: 'stat-label' }, [label]),
    el('div', {}, [
      el('div', { class: 'stat-value-row' }, [
        el('div', { class: 'stat-value' }, valueChildren),
        sub ? el('span', { class: 'stat-pct' }, [sub]) : null,
      ]),
      el('div', { class: 'stat-bar' }, [
        el('span', {
          style: {
            background: accentBg,
            transform: `scaleX(${Math.max(0, Math.min(1, fillPct / 100))})`,
          },
        }),
      ]),
    ]),
  ]);
}

export function renderEpicHero({ epic, today }) {
  const isOngoing = epic.status === 'inprogress';
  const isLoading = !epic.detailLoaded;
  const durationLabel = epic.endDate
    ? `${daysBetween(epic.startDate, epic.endDate)}`
    : epic.startDate
      ? `${daysBetween(epic.startDate, today)}`
      : '0';
  const durationSub = epic.endDate
    ? 'days'
    : epic.startDate
      ? 'days · ongoing'
      : 'not started';

  const endValue = epic.endDate
    ? [fmtDate(epic.endDate)]
    : epic.status === 'todo'
      ? ['Not started']
      : ['In progress'];
  const endSub = epic.endDate ? fmtDow(epic.endDate) : 'no end yet';

  return el('div', { class: `sprint-hero epic-hero ${isLoading ? 'loading' : ''}` }, [
    el('div', { class: 'card sprint-card epic-hero-card' }, [
      el('div', { class: 'sprint-card-header' }, [
        el('div', { class: 'name' }, [
          el('span', { class: 'epic-hero-key' }, [epic.isNoEpic ? 'NO EPIC' : epic.key]),
          el('span', { class: 'epic-hero-name' }, [epic.name]),
        ]),
        el('div', { class: 'epic-hero-badges' }, [
          isLoading ? el('span', { class: 'epic-hero-badge loading' }, ['Loading...']) : null,
          statusBadge(epic),
        ].filter(Boolean)),
      ]),
      epic.summary && !epic.isNoEpic
        ? el('p', { class: 'epic-hero-summary' }, [epic.summary])
        : null,
      el('div', { class: 'sprint-meta' }, [
        metaItem('Start', [fmtDate(epic.startDate)], epic.startDate ? fmtDow(epic.startDate) : 'not started'),
        metaItem('End', endValue, endSub, isOngoing ? { color: 'var(--amber)' } : null),
        metaItem('Duration', [durationLabel, dayUnit()], durationSub),
        metaItem('Sprints', [String(epic.sprintIds.length)], `spans ${epic.sprintIds.length} sprint${epic.sprintIds.length !== 1 ? 's' : ''}`),
      ]),
    ]),
    el('div', { class: 'stat-grid' }, [
      statTile({
        label: 'Progress',
        value: [`${epic.progress.percent}`, el('span', { class: 'unit' }, ['%'])],
        sub: `${epic.progress.doneIssues}/${epic.progress.totalIssues} issues`,
        accentBg: 'linear-gradient(90deg, var(--lime), var(--cyan))',
        fillPct: epic.progress.percent,
      }),
      statTile({
        label: 'Total Effort',
        value: [`${epic.progress.totalHours.toFixed(0)}`, el('span', { class: 'unit' }, ['h'])],
        sub: `${epic.progress.hours.done.toFixed(0)}h done`,
        accentBg: 'linear-gradient(90deg, var(--violet), var(--cyan))',
        fillPct: epic.progress.totalHours > 0
          ? (epic.progress.hours.done / epic.progress.totalHours) * 100
          : 0,
      }),
      statTile({
        label: 'In Progress',
        value: [String(epic.progress.counts.inprogress), el('span', { class: 'unit' }, ['tasks'])],
        sub: `${epic.progress.hours.inprogress.toFixed(0)}h`,
        accentBg: 'linear-gradient(90deg, var(--amber), var(--coral))',
        fillPct: epic.progress.totalIssues > 0
          ? (epic.progress.counts.inprogress / epic.progress.totalIssues) * 100
          : 0,
      }),
    ]),
  ]);
}
