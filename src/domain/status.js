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
  'ready to start': 'todo',
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

// Heuristic for custom statuses when no statusCategory is present.
// Detects common workflow naming patterns.
function heuristicFromName(name) {
  const n = name.toLowerCase();
  if (/(^|\s)(done|closed|resolved|complete|completed|cancel|cancelled|won['’]?t)\b/.test(n)) {
    return 'done';
  }
  if (/(in\s*progress|wip|review|testing|qa|coding|developing|implement|blocked|bug\s*fix|ready\s*for\s*test)/.test(n)) {
    return 'inprogress';
  }
  if (/(to\s*do|todo|backlog|open|new|ready|selected|draft)/.test(n)) {
    return 'todo';
  }
  return null;
}

export function normalizeStatus(status) {
  if (!status) return 'todo';
  if (typeof status === 'string') {
    return CATEGORY_BY_NAME[status.toLowerCase()] || heuristicFromName(status) || 'todo';
  }
  if (status.statusCategory && status.statusCategory.key) {
    return CATEGORY_BY_KEY[status.statusCategory.key] || 'todo';
  }
  if (status.name) {
    const lower = status.name.toLowerCase();
    return CATEGORY_BY_NAME[lower] || heuristicFromName(status.name) || 'todo';
  }
  return 'todo';
}

export function extractStatusName(status) {
  if (!status) return '';
  if (typeof status === 'string') return status;
  if (status.name) return status.name;
  return '';
}
