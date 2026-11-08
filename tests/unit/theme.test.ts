import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  isTheme,
  readStoredTheme,
  storeTheme,
  THEME_STORAGE_KEY
} from '../../src/theme/theme';

describe('theme preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('validates theme names', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it('falls back to the default theme when nothing valid is stored', () => {
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });

  it('persists and reads the selected theme', () => {
    storeTheme('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('applies the theme to the document root and browser chrome color', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);

    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.getAttribute('content')).toBe('#20262c');

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.getAttribute('content')).toBe('#f0f0f0');

    meta.remove();
  });
});
