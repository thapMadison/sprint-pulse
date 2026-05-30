import { describe, it, expect } from 'vitest';
import { normalizeStatus, extractStatusName } from '../../src/domain/status.js';

describe('normalizeStatus', () => {
  it('defaults empty input to todo', () => {
    expect(normalizeStatus(null)).toBe('todo');
    expect(normalizeStatus('')).toBe('todo');
    expect(normalizeStatus(undefined)).toBe('todo');
  });

  it('maps known string names', () => {
    expect(normalizeStatus('To Do')).toBe('todo');
    expect(normalizeStatus('Backlog')).toBe('todo');
    expect(normalizeStatus('In Progress')).toBe('inprogress');
    expect(normalizeStatus('In Review')).toBe('inprogress');
    expect(normalizeStatus('Blocked')).toBe('inprogress');
    expect(normalizeStatus('Done')).toBe('done');
    expect(normalizeStatus('Resolved')).toBe('done');
  });

  it('maps statusCategory keys on objects', () => {
    expect(normalizeStatus({ statusCategory: { key: 'new' } })).toBe('todo');
    expect(normalizeStatus({ statusCategory: { key: 'indeterminate' } })).toBe('inprogress');
    expect(normalizeStatus({ statusCategory: { key: 'done' } })).toBe('done');
  });

  it('falls back to a name heuristic for custom statuses', () => {
    expect(normalizeStatus('Code Review')).toBe('inprogress');
    expect(normalizeStatus('QA Testing')).toBe('inprogress');
    expect(normalizeStatus('Selected for Development')).toBe('todo');
    expect(normalizeStatus("Won't Fix")).toBe('done');
    expect(normalizeStatus({ name: 'Implementing' })).toBe('inprogress');
  });

  it('falls back to todo for unrecognized input', () => {
    expect(normalizeStatus('Something Weird')).toBe('todo');
  });
});

describe('extractStatusName', () => {
  it('returns the raw string', () => {
    expect(extractStatusName('In Progress')).toBe('In Progress');
  });
  it('returns the name field of an object', () => {
    expect(extractStatusName({ name: 'Code Review' })).toBe('Code Review');
  });
  it('returns empty string for missing input', () => {
    expect(extractStatusName(null)).toBe('');
    expect(extractStatusName({})).toBe('');
  });
});
