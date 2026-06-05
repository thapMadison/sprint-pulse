// Board-wide status colour assignment.
//
// PALETTES define the colour banks per category. Colours within each bank are
// ordered for maximum contrast — alternate light/dark so adjacent segments in
// the donut ring stay distinguishable even at small sizes.
//
// buildStatusColorMap  — called once per board load with the full Jira status
//   list; returns a stable name→colour map (alphabetical within category so
//   "Ready for Testing" always gets the same slot regardless of which sprint
//   it first appears in).
//
// resolveStatusColors  — per-render helper used by renderStatusCard and
//   donutCard; aggregates counts/hours from a list of issues, looks up colours
//   from the board map (or falls back to the local palette for demo/file mode),
//   and returns the sorted slice array that renderDonut expects.

const CATEGORY_BY_KEY = { new: 'todo', indeterminate: 'inprogress', done: 'done' };

const CAT_ORDER = { done: 0, inprogress: 1, todo: 2 };

export const PALETTES = {
  // 5 greens — chroma 0.22→0.27, hue 113→158, lightness swings ~0.85 ↔ ~0.50
  done: [
    'oklch(0.85 0.26 132)',
    'oklch(0.50 0.22 152)',
    'oklch(0.75 0.23 113)',
    'oklch(0.40 0.18 158)',
    'oklch(0.65 0.25 140)',
  ],
  // 10 warm tones — chroma 0.19→0.27, hue 90→5, lightness swings ~0.87 ↔ ~0.50
  inprogress: [
    'oklch(0.87 0.19 90)',
    'oklch(0.53 0.25 76)',
    'oklch(0.83 0.22 65)',
    'oklch(0.51 0.27 53)',
    'oklch(0.79 0.23 44)',
    'oklch(0.50 0.25 35)',
    'oklch(0.76 0.22 27)',
    'oklch(0.48 0.23 18)',
    'oklch(0.73 0.20 11)',
    'oklch(0.46 0.19 5)',
  ],
  // 3 greys — wider lightness spread for clear separation
  todo: [
    'oklch(0.62 0.02 270)',
    'oklch(0.45 0.02 270)',
    'oklch(0.28 0.01 270)',
  ],
};

// Derive a colour map directly from an issues array (no API needed).
// Used as a fallback when the board-level /statuses endpoint is unavailable —
// collects unique statusName+category pairs from issues, then delegates to
// buildStatusColorMap so the alphabetical ordering is identical.
const CAT_TO_KEY = { done: 'done', inprogress: 'indeterminate', todo: 'new' };
export function buildColorMapFromIssues(issues) {
  const seen = new Map();
  for (const iss of issues) {
    const name = iss.statusName || iss.status;
    if (!seen.has(name)) seen.set(name, { name, categoryKey: CAT_TO_KEY[iss.status] || 'new' });
  }
  return buildStatusColorMap([...seen.values()]);
}

// Build a name→colour map for an entire board's workflow.
// statuses: [{ name, categoryKey }] from /rest/api/3/status via the worker.
// Names are sorted alphabetically within each category so the assignment is
// deterministic regardless of the order Jira returns them.
export function buildStatusColorMap(statuses) {
  const groups = { done: [], inprogress: [], todo: [] };
  for (const { name, categoryKey } of statuses) {
    const cat = CATEGORY_BY_KEY[categoryKey] || 'todo';
    if (!groups[cat].includes(name)) groups[cat].push(name);
  }
  const map = {};
  for (const cat of ['done', 'inprogress', 'todo']) {
    const palette = PALETTES[cat];
    groups[cat].sort();
    groups[cat].forEach((name, i) => {
      map[name] = palette[Math.min(i, palette.length - 1)];
    });
  }
  return map;
}

// Return the board-level statusColorMap if populated, otherwise derive a
// sprint/epic-local map from the provided issues using the same alphabetical
// logic so all components (chip, hbar, donut) show the same colour for a
// given statusName within a single render context.
export function effectiveColorMap(statusColorMap, issues) {
  if (statusColorMap && Object.keys(statusColorMap).length > 0) return statusColorMap;
  const map = {};
  resolveStatusColors(issues || [], {}).forEach(({ label, color }) => { map[label] = color; });
  return map;
}

// Aggregate issues into donut slices with stable, consistent colours.
// statusColorMap: board-wide map from buildStatusColorMap, or {} for demo/file.
// Returns [{ label, color, count, hours }] sorted done→inprogress→todo then
// alphabetically by name — same order used when building the colour map, so
// colours are consistent even in fallback (local palette) mode.
export function resolveStatusColors(issues, statusColorMap = {}) {
  const byStatus = new Map();
  for (const i of issues) {
    const name = i.statusName || i.status;
    if (!byStatus.has(name)) byStatus.set(name, { category: i.status, count: 0, hours: 0 });
    const e = byStatus.get(name);
    e.count++;
    e.hours += i.originalEstimate || 0;
  }

  // Sort: category order, then name alphabetically (matches buildStatusColorMap sort)
  const sorted = [...byStatus.entries()].sort(([nameA, a], [nameB, b]) => {
    const ci = CAT_ORDER[a.category] - CAT_ORDER[b.category];
    return ci !== 0 ? ci : nameA.localeCompare(nameB);
  });

  // Assign colours from board map; fall back to local palette per-category
  const catUsed = { done: 0, inprogress: 0, todo: 0 };
  return sorted.map(([name, { category, count, hours }]) => {
    let color = statusColorMap[name];
    if (!color) {
      const palette = PALETTES[category] || PALETTES.todo;
      color = palette[Math.min(catUsed[category], palette.length - 1)];
      catUsed[category]++;
    }
    return { label: name, color, count, hours };
  });
}
