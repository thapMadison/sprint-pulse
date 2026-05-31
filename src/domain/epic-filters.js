import { FILTER_ALL } from '../app/constants.js';

// Predicate for the Epic-view filters (status + sprint + text search). Shared by
// the roadmap chart and the render layer's visible-count so the two never drift.
export function epicMatchesFilters(epic, filters) {
  if (filters.status !== FILTER_ALL && epic.status !== filters.status) return false;
  if (filters.sprintId !== FILTER_ALL && !epic.sprintIds.includes(filters.sprintId)) return false;
  const search = (filters.search || '').toLowerCase().trim();
  if (search && !`${epic.key} ${epic.name}`.toLowerCase().includes(search)) return false;
  return true;
}

export function filterEpics(epics, filters) {
  return epics.filter((e) => epicMatchesFilters(e, filters));
}
