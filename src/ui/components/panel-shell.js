import { el } from '../dom.js';

// Shared scaffolding for the slide-in detail panels (task + epic). Builds the
// backdrop, optional back button, close button, the dialog <aside>, and the
// overlay wrapper, and wires up click-to-close + Escape-to-close with reliable
// listener cleanup (the keydown handler is removed as soon as the panel leaves
// the DOM, whether it's closed by a button or torn down by an outside render).
export function renderPanelShell({ panelClass, ariaLabel, closeLabel, onClose, onBack, body }) {
  const backdrop = el('div', { class: 'epic-detail-backdrop', onClick: onClose });

  const backBtn = onBack
    ? el('button', { class: 'panel-back-btn', type: 'button', 'aria-label': 'Go back', onClick: onBack }, ['←'])
    : null;

  const closeBtn = el('button', {
    class: 'epic-detail-close',
    type: 'button',
    'aria-label': closeLabel,
    onClick: onClose,
  }, ['×']);

  const panel = el('aside', { class: panelClass, role: 'dialog', 'aria-label': ariaLabel },
    [backBtn, closeBtn, body]);
  panel.addEventListener('click', (e) => e.stopPropagation());

  const onKey = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKey);
  // Remove the global keydown listener the moment the panel is detached, however
  // that happens. MutationObserver is the reliable signal; the in-app close paths
  // remove it synchronously too, so the observer is just a safety net.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(panel)) {
      document.removeEventListener('keydown', onKey);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return el('div', { class: 'epic-detail-overlay' }, [backdrop, panel]);
}
