import { describe, it, expect } from 'vitest';
import {
  buildEpics,
  buildLightweightEpics,
  enrichEpicWithDetail,
  NO_EPIC_ID,
} from '../../src/domain/epic-builder.js';
import { buildSprintsFromIssues } from '../../src/domain/sprint-builder.js';
import { DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY } from '../../src/data/demo.js';

// DEMO_SPRINTS are already in built shape; buildEpics consumes built sprints.
describe('buildEpics', () => {
  it('groups demo issues by epic with progress + dates (golden master)', () => {
    expect(buildEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY)).toMatchSnapshot();
  });

  it('always emits a trailing No Epic bucket for orphan issues', () => {
    const epics = buildEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY);
    const noEpic = epics.find((e) => e.isNoEpic);
    expect(noEpic).toBeTruthy();
    expect(noEpic.id).toBe(NO_EPIC_ID);
    expect(epics[epics.length - 1].isNoEpic).toBe(true);
  });

  it('includes epics that have no loaded tasks', () => {
    const epics = buildEpics([], DEMO_EPICS, DEMO_TODAY);
    const keys = epics.map((e) => e.key);
    for (const meta of DEMO_EPICS) expect(keys).toContain(meta.key);
  });
});

describe('buildLightweightEpics', () => {
  it('marks only the No Epic bucket as detailLoaded', () => {
    const epics = buildLightweightEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY);
    for (const e of epics) {
      expect(e.detailLoaded).toBe(e.isNoEpic);
    }
  });
});

describe('enrichEpicWithDetail', () => {
  it('recomputes progress + dates from detailed issues (golden master)', () => {
    const [epic] = buildLightweightEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY);
    const detail = {
      epic: { name: 'Atlas Pipeline Foundations', status: { name: 'In Progress' } },
      issues: [
        {
          key: 'ATL-301', summary: 'REST client', type: 'Story', priority: 'High',
          status: { name: 'Done', statusCategory: { key: 'done' } },
          assigneeName: 'Khoa Tran', assigneeId: 'u2',
          originalEstimate: 12, timeSpent: 13, remainingEstimate: 0,
          sprintId: 'sp-23', sprintName: 'Sprint 23',
          sprintStartDate: '2026-04-20', sprintEndDate: '2026-05-08',
          epicKey: 'EPIC-100', epicName: 'Atlas Pipeline Foundations',
          statusChanges: [
            { date: '2026-04-20', toStatus: { statusCategory: { key: 'new' } } },
            { date: '2026-04-22', toStatus: { statusCategory: { key: 'indeterminate' } } },
            { date: '2026-04-30', toStatus: { statusCategory: { key: 'done' } } },
          ],
        },
      ],
    };
    expect(enrichEpicWithDetail(epic, detail, DEMO_TODAY)).toMatchSnapshot();
  });

  it('flips detailLoaded even with empty detail', () => {
    const [epic] = buildLightweightEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY);
    expect(enrichEpicWithDetail(epic, null, DEMO_TODAY).detailLoaded).toBe(true);
  });
});
