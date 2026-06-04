// Small formatting helpers shared across UI components.

import { t } from '../app/i18n.js';
import { el } from './dom.js';

// A link to an issue/epic in Jira ("<base>/browse/<KEY>"), opened in a new tab.
// Centralizes the `target`/`rel`/href shape that was copy-pasted across the
// workload table, epic tasks table, heroes, roadmap and task panel.
//   class:     the anchor's className (call sites use different ones)
//   children:  custom inner nodes; defaults to the key text
//   stopClick: swallow the click so it doesn't also trigger a row/panel handler
export function jiraLink({ jiraUrl, key, class: cls, children, stopClick = false }) {
  const attrs = { href: `${jiraUrl}/browse/${key}`, target: '_blank', rel: 'noopener noreferrer', class: cls };
  if (stopClick) attrs.onClick = (e) => e.stopPropagation();
  return el('a', attrs, children || [key]);
}

const STATUS_KEY = { inprogress: 'status.inprogress', todo: 'status.todo', done: 'status.done' };

// Short status label for an issue/task chip, preferring the raw Jira status name.
export function statusLabel(issue) {
  return issue.statusName || (STATUS_KEY[issue.status] ? t(STATUS_KEY[issue.status]) : t('status.done'));
}

// Drop a sprint name's descriptive suffix:
//   "Sprint 24 — Atlas Release" → "Sprint 24"
export function shortSprintName(name) {
  return (name || '').split(' — ')[0] || name || '';
}

const pad2 = (n) => String(n).padStart(2, '0');

// Parse a date string that may be date-only ("2025-06-05") or a full timestamp.
// Date-only strings are pinned to local midnight so the day doesn't drift by TZ.
function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// "05/06/2025"
export function fmtDateSlash(d) {
  const dt = parseDate(d);
  if (!dt) return '—';
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

// "05/06" — day/month without the year, for compact table cells.
export function fmtDateShort(d) {
  const dt = parseDate(d);
  if (!dt) return '—';
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}`;
}

// "05/06/2025 14:30"
export function fmtDateTime(d) {
  const dt = parseDate(d);
  if (!dt) return '—';
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

// Up-to-two-letter initials from a display name ("Jane Doe" → "JD").
export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Relative "time ago" label for the refresh FAB ("3 mins ago").
export function timeAgo(date, now = Date.now()) {
  if (!date) return '';
  const mins = Math.floor((now - date.getTime()) / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  return t('time.hourAgo', { count: hours });
}
