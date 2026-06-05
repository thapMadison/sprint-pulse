// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateDailySeries } from '../../src/domain/series.js';
import { DEMO_SPRINTS, DEMO_TODAY } from '../../src/data/demo.js';
import { renderBurndown } from '../../src/charts/burndown.js';
import { renderBurnup } from '../../src/charts/burnup.js';
import { renderCFD } from '../../src/charts/cfd.js';
import { renderControl } from '../../src/charts/control.js';
import { renderDonut } from '../../src/charts/donut.js';

const active = DEMO_SPRINTS.find((s) => s.state === 'active');
const series = generateDailySeries(active, DEMO_TODAY);

describe('chart renderers (golden master DOM)', () => {
  it('renderBurndown', () => {
    expect(renderBurndown(series).outerHTML).toMatchSnapshot();
  });

  it('renderBurnup', () => {
    expect(renderBurnup(series).outerHTML).toMatchSnapshot();
  });

  it('renderCFD', () => {
    expect(renderCFD(series).outerHTML).toMatchSnapshot();
  });

  it('renderControl', () => {
    expect(renderControl(series).outerHTML).toMatchSnapshot();
  });

  it('renderDonut', () => {
    const donut = renderDonut({
      statuses: [
        { label: 'Done', color: 'oklch(0.81 0.155 130)', count: 7, hours: 30 },
        { label: 'In Review', color: 'oklch(0.80 0.135 75)', count: 3, hours: 12 },
        { label: 'In Progress', color: 'oklch(0.73 0.14 60)', count: 2, hours: 8.5 },
        { label: 'To Do', color: 'oklch(0.50 0.02 270)', count: 3, hours: 10 },
      ],
      totalIssues: 15,
    });
    expect(donut.outerHTML).toMatchSnapshot();
  });

  it('renderControl shows an empty state with no completed issues', () => {
    const node = renderControl({ ...series, controlPoints: [] });
    expect(node.textContent).toContain('No completed issues yet');
  });
});
