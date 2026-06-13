// Demo SPRINTS — same data as the design bundle so the page renders on first load.

const USERS = [
  { id: 'u1', name: 'Linh Nguyen', initials: 'LN', color: '#a78bfa' },
  { id: 'u2', name: 'Khoa Tran', initials: 'KT', color: '#22d3ee' },
  { id: 'u3', name: 'Mai Pham', initials: 'MP', color: '#fb7185' },
  { id: 'u4', name: 'Duc Le', initials: 'DL', color: '#84cc16' },
  { id: 'u5', name: 'An Vu', initials: 'AV', color: '#f59e0b' },
];

const DEFAULT_STATUS_NAME = {
  todo: 'To Do',
  inprogress: 'In Progress',
  done: 'Done',
};

const issue = (
  key,
  summary,
  assigneeIdx,
  statusKey,
  est,
  spent,
  remaining,
  priority = 'Medium',
  type = 'Story',
  statusName = null
) => ({
  key,
  summary,
  assignee: USERS[assigneeIdx],
  status: statusKey,
  statusName: statusName || DEFAULT_STATUS_NAME[statusKey],
  priority,
  type,
  originalEstimate: est,
  timeSpent: spent,
  remainingEstimate: remaining,
});

export const DEMO_TODAY = '2026-05-22';

