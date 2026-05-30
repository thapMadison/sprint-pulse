// Group all sprint issues by their epic parent, derive Epic-level metadata:
// status, progress, start/end dates from changelog when available.
//
// Inputs:
//   sprints: built sprints (from buildSprintsFromIssues), each issue may have
//            epicKey, epicName, statusChanges (lazy-loaded changelog).
//   rawEpics: optional [{ key, name, summary, status }] from worker /epics.
//   today: ISO date string for "in-progress until today".
//
// Output: Array of Epic objects (see schema below).

import { normalizeStatus } from './status.js';
import { makeUserPool } from './sprint-builder.js';

export const NO_EPIC_ID = '__NO_EPIC__';

function categoryKey(toStatus) {
  if (!toStatus) return null;
  if (toStatus.statusCategory && toStatus.statusCategory.key) {
    return toStatus.statusCategory.key;
  }
  // Fallback: normalize by name
  const norm = normalizeStatus(toStatus);
  if (norm === 'done') return 'done';
  if (norm === 'inprogress') return 'indeterminate';
  return 'new';
}

// First date the issue left "To Do" (entered any non-new status).
// Returns null if no changelog, or the issue never started.
function firstStartedDate(task) {
  if (!task.statusChanges || !task.statusChanges.length) return null;
  for (const ch of task.statusChanges) {
    const cat = categoryKey(ch.toStatus);
    if (cat && cat !== 'new') return ch.date;
  }
  return null;
}

// Last date the issue entered "Done" category. Null if never reached done.
function lastDoneDate(task) {
  if (!task.statusChanges || !task.statusChanges.length) return null;
  let last = null;
  for (const ch of task.statusChanges) {
    if (categoryKey(ch.toStatus) === 'done') last = ch.date;
  }
  return last;
}

