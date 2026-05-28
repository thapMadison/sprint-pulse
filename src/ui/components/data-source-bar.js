import { el } from '../dom.js';
import { isAuthenticated } from '../../services/auth.js';
import {
  loadDemo, loadFromFile, refreshFromApi, showError, requireLogin,
  setApiPanelOpen,
} from '../../app/actions.js';
import { renderApiPanel } from './api-panel.js';
import { renderProgressOverlay } from './progress-overlay.js';

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

function statusText({ activeSource, isRefreshing, lastUpdated }) {
  if (activeSource === 'api') {
    return isRefreshing ? 'Refreshing...' : `Updated ${formatLastUpdated(lastUpdated)}`;
  }
  if (activeSource === 'file') return 'Loaded from file';
  return 'Using bundled demo';
}

function hiddenFileInput() {
  const input = el('input', {
    type: 'file', accept: '.csv,.xml,.json',
    style: { display: 'none' },
  });
  input.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      await loadFromFile(file);
    } finally {
      input.value = '';
    }
  });
  return input;
}

export function renderDataSource({
  activeSource, isRefreshing, lastUpdated, apiPanelOpen, pendingBoardId, loadProgress,
}) {
  const container = el('div', {}, []);
  const apiHost = el('div', {}, []);
  const fileInput = hiddenFileInput();

  function paintApiPanel() {
    apiHost.innerHTML = '';
    if (apiPanelOpen) apiHost.appendChild(renderApiPanel({ pendingBoardId }));
  }

  function paintBar() {
    const status = statusText({ activeSource, isRefreshing, lastUpdated });
    const authed = isAuthenticated();

    const demoBtn = el('button', {
      class: `ds-btn ${activeSource === 'demo' && !apiPanelOpen ? 'active' : ''}`,
      onClick: () => {
        setApiPanelOpen(false);
        loadDemo();
      },
    }, ['Demo data']);

    const apiBtn = el('button', {
      class: `ds-btn ${activeSource === 'api' || apiPanelOpen ? 'active' : ''} ${!authed ? 'disabled' : ''}`,
      onClick: () => {
        if (!authed) {
          showError('Please login to connect to Jira API.');
          requireLogin();
          return;
        }
        setApiPanelOpen(!apiPanelOpen);
      },
    }, ['Connect Jira API']);

    const fileBtn = el('button', {
      class: `ds-btn ${activeSource === 'file' ? 'active' : ''} ${!authed ? 'disabled' : ''}`,
      onClick: () => {
        if (!authed) {
          showError('Please login to import files.');
          requireLogin();
          return;
        }
        fileInput.click();
      },
    }, ['Import CSV / XML / JSON']);

    const refresh = el('button', {
      class: `ds-btn refresh-btn ${isRefreshing ? 'refreshing' : ''}`,
      onClick: refreshFromApi,
      disabled: isRefreshing,
      style: { display: activeSource === 'api' ? 'inline-flex' : 'none' },
    }, [
      el('span', { class: 'refresh-icon' }, ['↻']),
      'Refresh',
    ]);

    const progressNode = renderProgressOverlay({ progress: loadProgress });
    const trailing = progressNode
      ? progressNode
      : el('span', { class: 'ds-status' }, [status]);

    return el('div', { class: 'data-source-bar' }, [
      el('span', { class: 'ds-label' }, ['Data source']),
      demoBtn, apiBtn, fileBtn, fileInput, refresh,
      trailing,
    ]);
  }

  container.appendChild(paintBar());
  container.appendChild(apiHost);
  paintApiPanel();
  return container;
}
