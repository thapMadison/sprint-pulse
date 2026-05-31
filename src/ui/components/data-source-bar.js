import { el } from '../dom.js';
import { isAuthenticated, getWorkerUrl } from '../../services/auth.js';
import {
  loadDemo, loadFromFile, refreshFromApi, showError, requireLogin,
  setApiPanelOpen, loadFromApi, setPendingBoardId, getSavedBoardId, getRecentBoards,
} from '../../app/actions.js';
import { renderProgressOverlay } from './progress-overlay.js';
import { timeAgo } from '../format.js';
import { SOURCE } from '../../app/constants.js';
import { t } from '../../app/i18n.js';

function statusText({ activeSource, isRefreshing, lastUpdated }) {
  if (activeSource === SOURCE.API) {
    return isRefreshing ? t('dataSource.refreshing') : t('dataSource.updated', { time: timeAgo(lastUpdated) });
  }
  if (activeSource === SOURCE.FILE) return t('dataSource.loadedFromFile');
  return t('dataSource.usingDemo');
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
  if (!label) return t('dataSource.boardFallback', { id: boardId });
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
      title: t('dataSource.loadBoardCached', { id: b.boardId }),
    }, [
      el('span', { class: 'board-recent-name' }, [shortBoardLabel(b.label, b.boardId)]),
      el('span', { class: 'board-recent-id' }, [`#${b.boardId}`]),
    ]);
    item.addEventListener('click', () => loadFromApi(String(b.boardId)));
    return item;
  });

  const dropdown = el('div', { class: 'board-recent-dropdown' }, [
    el('div', { class: 'board-recent-head' }, [t('dataSource.recentBoards')]),
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
    placeholder: t('dataSource.boardPlaceholder'),
    value: savedBoardId,
  });
  boardIdInput.addEventListener('input', () => setPendingBoardId(boardIdInput.value));

  const submit = el('button', { class: 'submit-board', type: 'button' }, [t('dataSource.loadBoard')]);
  submit.addEventListener('click', async () => {
    const boardId = boardIdInput.value.trim();
    if (!workerUrl) return;
    submit.disabled = true;
    submit.textContent = t('dataSource.connecting');
    try {
      await loadFromApi(boardId);
    } finally {
      submit.disabled = false;
      submit.textContent = t('dataSource.loadBoard');
    }
  });

  const field = el('div', {
    class: 'inline-board-field',
    'data-tooltip': t('dataSource.boardTooltip'),
  }, [
    el('label', { class: 'inline-board-label' }, [t('dataSource.boardLabel')]),
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
      title: t('dataSource.recentBoards'), 'aria-label': t('dataSource.recentBoards'),
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
      class: `ds-btn ${activeSource === SOURCE.DEMO && !apiPanelOpen ? 'active' : ''}`,
      onClick: () => {
        setApiPanelOpen(false);
        loadDemo();
      },
    }, [t('dataSource.demo')]);

    const apiBtn = el('button', {
      class: `ds-btn ${activeSource === SOURCE.API || apiPanelOpen ? 'active' : ''} ${!authed ? 'disabled' : ''}`,
      onClick: () => {
        if (!authed) {
          showError(t('dataSource.loginForApi'));
          requireLogin();
          return;
        }
        setApiPanelOpen(!apiPanelOpen);
      },
    }, [t('dataSource.connectJira')]);

    const fileBtn = el('button', {
      class: `ds-btn ${activeSource === SOURCE.FILE && !apiPanelOpen ? 'active' : ''} ${!authed ? 'disabled' : ''}`,
      onClick: () => {
        if (!authed) {
          showError(t('dataSource.loginForFile'));
          requireLogin();
          return;
        }
        fileInput.click();
      },
    }, [t('dataSource.importFile')]);

    const refresh = el('button', {
      class: `ds-btn refresh-btn ${isRefreshing ? 'refreshing' : ''}`,
      onClick: refreshFromApi,
      disabled: isRefreshing,
    }, [
      el('span', { class: 'refresh-icon' }, ['↻']),
      t('dataSource.refresh'),
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
      if (activeSource === SOURCE.API) {
        right.push(el('span', { class: 'ds-divider' }));
        right.push(refresh);
      }
      trailing = el('div', { class: 'ds-trailing' }, right);
    }

    return el('div', { class: 'data-source-bar' }, [
      el('span', { class: 'ds-label' }, [t('dataSource.label')]),
      demoBtn, apiBtn, fileBtn, fileInput,
      trailing,
    ]);
  }

  if (apiPanelOpen && isAuthenticated()) {
    const loadingBar = paintBar(el('span', { class: 'ds-status' }, [t('dataSource.loadingConfig')]));
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
        container.appendChild(paintBar(el('span', { class: 'ds-status err' }, [t('dataSource.error', { message: e.message })])));
      }
    })();
  } else {
    container.appendChild(paintBar(null));
  }

  return container;
}
