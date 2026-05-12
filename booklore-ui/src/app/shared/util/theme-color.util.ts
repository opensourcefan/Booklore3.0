export type ThemeColorType = 'primary' | 'surface';
export type ColorPalette = Record<string, string>;

const HEX_COLOR_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const TONES = ['0', '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

const PRIMARY_LIGHTNESS: Record<(typeof TONES)[number], number> = {
  '0': 100,
  '50': 97,
  '100': 93,
  '200': 86,
  '300': 76,
  '400': 66,
  '500': 56,
  '600': 48,
  '700': 41,
  '800': 34,
  '900': 27,
  '950': 20,
};

const SURFACE_LIGHTNESS: Record<(typeof TONES)[number], number> = {
  '0': 100,
  '50': 98,
  '100': 95,
  '200': 89,
  '300': 80,
  '400': 65,
  '500': 50,
  '600': 42,
  '700': 32,
  '800': 24,
  '900': 16,
  '950': 10,
};

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expandHexColor(value: string): string {
  const raw = value.startsWith('#') ? value.slice(1) : value;
  if (raw.length !== 3) {
    return raw;
  }

  return raw.split('').map(char => char + char).join('');
}

function hexToRgb(value: string): RgbColor {
  const normalized = expandHexColor(value);
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({red, green, blue}: RgbColor): string {
  return `#${[red, green, blue]
    .map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function rgbToHsl({red, green, blue}: RgbColor): HslColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maxChannel = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minChannel = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maxChannel - minChannel;
  const lightness = (maxChannel + minChannel) / 2;

  if (delta === 0) {
    return {
      hue: 0,
      saturation: 0,
      lightness: lightness * 100,
    };
  }

  const saturation = lightness > 0.5
    ? delta / (2 - maxChannel - minChannel)
    : delta / (maxChannel + minChannel);

  let hue: number;
  if (maxChannel === normalizedRed) {
    hue = ((normalizedGreen - normalizedBlue) / delta + (normalizedGreen < normalizedBlue ? 6 : 0)) * 60;
  } else if (maxChannel === normalizedGreen) {
    hue = ((normalizedBlue - normalizedRed) / delta + 2) * 60;
  } else {
    hue = ((normalizedRed - normalizedGreen) / delta + 4) * 60;
  }

  return {
    hue,
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
}

function hslToRgb({hue, saturation, lightness}: HslColor): RgbColor {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = clamp(saturation, 0, 100) / 100;
  const normalizedLightness = clamp(lightness, 0, 100) / 100;

  if (normalizedSaturation === 0) {
    const grayChannel = normalizedLightness * 255;
    return {
      red: grayChannel,
      green: grayChannel,
      blue: grayChannel,
    };
  }

  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const huePrime = normalizedHue / 60;
  const secondComponent = chroma * (1 - Math.abs(huePrime % 2 - 1));
  const match = normalizedLightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime < 1) {
    red = chroma;
    green = secondComponent;
  } else if (huePrime < 2) {
    red = secondComponent;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondComponent;
  } else if (huePrime < 4) {
    green = secondComponent;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondComponent;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondComponent;
  }

  return {
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
  };
}

export function isHexColor(value: string | null | undefined): value is string {
  return value != null && HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!isHexColor(value)) {
    return null;
  }

  return `#${expandHexColor(value.trim()).toLowerCase()}`;
}

export function createThemePaletteFromHex(value: string, type: ThemeColorType): ColorPalette {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return {};
  }

  const {hue, saturation} = rgbToHsl(hexToRgb(normalized));
  const effectiveSaturation = type === 'primary'
    ? clamp(saturation, 48, 92)
    : clamp(saturation * 0.22, 6, 24);
  const lightnessScale = type === 'primary' ? PRIMARY_LIGHTNESS : SURFACE_LIGHTNESS;

  return TONES.reduce<ColorPalette>((palette, tone) => {
    palette[tone] = rgbToHex(hslToRgb({
      hue,
      saturation: effectiveSaturation,
      lightness: lightnessScale[tone],
    }));
    return palette;
  }, {});
}

export function getRecentThemeColors(
  currentColors: string[] | null | undefined,
  nextColor: string,
  maxEntries = 8,
): string[] {
  const normalized = normalizeHexColor(nextColor);
  if (!normalized) {
    return currentColors ?? [];
  }

  const seen = new Set<string>([normalized]);
  const dedupedExisting = (currentColors ?? [])
    .map(color => normalizeHexColor(color))
    .filter((color): color is string => {
      if (color == null || seen.has(color)) {
        return false;
      }

      seen.add(color);
      return true;
    });

  return [normalized, ...dedupedExisting].slice(0, maxEntries);
}