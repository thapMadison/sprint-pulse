import { el } from '../dom.js';
import { isAuthenticated, getWorkerUrl } from '../../services/auth.js';
import {
  loadDemo, loadFromFile, refreshFromApi, showError, requireLogin,
  setApiPanelOpen, loadFromApi, setPendingBoardId, getSavedBoardId,
} from '../../app/actions.js';
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

function buildInlineBoardInput({ pendingBoardId, workerUrl }) {
  const savedBoardId = pendingBoardId || getSavedBoardId();

  const boardIdInput = el('input', {
    class: 'inline-board-input',
    placeholder: '123',
    value: savedBoardId,
  });
  boardIdInput.addEventListener('input', () => setPendingBoardId(boardIdInput.value));

  const submit = el('button', { class: 'submit-board', type: 'button' }, ['Load board']);
  submit.addEventListener('click', async () => {
    const boardId = boardIdInput.value.trim();
    if (!workerUrl) return;
    submit.disabled = true;
    submit.textContent = 'Connecting…';
    try {
      await loadFromApi(boardId);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Load board';
    }
  });

  return el('div', {
    class: 'inline-board-field',
    'data-tooltip': 'Board ID can be found in your Jira board URL:\n/jira/software/projects/XXX/boards/{boardId}',
  }, [
    el('label', { class: 'inline-board-label' }, ['Board ID']),
    boardIdInput,
    submit,
  ]);
}

export function renderDataSource({
  activeSource, isRefreshing, lastUpdated, apiPanelOpen, pendingBoardId, loadProgress,
}) {
  const container = el('div', {}, []);
  const fileInput = hiddenFileInput();
  let workerUrlCache = null;

  function paintBar(inlineBoardEl) {
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
    }, ['Connect with Jira']);

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
      : inlineBoardEl || el('span', { class: 'ds-status' }, [status]);

    return el('div', { class: 'data-source-bar' }, [
      el('span', { class: 'ds-label' }, ['Data source']),
      demoBtn, apiBtn, fileBtn, fileInput, refresh,
      trailing,
    ]);
  }

  if (apiPanelOpen && isAuthenticated()) {
    const loadingBar = paintBar(el('span', { class: 'ds-status' }, ['Loading config...']));
    container.appendChild(loadingBar);

    (async () => {
      try {
        workerUrlCache = workerUrlCache || await getWorkerUrl();
        const inlineBoardEl = buildInlineBoardInput({ pendingBoardId, workerUrl: workerUrlCache });
        container.innerHTML = '';
        container.appendChild(paintBar(inlineBoardEl));
      } catch (e) {
        container.innerHTML = '';
        container.appendChild(paintBar(el('span', { class: 'ds-status err' }, [`Error: ${e.message}`])));
      }
    })();
  } else {
    container.appendChild(paintBar(null));
  }

  return container;
}
