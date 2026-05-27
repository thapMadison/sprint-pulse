import { svg, shortDate } from './svg.js';
import { el } from '../ui/dom.js';
import { chartGeometry, buildXs } from '../ui/chart-helpers.js';

export function renderCFD(series) {
  const geom = chartGeometry({ H: 260 });
  const { W, H, PAD, innerW, innerH } = geom;

  const { days, cfd } = series;
  const validCfd = cfd.filter((v) => v != null);
  if (!validCfd.length) return el('div', { class: 'chart-wrap' });

  const total = validCfd[0].todo + validCfd[0].inprogress + validCfd[0].done || 1;
  const xs = buildXs(geom, days.length);
  const yScale = (v) => PAD.t + innerH * (1 - v / total);

  const pointsForBand = (accessor) =>
    cfd
      .map((c, i) => (c == null ? null : [xs[i], yScale(accessor(c))]))
      .filter(Boolean);

  const donePts = pointsForBand((c) => c.done);
  const inProgPts = pointsForBand((c) => c.done + c.inprogress);
  const topPts = pointsForBand((c) => c.done + c.inprogress + c.todo);
  const baseline = PAD.t + innerH;
  const baselinePts = donePts.map((p) => [p[0], baseline]);

  const buildBand = (lower, upper) => {
    const up = upper.map((p) => `L ${p[0]} ${p[1]}`).join(' ');
    const lo = [...lower].reverse().map((p) => `L ${p[0]} ${p[1]}`).join(' ');
    return `M ${upper[0][0]} ${upper[0][1]} ${up} ${lo} Z`;
  };

  const xTickEvery = Math.ceil(days.length / 6);
  const children = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    children.push(svg('line', {
      class: 'grid-line',
      x1: PAD.l, y1: PAD.t + innerH * t,
      x2: W - PAD.r, y2: PAD.t + innerH * t,
    }));
  }
  days.forEach((d, i) => {
    if (i % xTickEvery === 0 || i === days.length - 1) {
      children.push(svg('text', {
        class: 'axis-text', x: xs[i], y: H - 10, 'text-anchor': 'middle',
      }, [shortDate(d)]));
    }
  });
  for (const v of [0, Math.round(total / 2), total]) {
    children.push(svg('text', {
      class: 'axis-text', x: PAD.l - 6, y: yScale(v) + 3, 'text-anchor': 'end',
    }, [String(v)]));
  }
  children.push(svg('path', { class: 'cfd-done area-fade', d: buildBand(baselinePts, donePts) }));
  children.push(svg('path', { class: 'cfd-inprog area-fade', d: buildBand(donePts, inProgPts) }));
  children.push(svg('path', { class: 'cfd-todo area-fade', d: buildBand(inProgPts, topPts) }));

  return el('div', { class: 'chart-wrap tall' }, [
    svg('svg', {
      viewBox: `0 0 ${W} ${H}`, width: '100%', height: '100%', preserveAspectRatio: 'none',
    }, children),
    el('div', { class: 'legend' }, [
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: 'var(--lime)', height: '8px' } }),
        'Done',
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: 'var(--amber)', height: '8px' } }),
        'In progress',
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: 'oklch(0.5 0.02 270)', height: '8px' } }),
        'To do',
      ]),
    ]),
  ]);
}
