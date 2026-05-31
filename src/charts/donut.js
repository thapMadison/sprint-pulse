import { svg } from './svg.js';
import { el } from '../ui/dom.js';
import { t } from '../app/i18n.js';

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return ['M', start.x, start.y, 'A', r, r, 0, largeArc, 0, end.x, end.y].join(' ');
}

const ORDER = ['done', 'inprogress', 'todo'];
const COLORS = {
  done: 'var(--lime)',
  inprogress: 'var(--amber)',
  todo: 'oklch(0.45 0.02 270)',
};
const LABELS = { done: 'chart.donut.done', inprogress: 'chart.donut.inprogress', todo: 'chart.donut.todo' };

export function renderDonut({ counts, hoursByStatus, totalIssues }) {
  const size = 200, stroke = 22, r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;

  const total = ORDER.reduce((s, k) => s + counts[k], 0);
  let startAngle = 0;
  const segs = [];
  for (const k of ORDER) {
    const pct = total ? counts[k] / total : 0;
    if (pct === 0) continue;
    const sweepAngle = pct * 360;
    const endAngle = startAngle + sweepAngle;
    if (pct >= 0.9999) {
      segs.push(svg('circle', {
        cx, cy, r, fill: 'none', stroke: COLORS[k], 'stroke-width': stroke,
      }));
    } else {
      segs.push(svg('path', {
        d: describeArc(cx, cy, r, startAngle, endAngle - 0.5),
        fill: 'none', stroke: COLORS[k], 'stroke-width': stroke, 'stroke-linecap': 'butt',
      }));
    }
    startAngle = endAngle;
  }

  const defs = svg('defs', {}, [
    svg('filter', {
      id: 'donutSoftGlow', x: '-30%', y: '-30%', width: '160%', height: '160%',
    }, [
      svg('feGaussianBlur', { stdDeviation: 4, result: 'blur' }),
      svg('feComponentTransfer', { in: 'blur', result: 'softer' }, [
        svg('feFuncA', { type: 'linear', slope: 0.55 }),
      ]),
      svg('feMerge', {}, [
        svg('feMergeNode', { in: 'softer' }),
        svg('feMergeNode', { in: 'SourceGraphic' }),
      ]),
    ]),
  ]);

  const baseCircle = svg('circle', {
    cx, cy, r, fill: 'none', stroke: 'oklch(1 0 0 / 0.05)', 'stroke-width': stroke,
  });
  const segGroup = svg('g', { filter: 'url(#donutSoftGlow)' }, segs);
  const centerVal = svg('text', {
    x: cx, y: cy - 4, 'text-anchor': 'middle',
    class: 'donut-center-val', fill: 'var(--ink)',
    style: 'font: 500 28px var(--font-display)',
  }, [String(totalIssues)]);
  const centerLbl = svg('text', {
    x: cx, y: cy + 16, 'text-anchor': 'middle',
    fill: 'var(--ink-3)',
    style: 'font: 500 10px var(--font-mono); letter-spacing: 0.1em',
  }, [t('chart.donut.issues')]);

  const svgEl = svg('svg',
    { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    [defs, baseCircle, segGroup, centerVal, centerLbl]
  );

  const legendRows = ORDER.map((k) =>
    el('div', { class: 'donut-legend-row' }, [
      el('div', { class: 'left' }, [
        el('span', { class: 'sw', style: { background: COLORS[k] } }),
        el('span', {}, [t(LABELS[k])]),
      ]),
      el('div', { class: 'right' }, [
        el('span', { class: 'big' }, [String(counts[k])]),
        el('span', { style: { color: 'var(--ink-3)' } }, [` · ${hoursByStatus[k].toFixed(1)}h`]),
      ]),
    ])
  );

  return el('div', { class: 'donut-wrap' }, [
    svgEl,
    el('div', { class: 'donut-legend' }, legendRows),
  ]);
}
