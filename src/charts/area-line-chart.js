import { svg, pathFromPoints, smoothPath } from './svg.js';
import { el } from '../ui/dom.js';
import {
  chartGeometry, buildXs, yScaleOf, niceYMax, evenYTicks, renderGridAndAxes,
} from '../ui/chart-helpers.js';

// Shared renderer for the two area+line charts (burndown, burnup). Both draw a
// straight reference line plus a smoothed "actual" line with a filled area and
// dotted markers — only the series fields, colors, CSS classes and labels differ.
//
//   refKey/actualKey  — series property names to plot
//   *Class            — CSS classes for the reference line, actual line and area
//   refColor          — legend swatch color for the (dashed) reference line
//   actualColor       — dot fill + legend swatch for the actual line
export function renderAreaLineChart({
  series, refKey, actualKey,
  refClass, actualClass, areaClass,
  refColor, actualColor, refLabel, actualLabel,
}) {
  const geom = chartGeometry();
  const { days } = series;
  const refLine = series[refKey];
  const actualLine = series[actualKey];

  const valid = actualLine.filter((v) => v != null);
  const yMax = niceYMax(Math.max(...refLine, ...(valid.length ? valid : [0])));
  const xs = buildXs(geom, days.length);
  const yScale = yScaleOf(geom, yMax);

  const refPts = refLine.map((v, i) => [xs[i], yScale(v)]);
  const actualPts = actualLine
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
    svg('path', { class: `${refClass} line-draw`, d: pathFromPoints(refPts) }),
  ];
  if (areaPath) children.push(svg('path', { class: `${areaClass} area-fade`, d: areaPath }));
  children.push(svg('path', { class: `${actualClass} line-draw`, d: smoothPath(actualPts) }));
  for (const [x, y] of actualPts) {
    children.push(svg('circle', {
      cx: x, cy: y, r: 3, fill: actualColor,
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
        el('span', { class: 'legend-sw dashed', style: { color: refColor } }),
        refLabel,
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw', style: { background: actualColor } }),
        actualLabel,
      ]),
    ]),
  ]);
}
