import { describe, it, expect } from 'vitest';
import {
  isWeekend,
  workingDaysBetween,
  workingDaysRemaining,
  listWorkingDays,
  todayISO,
  toLocalDateStr,
} from '../../src/domain/working-days.js';

describe('isWeekend', () => {
  it('flags Saturday and Sunday', () => {
    expect(isWeekend(new Date('2026-05-16T00:00:00'))).toBe(true); // Sat
    expect(isWeekend(new Date('2026-05-17T00:00:00'))).toBe(true); // Sun
  });
  it('clears Monday–Friday', () => {
    expect(isWeekend(new Date('2026-05-11T00:00:00'))).toBe(false); // Mon
    expect(isWeekend(new Date('2026-05-15T00:00:00'))).toBe(false); // Fri
  });
});

describe('workingDaysBetween', () => {
  it('counts a single Mon–Fri week as 5', () => {
    expect(workingDaysBetween('2026-05-11', '2026-05-15')).toBe(5);
  });
  it('spans three weeks (Sprint 24) as 15', () => {
    expect(workingDaysBetween('2026-05-11', '2026-05-29')).toBe(15);
  });
  it('excludes a weekend-only range', () => {
    expect(workingDaysBetween('2026-05-16', '2026-05-17')).toBe(0);
  });
  it('counts a single weekday as 1', () => {
    expect(workingDaysBetween('2026-05-11', '2026-05-11')).toBe(1);
  });
});

describe('workingDaysRemaining', () => {
  it('counts from today to end inclusive', () => {
    expect(workingDaysRemaining('2026-05-29', '2026-05-22')).toBe(6);
  });
  it('returns 0 once today is past the end', () => {
    expect(workingDaysRemaining('2026-05-08', '2026-05-22')).toBe(0);
  });
});

describe('listWorkingDays', () => {
  it('returns one Date per working day', () => {
    const days = listWorkingDays('2026-05-11', '2026-05-15');
    expect(days).toHaveLength(5);
    expect(days.every((d) => d instanceof Date)).toBe(true);
  });
});

describe('toLocalDateStr', () => {
  it('formats as local YYYY-MM-DD without UTC drift', () => {
    expect(toLocalDateStr(new Date(2026, 4, 5))).toBe('2026-05-05');
    expect(toLocalDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('todayISO', () => {
  it('matches the YYYY-MM-DD shape', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
