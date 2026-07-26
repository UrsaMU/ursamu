/**
 * Color parsing and gradient sampling for +gradient.
 */

export type Rgb = readonly [number, number, number];

const NAMED: Record<string, Rgb> = {
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 200, 0],
  blue: [0, 100, 255],
  yellow: [255, 220, 0],
  cyan: [0, 220, 255],
  magenta: [255, 0, 200],
  purple: [160, 32, 240],
  orange: [255, 140, 0],
  pink: [255, 105, 180],
  white: [255, 255, 255],
  gray: [160, 160, 160],
  grey: [160, 160, 160],
  brown: [139, 90, 43],
  lime: [50, 255, 50],
  teal: [0, 180, 180],
  navy: [0, 0, 128],
  gold: [255, 200, 40],
  silver: [192, 192, 192],
  r: [255, 0, 0],
  g: [0, 200, 0],
  b: [0, 100, 255],
  y: [255, 220, 0],
  c: [0, 220, 255],
  m: [255, 0, 200],
  w: [255, 255, 255],
  x: [0, 0, 0],
};

/** Parse one color token to RGB, or null if invalid. */
export function parseColor(raw: string): Rgb | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) return NAMED[s];

  let hex = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;

  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function toHex([r, g, b]: Rgb): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `${h(r)}${h(g)}${h(b)}`;
}

/** Sample multi-stop gradient at t in [0, 1]. */
export function sampleGradient(stops: Rgb[], t: number): Rgb {
  if (stops.length === 0) return [255, 255, 255];
  if (stops.length === 1) return stops[0];
  const clamped = Math.max(0, Math.min(1, t));
  const seg = (stops.length - 1) * clamped;
  const i = Math.min(Math.floor(seg), stops.length - 2);
  return mix(stops[i], stops[i + 1], seg - i);
}

/** Wrap each character in truecolor codes along stops. Ends with %cn. */
export function gradientText(text: string, stops: Rgb[]): string {
  const chars = Array.from(text);
  if (chars.length === 0) return "%cn";
  if (stops.length === 0) return `${text}%cn`;

  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const t = chars.length === 1 ? 0 : i / (chars.length - 1);
    const hex = toHex(sampleGradient(stops, t));
    out += `<#${hex}>${chars[i]}`;
  }
  return `${out}%cn`;
}

/** Split a color list on commas. */
export function splitColors(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
