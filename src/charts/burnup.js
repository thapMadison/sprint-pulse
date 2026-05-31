import { renderAreaLineChart } from './area-line-chart.js';
import { t } from '../app/i18n.js';

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
    refLabel: t('chart.burnup.scope'),
    actualLabel: t('chart.burnup.completed'),
  });
}
