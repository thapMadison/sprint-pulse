import { describe, it, expect } from 'vitest';
import { parseJiraJSON } from '../../src/data/parsers/json.js';

describe('parseJiraJSON', () => {
  it('passes through a pre-shaped array unchanged', () => {
    const raw = [{ key: 'ATL-1', summary: 'x', originalEstimate: 4 }];
    expect(parseJiraJSON(JSON.stringify(raw))).toEqual(raw);
  });

  it('maps a Jira REST search response (golden master)', () => {
    const response = {
      issues: [
        {
          key: 'ATL-9',
          fields: {
            summary: 'Build pipeline',
            issuetype: { name: 'Story' },
            priority: { name: 'High' },
            status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
            assignee: { displayName: 'Mai Pham', accountId: 'acc-1' },
            timetracking: {
              originalEstimateSeconds: 28800,
              timeSpentSeconds: 7200,
              remainingEstimateSeconds: 21600,
            },
            sprint: {
              name: 'Sprint 24',
              startDate: '2026-05-11T00:00:00.000Z',
              endDate: '2026-05-29T00:00:00.000Z',
              state: 'ACTIVE',
              goal: 'Ship it',
            },
            parent: { key: 'EPIC-1', fields: { summary: 'Pipeline epic' } },
          },
        },
      ],
    };
    expect(parseJiraJSON(JSON.stringify(response))).toMatchSnapshot();
  });

  it('throws on an unrecognized shape', () => {
    expect(() => parseJiraJSON('{"foo":1}')).toThrow(/not recognized/);
  });
});
