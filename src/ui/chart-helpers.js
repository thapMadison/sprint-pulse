import { svg, shortDate } from '../charts/svg.js';

export function chartGeometry({ W = 520, H = 240, PAD = { l: 36, r: 16, t: 16, b: 28 } } = {}) {
  return { W, H, PAD, innerW: W - PAD.l - PAD.r, innerH: H - PAD.t - PAD.b };
}

export function buildXs(geom, count) {
  const { PAD, innerW } = geom;
  return Array.from({ length: count }, (_, i) =>
    PAD.l + (i / Math.max(1, count - 1)) * innerW
  );
}

export function yScaleOf(geom, yMax) {
  const { PAD, innerH } = geom;
  return (v) => PAD.t + innerH * (1 - v / yMax);
}

export function niceYMax(maxVal, step = 20) {
  return Math.ceil(Math.max(maxVal, 1) / step) * step || step;
}

export function evenYTicks(yMax, count = 4) {
  return Array.from({ length: count + 1 }, (_, i) => Math.round((yMax * i) / count));
}

// Render horizontal grid lines + Y-axis labels and X-axis date labels.
// yTicks: numeric values to draw. yScale: function v -> screen y.
export function renderGridAndAxes(geom, { days, xs, yTicks, yScale, yLabel = (v) => `${v}h` }) {
  const { W, H, PAD } = geom;
  const out = [];
  const xTickEvery = Math.ceil(days.length / 6);

  for (const v of yTicks) {
    const y = yScale(v);
    out.push(
      svg('line', { class: 'grid-line', x1: PAD.l, y1: y, x2: W - PAD.r, y2: y })
    );
    out.push(
      svg('text', {
        class: 'axis-text', x: PAD.l - 8, y: y + 3, 'text-anchor': 'end',
      }, [yLabel(v)])
    );
  }
  days.forEach((d, i) => {
    if (i % xTickEvery === 0 || i === days.length - 1) {
      out.push(
        svg('text', {
          class: 'axis-text', x: xs[i], y: H - 10, 'text-anchor': 'middle',
        }, [shortDate(d)])
      );
    }
  });
  return out;
}
