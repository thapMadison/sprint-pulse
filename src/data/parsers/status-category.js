// Map a Jira "status category" string (free-form text or category key) into
// the three canonical keys used by domain/status.js: 'new' | 'indeterminate' | 'done'.
export function statusCategoryKey(s) {
  if (!s) return 'new';
  const v = String(s).toLowerCase();
  if (v.includes('done')) return 'done';
  if (v.includes('progress') || v.includes('indeterminate')) return 'indeterminate';
  if (v.includes('todo') || v.includes('to do') || v.includes('open')) return 'new';
  return 'new';
}
