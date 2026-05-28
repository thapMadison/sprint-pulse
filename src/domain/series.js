import { isWeekend, workingDaysBetween, toLocalDateStr } from './working-days.js';
import { normalizeStatus } from './status.js';

// Extract cycle time info from an issue's statusChanges
function getCycleTimeData(issue) {
  if (!issue.statusChanges || issue.statusChanges.length === 0) {
    return null;
  }

  let firstInProgressDate = null;
  let completionDate = null;

  for (const change of issue.statusChanges) {
    const status = normalizeStatus(change.toStatus);

    // First time entering "inprogress"
    if (!firstInProgressDate && status === 'inprogress') {
      firstInProgressDate = change.date;
    }

    // First time entering "done"
    if (!completionDate && status === 'done') {
      completionDate = change.date;
    }
  }

  // If never went to done, not a completed issue
  if (!completionDate) return null;

  // If went straight to done (no inprogress), use creation date or first change date
  if (!firstInProgressDate) {
    firstInProgressDate = issue.statusChanges[0]?.date || completionDate;
  }

  // Calculate cycle time in working days
  const cycleTime = workingDaysBetween(firstInProgressDate, completionDate);

  return {
    startDate: firstInProgressDate,
    completionDate,
    cycleTime: Math.max(1, cycleTime), // Minimum 1 day
  };
}

// Build control chart points from real changelog data
function buildControlPoints(issues, days, sprintStartDate) {
  const doneIssues = issues.filter((i) => i.status === 'done');
  const hasChangelog = doneIssues.some((i) => i.statusChanges && i.statusChanges.length > 0);

  if (!hasChangelog) {
    return buildControlPointsSimulated(doneIssues, days.length);
  }

  const totalDays = days.length;
  const sprintStart = sprintStartDate;
  const sprintEnd = days[totalDays - 1] ? toLocalDateStr(days[totalDays - 1]) : null;

  const points = [];
  let fallbackIdx = 0; // For issues without changelog data
  let withChangelog = 0;
  let withoutChangelog = 0;

  for (const iss of doneIssues) {
    const data = getCycleTimeData(iss);

    let dayIdx, cycleTime, completionDate, startDate;

    if (data) {
      // Real data from changelog
      cycleTime = data.cycleTime;
      completionDate = data.completionDate;
      startDate = data.startDate;
      withChangelog++;

      // Map completion date to dayIdx (which sprint day)
      dayIdx = 0;
      for (let i = 0; i < totalDays; i++) {
        const dayStr = toLocalDateStr(days[i]);
        if (dayStr <= completionDate) {
          dayIdx = i;
        } else {
          break;
        }
      }

      // Clamp to sprint bounds
      if (completionDate < sprintStart) dayIdx = 0;
      if (completionDate > sprintEnd) dayIdx = totalDays - 1;
    } else {
      // Fallback: spread issues without changelog across the sprint
      dayIdx = Math.min(totalDays - 1, Math.round((fallbackIdx / doneIssues.length) * totalDays));
      cycleTime = 1 + (iss.originalEstimate || 0) * 0.1; // Estimate based on size
      completionDate = null;
      startDate = null;
      withoutChangelog++;
      fallbackIdx++;
    }

    points.push({
      key: iss.key,
      summary: iss.summary,
      dayIdx,
      cycleTime,
      completionDate,
      startDate,
    });
  }

  console.log(`[Control Chart] Done issues: ${doneIssues.length}, with changelog: ${withChangelog}, without: ${withoutChangelog}`);
  return points;
}

// Fallback simulated control points when no changelog
function buildControlPointsSimulated(doneIssues, totalDays) {
  return doneIssues.map((iss, idx) => ({
    key: iss.key,
    summary: iss.summary,
    dayIdx: Math.min(
      totalDays - 1,
      Math.max(0, Math.round(((idx + 1) / (totalDays + 1)) * totalDays + Math.sin(idx) * 1.5))
    ),
    cycleTime: +(2 + Math.abs(Math.sin(idx * 1.9)) * 6 + iss.originalEstimate * 0.15).toFixed(1),
    completionDate: null,
    startDate: null,
  }));
}

