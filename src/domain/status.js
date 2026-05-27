// Normalize Jira status / status category into our 3 buckets: 'todo' | 'inprogress' | 'done'.

const CATEGORY_BY_KEY = {
  new: 'todo',
  indeterminate: 'inprogress',
  done: 'done',
};

const CATEGORY_BY_NAME = {
  'to do': 'todo',
  todo: 'todo',
  open: 'todo',
  backlog: 'todo',
  'selected for development': 'todo',
  'in progress': 'inprogress',
  inprogress: 'inprogress',
  'in review': 'inprogress',
  reviewing: 'inprogress',
  blocked: 'inprogress',
  done: 'done',
  closed: 'done',
  resolved: 'done',
  complete: 'done',
  completed: 'done',
};

export function normalizeStatus(status) {
  if (!status) return 'todo';
  if (typeof status === 'string') {
    return CATEGORY_BY_NAME[status.toLowerCase()] || 'todo';
  }
  if (status.statusCategory && status.statusCategory.key) {
    return CATEGORY_BY_KEY[status.statusCategory.key] || 'todo';
  }
  if (status.name) {
    return CATEGORY_BY_NAME[status.name.toLowerCase()] || 'todo';
  }
  return 'todo';
}

export function extractStatusName(status) {
  if (!status) return '';
  if (typeof status === 'string') return status;
  if (status.name) return status.name;
  return '';
}
