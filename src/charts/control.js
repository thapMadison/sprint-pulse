import { svg } from './svg.js';
import { el } from '../ui/dom.js';
import { chartGeometry, buildXs, yScaleOf, renderGridAndAxes } from '../ui/chart-helpers.js';
import { t } from '../app/i18n.js';

export function renderControl(series) {
  const geom = chartGeometry({ H: 260 });
  const { W, PAD, innerW } = geom;
  const { days, controlPoints } = series;

  if (!controlPoints.length) {
    return el('div', {
      class: 'chart-wrap tall',
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: '12px',
      },
    }, [t('chart.control.empty')]);
  }

  const mean = controlPoints.reduce((s, p) => s + p.cycleTime, 0) / controlPoints.length;
  const stdDev = Math.sqrt(
    controlPoints.reduce((s, p) => s + (p.cycleTime - mean) ** 2, 0) / controlPoints.length
  );
  const upperBand = mean + 2 * stdDev;
  const maxY = Math.max(upperBand * 1.1, ...controlPoints.map((p) => p.cycleTime), 1);
  const yMax = Math.ceil(maxY / 2) * 2 || 2;

  const xs = buildXs(geom, days.length);
  const yScale = yScaleOf(geom, yMax);
  const xScale = (i) => xs[i];

  const bandTop = yScale(Math.min(yMax, mean + 2 * stdDev));
  const bandBot = yScale(Math.max(0, mean - 2 * stdDev));

  const yTicks = [0, Math.round(yMax / 2), yMax];
  const children = renderGridAndAxes(geom, { days, xs, yTicks, yScale, yLabel: (v) => `${v}d` });

  children.push(svg('rect', {
    class: 'control-band area-fade',
    x: PAD.l, y: bandTop, width: innerW, height: bandBot - bandTop,
  }));
  children.push(svg('line', {
    class: 'control-mean line-draw',
    x1: PAD.l, y1: yScale(mean), x2: W - PAD.r, y2: yScale(mean),
  }));
  controlPoints.forEach((p, i) => {
    const isOutlier = Math.abs(p.cycleTime - mean) > 1.5 * stdDev;
    const tooltip = p.completionDate
      ? `${p.key}: ${p.cycleTime}d (${p.startDate} → ${p.completionDate})`
      : `${p.key}: ${p.cycleTime.toFixed(1)}d (no changelog)`;

    // Add jitter to prevent overlapping dots
    const jitterX = (Math.sin(i * 2.3) * 4);
    const jitterY = (Math.cos(i * 3.1) * 3);

    const c = svg('circle', {
      class: isOutlier ? 'control-pt-outlier' : 'control-pt',
      cx: xScale(p.dayIdx) + jitterX,
      cy: yScale(p.cycleTime) + jitterY,
      r: isOutlier ? 6 : 5,
    });
    c.style.animation = `barRise 0.6s ${i * 0.05}s both cubic-bezier(0.2,0.8,0.2,1)`;
    c.style.cursor = 'pointer';
    const title = svg('title', {}, [tooltip]);
    c.appendChild(title);
    children.push(c);
  });
  children.push(svg('text', {
    class: 'axis-text',
    x: W - PAD.r - 4, y: yScale(mean) - 4,
    'text-anchor': 'end', fill: 'var(--cyan)',
  }, [t('chart.control.mean', { mean: mean.toFixed(1) })]));

  return el('div', { class: 'chart-wrap tall' }, [
    svg('svg', {
      viewBox: `0 0 ${W} ${geom.H}`, width: '100%', height: '100%', preserveAspectRatio: 'none',
    }, children),
    el('div', { class: 'legend' }, [
      el('span', { class: 'legend-item' }, [
        el('span', {
          class: 'legend-sw',
          style: { background: 'var(--violet)', borderRadius: '999px', height: '8px', width: '8px' },
        }),
        t('chart.control.cycleTime'),
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', {
          class: 'legend-sw',
          style: { background: 'var(--coral)', borderRadius: '999px', height: '8px', width: '8px' },
        }),
        t('chart.control.outlier'),
      ]),
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'legend-sw dashed', style: { color: 'var(--cyan)' } }),
        t('chart.control.meanBand'),
      ]),
    ]),
  ]);
}
