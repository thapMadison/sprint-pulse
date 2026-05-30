import { el } from '../dom.js';
import { refreshFromApi } from '../../app/actions.js';

function formatLastUpdated(date) {
  if (!date) return '';
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}

// Floating Action Button for refresh — shows when:
// 1. sourceKey === 'api' (only API source can refresh)
// 2. User has scrolled past the data-source-bar (so the original Refresh button is off-screen)
//
// The FAB contains:
// - Status text "Updated X mins ago" (or "Refreshing...")
// - Refresh icon button
//
// Positioned fixed at bottom-right, slides in/out based on scroll position.
export function renderRefreshFAB({ sourceKey, isRefreshing, lastUpdated }) {
  // Only show for API source
  if (sourceKey !== 'api') return null;

  const status = isRefreshing ? 'Refreshing...' : `Updated ${formatLastUpdated(lastUpdated)}`;

  const refreshIcon = el('span', { class: `fab-refresh-icon ${isRefreshing ? 'spinning' : ''}` }, ['↻']);
  const statusText = el('span', { class: 'fab-status' }, [status]);

  const fab = el('div', { class: 'refresh-fab' }, [
    statusText,
    el('button', {
      class: 'fab-btn',
      onClick: refreshFromApi,
      disabled: isRefreshing,
      'aria-label': 'Refresh data',
    }, [refreshIcon]),
  ]);

  // Show the FAB once the data-source-bar (which holds the in-flow Refresh
  // button) has scrolled above the top edge of the viewport. Measuring the real
  // bar instead of a fixed scroll threshold keeps this correct regardless of
  // topbar height, and mirrors the floating view-tabs behaviour.
  let visible = false;
  function updateVisibility() {
    const bar = document.querySelector('.data-source-bar');
    const shouldShow = bar
      ? bar.getBoundingClientRect().bottom <= 8
      : window.scrollY > 100; // fallback if the bar isn't mounted
    if (shouldShow !== visible) {
      visible = shouldShow;
      fab.classList.toggle('visible', visible);
    }
  }

  // Initial check
  updateVisibility();

  // Listen to scroll
  const onScroll = () => {
    requestAnimationFrame(updateVisibility);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Cleanup when FAB is removed from DOM
  fab._cleanup = () => {
    window.removeEventListener('scroll', onScroll);
  };

  return fab;
}

// Update an existing FAB in place (for isRefreshing / lastUpdated changes)
// without recreating the whole element (preserves scroll listener).
export function updateRefreshFAB(fabNode, { isRefreshing, lastUpdated }) {
  if (!fabNode) return;

  const status = isRefreshing ? 'Refreshing...' : `Updated ${formatLastUpdated(lastUpdated)}`;
  const statusEl = fabNode.querySelector('.fab-status');
  const iconEl = fabNode.querySelector('.fab-refresh-icon');
  const btnEl = fabNode.querySelector('.fab-btn');

  if (statusEl) statusEl.textContent = status;
  if (iconEl) iconEl.classList.toggle('spinning', isRefreshing);
  if (btnEl) btnEl.disabled = isRefreshing;
}
