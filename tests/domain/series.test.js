import { describe, it, expect } from 'vitest';
import { generateDailySeries } from '../../src/domain/series.js';
import { DEMO_SPRINTS, DEMO_TODAY } from '../../src/data/demo.js';

const active = DEMO_SPRINTS.find((s) => s.state === 'active');
const closed = DEMO_SPRINTS.find((s) => s.state === 'closed');
const future = DEMO_SPRINTS.find((s) => s.state === 'future');

describe('generateDailySeries', () => {
  it('builds the active-sprint series from changelog (golden master)', () => {
    expect(generateDailySeries(active, DEMO_TODAY)).toMatchSnapshot();
  });

  it('builds a closed-sprint series (golden master)', () => {
    expect(generateDailySeries(closed, DEMO_TODAY)).toMatchSnapshot();
  });

  it('builds a future-sprint series (golden master)', () => {
    expect(generateDailySeries(future, DEMO_TODAY)).toMatchSnapshot();
  });

  it('exposes one entry per working day across every series array', () => {
    const s = generateDailySeries(active, DEMO_TODAY);
    expect(s.days).toHaveLength(s.totalDays);
    expect(s.idealLine).toHaveLength(s.totalDays);
    expect(s.actualRemaining).toHaveLength(s.totalDays);
    expect(s.scopeLine).toHaveLength(s.totalDays);
    expect(s.completedLine).toHaveLength(s.totalDays);
    expect(s.cfd).toHaveLength(s.totalDays);
  });

  it('hides future days of an active sprint (null beyond elapsed)', () => {
    const s = generateDailySeries(active, DEMO_TODAY);
    expect(s.actualRemaining[s.totalDays - 1]).toBeNull();
    expect(s.actualRemaining[0]).not.toBeNull();
  });
});
