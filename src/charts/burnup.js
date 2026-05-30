import { renderAreaLineChart } from './area-line-chart.js';

// Sprint scope vs. cumulative completed effort.
export function renderBurnup(series) {
  return renderAreaLineChart({
    series,
    refKey: 'scopeLine',
    actualKey: 'completedLine',
    refClass: 'line-scope',
    actualClass: 'line-completed',
    areaClass: 'area-completed',
    refColor: 'var(--cyan)',
    actualColor: 'var(--lime)',
    refLabel: 'Scope (h)',
    actualLabel: 'Completed (h)',
  });
}
