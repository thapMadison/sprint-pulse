// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isSupportedTheme, getActiveTheme, setActiveTheme, resolveInitialTheme, applyTheme,
  DEFAULT_THEME, SUPPORTED_THEMES, THEME_STORAGE_KEY,
} from '../../src/app/theme.js';

describe('theme core', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete globalThis.matchMedia;
    setActiveTheme(DEFAULT_THEME);
  });
  afterEach(() => {
    delete globalThis.matchMedia;
  });

  describe('registry', () => {
    it('knows the supported themes', () => {
      expect(SUPPORTED_THEMES).toEqual(['light', 'dark']);
      expect(isSupportedTheme('light')).toBe(true);
      expect(isSupportedTheme('dark')).toBe(true);
      expect(isSupportedTheme('sepia')).toBe(false);
      expect(isSupportedTheme(null)).toBe(false);
    });
  });

  describe('active theme', () => {
    it('sets and reads the active theme', () => {
      expect(setActiveTheme('dark')).toBe('dark');
      expect(getActiveTheme()).toBe('dark');
    });

    it('falls back to the default for an unsupported value', () => {
      const resolved = setActiveTheme('neon');
      expect(resolved).toBe(DEFAULT_THEME);
      expect(getActiveTheme()).toBe(DEFAULT_THEME);
    });
  });

  describe('resolveInitialTheme', () => {
    it('prefers a saved choice over everything else', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      // Even with the OS asking for light, the saved value wins.
      globalThis.matchMedia = () => ({ matches: false });
      expect(resolveInitialTheme()).toBe('dark');
    });

    it('ignores an invalid saved value', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'banana');
      expect(resolveInitialTheme()).toBe('light');
    });

    it('follows the OS when no choice is saved', () => {
      globalThis.matchMedia = (q) => ({ matches: q.includes('dark') });
      expect(resolveInitialTheme()).toBe('dark');
    });

    it('falls back to light when nothing is saved and OS is light/unknown', () => {
      expect(resolveInitialTheme()).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('adds the theme-light class for the light theme', () => {
      applyTheme('light');
      expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    });

    it('removes the theme-light class for the dark theme', () => {
      document.documentElement.classList.add('theme-light');
      applyTheme('dark');
      expect(document.documentElement.classList.contains('theme-light')).toBe(false);
    });
  });
});
