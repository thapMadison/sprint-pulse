import { describe, it, expect } from 'vitest';
import { statusCategoryKey } from '../../src/data/parsers/status-category.js';

describe('statusCategoryKey', () => {
  it('defaults empty input to new', () => {
    expect(statusCategoryKey('')).toBe('new');
    expect(statusCategoryKey(null)).toBe('new');
  });
  it('detects done', () => {
    expect(statusCategoryKey('Done')).toBe('done');
    expect(statusCategoryKey('DONE')).toBe('done');
  });
  it('detects in-progress / indeterminate', () => {
    expect(statusCategoryKey('In Progress')).toBe('indeterminate');
    expect(statusCategoryKey('Indeterminate')).toBe('indeterminate');
  });
  it('detects to-do / open as new', () => {
    expect(statusCategoryKey('To Do')).toBe('new');
    expect(statusCategoryKey('Open')).toBe('new');
  });
  it('falls back to new for anything else', () => {
    expect(statusCategoryKey('Mystery')).toBe('new');
  });
});
