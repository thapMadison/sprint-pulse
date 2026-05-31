import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';
import { t } from '../../app/i18n.js';

// Brand violet→cyan gradient, referenced by the active tab via CSS (stroke: url(#id)).
function brandGradient(id) {
  return svg('defs', {}, [
    svg('linearGradient', {
      id, x1: 2, y1: 2, x2: 22, y2: 22, gradientUnits: 'userSpaceOnUse',
    }, [
      svg('stop', { offset: '0', style: { stopColor: 'var(--violet)' } }),
      svg('stop', { offset: '1', style: { stopColor: 'var(--cyan)' } }),
    ]),
  ]);
}

function iconSprint(gradId = 'vtGradSprint') {
  return svg('svg', {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2.25,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    brandGradient(gradId),
    svg('path', { d: 'M3 12h4l3-7 4 14 3-7h4' }),
  ]);
}

function iconEpic(gradId = 'vtGradEpic') {
  // Lucide "layers" — stacked planes read as a portfolio of epics.
  return svg('svg', {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2.25,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    brandGradient(gradId),
    svg('path', { d: 'M12 2 2 7l10 5 10-5-10-5Z' }),
    svg('path', { d: 'm2 17 10 5 10-5' }),
    svg('path', { d: 'm2 12 10 5 10-5' }),
  ]);
}

export { iconSprint, iconEpic };

// One Sprint/Epic tab button. `data-key` lets in-place updates target a tab by
// identity instead of DOM position. Shared by the in-flow tabs and the FAB.
export function renderTabBtn({ key, label, icon, active, onChange }) {
  const btn = el('button', {
    class: `view-tab ${active === key ? 'active' : ''}`,
    type: 'button',
    'data-key': key,
    onClick: () => onChange(key),
  }, [label]);
  btn.insertBefore(icon, btn.firstChild);
  return btn;
}

export function renderViewTabs({ active, onChange }) {
  return el('div', { class: 'view-tabs' }, [
    renderTabBtn({ key: 'sprint', label: t('viewTabs.sprint'), icon: iconSprint(), active, onChange }),
    renderTabBtn({ key: 'epic', label: t('viewTabs.epic'), icon: iconEpic(), active, onChange }),
  ]);
}
