// Shared enums for the small set of string literals that flow through state,
// actions, and the render layer. Centralizing them keeps the two views, the
// three data sources, and the three status categories spelled one way.

// Which top-level view is active.
export const VIEW = { SPRINT: 'sprint', EPIC: 'epic' };

// Where the loaded data came from.
export const SOURCE = { DEMO: 'demo', API: 'api', FILE: 'file' };

// Collapsed status categories (see domain/status.js).
export const STATUS = { TODO: 'todo', IN_PROGRESS: 'inprogress', DONE: 'done' };

// "Show everything" sentinel for the Epic-view filters.
export const FILTER_ALL = 'all';

// Sort weight for ordering issues/tasks by status (in-progress first, done last).
export const STATUS_ORDER = { inprogress: 0, todo: 1, done: 2 };