// Fallback when no changelog: derive from current status + sprint dates.
// Status can be a string ('todo') or object ({name, statusCategory}).
function fallbackStarted(task, sprint) {
  const status = typeof task.status === 'string' ? task.status : normalizeStatus(task.status);
  if (status === 'todo') return null;
  return sprint?.startDate || null;
}
function fallbackDone(task, sprint) {
  const status = typeof task.status === 'string' ? task.status : normalizeStatus(task.status);
  if (status !== 'done') return null;
  return sprint?.endDate || null;
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function deriveEpicStatus(tasks) {
  if (!tasks.length) return 'todo';
  const allDone = tasks.every((t) => t.status === 'done');
  if (allDone) return 'done';
  const anyStarted = tasks.some((t) => t.status !== 'todo');
  return anyStarted ? 'inprogress' : 'todo';
}

function hoursByStatus(tasks, status) {
  return tasks
    .filter((t) => t.status === status)
    .reduce((s, t) => s + (t.originalEstimate || 0), 0);
}

// Aggregate per-status counts/hours plus overall completion percent for an epic.
// Percent prefers hours; falls back to issue count when no estimates exist.
function computeProgress(tasks) {
  const totalIssues = tasks.length;
  const doneIssues = tasks.filter((t) => t.status === 'done').length;
  const totalHours = tasks.reduce((s, t) => s + (t.originalEstimate || 0), 0);
  const doneHours = hoursByStatus(tasks, 'done');
  const percent = totalHours > 0
    ? Math.round((doneHours / totalHours) * 100)
    : totalIssues > 0
      ? Math.round((doneIssues / totalIssues) * 100)
      : 0;
  return {
    totalIssues, doneIssues,
    totalHours, doneHours,
    percent,
    counts: {
      todo: tasks.filter((t) => t.status === 'todo').length,
      inprogress: tasks.filter((t) => t.status === 'inprogress').length,
      done: doneIssues,
    },
    hours: {
      todo: hoursByStatus(tasks, 'todo'),
      inprogress: hoursByStatus(tasks, 'inprogress'),
      done: doneHours,
    },
  };
}

// Epic start = earliest task start; end = latest task done — but the end date is
// only "real" once every task is done, otherwise the epic is still in progress.
function computeEpicDates(tasks, status) {
  let startDate = null;
  let endDate = null;
  for (const t of tasks) {
    if (t.startedDate) startDate = minDate(startDate, t.startedDate);
    if (t.doneDate) endDate = maxDate(endDate, t.doneDate);
  }
  if (status !== 'done') endDate = null;
  return { startDate, endDate };
}

function uniqueSprintIds(tasks) {
  return Array.from(new Set(tasks.map((t) => t.sprintId).filter(Boolean)));
}

export function buildEpics(sprints, rawEpics, today) {
  // Index epic metadata by key for fast lookup
  const epicMetaByKey = new Map();
  for (const e of rawEpics || []) {
    if (e.key) epicMetaByKey.set(e.key, e);
  }

  // Build {epicKey → tasksWithSprintRef}
  const taskGroups = new Map();
  for (const sp of sprints) {
    for (const iss of sp.issues) {
      const key = iss.epicKey || NO_EPIC_ID;
      if (!taskGroups.has(key)) taskGroups.set(key, []);
      taskGroups.get(key).push({
        ...iss,
        sprintId: sp.id,
        sprintName: sp.name,
        sprintStartDate: sp.startDate,
        sprintEndDate: sp.endDate,
        // Derived per-task dates
        startedDate: firstStartedDate(iss) || fallbackStarted(iss, sp),
        doneDate: lastDoneDate(iss) || fallbackDone(iss, sp),
      });
    }
  }

  // Also include epics from rawEpics that have no tasks in loaded sprints
  for (const meta of epicMetaByKey.values()) {
    if (!taskGroups.has(meta.key)) taskGroups.set(meta.key, []);
  }

  const epics = [];
  for (const [key, tasks] of taskGroups.entries()) {
    const isNoEpic = key === NO_EPIC_ID;
    const meta = epicMetaByKey.get(key);

    // Fallback name from any task that carried epicName
    const taskWithName = tasks.find((t) => t.epicName);
    const name = isNoEpic
      ? 'No Epic'
      : (meta?.name || taskWithName?.epicName || key);

    const summary = isNoEpic
      ? 'Tasks without an Epic parent'
      : (meta?.summary || name);

    const status = deriveEpicStatus(tasks);
    const statusName = isNoEpic
      ? ''
      : (meta?.status?.name ||
         (status === 'done' ? 'Done' : status === 'inprogress' ? 'In Progress' : 'To Do'));

    const progress = computeProgress(tasks);
    const { startDate, endDate } = computeEpicDates(tasks, status);

    epics.push({
      id: isNoEpic ? NO_EPIC_ID : key,
      key,
      name,
      summary,
      status,
      statusName,
      tasks,
      sprintIds: uniqueSprintIds(tasks),
      startDate,
      endDate,
      today,
      progress,
      isNoEpic,
    });
  }

  // Sort: real epics first (in-progress → not started → done), No Epic last
  const STATE_ORDER = { inprogress: 0, todo: 1, done: 2 };
  epics.sort((a, b) => {
    if (a.isNoEpic !== b.isNoEpic) return a.isNoEpic ? 1 : -1;
    const sa = STATE_ORDER[a.status] ?? 3;
    const sb = STATE_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    return (a.name || '').localeCompare(b.name || '');
  });

  return epics;
}

// Phase 1: Build lightweight epics using only existing /all data (no changelog).
// Uses fallback dates from sprint boundaries. Sets detailLoaded: false so UI
// can show loading indicator per epic.
export function buildLightweightEpics(sprints, rawEpics, today) {
  const epics = buildEpics(sprints, rawEpics, today);
  return epics.map((e) => ({ ...e, detailLoaded: e.isNoEpic }));
}

// Phase 2: Enrich a single epic with detailed issue data (with changelog).
// Returns a new epic object with accurate startedDate/doneDate per task.
export function enrichEpicWithDetail(epic, detailData, today) {
  if (!detailData || !detailData.issues) return { ...epic, detailLoaded: true };

  const userFor = makeUserPool();
  const tasks = detailData.issues.map((iss) => {
    const status = normalizeStatus(iss.status);
    return {
      key: iss.key,
      summary: iss.summary,
      type: iss.type,
      priority: iss.priority,
      status,
      statusName: iss.status?.name || status,
      assignee: userFor(iss.assigneeName, iss.assigneeId),
      assigneeName: iss.assigneeName,
      assigneeId: iss.assigneeId,
      originalEstimate: iss.originalEstimate,
      timeSpent: iss.timeSpent,
      remainingEstimate: iss.remainingEstimate,
      sprintId: iss.sprintId,
      sprintName: iss.sprintName,
      sprintStartDate: iss.sprintStartDate,
      sprintEndDate: iss.sprintEndDate,
      epicKey: iss.epicKey,
      epicName: iss.epicName,
      statusChanges: iss.statusChanges || [],
      startedDate: firstStartedDate(iss) || fallbackStarted(iss, {
        startDate: iss.sprintStartDate,
        endDate: iss.sprintEndDate,
      }),
      doneDate: lastDoneDate(iss) || fallbackDone(iss, {
        startDate: iss.sprintStartDate,
        endDate: iss.sprintEndDate,
      }),
    };
  });

  const epicStatus = deriveEpicStatus(tasks);
  const progress = computeProgress(tasks);
  const { startDate, endDate } = computeEpicDates(tasks, epicStatus);

  return {
    ...epic,
    name: detailData.epic?.name || epic.name,
    summary: detailData.epic?.name || epic.summary,
    status: epicStatus,
    statusName: detailData.epic?.status?.name || epic.statusName,
    tasks,
    sprintIds: uniqueSprintIds(tasks),
    startDate,
    endDate,
    today,
    progress,
    detailLoaded: true,
  };
}
