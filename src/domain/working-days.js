export function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function workingDaysBetween(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  let n = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (!isWeekend(cur)) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export function workingDaysRemaining(endStr, todayStr) {
  const today = new Date(todayStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  if (today > e) return 0;
  let n = 0;
  const cur = new Date(today);
  while (cur <= e) {
    if (!isWeekend(cur)) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export function listWorkingDays(startStr, endStr) {
  const days = [];
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  const cur = new Date(s);
  while (cur <= e) {
    if (!isWeekend(cur)) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
