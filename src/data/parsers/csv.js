// Parse standard Jira "Export Issues (CSV - current fields)" output.
// Hand-rolled RFC-4180-ish parser: handles quoted fields, escaped quotes, CR/LF.
import { statusCategoryKey } from './status-category.js';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0]));
}

function findCol(headers, candidates) {
  const idxs = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();
    if (candidates.some((c) => h.toLowerCase() === c.toLowerCase())) idxs.push(i);
  }
  return idxs;
}

function firstNonEmpty(row, idxs) {
  for (const i of idxs) {
    if (row[i] && row[i].trim()) return row[i].trim();
  }
  return '';
}

// Jira time fields: numbers = seconds; strings like "1d 2h" need parsing.
function parseSeconds(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  let total = 0;
  for (const part of s.matchAll(/(\d+(?:\.\d+)?)\s*([wdhm])/gi)) {
    const n = Number(part[1]);
    const u = part[2].toLowerCase();
    if (u === 'w') total += n * 5 * 8 * 3600;
    else if (u === 'd') total += n * 8 * 3600;
    else if (u === 'h') total += n * 3600;
    else if (u === 'm') total += n * 60;
  }
  return total;
}

function toHours(seconds) {
  return Math.round((seconds / 3600) * 100) / 100;
}

// Jira CSV may include multiple "Sprint" columns when an issue belongs to
// several sprints over its lifetime — take the last non-empty one.
function lastSprint(row, sprintIdxs) {
  for (let i = sprintIdxs.length - 1; i >= 0; i--) {
    const v = row[sprintIdxs[i]];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

export function parseJiraCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0];

  const keyIdx = findCol(headers, ['Issue key', 'Key'])[0];
  const summaryIdx = findCol(headers, ['Summary'])[0];
  const typeIdx = findCol(headers, ['Issue Type', 'Type'])[0];
  const statusIdx = findCol(headers, ['Status'])[0];
  const statusCatIdx = findCol(headers, ['Status Category', 'Status category'])[0];
  const priorityIdx = findCol(headers, ['Priority'])[0];
  const assigneeIdx = findCol(headers, ['Assignee'])[0];
  const assigneeIdIdxArr = findCol(headers, ['Assignee Id', 'Assignee ID', 'Assignee Account Id']);
  const estIdxs = findCol(headers, ['Σ Original Estimate', 'Original Estimate', 'Original estimate']);
  const spentIdxs = findCol(headers, ['Σ Time Spent', 'Time Spent', 'Time spent']);
  const remIdxs = findCol(headers, ['Σ Remaining Estimate', 'Remaining Estimate', 'Remaining estimate']);
  const sprintIdxs = findCol(headers, ['Sprint']);

  if (keyIdx == null) {
    throw new Error('CSV does not look like a Jira export — missing "Issue key" column.');
  }

  const raws = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[keyIdx]) continue;

    const statusName = statusIdx != null ? row[statusIdx] : '';
    const statusCat = statusCatIdx != null ? row[statusCatIdx] : '';
    const status = statusCat
      ? { name: statusName, statusCategory: { key: statusCategoryKey(statusCat) } }
      : statusName;

    raws.push({
      key: row[keyIdx],
      summary: summaryIdx != null ? row[summaryIdx] : '',
      type: typeIdx != null ? row[typeIdx] : 'Task',
      priority: priorityIdx != null ? row[priorityIdx] : 'Medium',
      status,
      assigneeName: assigneeIdx != null ? row[assigneeIdx] : '',
      assigneeId: firstNonEmpty(row, assigneeIdIdxArr),
      originalEstimate: toHours(parseSeconds(firstNonEmpty(row, estIdxs))),
      timeSpent: toHours(parseSeconds(firstNonEmpty(row, spentIdxs))),
      remainingEstimate: toHours(parseSeconds(firstNonEmpty(row, remIdxs))),
      sprintName: lastSprint(row, sprintIdxs),
    });
  }
  return raws;
}
