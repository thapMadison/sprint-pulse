import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';

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

function iconSprint() {
  return svg('svg', {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2.25,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    brandGradient('vtGradSprint'),
    svg('path', { d: 'M3 12h4l3-7 4 14 3-7h4' }),
  ]);
}

function iconEpic() {
  // Lucide "layers" — stacked planes read as a portfolio of epics.
  return svg('svg', {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2.25,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    brandGradient('vtGradEpic'),
    svg('path', { d: 'M12 2 2 7l10 5 10-5-10-5Z' }),
    svg('path', { d: 'm2 17 10 5 10-5' }),
    svg('path', { d: 'm2 12 10 5 10-5' }),
  ]);
}

export function renderViewTabs({ active, onChange }) {
  const tab = (key, label, icon) => {
    const btn = el('button', {
      class: `view-tab ${active === key ? 'active' : ''}`,
      type: 'button',
      onClick: () => onChange(key),
    }, [label]);
    btn.insertBefore(icon, btn.firstChild);
    return btn;
  };

  return el('div', { class: 'view-tabs' }, [
    tab('sprint', 'Sprint', iconSprint()),
    tab('epic', 'Epic', iconEpic()),
  ]);
}
