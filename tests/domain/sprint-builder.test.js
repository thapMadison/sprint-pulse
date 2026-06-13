import { describe, it, expect } from 'vitest';
import {
  buildSprintsFromIssues,
  buildSprintShells,
  populateSprintIssues,
  buildBacklogShell,
  BACKLOG_ID,
} from '../../src/domain/sprint-builder.js';

const TODAY = '2026-05-22';

const RAW_ISSUES = [
  {
    key: 'ATL-1', summary: 'First', type: 'Story', priority: 'High',
    status: { name: 'Done', statusCategory: { key: 'done' } },
    assigneeName: 'Linh Nguyen', assigneeId: 'u1',
    originalEstimate: 8, timeSpent: 7, remainingEstimate: 0,
    sprintName: 'Sprint 24', sprintStartDate: '2026-05-11', sprintEndDate: '2026-05-29',
    sprintState: 'active', sprintGoal: 'Ship it', epicKey: 'EPIC-1', epicName: 'Pipeline',
  },
  {
    key: 'ATL-2', summary: 'Second', type: 'Task', priority: 'Medium',
    status: 'In Progress',
    assigneeName: 'Khoa Tran', assigneeId: 'u2',
    originalEstimate: 5, timeSpent: 2, remainingEstimate: 3,
    sprintName: 'Sprint 24',
  },
  {
    key: 'ATL-3', summary: 'Orphan', type: 'Bug', priority: 'Low',
    status: 'To Do',
    assigneeName: '', assigneeId: '',
    originalEstimate: 0, timeSpent: 0, remainingEstimate: 0,
    // no sprintName -> Backlog, no dates -> inferred
  },
];

describe('buildSprintsFromIssues', () => {
  it('groups, normalizes and infers (golden master)', () => {
    expect(buildSprintsFromIssues(RAW_ISSUES, TODAY)).toMatchSnapshot();
  });

  it('falls back unnamed sprints to a single Backlog group', () => {
    const sprints = buildSprintsFromIssues(RAW_ISSUES, TODAY);
    const names = sprints.map((s) => s.name);
    expect(names).toContain('Sprint 24');
    expect(names).toContain('Backlog');
  });

  it('marks eagerly-built sprints as issuesLoaded', () => {
    const sprints = buildSprintsFromIssues(RAW_ISSUES, TODAY);
    expect(sprints.every((s) => s.issuesLoaded)).toBe(true);
  });
});

describe('buildSprintShells', () => {
  it('builds metadata-only shells (golden master)', () => {
    const shells = buildSprintShells(
      [
        { id: 101, name: 'Sprint 24', state: 'ACTIVE', startDate: '2026-05-11T00:00:00.000Z', endDate: '2026-05-29T00:00:00.000Z', goal: 'Ship' },
        { id: 100, name: 'Sprint 23', state: 'CLOSED', startDate: '2026-04-20T00:00:00.000Z', endDate: '2026-05-08T00:00:00.000Z' },
      ],
      TODAY,
    );
    expect(shells).toMatchSnapshot();
  });

  it('leaves shells with issuesLoaded false', () => {
    const shells = buildSprintShells([{ id: 1, name: 'S', startDate: '2026-05-11', endDate: '2026-05-29' }], TODAY);
    expect(shells[0].issuesLoaded).toBe(false);
  });
});

describe('buildBacklogShell', () => {
  it('builds an always-present, unloaded Backlog shell pinned to the backlog state', () => {
    const shell = buildBacklogShell(TODAY);
    expect(shell.id).toBe(BACKLOG_ID);
    expect(shell.name).toBe('Backlog');
    expect(shell.state).toBe('backlog');
    expect(shell.jiraId).toBeNull();
    expect(shell.issuesLoaded).toBe(false);
    expect(shell.startDate).toBe(TODAY);
    expect(shell.endDate).toBe(TODAY);
  });

  it('fills via populateSprintIssues like a sprint shell', () => {
    const populated = populateSprintIssues(buildBacklogShell(TODAY), RAW_ISSUES.slice(0, 1));
    expect(populated.issuesLoaded).toBe(true);
    expect(populated.issues).toHaveLength(1);
    expect(populated.state).toBe('backlog');
  });
});

describe('populateSprintIssues', () => {
  it('fills a shell with normalized issues and flips issuesLoaded', () => {
    const shell = buildSprintShells([{ id: 1, name: 'Sprint 24', startDate: '2026-05-11', endDate: '2026-05-29', state: 'active' }], TODAY)[0];
    const populated = populateSprintIssues(shell, RAW_ISSUES.slice(0, 2));
    expect(populated.issuesLoaded).toBe(true);
    expect(populated.issues).toHaveLength(2);
    expect(populated).toMatchSnapshot();
  });
});
