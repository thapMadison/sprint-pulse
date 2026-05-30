import { el } from '../dom.js';
import { iconSprint, iconEpic } from './view-tabs.js';

// Floating Sprint/Epic switcher — a compact version of the view tabs that lives
// at the bottom-left, mirroring the refresh FAB at the bottom-right. Shows after
// the user has scrolled past the in-flow view tabs (~160px), so switching views
// never requires scrolling back to the top.
//
// Uses unique gradient IDs (suffix "Fab") so the SVG <defs> don't collide with
// the in-flow tabs' gradients.
export function renderViewTabsFAB({ active, onChange }) {
  const tab = (key, label, icon) => {
    const btn = el('button', {
      class: `view-tab ${active === key ? 'active' : ''}`,
      type: 'button',
      onClick: () => onChange(key),
    }, [label]);
    btn.insertBefore(icon, btn.firstChild);
    return btn;
  };

  const fab = el('div', { class: 'view-tabs view-tabs-fab' }, [
    tab('sprint', 'Sprint', iconSprint('vtGradSprintFab')),
    tab('epic', 'Epic', iconEpic('vtGradEpicFab')),
  ]);

  // Show once the in-flow tabs have scrolled above the top edge of the viewport.
  // We measure the real in-flow tabs (`.view-tabs` that isn't this FAB) instead
  // of a fixed scroll threshold, so a taller/shorter topbar or data-source bar
  // never makes both sets of tabs visible at once.
  let visible = false;
  function updateVisibility() {
    const inflow = document.querySelector('.view-tabs:not(.view-tabs-fab)');
    let shouldShow;
    if (inflow) {
      shouldShow = inflow.getBoundingClientRect().bottom <= 8;
    } else {
      shouldShow = window.scrollY > 160; // fallback if in-flow tabs aren't mounted
    }
    if (shouldShow !== visible) {
      visible = shouldShow;
      fab.classList.toggle('visible', visible);
    }
  }
  updateVisibility();

  const onScroll = () => requestAnimationFrame(updateVisibility);
  window.addEventListener('scroll', onScroll, { passive: true });

  // Cleanup hook (mirrors refresh-fab) so the scroll listener is removed when the
  // FAB is torn down.
  fab._cleanup = () => window.removeEventListener('scroll', onScroll);

  return fab;
}

// Update the active tab in place without recreating the element (preserves the
// scroll listener).
export function updateViewTabsFAB(fabNode, { active }) {
  if (!fabNode) return;
  const btns = fabNode.querySelectorAll('.view-tab');
  // Order matches render: [0] = sprint, [1] = epic.
  btns[0]?.classList.toggle('active', active === 'sprint');
  btns[1]?.classList.toggle('active', active === 'epic');
}
