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
];
