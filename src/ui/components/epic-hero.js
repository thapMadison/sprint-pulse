import { el } from '../dom.js';
import { fmtDate, fmtDow, metaItem, dayUnit } from '../hero-helpers.js';
import { issueTypeIcon } from './issue-type-icon.js';

function daysBetween(a, b) {
  if (!a || !b) return 0;
  const x = new Date(a + 'T00:00:00');
  const y = new Date(b + 'T00:00:00');
  return Math.max(0, Math.round((y - x) / 86400000));
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

export function renderEpicHero({ epic, today, jiraUrl }) {
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
          el('span', { class: 'issue-key-cell' }, [
            epic.isNoEpic ? null : issueTypeIcon('epic', { size: 18, withTitle: false }),
            (jiraUrl && !epic.isNoEpic)
              ? el('a', { href: `${jiraUrl}/browse/${epic.key}`, target: '_blank', rel: 'noopener noreferrer', class: 'epic-hero-key jira-key-link' }, [epic.key])
              : el('span', { class: 'epic-hero-key' }, [epic.isNoEpic ? 'NO EPIC' : epic.key]),
          ]),
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
