import { el } from '../dom.js';
import { refreshFromApi } from '../../app/actions.js';
import { timeAgo } from '../format.js';
import { attachScrollVisibility } from './scroll-visibility.js';
import { SOURCE } from '../../app/constants.js';

const statusText = ({ isRefreshing, lastUpdated }) =>
  isRefreshing ? 'Refreshing...' : `Updated ${timeAgo(lastUpdated)}`;

// Floating refresh button — shown only for the API source and only once the user
// has scrolled past the in-flow data-source bar (so its Refresh button is off
// screen). Positioned fixed at bottom-right; slides in/out based on scroll.
export function renderRefreshFAB({ sourceKey, isRefreshing, lastUpdated }) {
  if (sourceKey !== SOURCE.API) return null;

  const refreshIcon = el('span', { class: `fab-refresh-icon ${isRefreshing ? 'spinning' : ''}` }, ['↻']);
  const status = el('span', { class: 'fab-status' }, [statusText({ isRefreshing, lastUpdated })]);

  const fab = el('div', { class: 'refresh-fab' }, [
    status,
    el('button', {
      class: 'fab-btn',
      onClick: refreshFromApi,
      disabled: isRefreshing,
      'aria-label': 'Refresh data',
    }, [refreshIcon]),
  ]);

  fab._cleanup = attachScrollVisibility(fab, {
    anchorSelector: '.data-source-bar',
    fallbackScrollY: 100,
  });

  return fab;
}

// Update an existing FAB in place (for isRefreshing / lastUpdated changes)
// without recreating the whole element (preserves the scroll listener).
export function updateRefreshFAB(fabNode, { isRefreshing, lastUpdated }) {
  if (!fabNode) return;
  const statusEl = fabNode.querySelector('.fab-status');
  const iconEl = fabNode.querySelector('.fab-refresh-icon');
  const btnEl = fabNode.querySelector('.fab-btn');

  if (statusEl) statusEl.textContent = statusText({ isRefreshing, lastUpdated });
  if (iconEl) iconEl.classList.toggle('spinning', isRefreshing);
  if (btnEl) btnEl.disabled = isRefreshing;
}
