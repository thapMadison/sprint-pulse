// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The panel lazily fetches extended detail via fetchTaskDetail(). Mock the whole
// actions module so every async branch is controllable and the firebase/network
// import chain is never pulled in. vi.hoisted guarantees the spy exists before
// the (hoisted) vi.mock factory and before the static import below run.
const { fetchTaskDetail } = vi.hoisted(() => ({ fetchTaskDetail: vi.fn() }));
vi.mock('../../src/app/actions.js', () => ({ fetchTaskDetail }));

import { renderTaskDetailPanel } from '../../src/ui/components/task-detail-panel.js';
import { DEMO_SPRINTS } from '../../src/data/demo.js';

const sampleIssue = DEMO_SPRINTS.find((s) => s.state === 'active').issues[0];

// Mount the overlay into <body> so the panel's `document.body.contains(panel)`
// guard passes and the lazy .then/.catch actually applies its updates.
function mount(issue = sampleIssue, onClose = () => {}) {
  const overlay = renderTaskDetailPanel({ issue, onClose });
  document.body.appendChild(overlay);
  return overlay;
}

// Let the queued fetch .then/.catch microtasks settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fetchTaskDetail.mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderTaskDetailPanel', () => {
  it('returns null when no issue is given', () => {
    expect(renderTaskDetailPanel({ issue: null, onClose: () => {} })).toBeNull();
  });

  it('renders header, meta and effort synchronously with loading skeletons', () => {
    fetchTaskDetail.mockReturnValue(new Promise(() => {})); // never resolves
    const overlay = mount();

    expect(overlay.querySelector('.task-detail-key').textContent).toBe(sampleIssue.key);
    expect(overlay.querySelector('.task-detail-title').textContent).toBe(sampleIssue.summary);
    expect(overlay.querySelectorAll('.task-detail-skeleton').length).toBeGreaterThan(0);
    expect(overlay.textContent).toContain('Loading description…');
    expect(overlay.textContent).toContain('Loading comments…');
    // Effort tiles + meta type/priority come straight from the issue, no fetch.
    expect(overlay.querySelector('.task-effort-grid')).not.toBeNull();
    expect(overlay.querySelector('.issue-type-badge')).not.toBeNull();
  });

  it('fills meta, description and comments when detail resolves', async () => {
    fetchTaskDetail.mockResolvedValue({
      reporterName: 'Ada Lovelace',
      created: '2026-05-01T09:30:00.000Z',
      updated: '2026-05-10T14:00:00.000Z',
      dueDate: '2026-05-20',
      labels: ['backend', 'urgent'],
      components: ['API', 'Auth'],
      description: 'First paragraph.\n\nSecond paragraph.',
      comments: [
        { authorName: 'Grace Hopper', created: '2026-05-02T10:00:00.000Z', body: 'Looks good to me.' },
        { authorName: 'Alan Turing', created: '2026-05-03T11:00:00.000Z', body: 'Agreed.' },
      ],
    });
    const overlay = mount();
    await flush();

    expect(overlay.querySelectorAll('.task-detail-skeleton').length).toBe(0);
    expect(overlay.textContent).not.toContain('Loading description…');
    expect(overlay.textContent).toContain('Ada Lovelace');
    expect(overlay.textContent).toContain('backend');
    expect(overlay.textContent).toContain('urgent');
    // Components appended as an extra (wide) meta field only when present.
    expect(overlay.textContent).toContain('API, Auth');
    // Description split into paragraphs.
    expect(overlay.textContent).toContain('First paragraph.');
    expect(overlay.textContent).toContain('Second paragraph.');
    // Comments: count in the section title + each comment rendered.
    expect(overlay.textContent).toContain('Comments (2)');
    expect(overlay.textContent).toContain('Grace Hopper');
    expect(overlay.textContent).toContain('Looks good to me.');
    expect(overlay.textContent).toContain('Alan Turing');
  });

  it('settles to dashes / empty notes when detail is null (non-api source)', async () => {
    fetchTaskDetail.mockResolvedValue(null);
    const overlay = mount();
    await flush();

    expect(overlay.querySelectorAll('.task-detail-skeleton').length).toBe(0);
    expect(overlay.textContent).not.toContain('Loading description…');
    // Description section is removed entirely; comments show the source note.
    expect(overlay.textContent).not.toContain('Description');
    expect(overlay.textContent).toContain('Comments not available for this source.');
  });

  it('omits the description section when detail has no description', async () => {
    fetchTaskDetail.mockResolvedValue({
      reporterName: 'Ada', labels: [], components: [], comments: [], description: '   ',
    });
    const overlay = mount();
    await flush();

    expect(overlay.textContent).not.toContain('Loading description…');
    expect(overlay.textContent).not.toContain('Description');
    // No comments → the empty note, not the source-unavailable one.
    expect(overlay.textContent).toContain('No comments on this task.');
  });

  it('shows error states when the fetch rejects', async () => {
    fetchTaskDetail.mockRejectedValue(new Error('boom'));
    const overlay = mount();
    await flush();

    expect(overlay.textContent).toContain('Could not load extended details.');
    expect(overlay.textContent).toContain('Could not load comments.');
  });

  it('is a no-op when the panel was removed before the fetch resolved', async () => {
    let resolve;
    fetchTaskDetail.mockReturnValue(new Promise((r) => { resolve = r; }));
    const overlay = mount();
    overlay.remove(); // user closed the panel before data arrived
    resolve({ reporterName: 'Ada', labels: ['x'], comments: [], description: 'hi' });
    await flush();

    // Detached node is left untouched — skeletons never replaced, no throw.
    expect(overlay.querySelectorAll('.task-detail-skeleton').length).toBeGreaterThan(0);
    expect(overlay.textContent).not.toContain('Ada');
  });

  it('invokes onClose from the backdrop, the close button and the Escape key', () => {
    fetchTaskDetail.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    const overlay = mount(sampleIssue, onClose);

    overlay.querySelector('.epic-detail-backdrop')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    overlay.querySelector('.epic-detail-close')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('ignores non-Escape key presses', () => {
    fetchTaskDetail.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    mount(sampleIssue, onClose);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders an empty status-history note when the issue has no changes', () => {
    fetchTaskDetail.mockReturnValue(new Promise(() => {}));
    const overlay = mount({ ...sampleIssue, statusChanges: [] });
    expect(overlay.textContent).toContain('No status history available.');
  });

  it('renders one timeline item per status change', () => {
    fetchTaskDetail.mockReturnValue(new Promise(() => {}));
    const overlay = mount({
      ...sampleIssue,
      statusChanges: [
        { toStatus: 'To Do', date: '2026-05-01' },
        { toStatus: 'In Progress', date: '2026-05-03' },
        { toStatus: 'Done', date: '2026-05-05' },
      ],
    });
    expect(overlay.querySelectorAll('.task-timeline-item').length).toBe(3);
  });
});
