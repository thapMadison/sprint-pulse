import { el } from '../dom.js';
import { iconSprint, iconEpic, renderTabBtn } from './view-tabs.js';
import { attachScrollVisibility } from './scroll-visibility.js';
import { t } from '../../app/i18n.js';

// Floating Sprint/Epic switcher — a compact version of the view tabs that lives
// at the bottom-left, mirroring the refresh FAB at the bottom-right. Shows after
// the user has scrolled past the in-flow view tabs, so switching views never
// requires scrolling back to the top.
//
// Uses unique gradient IDs (suffix "Fab") so the SVG <defs> don't collide with
// the in-flow tabs' gradients.
export function renderViewTabsFAB({ active, onChange }) {
  const fab = el('div', { class: 'view-tabs view-tabs-fab' }, [
    renderTabBtn({ key: 'sprint', label: t('viewTabs.sprint'), icon: iconSprint('vtGradSprintFab'), active, onChange }),
    renderTabBtn({ key: 'epic', label: t('viewTabs.epic'), icon: iconEpic('vtGradEpicFab'), active, onChange }),
  ]);

  // Show once the in-flow tabs (the .view-tabs that isn't this FAB) scroll above
  // the viewport's top edge — measuring the real element keeps both sets of tabs
  // from ever showing at once regardless of topbar height.
  fab._cleanup = attachScrollVisibility(fab, {
    anchorSelector: '.view-tabs:not(.view-tabs-fab)',
    fallbackScrollY: 160,
  });

  return fab;
}

// Update the active tab in place without recreating the element (preserves the
// scroll listener).
export function updateViewTabsFAB(fabNode, { active }) {
  if (!fabNode) return;
  fabNode.querySelectorAll('.view-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.key === active);
  });
}
