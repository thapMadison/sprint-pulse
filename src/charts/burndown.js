import { renderAreaLineChart } from './area-line-chart.js';

// Ideal linear burndown vs. actual remaining effort (interpolated from changelog).
export function renderBurndown(series) {
  return renderAreaLineChart({
    series,
    refKey: 'idealLine',
    actualKey: 'actualRemaining',
    refClass: 'line-ideal',
    actualClass: 'line-actual',
    areaClass: 'area-actual',
    refColor: 'oklch(1 0 0 / 0.4)',
    actualColor: 'var(--coral)',
    refLabel: 'Ideal burndown',
    actualLabel: 'Actual remaining (h)',
  });
}
