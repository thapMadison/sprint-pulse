// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  normalizeIssueType, issueTypeLabel, issueTypeColor, issueTypeIcon, issueTypeBadge,
} from '../../src/ui/components/issue-type-icon.js';

describe('issue-type-icon', () => {
  describe('normalizeIssueType', () => {
    it('maps known Jira type names to canonical keys', () => {
      expect(normalizeIssueType('Epic')).toBe('epic');
      expect(normalizeIssueType('Story')).toBe('story');
      expect(normalizeIssueType('Task')).toBe('task');
      expect(normalizeIssueType('Bug')).toBe('bug');
      expect(normalizeIssueType('Sub-task')).toBe('subtask');
      expect(normalizeIssueType('Subtask')).toBe('subtask');
    });

    it('treats defect/incident as bug', () => {
      expect(normalizeIssueType('Defect')).toBe('bug');
      expect(normalizeIssueType('Incident')).toBe('bug');
    });

    it('is case- and whitespace-insensitive', () => {
      expect(normalizeIssueType('  BUG  ')).toBe('bug');
      expect(normalizeIssueType('User Story')).toBe('story');
    });

    it('falls back to task for unknown or empty input', () => {
      expect(normalizeIssueType('')).toBe('task');
      expect(normalizeIssueType(null)).toBe('task');
      expect(normalizeIssueType(undefined)).toBe('task');
      expect(normalizeIssueType('Spike')).toBe('task');
    });
  });

  describe('issueTypeLabel / issueTypeColor', () => {
    it('returns the canonical label for a raw type', () => {
      expect(issueTypeLabel('bug')).toBe('Bug');
      expect(issueTypeLabel('Sub-task')).toBe('Sub-task');
    });

    it('returns a hex colour for every canonical type', () => {
      for (const t of ['Epic', 'Story', 'Task', 'Bug', 'Sub-task']) {
        expect(issueTypeColor(t)).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });

  describe('issueTypeIcon / issueTypeBadge', () => {
    it('renders a coloured tile carrying the type class and tooltip', () => {
      const icon = issueTypeIcon('Bug', { size: 20 });
      expect(icon.className).toContain('type-bug');
      expect(icon.getAttribute('title')).toBe('Bug');
      expect(icon.style.width).toBe('20px');
      expect(icon.style.height).toBe('20px');
    });

    it('omits the tooltip when withTitle is false', () => {
      const icon = issueTypeIcon('Story', { withTitle: false });
      expect(icon.getAttribute('title')).toBeNull();
    });

    it('badge pairs the icon with the label text', () => {
      const badge = issueTypeBadge('Story');
      expect(badge.className).toBe('issue-type-badge');
      expect(badge.querySelector('.issue-type-icon')).not.toBeNull();
      expect(badge.textContent).toContain('Story');
    });
  });
});