export const DEMO_SPRINTS = [
  {
    id: 'sp-24',
    name: 'Sprint 24 — Atlas Release',
    goal: 'Ship public beta of import pipeline + onboarding revamp',
    startDate: '2026-05-11',
    endDate: '2026-05-29',
    state: 'active',
    issues: [
      issue('ATL-401', 'Implement OAuth callback for Jira Cloud', 0, 'done', 8, 7.5, 0, 'High', 'Story'),
      issue('ATL-402', 'Sprint metrics aggregation service', 1, 'inprogress', 16, 11, 6, 'High', 'Story', 'In Review'),
      issue('ATL-403', 'Burndown calc — exclude weekends & holidays', 2, 'inprogress', 10, 6, 5, 'Medium', 'Task', 'In Progress'),
      issue('ATL-404', 'Workload report — per-user breakdown UI', 0, 'inprogress', 12, 8, 5, 'Medium', 'Story', 'Code Review'),
      issue('ATL-405', 'Cumulative Flow data model', 3, 'done', 6, 5.5, 0, 'Medium', 'Task'),
      issue('ATL-406', 'Control Chart — cycle time histogram', 3, 'inprogress', 10, 4, 7, 'Medium', 'Task', 'Blocked'),
      issue('ATL-407', 'Empty-state illustrations for dashboard', 2, 'done', 4, 4, 0, 'Low', 'Task'),
      issue('ATL-408', 'API rate-limit retry with backoff', 1, 'done', 5, 5, 0, 'High', 'Bug', 'Resolved'),
      issue('ATL-409', 'Export dashboard as PDF', 4, 'todo', 8, 0, 8, 'Low', 'Story', 'Backlog'),
      issue('ATL-410', 'Sprint filter dropdown — keyboard nav', 4, 'todo', 3, 0, 3, 'Low', 'Task'),
      issue('ATL-411', 'Status category mapping override', 0, 'inprogress', 6, 3, 4, 'Medium', 'Task', 'In Progress'),
      issue('ATL-412', 'Performance — virtualize workload table', 1, 'todo', 8, 0, 8, 'Medium', 'Task', 'Selected for Development'),
      issue('ATL-413', 'Auth — refresh token rotation bug', 2, 'done', 4, 4.5, 0, 'High', 'Bug', 'Resolved'),
      issue('ATL-414', 'Docs — REST endpoint reference page', 4, 'todo', 5, 0, 5, 'Low', 'Task'),
      issue('ATL-415', 'Telemetry: dashboard render p95', 3, 'done', 3, 3, 0, 'Low', 'Task'),
    ],
  },
  {
    id: 'sp-23',
    name: 'Sprint 23 — Foundations',
    goal: 'Auth, data model, and first dashboard scaffold',
    startDate: '2026-04-20',
    endDate: '2026-05-08',
    state: 'closed',
    issues: [
      issue('ATL-301', 'Jira REST client wrapper', 1, 'done', 12, 13, 0, 'High', 'Story'),
      issue('ATL-302', 'Issue + Sprint data schema', 0, 'done', 8, 7, 0, 'High', 'Task'),
      issue('ATL-303', 'Initial dashboard route + shell', 2, 'done', 10, 11, 0, 'Medium', 'Story'),
      issue('ATL-304', 'Working-day duration utility', 3, 'done', 4, 3.5, 0, 'Medium', 'Task'),
      issue('ATL-305', 'Status category color tokens', 4, 'done', 3, 2.5, 0, 'Low', 'Task'),
      issue('ATL-306', 'User profile sync', 1, 'done', 6, 6.5, 0, 'Medium', 'Task'),
      issue('ATL-307', 'Bug: timezone offset in dates', 0, 'done', 3, 4, 0, 'High', 'Bug'),
    ],
  },
  {
    id: 'sp-25',
    name: 'Sprint 25 — Insights',
    goal: 'Predictive metrics + team velocity forecasting',
    startDate: '2026-06-01',
    endDate: '2026-06-19',
    state: 'future',
    issues: [
      issue('ATL-501', 'Velocity rolling-average widget', 0, 'todo', 8, 0, 8, 'High', 'Story'),
      issue('ATL-502', 'Forecast — completion probability', 1, 'todo', 16, 0, 16, 'High', 'Story'),
      issue('ATL-503', 'Anomaly detection on cycle time', 3, 'todo', 12, 0, 12, 'Medium', 'Task'),
      issue('ATL-504', 'Slack notifications for blockers', 4, 'todo', 6, 0, 6, 'Low', 'Task'),
      issue('ATL-505', 'Multi-board comparison view', 2, 'todo', 14, 0, 14, 'Medium', 'Story'),
    ],
  },
  {
    // Issues triaged into the project but not yet pulled into a sprint.
    id: 'backlog',
    name: 'Backlog',
    goal: '',
    startDate: null,
    endDate: null,
    state: 'backlog',
    issues: [
      issue('ATL-601', 'Custom dashboard layouts (drag & drop)', 0, 'todo', 20, 0, 20, 'Medium', 'Story', 'Backlog'),
      issue('ATL-602', 'SSO with Google Workspace', 1, 'todo', 12, 0, 12, 'Medium', 'Story', 'Backlog'),
      issue('ATL-603', 'Dark/light theme per-user preference sync', 2, 'todo', 5, 0, 5, 'Low', 'Task', 'Backlog'),
      issue('ATL-604', 'Bulk CSV import for historical sprints', 3, 'todo', 10, 0, 10, 'Medium', 'Story', 'Backlog'),
      issue('ATL-605', 'Mobile-responsive workload table', 4, 'todo', 8, 0, 8, 'Low', 'Task', 'Backlog'),
      issue('ATL-606', 'Webhook integration for live updates', 1, 'todo', 14, 0, 14, 'High', 'Story', 'Backlog'),
    ],
  },
];

// =========== Demo Epic metadata + issue→epic mapping ============

export const DEMO_EPICS = [
  {
    key: 'EPIC-100',
    name: 'Atlas Pipeline Foundations',
    summary: 'Build the core import + metrics pipeline',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  },
  {
    key: 'EPIC-101',
    name: 'Dashboard Insights',
    summary: 'Burndown, CFD, control chart, and predictive widgets',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  },
  {
    key: 'EPIC-102',
    name: 'Auth & Reliability',
    summary: 'Microsoft SSO, token rotation, and refresh hardening',
    status: { name: 'Done', statusCategory: { key: 'done' } },
  },
];

// Map issue key → epicKey (omitted = "No Epic")
const ISSUE_TO_EPIC = {
  'ATL-301': 'EPIC-100',
  'ATL-302': 'EPIC-100',
  'ATL-303': 'EPIC-101',
  'ATL-305': 'EPIC-101',
  'ATL-306': 'EPIC-102',
  'ATL-401': 'EPIC-102',
  'ATL-402': 'EPIC-100',
  'ATL-403': 'EPIC-101',
  'ATL-404': 'EPIC-101',
  'ATL-405': 'EPIC-101',
  'ATL-406': 'EPIC-101',
  'ATL-408': 'EPIC-100',
  'ATL-411': 'EPIC-100',
  'ATL-413': 'EPIC-102',
  'ATL-501': 'EPIC-101',
  'ATL-502': 'EPIC-101',
};

