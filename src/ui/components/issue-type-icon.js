import { svg } from '../../charts/svg.js';
import { el } from '../dom.js';
import { t } from '../../app/i18n.js';

// Shared issue-type iconography, used consistently across the whole app
// (workload table, epic tasks table, roadmap, task detail panel).
//
// Each type maps to a normalized key with a colour token and a Lucide-style
// glyph drawn inside a rounded square — echoing Jira's coloured type marks
// (Epic = purple, Story = green, Task = blue, Bug = red, Sub-task = cyan)
// without copying its exact assets.

const TYPE_DEFS = {
  epic:    { labelKey: 'issueType.epic',    color: '#8b5cf6' },
  story:   { labelKey: 'issueType.story',   color: '#22c55e' },
  task:    { labelKey: 'issueType.task',    color: '#3b82f6' },
  bug:     { labelKey: 'issueType.bug',     color: '#ef4444' },
  subtask: { labelKey: 'issueType.subtask', color: '#06b6d4' },
};

// Map a raw Jira issuetype name to one of our known keys.
export function normalizeIssueType(raw) {
  const n = (raw || '').toLowerCase().trim();
  if (!n) return 'task';
  if (n.includes('epic')) return 'epic';
  if (n.includes('story')) return 'story';
  if (n.includes('bug') || n.includes('defect') || n.includes('incident')) return 'bug';
  if (n.includes('sub') && n.includes('task')) return 'subtask';
  return 'task';
}

export function issueTypeLabel(raw) {
  const def = TYPE_DEFS[normalizeIssueType(raw)];
  return def ? t(def.labelKey) : (raw || t('issueType.task'));
}

export function issueTypeColor(raw) {
  return TYPE_DEFS[normalizeIssueType(raw)]?.color || TYPE_DEFS.task.color;
}

// Inner glyph per type (white stroke/fill on the coloured tile).
function glyph(typeKey) {
  const common = {
    width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'white', 'stroke-width': 2.4,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  };
  switch (typeKey) {
    case 'epic':
      // lightning bolt
      return svg('svg', common, [svg('path', { d: 'M13 2 4 14h7l-1 8 9-12h-7z', fill: 'white', stroke: 'none' })]);
    case 'story':
      // bookmark
      return svg('svg', common, [svg('path', { d: 'M6 4h12v16l-6-4-6 4z' })]);
    case 'bug':
      // bug body + legs
      return svg('svg', { ...common, 'stroke-width': 2 }, [
        svg('rect', { x: 8, y: 7, width: 8, height: 11, rx: 4 }),
        svg('path', { d: 'M12 7V4M5 10h3M5 15h3M16 10h3M16 15h3' }),
      ]);
    case 'subtask':
      // nested squares
      return svg('svg', common, [
        svg('rect', { x: 4, y: 4, width: 9, height: 9, rx: 1.5 }),
        svg('path', { d: 'M13 13h7v7h-7z', fill: 'white', stroke: 'none' }),
      ]);
    case 'task':
    default:
      // checkmark
      return svg('svg', common, [svg('path', { d: 'M5 12.5 10 17l9-10' })]);
  }
}

// A small coloured tile with the type glyph. Pass `title` to show a tooltip.
export function issueTypeIcon(rawType, { size = 18, withTitle = true } = {}) {
  const typeKey = normalizeIssueType(rawType);
  const def = TYPE_DEFS[typeKey];
  return el('span', {
    class: `issue-type-icon type-${typeKey}`,
    style: {
      background: def.color,
      width: `${size}px`,
      height: `${size}px`,
    },
    ...(withTitle ? { title: t(def.labelKey) } : {}),
  }, [glyph(typeKey)]);
}

// Icon + label, for places that want both (e.g. detail panel meta field).
export function issueTypeBadge(rawType) {
  return el('span', { class: 'issue-type-badge' }, [
    issueTypeIcon(rawType, { withTitle: false }),
    el('span', {}, [issueTypeLabel(rawType)]),
  ]);
}
