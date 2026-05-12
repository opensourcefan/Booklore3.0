const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

const HEX6_REGEX = /^#?[0-9a-fA-F]{6}$/;
const HEX3_REGEX = /^#?[0-9a-fA-F]{3}$/;

export class ColorParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColorParseError';
  }
}

function hclToRgb(h: number, c: number, l: number): { r: number; g: number; b: number } {
  const t = c;
  let r: number, g: number, b: number;

  if (t !== 0) {
    const hh = ((h % 360) + 360) % 360;
    const hPrime = hh / 60;
    const x = t * (1 - Math.abs((hPrime % 2) - 1));
    const m = l - t / 2;

    let r1 = 0, g1 = 0, b1 = 0;
    if (hPrime < 1) { r1 = t; g1 = x; }
    else if (hPrime < 2) { r1 = x; g1 = t; }
    else if (hPrime < 3) { g1 = t; b1 = x; }
    else if (hPrime < 4) { g1 = x; b1 = t; }
    else if (hPrime < 5) { r1 = x; b1 = t; }
    else { r1 = t; b1 = x; }

    r = Math.round((r1 + m) * 255);
    g = Math.round((g1 + m) * 255);
    b = Math.round((b1 + m) * 255);
  } else {
    r = g = b = Math.round(l * 255);
  }

  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  return hclToRgb(h, c, l);
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)));
    return clamped.toString(16).padStart(2, '0');
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rf) {
      h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
    } else if (max === gf) {
      h = ((bf - rf) / d + 2) / 6;
    } else {
      h = ((rf - gf) / d + 4) / 6;
    }
  }
  return { h: h * 360, s, l };
}

function parseRgbString(input: string): string {
  const match = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/i);
  if (!match) {
    throw new ColorParseError('Invalid RGB/RGBA format. Expected: rgb(r, g, b) or rgba(r, g, b, a)');
  }
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  if (r > 255 || g > 255 || b > 255) {
    throw new ColorParseError('RGB values must be between 0 and 255');
  }
  return rgbToHex(r, g, b);
}

function parseHslString(input: string): string {
  const match = input.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i);
  if (!match) {
    throw new ColorParseError('Invalid HSL format. Expected: hsl(h, s%, l%)');
  }
  const h = parseFloat(match[1]);
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  if (s > 1 || l > 1) {
    throw new ColorParseError('HSL saturation and lightness must be percentages (0-100)');
  }
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function parseColorToHex(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ColorParseError('Color input is empty');
  }

  if (HEX6_REGEX.test(trimmed)) {
    const hex = trimmed.replace(/^#/, '').toLowerCase();
    return '#' + hex;
  }

  if (HEX3_REGEX.test(trimmed)) {
    const hex = trimmed.replace(/^#/, '').toLowerCase();
    const expanded = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return '#' + expanded;
  }

  if (trimmed.startsWith('rgb')) {
    return parseRgbString(trimmed);
  }

  if (trimmed.startsWith('hsl')) {
    return parseHslString(trimmed);
  }

  const lower = trimmed.toLowerCase();
  if (CSS_NAMED_COLORS[lower]) {
    return CSS_NAMED_COLORS[lower];
  }

  throw new ColorParseError(`Cannot parse color: "${trimmed}". Use a hex code (e.g., #ff6600), RGB, HSL, or a named CSS color.`);
}

export function isValidColorInput(input: string): boolean {
  try {
    parseColorToHex(input);
    return true;
  } catch {
    return false;
  }
}

export function generateShadeScale(baseHex: string): Record<number, string> {
  const hex = parseColorToHex(baseHex);
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const scale: Record<number, string> = {};

  // Shade 500 is the base color itself
  scale[500] = hex;

  // Build lighter shades (50-400) interpolating from base to near-white
  const lightStops: [number, number, number][] = [
    [50, 0.96, 0.4],
    [100, 0.88, 0.6],
    [200, 0.78, 0.8],
    [300, 0.68, 0.9],
    [400, 0.58, 0.95],
  ];
  for (const [shade, lTarget, sMultiplier] of lightStops) {
    const s = hsl.s * sMultiplier;
    const rgbColor = hslToRgb(hsl.h, s, lTarget);
    scale[shade] = rgbToHex(rgbColor.r, rgbColor.g, rgbColor.b);
  }

  // Build darker shades (600-950) interpolating from base to near-black
  const darkStops: [number, number, number][] = [
    [600, 0.44, 1.0],
    [700, 0.34, 1.0],
    [800, 0.24, 1.0],
    [900, 0.16, 1.0],
    [950, 0.08, 1.0],
  ];
  for (const [shade, lTarget, sMultiplier] of darkStops) {
    const s = hsl.s * sMultiplier;
    const rgbColor = hslToRgb(hsl.h, s, lTarget);
    scale[shade] = rgbToHex(rgbColor.r, rgbColor.g, rgbColor.b);
  }

  return scale;
}