function buildCfdFromChangelog(issues, days, elapsed, sprintState) {
  const hasChangelog = issues.some((i) => i.statusChanges && i.statusChanges.length > 0);

  if (!hasChangelog) {
    return buildCfdInterpolated(issues.length, days.length, elapsed, sprintState);
  }

  const totalDays = days.length;
  const cfd = [];

  for (let i = 0; i < totalDays; i++) {
    if (i >= elapsed && sprintState !== 'closed') {
      cfd.push(null);
      continue;
    }

    const dayDate = toLocalDateStr(days[i]);
    const isLastDay = (i === elapsed - 1) || (sprintState === 'closed' && i === totalDays - 1);
    let todo = 0;
    let inprogress = 0;
    let done = 0;

    for (const issue of issues) {
      // For the last visible day, use current status to ensure CFD endpoint matches pie chart
      const statusAtDay = isLastDay
        ? (issue.status || 'todo')
        : getStatusAtDate(issue, dayDate);
      if (statusAtDay === 'done') done++;
      else if (statusAtDay === 'inprogress') inprogress++;
      else todo++;
    }

    cfd.push({ done, inprogress, todo });
  }

  return cfd;
}

function getStatusAtDate(issue, targetDate) {
  if (!issue.statusChanges || issue.statusChanges.length === 0) {
    return issue.status || 'todo';
  }

  // If targetDate is before the first recorded change, use the initial status
  // (the status the issue had when first tracked, typically at creation or sprint entry)
  const firstChange = issue.statusChanges[0];
  if (firstChange && firstChange.date > targetDate) {
    return normalizeStatus(firstChange.toStatus);
  }

  let currentStatus = normalizeStatus(firstChange.toStatus);
  for (const change of issue.statusChanges) {
    if (change.date > targetDate) break;
    currentStatus = normalizeStatus(change.toStatus);
  }
  return currentStatus;
}

function buildCfdInterpolated(totalIssues, totalDays, elapsed, sprintState) {
  const cfd = [];
  for (let i = 0; i < totalDays; i++) {
    if (i >= elapsed && sprintState !== 'closed') {
      cfd.push(null);
      continue;
    }
    const t = elapsed > 0 ? i / elapsed : 0;
    const tt = sprintState === 'closed' ? i / Math.max(1, totalDays - 1) : t;
    const doneCt = sprintState === 'future' ? 0 : Math.round(totalIssues * 0.6 * Math.pow(tt, 1.4));
    const inProgCt = Math.round(totalIssues * 0.25 * Math.sin(tt * Math.PI));
    const doneClamped = Math.min(doneCt, totalIssues);
    const inProgClamped = Math.min(Math.max(0, inProgCt), totalIssues - doneClamped);
    const todoCt = totalIssues - doneClamped - inProgClamped;
    cfd.push({ done: doneClamped, inprogress: inProgClamped, todo: Math.max(0, todoCt) });
  }
  return cfd;
}

// Build burndown (actual remaining) and burnup (completed) from changelog
function buildBurndownBurnupFromChangelog(issues, days, elapsed, sprintState) {
  const totalDays = days.length;
  const actualRemaining = [];
  const completedLine = [];

  // Get current actual remaining for the last day (ensures endpoint matches reality)
  const currentRemaining = issues.reduce((acc, i) => acc + i.remainingEstimate, 0);
  const currentCompleted = issues
    .filter((i) => i.status === 'done')
    .reduce((acc, i) => acc + i.originalEstimate, 0);

  for (let i = 0; i < totalDays; i++) {
    if (i >= elapsed && sprintState !== 'closed') {
      actualRemaining.push(null);
      completedLine.push(null);
      continue;
    }

    const dayDate = toLocalDateStr(days[i]);
    const isLastDay = (i === elapsed - 1) || (sprintState === 'closed' && i === totalDays - 1);

    let remaining = 0;
    let completed = 0;

    for (const issue of issues) {
      const est = issue.originalEstimate || 0;

      if (isLastDay) {
        // Use current status to ensure endpoint matches dashboard stats
        if (issue.status === 'done') {
          completed += est;
        } else {
          remaining += issue.remainingEstimate || est;
        }
      } else {
        // Use historical status from changelog
        const statusAtDay = getStatusAtDate(issue, dayDate);
        if (statusAtDay === 'done') {
          completed += est;
        } else {
          // For non-done issues, use originalEstimate as remaining
          // (we don't have historical remainingEstimate data)
          remaining += est;
        }
      }
    }

    actualRemaining.push(+remaining.toFixed(1));
    completedLine.push(+completed.toFixed(1));
  }

  return { actualRemaining, completedLine };
}

