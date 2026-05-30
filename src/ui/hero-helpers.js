import { el } from './dom.js';

// Small presentation helpers shared by the Sprint and Epic hero cards.

// "05 May" — null-safe so it works for epics that may have no start/end yet.
export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return `${String(dt.getDate()).padStart(2, '0')} ${dt.toLocaleString('en', { month: 'short' })}`;
}

// "Mon" — the day-of-week label under a date.
export function fmtDow(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleString('en', { weekday: 'short' });
}

// A label / value / sub-label cell in the hero meta row.
export function metaItem(label, value, sub, valueStyle) {
  return el('div', { class: 'meta-item' }, [
    el('div', { class: 'meta-label' }, [label]),
    el('div', { class: 'meta-value', style: valueStyle || null }, value),
    el('div', { class: 'meta-sub' }, [sub]),
  ]);
}

// The small "d" unit appended after a working-day count.
export function dayUnit() {
  return el('span', {
    style: { fontSize: '13px', color: 'var(--ink-3)', marginLeft: '4px' },
  }, ['d']);
}
