import { el } from '../dom.js';
import { isAuthenticated, getWorkerUrl } from '../../services/auth.js';
import {
  loadFromApi, setPendingBoardId, getSavedBoardId, requireLogin,
} from '../../app/actions.js';

export function renderApiPanel({ pendingBoardId }) {
  const host = el('div', {}, []);

  if (!isAuthenticated()) {
    host.appendChild(el('div', { class: 'api-panel' }, [
      el('div', { class: 'hint', style: { marginBottom: '0' } }, [
        'Please login with Microsoft to connect to Jira API.',
      ]),
    ]));
    requireLogin();
    return host;
  }

  host.appendChild(el('div', { class: 'api-panel' }, [
    el('div', { class: 'hint' }, ['Loading configuration...']),
  ]));

  (async () => {
    try {
      const workerUrl = await getWorkerUrl();
      host.innerHTML = '';
      host.appendChild(buildPanel({ pendingBoardId, workerUrl }));
    } catch (e) {
      host.innerHTML = '';
      host.appendChild(el('div', { class: 'api-panel' }, [
        el('div', { class: 'hint', style: { color: 'var(--coral)' } }, [`Error: ${e.message}`]),
      ]));
    }
  })();

  return host;
}

function buildPanel({ pendingBoardId, workerUrl }) {
  const savedBoardId = pendingBoardId || getSavedBoardId();

  const boardIdInput = el('input', {
    placeholder: 'e.g. 1336',
    value: savedBoardId,
  });
  boardIdInput.addEventListener('input', () => setPendingBoardId(boardIdInput.value));

  const submit = el('button', { class: 'submit', type: 'button' }, ['Load sprints']);
  submit.addEventListener('click', async () => {
    const boardId = boardIdInput.value.trim();
    if (!workerUrl) return;
    submit.disabled = true;
    submit.textContent = 'Loading…';
    try {
      await loadFromApi(boardId);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Load sprints';
    }
  });

  return el('div', { class: 'api-panel' }, [
    el('div', { class: 'field' }, [
      el('label', {}, ['Board ID']),
      boardIdInput,
    ]),
    submit,
    el('div', { class: 'hint' }, [
      'Find Board ID in your Jira board URL: /jira/software/projects/XXX/boards/',
      el('strong', {}, ['123']),
    ]),
  ]);
}