// Fallback simulated burndown/burnup when no changelog
function buildBurndownBurnupSimulated(issues, days, elapsed, sprintState, totalEst, totalDone) {
  const totalDays = days.length;
  const currentRemaining = issues.reduce((acc, i) => acc + i.remainingEstimate, 0);
  const finalCompleted = sprintState === 'closed' ? totalEst : totalDone;

  const actualRemaining = [];
  const completedLine = [];

  for (let i = 0; i < totalDays; i++) {
    if (i >= elapsed && sprintState !== 'closed') {
      actualRemaining.push(null);
      completedLine.push(null);
      continue;
    }

    const t = elapsed > 0 ? i / elapsed : 0;

    // Burndown: smooth curve from totalEst to currentRemaining
    const burnBase = totalEst - (totalEst - currentRemaining) * Math.pow(t, 0.85);
    const burnNoise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 1.4;
    actualRemaining.push(Math.max(0, +(burnBase + burnNoise).toFixed(1)));

    // Burnup: smooth curve from 0 to finalCompleted
    const upBase = finalCompleted * Math.pow(t, 1.15);
    const upNoise = Math.sin(i * 1.3) * 0.8;
    completedLine.push(Math.max(0, +(upBase + upNoise).toFixed(1)));
  }

  return { actualRemaining, completedLine };
}

// Produce per-working-day series consumed by all 4 charts.
// Mirrors the design's data.js generateDailySeries(), but with safer guards
// so it works on real-world sprints (e.g. no completed issues yet).
export function generateDailySeries(sprint, today) {
  const totalEst = sprint.issues.reduce((s, i) => s + i.originalEstimate, 0);
  const totalDone = sprint.issues
    .filter((i) => i.status === 'done')
    .reduce((s, i) => s + i.originalEstimate, 0);

  const days = [];
  const s = new Date(sprint.startDate + 'T00:00:00');
  const e = new Date(sprint.endDate + 'T00:00:00');
  const cur = new Date(s);
  while (cur <= e) {
    if (!isWeekend(cur)) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const totalDays = Math.max(1, days.length);

  const todayDate = new Date(today + 'T00:00:00');
  let elapsed = 0;
  for (const d of days) if (d <= todayDate) elapsed++;
  if (sprint.state === 'closed') elapsed = totalDays;
  if (sprint.state === 'future') elapsed = 0;

  // ideal burndown: linear decrease from totalEst to 0
  const idealLine = days.map(
    (_, i) => +(totalEst * (1 - i / Math.max(1, totalDays - 1))).toFixed(1)
  );

  // Check if we have changelog data
  const hasChangelog = sprint.issues.some((i) => i.statusChanges && i.statusChanges.length > 0);

  // actual remaining & completed: from changelog or simulated
  const { actualRemaining, completedLine } = hasChangelog
    ? buildBurndownBurnupFromChangelog(sprint.issues, days, elapsed, sprint.state)
    : buildBurndownBurnupSimulated(sprint.issues, days, elapsed, sprint.state, totalEst, totalDone);

  // burnup scope: constant (we don't track when issues were added to sprint)
  const scopeLine = days.map(() => totalEst);

  // CFD: counts per status per day from changelog
  const cfd = buildCfdFromChangelog(sprint.issues, days, elapsed, sprint.state);

  // Control chart: per completed issue (from changelog or simulated)
  const controlPoints = buildControlPoints(sprint.issues, days, sprint.startDate);

  return {
    days,
    idealLine,
    actualRemaining,
    scopeLine,
    completedLine,
    cfd,
    controlPoints,
    elapsed,
    totalDays,
  };
}
