import { el } from '../dom.js';
import { isAuthenticated, getWorkerUrl } from '../../services/auth.js';
import {
  loadDemo, loadFromFile, refreshFromApi, showError, requireLogin,
  setApiPanelOpen, loadFromApi, setPendingBoardId, getSavedBoardId, getRecentBoards,
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

// Strip the "Jira API · " prefix so the chip shows just the board name/id.
function shortBoardLabel(label, boardId) {
  if (!label) return `Board ${boardId}`;
  return label.replace(/^Jira API · /, '');
}

// Floating quick-switch list for boards this user has already loaded. Anchored
// (position:absolute) to the Board ID field so it overlays the content below
// instead of growing the bar — no layout shift / screen jump. The board
// currently in the input is excluded. Clicking an item loads it from cache.
function buildRecentDropdown({ recentBoards, activeBoardId }) {
  const others = (recentBoards || []).filter((b) => String(b.boardId) !== String(activeBoardId));
  if (!others.length) return null;

  const items = others.map((b) => {
    const item = el('button', {
      class: 'board-recent-item', type: 'button',
      title: `Load board ${b.boardId} (cached)`,
    }, [
      el('span', { class: 'board-recent-name' }, [shortBoardLabel(b.label, b.boardId)]),
      el('span', { class: 'board-recent-id' }, [`#${b.boardId}`]),
    ]);
    item.addEventListener('click', () => loadFromApi(String(b.boardId)));
    return item;
  });

  const dropdown = el('div', { class: 'board-recent-dropdown' }, [
    el('div', { class: 'board-recent-head' }, ['Recent boards']),
    ...items,
  ]);
  // Keep the input focused on click so the click lands before blur closes us.
  dropdown.addEventListener('mousedown', (e) => e.preventDefault());
  return dropdown;
}

function buildInlineBoardInput({ pendingBoardId, workerUrl, recentBoards }) {
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

  const field = el('div', {
    class: 'inline-board-field',
    'data-tooltip': 'Board ID can be found in your Jira board URL:\n/jira/software/projects/XXX/boards/{boardId}',
  }, [
    el('label', { class: 'inline-board-label' }, ['Board ID']),
    boardIdInput,
    submit,
  ]);

  // Recent boards live in a floating dropdown revealed on focus (with a chevron
  // affordance), so the bar height never changes when the panel opens/switches.
  const dropdown = buildRecentDropdown({ recentBoards, activeBoardId: savedBoardId });
  if (dropdown) {
    field.classList.add('has-recent');

    const caret = el('button', {
      class: 'recent-toggle', type: 'button',
      title: 'Recent boards', 'aria-label': 'Recent boards',
    }, ['▾']);
    caret.addEventListener('click', () => {
      if (dropdown.classList.contains('open')) dropdown.classList.remove('open');
      else boardIdInput.focus(); // focus handler opens it
    });

    boardIdInput.addEventListener('focus', () => dropdown.classList.add('open'));
    boardIdInput.addEventListener('blur', () => {
      setTimeout(() => dropdown.classList.remove('open'), 140);
    });

    field.insertBefore(caret, submit);
    field.appendChild(dropdown);
  }

  return field;
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
      class: `ds-btn ${activeSource === 'file' && !apiPanelOpen ? 'active' : ''} ${!authed ? 'disabled' : ''}`,
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
    }, [
      el('span', { class: 'refresh-icon' }, ['↻']),
      'Refresh',
    ]);

    const progressNode = renderProgressOverlay({ progress: loadProgress });

    // Trailing region, right-aligned. While the inline board panel or load
    // progress strip is showing, it owns the right side; otherwise show the
    // "Updated …" status with the Refresh button beside it: "Updated xxx | ↻".
    let trailing;
    if (progressNode) {
      trailing = progressNode;
    } else if (inlineBoardEl) {
      trailing = inlineBoardEl;
    } else {
      const right = [el('span', { class: 'ds-status' }, [status])];
      if (activeSource === 'api') {
        right.push(el('span', { class: 'ds-divider' }));
        right.push(refresh);
      }
      trailing = el('div', { class: 'ds-trailing' }, right);
    }

    return el('div', { class: 'data-source-bar' }, [
      el('span', { class: 'ds-label' }, ['Data source']),
      demoBtn, apiBtn, fileBtn, fileInput,
      trailing,
    ]);
  }

  if (apiPanelOpen && isAuthenticated()) {
    const loadingBar = paintBar(el('span', { class: 'ds-status' }, ['Loading config...']));
    container.appendChild(loadingBar);

    (async () => {
      try {
        workerUrlCache = workerUrlCache || await getWorkerUrl();
        const recentBoards = await getRecentBoards().catch(() => []);
        const inlineBoardEl = buildInlineBoardInput({ pendingBoardId, workerUrl: workerUrlCache, recentBoards });
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