const CAT_NEW = { name: 'To Do', statusCategory: { key: 'new' } };
const CAT_INPROG = { name: 'In Progress', statusCategory: { key: 'indeterminate' } };
const CAT_DONE = { name: 'Done', statusCategory: { key: 'done' } };

const mk = (date, toStatus) => ({ date, toStatus });

// Realistic changelog per task (only set where useful for Gantt demo)
const ISSUE_STATUS_CHANGES = {
  // Sprint 23 (closed: 2026-04-20 → 2026-05-08)
  'ATL-301': [mk('2026-04-20', CAT_NEW), mk('2026-04-20', CAT_INPROG), mk('2026-04-30', CAT_DONE)],
  'ATL-302': [mk('2026-04-20', CAT_NEW), mk('2026-04-21', CAT_INPROG), mk('2026-04-27', CAT_DONE)],
  'ATL-303': [mk('2026-04-20', CAT_NEW), mk('2026-04-21', CAT_INPROG), mk('2026-04-28', CAT_DONE)],
  'ATL-304': [mk('2026-04-22', CAT_NEW), mk('2026-04-24', CAT_INPROG), mk('2026-04-25', CAT_DONE)],
  'ATL-305': [mk('2026-04-23', CAT_NEW), mk('2026-04-24', CAT_INPROG), mk('2026-04-26', CAT_DONE)],
  'ATL-306': [mk('2026-04-22', CAT_NEW), mk('2026-04-22', CAT_INPROG), mk('2026-04-29', CAT_DONE)],
  'ATL-307': [mk('2026-05-05', CAT_NEW), mk('2026-05-06', CAT_INPROG), mk('2026-05-07', CAT_DONE)],
  // Sprint 24 (active: 2026-05-11 → 2026-05-29, today=2026-05-22)
  'ATL-401': [mk('2026-05-11', CAT_NEW), mk('2026-05-12', CAT_INPROG), mk('2026-05-16', CAT_DONE)],
  'ATL-402': [mk('2026-05-11', CAT_NEW), mk('2026-05-14', CAT_INPROG)],
  'ATL-403': [mk('2026-05-11', CAT_NEW), mk('2026-05-15', CAT_INPROG)],
  'ATL-404': [mk('2026-05-11', CAT_NEW), mk('2026-05-13', CAT_INPROG)],
  'ATL-405': [mk('2026-05-11', CAT_NEW), mk('2026-05-12', CAT_INPROG), mk('2026-05-17', CAT_DONE)],
  'ATL-406': [mk('2026-05-11', CAT_NEW), mk('2026-05-19', CAT_INPROG)],
  'ATL-407': [mk('2026-05-12', CAT_NEW), mk('2026-05-13', CAT_INPROG), mk('2026-05-14', CAT_DONE)],
  'ATL-408': [mk('2026-05-11', CAT_NEW), mk('2026-05-13', CAT_INPROG), mk('2026-05-15', CAT_DONE)],
  'ATL-411': [mk('2026-05-11', CAT_NEW), mk('2026-05-19', CAT_INPROG)],
  'ATL-413': [mk('2026-05-15', CAT_NEW), mk('2026-05-18', CAT_INPROG), mk('2026-05-20', CAT_DONE)],
  'ATL-415': [mk('2026-05-11', CAT_NEW), mk('2026-05-14', CAT_INPROG), mk('2026-05-15', CAT_DONE)],
};

// Enrich DEMO_SPRINTS in place with epicKey + statusChanges per issue
for (const sp of DEMO_SPRINTS) {
  for (const iss of sp.issues) {
    iss.epicKey = ISSUE_TO_EPIC[iss.key] || null;
    iss.statusChanges = ISSUE_STATUS_CHANGES[iss.key] || [];
  }
}
