import { describe, it, expect } from 'vitest';
import { parseJiraCSV } from '../../src/data/parsers/csv.js';

const SAMPLE = [
  'Issue key,Summary,Issue Type,Status,Status Category,Priority,Assignee,Σ Original Estimate,Σ Time Spent,Σ Remaining Estimate,Sprint,Parent',
  'ATL-1,Do a thing,Story,In Progress,In Progress,High,Linh Nguyen,28800,7200,21600,Sprint 24,EPIC-1',
  'ATL-2,"Quoted, with comma",Task,Done,Done,Low,Khoa Tran,1d 4h,1d,0,Sprint 24,',
  'ATL-3,Weekend work,Bug,To Do,To Do,Medium,,0,0,0,Sprint 24,',
].join('\n');

describe('parseJiraCSV', () => {
  it('parses a standard Jira CSV export (golden master)', () => {
    expect(parseJiraCSV(SAMPLE)).toMatchSnapshot();
  });

  it('returns empty for a header-only file', () => {
    expect(parseJiraCSV('Issue key,Summary\n')).toEqual([]);
  });

  it('throws when the Issue key column is missing', () => {
    expect(() => parseJiraCSV('Summary,Status\nfoo,bar')).toThrow(/Issue key/);
  });

  it('converts duration strings and seconds to hours', () => {
    const [a, b] = parseJiraCSV(SAMPLE);
    expect(a.originalEstimate).toBe(8); // 28800s
    expect(b.originalEstimate).toBe(12); // 1d 4h
    expect(b.timeSpent).toBe(8); // 1d
  });
});
