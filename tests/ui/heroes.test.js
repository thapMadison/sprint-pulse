// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderSprintHero } from '../../src/ui/components/sprint-hero.js';
import { renderEpicHero } from '../../src/ui/components/epic-hero.js';
import { buildLightweightEpics } from '../../src/domain/epic-builder.js';
import { DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY } from '../../src/data/demo.js';

const activeSprint = DEMO_SPRINTS.find((s) => s.state === 'active');
const epics = buildLightweightEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY);
const realEpic = epics.find((e) => !e.isNoEpic);
const noEpic = epics.find((e) => e.isNoEpic);

describe('hero components (golden master DOM)', () => {
  it('renderSprintHero', () => {
    expect(renderSprintHero({ sprint: activeSprint, today: DEMO_TODAY }).outerHTML).toMatchSnapshot();
  });

  it('renderEpicHero (real epic)', () => {
    expect(renderEpicHero({ epic: realEpic, today: DEMO_TODAY }).outerHTML).toMatchSnapshot();
  });

  it('renderEpicHero (No Epic bucket)', () => {
    expect(renderEpicHero({ epic: noEpic, today: DEMO_TODAY }).outerHTML).toMatchSnapshot();
  });
});
