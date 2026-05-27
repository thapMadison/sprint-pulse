import { svg, pathFromPoints, smoothPath } from './svg.js';
import { el } from '../ui/dom.js';
import {
  chartGeometry, buildXs, yScaleOf, niceYMax, evenYTicks, renderGridAndAxes,
} from '../ui/chart-helpers.js';

export function renderBurndown(series) {
  const geom = chartGeometry();
  const { days, idealLine, actualRemaining } = series;
  const valid = actualRemaining.filter((v) => v != null);
  const yMax = niceYMax(Math.max(...idealLine, ...(valid.length ? valid : [0])));
  const xs = buildXs(geom, days.length);
  const yScale = yScaleOf(geom, yMax);

  const idealPts = idealLine.map((v, i) => [xs[i], yScale(v)]);
  const actualPts = actualRemaining
    .map((v, i) => (v == null ? null : [xs[i], yScale(v)]))
    .filter(Boolean);

  const baseline = geom.PAD.t + geom.innerH;
  const areaPath = actualPts.length
    ? smoothPath(actualPts) +
      ` L ${actualPts[actualPts.length - 1][0]} ${baseline}` +
      ` L ${actualPts[0][0]} ${baseline} Z`
    : '';

  const children = [
    ...renderGridAndAxes(geom, { days, xs, yTicks: evenYTicks(yMax), yScale }),
    svg('path', { class: 'line-ideal line-draw', d: pathFromPoints(idealPts) }),
  ];
  if (areaPath) children.push(svg('path', { class: 'area-actual area-fade', d: areaPath }));
  children.push(svg('path', { class: 'line-actual line-draw', d: smoothPath(actualPts) }));
  for (const [x, y] of actualPts) {
    children.push(svg('circle', {
      cx: x, cy: y, r: 3, fill: 'var(--coral)',
      stroke: 'white', 'stroke-width': 1, opacity: 0.9,
    }));
  }

  return el('div', { class: 'chart-wrap' }, [
    svg('svg', {
      viewBox: `0 0 ${geom.W} ${geom.H}`,
      width: '100%', height: '100%', preserveAspectRatio: 'none',
    }, children),
    el('div', { class: 'legend' }, [
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw dashed', style: { color: 'oklch(1 0 0 / 0.4)' } }),
        'Ideal burndown',
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: 'var(--coral)' } }),
        'Actual remaining (h)',
      ]),
    ]),
  ]);
}
