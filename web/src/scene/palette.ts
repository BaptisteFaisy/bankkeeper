// palette.ts — the only place where colours live.
//
// The scene reads the CSS tokens of `styles.css` once, from the live
// document, and derives darker or lighter tones of those very hues.
// No other module of `scene/` writes a colour literal: they all ask
// this one for a token, a tone of a token or an alpha of a token.

export type Token =
  | '--bg' | '--panel' | '--panel-2' | '--sea' | '--line' | '--ink'
  | '--muted' | '--buoy' | '--gold' | '--kelp' | '--sand' | '--red';

export const TOKENS: Token[] = [
  '--bg', '--panel', '--panel-2', '--sea', '--line', '--ink',
  '--muted', '--buoy', '--gold', '--kelp', '--sand', '--red',
];

export interface Rgb { r: number; g: number; b: number }

// Mirrors `styles.css`: only used when the sheet is missing, so the
// scene still paints (the game and the preview page both load it).
const FALLBACK: Record<Token, string> = {
  '--bg': '#0f2a30', '--panel': '#163940', '--panel-2': '#1b4a54',
  '--sea': '#24616c', '--line': '#2b5560', '--ink': '#e4ede6',
  '--muted': '#9db5ac', '--buoy': '#e0672f', '--gold': '#e3b65a',
  '--kelp': '#8fc06f', '--sand': '#c9b083', '--red': '#d4705e',
};

const hues = new Map<Token, Rgb>();
const cache = new Map<string, string>();

function parseHex(raw: string): Rgb | null {
  const hex = raw.trim().replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r, g, b };
  }
  if (hex.length !== 6) return null;
  const packed = parseInt(hex, 16);
  if (Number.isNaN(packed)) return null;
  return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255 };
}

function parseColor(raw: string): Rgb | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('#')) return parseHex(trimmed);
  const parts = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (parts === null) return null;
  return { r: Number(parts[1]), g: Number(parts[2]), b: Number(parts[3]) };
}

function toneRgb(base: Rgb, amount: number): Rgb {
  if (amount >= 0) {
    const k = Math.min(1, amount);
    return {
      r: Math.round(base.r + (255 - base.r) * k),
      g: Math.round(base.g + (255 - base.g) * k),
      b: Math.round(base.b + (255 - base.b) * k),
    };
  }
  const k = Math.min(1, -amount);
  return {
    r: Math.round(base.r * (1 - k)),
    g: Math.round(base.g * (1 - k)),
    b: Math.round(base.b * (1 - k)),
  };
}

function memo(key: string, build: () => string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const out = build();
  cache.set(key, out);
  return out;
}

function hue(token: Token): Rgb {
  const found = hues.get(token);
  if (found !== undefined) return found;
  const parsed = parseHex(FALLBACK[token]);
  return parsed ?? { r: 0, g: 0, b: 0 };
}

/** Read the tokens once: called when the scene is created. */
export function loadPalette(root?: HTMLElement): void {
  const element = root ?? document.documentElement;
  const style = window.getComputedStyle(element);
  for (const token of TOKENS) {
    const raw = style.getPropertyValue(token);
    const parsed = parseColor(raw.length > 0 ? raw : FALLBACK[token]);
    if (parsed !== null) hues.set(token, parsed);
  }
  cache.clear();
}

/** `#rrggbb` of a token, for state that carries a colour string. */
export function hex(token: Token): string {
  return memo(`h|${token}`, () => {
    const h = hue(token);
    const part = (c: number): string => c.toString(16).padStart(2, '0');
    return `#${part(h.r)}${part(h.g)}${part(h.b)}`;
  });
}

/** `rgb(r, g, b)` of a token. */
export function color(token: Token): string {
  return memo(`c|${token}`, () => {
    const h = hue(token);
    return `rgb(${h.r}, ${h.g}, ${h.b})`;
  });
}

/** A token pushed lighter (amount > 0) or darker (amount < 0). */
export function tone(token: Token, amount: number): string {
  return memo(`t|${token}|${amount.toFixed(3)}`, () => {
    const h = toneRgb(hue(token), amount);
    return `rgb(${h.r}, ${h.g}, ${h.b})`;
  });
}

/** A token with an alpha, for washes and thin lines. */
export function alpha(token: Token, a: number): string {
  return memo(`a|${token}|${a.toFixed(3)}`, () => {
    const h = hue(token);
    return `rgba(${h.r}, ${h.g}, ${h.b}, ${a})`;
  });
}

/** The same treatment for a colour carried by the state (a hull). */
export function toneHex(raw: string, amount: number): string {
  return memo(`th|${raw}|${amount.toFixed(3)}`, () => {
    const base = parseColor(raw);
    if (base === null) return raw;
    const h = toneRgb(base, amount);
    return `rgb(${h.r}, ${h.g}, ${h.b})`;
  });
}

/** An alpha applied to a colour carried by the state. */
export function alphaHex(raw: string, a: number): string {
  return memo(`ah|${raw}|${a.toFixed(3)}`, () => {
    const base = parseColor(raw);
    if (base === null) return raw;
    return `rgba(${base.r}, ${base.g}, ${base.b}, ${a})`;
  });
}
