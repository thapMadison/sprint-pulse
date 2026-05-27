// Parse Jira "RSS / XML" issue export.
// Time fields usually appear as numeric "seconds" attributes — prefer those.
import { statusCategoryKey } from './status-category.js';

function text(el, tag) {
  if (!el) return '';
  const n = el.getElementsByTagName(tag)[0];
  return n ? (n.textContent || '').trim() : '';
}

function attr(el, tag, name) {
  if (!el) return '';
  const n = el.getElementsByTagName(tag)[0];
  return n ? n.getAttribute(name) || '' : '';
}

function findCustomField(item, fieldName) {
  const customs = item.getElementsByTagName('customfield');
  for (const cf of customs) {
    const nm = cf.getElementsByTagName('customfieldname')[0];
    if (nm && nm.textContent.trim().toLowerCase() === fieldName.toLowerCase()) {
      const values = cf.getElementsByTagName('customfieldvalue');
      if (!values.length) return '';
      return Array.from(values)
        .map((v) => (v.textContent || '').trim())
        .filter(Boolean);
    }
  }
  return '';
}

function toHours(seconds) {
  const n = Number(seconds || 0);
  return Math.round((n / 3600) * 100) / 100;
}

export function parseJiraXML(text_) {
  const doc = new DOMParser().parseFromString(text_, 'application/xml');
  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) {
    throw new Error('Invalid XML: ' + parseErr.textContent.slice(0, 200));
  }
  const items = doc.getElementsByTagName('item');
  if (!items.length) {
    throw new Error('XML does not look like a Jira export — no <item> elements found.');
  }

  const raws = [];
  for (const item of items) {
    const key = text(item, 'key');
    if (!key) continue;

    const assigneeNode = item.getElementsByTagName('assignee')[0];
    const assigneeName = assigneeNode ? (assigneeNode.textContent || '').trim() : '';
    const assigneeId = assigneeNode
      ? assigneeNode.getAttribute('accountid') ||
        assigneeNode.getAttribute('username') ||
        ''
      : '';

    const statusName = text(item, 'status');
    const statusEl = item.getElementsByTagName('status')[0];
    const statusCat =
      statusEl &&
      (statusEl.getAttribute('statusCategory') ||
        statusEl.getAttribute('iconUrl') ||
        '');

    const origSec = attr(item, 'timeoriginalestimate', 'seconds') || attr(item, 'timeoriginalestimate', 'value') || '';
    const spentSec = attr(item, 'timespent', 'seconds') || attr(item, 'timespent', 'value') || '';
    const remSec = attr(item, 'timeestimate', 'seconds') || attr(item, 'timeestimate', 'value') || '';

    const sprintVals = findCustomField(item, 'Sprint');
    const sprintInfo = parseSprintBlob(
      Array.isArray(sprintVals) ? sprintVals[sprintVals.length - 1] : sprintVals
    );

    raws.push({
      key,
      summary: text(item, 'summary'),
      type: text(item, 'type') || 'Task',
      priority: text(item, 'priority') || 'Medium',
      status: { name: statusName, statusCategory: { key: statusCategoryKey(statusCat || statusName) } },
      assigneeName,
      assigneeId,
      originalEstimate: toHours(origSec),
      timeSpent: toHours(spentSec),
      remainingEstimate: toHours(remSec),
      sprintName: sprintInfo.name,
      sprintStartDate: sprintInfo.startDate,
      sprintEndDate: sprintInfo.endDate,
      sprintState: sprintInfo.state,
      sprintGoal: sprintInfo.goal,
    });
  }
  return raws;
}

// Greenhopper blob:
//   com.atlassian.greenhopper.service.sprint.Sprint@1a2b[id=42,...,state=ACTIVE,name=Sprint 24,
//   startDate=...,endDate=...,completeDate=<null>,goal=Ship beta]
function parseSprintBlob(v) {
  if (!v) return { name: '', startDate: null, endDate: null, state: null, goal: '' };
  const out = { name: v.trim(), startDate: null, endDate: null, state: null, goal: '' };
  const grab = (key) => {
    const m = v.match(new RegExp(`${key}=([^,\\]]*)`));
    return m && m[1] !== '<null>' ? m[1].trim() : '';
  };
  const name = grab('name');
  const start = grab('startDate');
  const end = grab('endDate');
  const state = grab('state');
  const goal = grab('goal');
  if (name) out.name = name;
  if (start) out.startDate = start.slice(0, 10);
  if (end) out.endDate = end.slice(0, 10);
  if (state) out.state = state.toLowerCase();
  if (goal) out.goal = goal;
  return out;
}
