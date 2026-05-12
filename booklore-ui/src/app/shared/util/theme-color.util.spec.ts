import {describe, expect, it} from 'vitest';

import {
  createThemePaletteFromHex,
  getRecentThemeColors,
  isHexColor,
  normalizeHexColor,
} from './theme-color.util';

describe('theme-color.util', () => {
  it('normalizes three-digit and six-digit hex colors', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('A1B2C3')).toBe('#a1b2c3');
  });

  it('rejects non-hex values', () => {
    expect(isHexColor('green')).toBe(false);
    expect(normalizeHexColor('rgb(0,0,0)')).toBeNull();
  });

  it('builds a full primary palette from a custom color', () => {
    const palette = createThemePaletteFromHex('#4f46e5', 'primary');

    expect(palette['50']).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette['500']).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette['950']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('builds a full surface palette from a custom color', () => {
    const palette = createThemePaletteFromHex('#14b8a6', 'surface');

    expect(palette['0']).toBe('#ffffff');
    expect(palette['900']).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette['950']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps recent colors deduped with newest first', () => {
    expect(getRecentThemeColors(['#112233', '#445566', '#112233'], '#445566', 4))
      .toEqual(['#445566', '#112233']);
  });
});