import { isWeekend } from './working-days.js';

// Produce per-working-day series consumed by all 4 charts.
// Mirrors the design's data.js generateDailySeries(), but with safer guards
// so it works on real-world sprints (e.g. no completed issues yet).
export function generateDailySeries(sprint, today) {
  const totalEst = sprint.issues.reduce((s, i) => s + i.originalEstimate, 0);
  const totalDone = sprint.issues
    .filter((i) => i.status === 'done')
    .reduce((s, i) => s + i.originalEstimate, 0);
  const totalInProg = sprint.issues
    .filter((i) => i.status === 'inprogress')
    .reduce((s, i) => s + i.originalEstimate, 0);
  const totalTodo = sprint.issues
    .filter((i) => i.status === 'todo')
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

  // ideal burndown
  const idealLine = days.map(
    (_, i) => +(totalEst * (1 - i / Math.max(1, totalDays - 1))).toFixed(1)
  );

  // actual remaining: smooth interp from totalEst → currentRemaining + noise
  const currentRemaining = sprint.issues.reduce(
    (acc, i) => acc + i.remainingEstimate,
    0
  );
  const actualRemaining = [];
  for (let i = 0; i < totalDays; i++) {
    if (i > elapsed) {
      actualRemaining.push(null);
      continue;
    }
    const t = elapsed > 0 ? i / elapsed : 0;
    const base = totalEst - (totalEst - currentRemaining) * Math.pow(t, 0.85);
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 1.4;
    actualRemaining.push(Math.max(0, +(base + noise).toFixed(1)));
  }

  // burnup
  const scopeLine = days.map((_, i) => {
    if (sprint.state === 'active' && i > totalDays * 0.4) return totalEst + 4;
    return totalEst;
  });
  const finalCompleted =
    totalDone +
    (sprint.state === 'closed' ? totalInProg + totalTodo : 0);
  const completedLine = [];
  for (let i = 0; i < totalDays; i++) {
    if (i > elapsed) {
      completedLine.push(null);
      continue;
    }
    const t = elapsed > 0 ? i / elapsed : 0;
    const base = finalCompleted * Math.pow(t, 1.15);
    const noise = Math.sin(i * 1.3) * 0.8;
    completedLine.push(Math.max(0, +(base + noise).toFixed(1)));
  }

  // CFD: counts per status per day (cumulative-ish)
  const totalIssues = sprint.issues.length;
  const cfd = [];
  for (let i = 0; i < totalDays; i++) {
    if (i > elapsed && sprint.state !== 'closed') {
      cfd.push(null);
      continue;
    }
    const t = elapsed > 0 ? i / elapsed : 0;
    const tt = sprint.state === 'closed' ? i / Math.max(1, totalDays - 1) : t;
    const doneCt =
      sprint.state === 'future'
        ? 0
        : Math.round(totalIssues * 0.6 * Math.pow(tt, 1.4));
    const inProgCt = Math.round(totalIssues * 0.25 * Math.sin(tt * Math.PI));
    const doneClamped = Math.min(doneCt, totalIssues);
    const inProgClamped = Math.min(
      Math.max(0, inProgCt),
      totalIssues - doneClamped
    );
    const todoCt = totalIssues - doneClamped - inProgClamped;
    cfd.push({
      done: doneClamped,
      inprogress: inProgClamped,
      todo: Math.max(0, todoCt),
    });
  }

  // Control chart: per completed issue
  const controlPoints = sprint.issues
    .filter((i) => i.status === 'done')
    .map((iss, idx) => ({
      key: iss.key,
      dayIdx: Math.min(
        totalDays - 1,
        Math.max(
          0,
          Math.round(
            ((idx + 1) / (totalDays + 1)) * totalDays + Math.sin(idx) * 1.5
          )
        )
      ),
      cycleTime: +(
        2 +
        Math.abs(Math.sin(idx * 1.9)) * 6 +
        iss.originalEstimate * 0.15
      ).toFixed(1),
    }));

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
