// Small formatting helpers shared across UI components.

const STATUS_LABEL = { inprogress: 'In Prog', todo: 'To Do', done: 'Done' };

// Short status label for an issue/task chip, preferring the raw Jira status name.
export function statusLabel(issue) {
  return issue.statusName || STATUS_LABEL[issue.status] || 'Done';
}

// Drop a sprint name's descriptive suffix:
//   "Sprint 24 — Atlas Release" → "Sprint 24"
export function shortSprintName(name) {
  return (name || '').split(' — ')[0] || name || '';
}
