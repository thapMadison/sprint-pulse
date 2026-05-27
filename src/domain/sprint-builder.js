// Group raw issues into sprints, normalize statuses, infer missing sprint dates.
//
// Raw issue shape (produced by parsers/* and services/jira-api):
//   { key, summary, type, priority, status, assigneeName, assigneeId,
//     originalEstimate (h), timeSpent (h), remainingEstimate (h),
//     sprintName, sprintStartDate?, sprintEndDate?, sprintState?, sprintGoal? }
import { normalizeStatus, extractStatusName } from './status.js';

const USER_COLORS = [
  '#a78bfa', '#22d3ee', '#fb7185', '#84cc16', '#f59e0b',
  '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#c084fc',
];

function initialsOf(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function makeUserPool() {
  const map = new Map();
  let colorIdx = 0;
  return (name, id) => {
    const k = id || name || 'unassigned';
    if (!map.has(k)) {
      map.set(k, {
        id: k,
        name: name || 'Unassigned',
        initials: initialsOf(name || 'NA'),
        color: USER_COLORS[colorIdx++ % USER_COLORS.length],
      });
    }
    return map.get(k);
  };
}

function inferDatesAndState(sp, todayDate) {
  if (!sp.startDate || !sp.endDate) {
    const end = new Date(todayDate);
    const start = new Date(todayDate);
    start.setDate(start.getDate() - 14);
    sp.startDate = sp.startDate || start.toISOString().slice(0, 10);
    sp.endDate = sp.endDate || end.toISOString().slice(0, 10);
  }
  if (!sp.state) {
    const s = new Date(sp.startDate + 'T00:00:00');
    const e = new Date(sp.endDate + 'T00:00:00');
    if (todayDate < s) sp.state = 'future';
    else if (todayDate > e) sp.state = 'closed';
    else sp.state = 'active';
  }
}

export function buildSprintsFromIssues(rawIssues, today) {
  const userFor = makeUserPool();
  const sprintMap = new Map();

  for (const r of rawIssues) {
    const spName = r.sprintName || 'Backlog';
    if (!sprintMap.has(spName)) {
      sprintMap.set(spName, {
        id: spName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: spName,
        goal: r.sprintGoal || '',
        startDate: r.sprintStartDate || null,
        endDate: r.sprintEndDate || null,
        state: r.sprintState || null,
        issues: [],
      });
    }
    const sp = sprintMap.get(spName);
    if (!sp.startDate && r.sprintStartDate) sp.startDate = r.sprintStartDate;
    if (!sp.endDate && r.sprintEndDate) sp.endDate = r.sprintEndDate;
    if (!sp.state && r.sprintState) sp.state = r.sprintState;
    if (!sp.goal && r.sprintGoal) sp.goal = r.sprintGoal;

    sp.issues.push({
      key: r.key,
      summary: r.summary,
      assignee: userFor(r.assigneeName, r.assigneeId),
      status: normalizeStatus(r.status),
      statusName: extractStatusName(r.status),
      priority: r.priority || 'Medium',
      type: r.type || 'Task',
      originalEstimate: Number(r.originalEstimate) || 0,
      timeSpent: Number(r.timeSpent) || 0,
      remainingEstimate: Number(r.remainingEstimate) || 0,
    });
  }

  const sprints = Array.from(sprintMap.values());
  const todayDate = new Date(today + 'T00:00:00');
  for (const sp of sprints) inferDatesAndState(sp, todayDate);

  sprints.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  return sprints;
}
