// Parse JSON exports. Two supported shapes:
//   (a) An array of "raw issue" records already shaped like our internal type.
//   (b) Jira REST search response: { issues: [...] } with .fields.*
function toHours(s) {
  return Math.round(((Number(s) || 0) / 3600) * 100) / 100;
}

export function parseJiraJSON(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.issues)) return data.issues.map(toRawIssue);
  throw new Error('JSON shape not recognized (expected array of issues or { issues: [...] }).');
}

function toRawIssue(iss) {
  const f = iss.fields || {};
  const tt = f.timetracking || {};
  const assignee = f.assignee || {};
  const sprintField =
    (f.sprint && f.sprint.name) ||
    (Array.isArray(f.customfield_10020) && f.customfield_10020[0] && f.customfield_10020[0].name) ||
    '';
  const sprintObj =
    (f.sprint && f.sprint) ||
    (Array.isArray(f.customfield_10020) && f.customfield_10020[0]) ||
    {};
  const epicKey =
    (f.parent && f.parent.key) ||
    f.customfield_10014 ||
    null;
  const epicName =
    (f.parent && f.parent.fields && f.parent.fields.summary) ||
    null;
  return {
    key: iss.key,
    summary: f.summary || '',
    type: (f.issuetype && f.issuetype.name) || 'Task',
    priority: (f.priority && f.priority.name) || 'Medium',
    status: f.status || { name: 'To Do', statusCategory: { key: 'new' } },
    assigneeName: assignee.displayName || 'Unassigned',
    assigneeId: assignee.accountId || '',
    originalEstimate: toHours(tt.originalEstimateSeconds),
    timeSpent: toHours(tt.timeSpentSeconds),
    remainingEstimate: toHours(tt.remainingEstimateSeconds),
    sprintName: sprintField,
    sprintStartDate: sprintObj.startDate ? sprintObj.startDate.slice(0, 10) : null,
    sprintEndDate: sprintObj.endDate ? sprintObj.endDate.slice(0, 10) : null,
    sprintState: (sprintObj.state || '').toLowerCase() || null,
    sprintGoal: sprintObj.goal || '',
    epicKey,
    epicName,
  };
}
