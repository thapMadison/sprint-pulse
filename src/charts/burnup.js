import { svg, pathFromPoints, smoothPath } from './svg.js';
import { el } from '../ui/dom.js';
import {
  chartGeometry, buildXs, yScaleOf, niceYMax, evenYTicks, renderGridAndAxes,
} from '../ui/chart-helpers.js';

export function renderBurnup(series) {
  const geom = chartGeometry();
  const { days, scopeLine, completedLine } = series;
  const valid = completedLine.filter((v) => v != null);
  const yMax = niceYMax(Math.max(...scopeLine, ...(valid.length ? valid : [0])));
  const xs = buildXs(geom, days.length);
  const yScale = yScaleOf(geom, yMax);

  const scopePts = scopeLine.map((v, i) => [xs[i], yScale(v)]);
  const compPts = completedLine
    .map((v, i) => (v == null ? null : [xs[i], yScale(v)]))
    .filter(Boolean);

  const baseline = geom.PAD.t + geom.innerH;
  const areaPath = compPts.length
    ? smoothPath(compPts) +
      ` L ${compPts[compPts.length - 1][0]} ${baseline}` +
      ` L ${compPts[0][0]} ${baseline} Z`
    : '';

  const children = [
    ...renderGridAndAxes(geom, { days, xs, yTicks: evenYTicks(yMax), yScale }),
    svg('path', { class: 'line-scope line-draw', d: pathFromPoints(scopePts) }),
  ];
  if (areaPath) children.push(svg('path', { class: 'area-completed area-fade', d: areaPath }));
  children.push(svg('path', { class: 'line-completed line-draw', d: smoothPath(compPts) }));
  for (const [x, y] of compPts) {
    children.push(svg('circle', {
      cx: x, cy: y, r: 3, fill: 'var(--lime)',
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
        el('span', { class: 'legend-sw dashed', style: { color: 'var(--cyan)' } }),
        'Scope (h)',
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: 'var(--lime)' } }),
        'Completed (h)',
      ]),
    ]),
  ]);
}
