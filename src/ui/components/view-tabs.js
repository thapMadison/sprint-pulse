import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';

function iconSprint() {
  return svg('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    svg('path', { d: 'M3 12h4l3-7 4 14 3-7h4' }),
  ]);
}

function iconEpic() {
  return svg('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    svg('rect', { x: 3, y: 4, width: 7, height: 7, rx: 1 }),
    svg('rect', { x: 14, y: 4, width: 7, height: 7, rx: 1 }),
    svg('rect', { x: 3, y: 13, width: 7, height: 7, rx: 1 }),
    svg('rect', { x: 14, y: 13, width: 7, height: 7, rx: 1 }),
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
