import { el } from '../dom.js';
import { statusLabel } from '../format.js';
import { normalizeStatus, extractStatusName } from '../../domain/status.js';
import { issueTypeIcon, issueTypeBadge } from './issue-type-icon.js';
import { fetchTaskDetail } from '../../app/actions.js';

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d.length <= 10 ? d + 'T00:00:00' : d);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return fmtDate(d);
  const date = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function hours(h) {
  return `${(Number(h) || 0).toFixed(1)}h`;
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// One labelled meta field (label above value). Returns { field, valueEl } so
// callers can replace the skeleton with real data without touching the layout.
// Options:
//   wide:   spans all columns (Components)
//   span2:  spans 2 columns (Epic — fills cols 3-4 of row 1)
//   span3:  spans 3 columns (Labels — fills cols 2-4 of row 3)
//   newRow: forces grid-column-start:1 (Assignee — always begins row 2)
function metaField(label, valueNode, { wide = false, span2 = false, span3 = false, newRow = false } = {}) {
  const valueEl = el('div', { class: 'task-detail-field-value' }, [valueNode]);
  let cls = 'task-detail-field';
  if (wide)   cls += ' task-detail-field--wide';
  if (span2)  cls += ' task-detail-field--span2';
  if (span3)  cls += ' task-detail-field--span3';
  if (newRow) cls += ' task-detail-field--new-row';
  const field = el('div', { class: cls }, [
    el('div', { class: 'task-detail-field-label' }, [label]),
    valueEl,
  ]);
  return { field, valueEl };
}

// Shimmer placeholder while lazy data is in flight.
function fieldSkeleton() {
  return el('span', { class: 'task-detail-skeleton' });
}

// Avatar + name chip.
function userCell(name, color) {
  return el('div', { class: 'user-cell-mini' }, [
    el('div', {
      class: 'avatar-mini',
      style: { background: color, color: 'oklch(0.2 0.02 270)' },
    }, [initialsOf(name)]),
    el('span', {}, [name || 'Unknown']),
  ]);
}

// Epic reference with the purple epic icon (consistent with issue-type iconography).
function epicBadge(issue) {
  const text = issue.epicName
    ? `${issue.epicKey || ''} ${issue.epicName}`.trim()
    : (issue.epicKey || '—');
  return el('span', { class: 'issue-type-badge epic-ref-badge' }, [
    issueTypeIcon('epic', { withTitle: false, size: 16 }),
    el('span', {}, [text]),
  ]);
}

// Effort stats in stat-tile card style (matching the sprint hero's stat-grid).
function effortTiles(iss) {
  const totalEst = Number(iss.originalEstimate) || 0;
  const spent    = Number(iss.timeSpent)        || 0;
  const remaining = Number(iss.remainingEstimate) || 0;

  const spentPct  = Math.min(1, spent     / Math.max(totalEst, 1));
  const remainPct = Math.min(1, remaining / Math.max(totalEst, 1));

  function statBar(bg, scale) {
    return el('div', { class: 'stat-bar' }, [
      el('span', { style: { background: bg, transform: `scaleX(${scale})` } }),
    ]);
  }

  return el('div', { class: 'task-effort-grid' }, [
    el('div', { class: 'card stat-tile' }, [
      el('div', { class: 'stat-label' }, ['Original Estimate']),
      el('div', {}, [
        el('div', { class: 'stat-value' }, [totalEst.toFixed(1), el('span', { class: 'unit' }, ['h'])]),
        statBar('linear-gradient(90deg, var(--violet), var(--cyan))', 1),
      ]),
    ]),
    el('div', { class: 'card stat-tile' }, [
      el('div', { class: 'stat-label' }, ['Time Spent']),
      el('div', {}, [
        el('div', { class: 'stat-value-row' }, [
          el('div', { class: 'stat-value' }, [spent.toFixed(1), el('span', { class: 'unit' }, ['h'])]),
          el('span', { class: 'stat-pct' }, [`${(spentPct * 100).toFixed(0)}% of est.`]),
        ]),
        statBar('linear-gradient(90deg, var(--lime), var(--cyan))', spentPct),
      ]),
    ]),
    el('div', { class: 'card stat-tile' }, [
      el('div', { class: 'stat-label' }, ['Remaining Effort']),
      el('div', {}, [
        el('div', { class: 'stat-value' }, [remaining.toFixed(1), el('span', { class: 'unit' }, ['h'])]),
        statBar('linear-gradient(90deg, var(--coral), var(--amber))', remainPct),
      ]),
    ]),
  ]);
}

// Vertical status-change timeline (always available from sprint data, no lazy fetch).
function statusTimeline(iss) {
  const changes = iss.statusChanges || [];
  if (!changes.length) {
    return el('p', { class: 'task-detail-empty' }, ['No status history available.']);
  }

  return el('div', { class: 'task-timeline' },
    changes.map((ch) => {
      const cat = normalizeStatus(ch.toStatus);
      const name = extractStatusName(ch.toStatus) || cat;
      return el('div', { class: 'task-timeline-item' }, [
        el('span', { class: `task-timeline-dot ${cat}` }),
        el('div', { class: 'task-timeline-content' }, [
          el('span', { class: `status-chip ${cat}` }, [
            el('span', { class: 'sdot' }),
            name,
          ]),
          el('span', { class: 'task-timeline-date' }, [fmtDate(ch.date)]),
        ]),
      ]);
    })
  );
}

// Multi-paragraph plain text → DOM paragraphs.
function textBlock(text) {
  const parts = String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return el('div', { class: 'task-detail-text' },
    parts.map((p) =>
      el('p', {}, p.split('\n').reduce((acc, line, i) => {
        if (i > 0) acc.push(el('br', {}));
        acc.push(line);
        return acc;
      }, []))
    )
  );
}

function labelChips(labels) {
  return el('div', { class: 'task-detail-chips' },
    labels.map((l) => el('span', { class: 'task-label-chip' }, [l]))
  );
}

function commentList(comments) {
  return el('div', { class: 'task-comments' },
    comments.map((c) => el('div', { class: 'task-comment' }, [
      el('div', { class: 'task-comment-head' }, [
        el('div', {
          class: 'avatar-mini',
          style: { background: 'var(--violet)', color: 'oklch(0.2 0.02 270)' },
        }, [initialsOf(c.authorName)]),
        el('span', { class: 'task-comment-author' }, [c.authorName || 'Unknown']),
        el('span', { class: 'task-comment-date' }, [fmtDateTime(c.created)]),
      ]),
      textBlock(c.body || ''),
    ]))
  );
}

function loadingLine(text) {
  return el('div', { class: 'task-detail-loading' }, [
    el('span', { class: 'spinner-mini' }),
    el('span', {}, [text]),
  ]);
}

export function renderTaskDetailPanel({ issue, onClose }) {
  if (!issue) return null;

  const backdrop = el('div', { class: 'epic-detail-backdrop', onClick: onClose });

  const closeBtn = el('button', {
    class: 'epic-detail-close',
    type: 'button',
    'aria-label': 'Close task details',
    onClick: onClose,
  }, ['×']);

  const assignee = issue.assignee || { color: 'var(--ink-3)', initials: '?', name: 'Unassigned' };

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = el('div', { class: 'task-detail-header' }, [
    el('div', { class: 'task-detail-head-row' }, [
      el('span', { class: 'issue-key-cell' }, [
        issueTypeIcon(issue.type, { size: 18 }),
        el('span', { class: 'task-detail-key' }, [issue.key]),
      ]),
      el('span', { class: `status-chip ${issue.status}` }, [
        el('span', { class: 'sdot' }),
        statusLabel(issue),
      ]),
    ]),
    el('h2', { class: 'task-detail-title' }, [issue.summary]),
  ]);

  // ── Details card (meta + effort) ────────────────────────────────────────────
  // All meta fields are rendered immediately; reporter/dates show skeletons
  // until the lazy fetch resolves — no layout shift, just in-place substitution.
  const assigneeCell = userCell(assignee.name, assignee.color);
  assigneeCell.querySelector('.avatar-mini').textContent = assignee.initials;

  const reporterSlot = metaField('Reporter', fieldSkeleton());
  const createdSlot  = metaField('Created',  fieldSkeleton());
  const updatedSlot  = metaField('Updated',  fieldSkeleton());
  // Due and Labels are always visible; their values are filled by the lazy fetch.
  const dueSlot    = metaField('Due',    fieldSkeleton());
  const labelsSlot = metaField('Labels', fieldSkeleton(), { span3: true });

  // Row 1: Type | Priority | Epic(span2, always shown)
  // Row 2: Assignee(newRow) | Reporter | Created | Updated
  // Row 3: Due | Labels(span3)
  const epicValue = (issue.epicKey || issue.epicName) ? epicBadge(issue) : '—';
  const metaFields = [
    metaField('Type',     issueTypeBadge(issue.type)),
    metaField('Priority', el('span', { class: `task-priority ${(issue.priority || '').toLowerCase()}` }, [issue.priority || '—'])),
    metaField('Epic',     epicValue, { span2: true }),
    metaField('Assignee', assigneeCell, { newRow: true }),
    reporterSlot,
    createdSlot,
    updatedSlot,
    dueSlot,
    labelsSlot,
  ];
  const metaGrid = el('div', { class: 'task-detail-meta' }, metaFields.map((f) => f.field));

  // Info card: Details (left) + Effort (right) in a 2-column layout.
  const infoCard = el('div', { class: 'task-detail-info-card' }, [
    el('div', { class: 'task-detail-info-left' }, [
      el('div', { class: 'task-detail-section' }, [
        el('h3', { class: 'task-detail-section-title' }, ['Details']),
        metaGrid,
      ]),
    ]),
    el('div', { class: 'task-detail-info-right' }, [
      el('div', { class: 'task-detail-section' }, [
        el('h3', { class: 'task-detail-section-title' }, ['Effort']),
        effortTiles(issue),
      ]),
    ]),
  ]);

  // ── Description (lazy, optional — removed when absent) ─────────────────────
  const descBody = el('div', {}, [loadingLine('Loading description…')]);
  const descSection = el('div', { class: 'task-detail-section' }, [
    el('h3', { class: 'task-detail-section-title' }, ['Description']),
    descBody,
  ]);

  // ── Activity row: Comments (left) + History (right) ─────────────────────────
  // History comes from sprint data so it's always present without a lazy fetch.
  // Comments are lazily filled; the section header updates with the count.
  const commentsTitleEl = el('h3', { class: 'task-detail-section-title' }, ['Comments']);
  const commentsBody = el('div', {}, [loadingLine('Loading comments…')]);

  const activitySection = el('div', { class: 'task-detail-activity' }, [
    el('div', { class: 'task-detail-comments-col' }, [commentsTitleEl, commentsBody]),
    el('div', { class: 'task-detail-history-col' }, [
      el('h3', { class: 'task-detail-section-title' }, ['History']),
      statusTimeline(issue),
    ]),
  ]);

  // ── Panel body ──────────────────────────────────────────────────────────────
  const body = el('div', { class: 'epic-detail-body task-detail-body' }, [
    header,
    infoCard,
    descSection,
    activitySection,
  ]);

  const panel = el('aside', {
    class: 'epic-detail-panel task-detail-panel',
    role: 'dialog',
    'aria-label': `Details for ${issue.key}`,
  }, [closeBtn, body]);

  panel.addEventListener('click', (e) => e.stopPropagation());

  const onKey = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKey);
  setTimeout(() => {
    if (!document.body.contains(panel)) document.removeEventListener('keydown', onKey);
  }, 50);

  // ── Lazy fetch ──────────────────────────────────────────────────────────────
  // API source only — demo/file return null, in which case we settle the
  // skeleton slots to dashes and show an appropriate empty state for comments.
  fetchTaskDetail(issue.key)
    .then((detail) => {
      if (!document.body.contains(panel)) return;

      if (!detail) {
        reporterSlot.valueEl.replaceChildren('—');
        createdSlot.valueEl.replaceChildren('—');
        updatedSlot.valueEl.replaceChildren('—');
        dueSlot.valueEl.replaceChildren('—');
        labelsSlot.valueEl.replaceChildren('—');
        descSection.remove();
        commentsBody.replaceChildren(
          el('p', { class: 'task-detail-empty' }, ['Comments not available for this source.'])
        );
        return;
      }

      // Skeleton slots → real values.
      reporterSlot.valueEl.replaceChildren(
        detail.reporterName ? userCell(detail.reporterName, 'var(--cyan)') : '—'
      );
      createdSlot.valueEl.replaceChildren(detail.created ? fmtDateTime(detail.created) : '—');
      updatedSlot.valueEl.replaceChildren(detail.updated ? fmtDateTime(detail.updated) : '—');
      dueSlot.valueEl.replaceChildren(detail.dueDate ? fmtDate(detail.dueDate) : '—');
      labelsSlot.valueEl.replaceChildren(
        (detail.labels && detail.labels.length) ? labelChips(detail.labels) : '—'
      );

      // Optional: Components (only appended when present).
      if (detail.components && detail.components.length) {
        metaGrid.appendChild(metaField('Components', el('span', {}, [detail.components.join(', ')]), { wide: true }).field);
      }

      // Description.
      if (detail.description && detail.description.trim()) {
        descBody.replaceChildren(textBlock(detail.description));
      } else {
        descSection.remove();
      }

      // Comments.
      if (detail.comments && detail.comments.length) {
        commentsTitleEl.textContent = `Comments (${detail.comments.length})`;
        commentsBody.replaceChildren(commentList(detail.comments));
      } else {
        commentsBody.replaceChildren(
          el('p', { class: 'task-detail-empty' }, ['No comments on this task.'])
        );
      }
    })
    .catch(() => {
      if (!document.body.contains(panel)) return;
      reporterSlot.valueEl.replaceChildren('—');
      createdSlot.valueEl.replaceChildren('—');
      updatedSlot.valueEl.replaceChildren('—');
      dueSlot.valueEl.replaceChildren('—');
      labelsSlot.valueEl.replaceChildren('—');
      descBody.replaceChildren(
        el('p', { class: 'task-detail-empty' }, ['Could not load extended details.'])
      );
      commentsBody.replaceChildren(
        el('p', { class: 'task-detail-empty' }, ['Could not load comments.'])
      );
    });

  return el('div', { class: 'epic-detail-overlay' }, [backdrop, panel]);
}
