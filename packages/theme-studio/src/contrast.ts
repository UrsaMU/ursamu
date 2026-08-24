/**
 * WCAG 2.x contrast helpers for theme token pairs (Phase 5).
 */

export type ContrastPair = {
  id: string;
  label: string;
  fg: string;
  bg: string;
  /** WCAG AA normal text needs 4.5; large/UI 3.0 */
  minRatio: number;
};

/** Default pairs checked against active tokens */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    id: "text-bg",
    label: "Body text on page",
    fg: "--site-text",
    bg: "--site-bg",
    minRatio: 4.5,
  },
  {
    id: "secondary-bg",
    label: "Secondary text on page",
    fg: "--site-text-secondary",
    bg: "--site-bg",
    minRatio: 4.5,
  },
  {
    id: "muted-bg",
    label: "Muted text on page",
    fg: "--site-text-muted",
    bg: "--site-bg",
    minRatio: 3.0,
  },
  {
    id: "text-surface",
    label: "Text on surface",
    fg: "--site-text",
    bg: "--site-bg-surface",
    minRatio: 4.5,
  },
  {
    id: "accent-bg",
    label: "Accent on page",
    fg: "--site-accent",
    bg: "--site-bg",
    minRatio: 3.0,
  },
  {
    id: "btn",
    label: "Primary button",
    fg: "--site-btn-fg",
    bg: "--site-btn-bg",
    minRatio: 4.5,
  },
  {
    id: "link-surface",
    label: "Accent on surface",
    fg: "--site-accent",
    bg: "--site-bg-surface",
    minRatio: 3.0,
  },
];

export type ContrastResult = {
  id: string;
  label: string;
  fgToken: string;
  bgToken: string;
  fg: string;
  bg: string;
  ratio: number | null;
  minRatio: number;
  pass: boolean | null;
  note?: string;
};

/** Parse #rgb / #rrggbb / rgb() / rgba() — returns sRGB 0–1 or null */
export function parseColor(
  raw: string,
): { r: number; g: number; b: number } | null {
  let s = String(raw || "").trim();
  if (!s || s === "none" || s.startsWith("url(")) return null;
  // var() — not resolved here
  if (s.startsWith("var(")) return null;

  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) {
      h = h[0]! + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length === 8) h = h.slice(0, 6); // drop alpha
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    };
  }

  const m = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const scale = r > 1 || g > 1 || b > 1 ? 255 : 1;
    return { r: r / scale, g: g / scale, b: b / scale };
  }
  return null;
}

function lin(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance (WCAG) */
export function relativeLuminance(
  rgb: { r: number; g: number; b: number },
): number {
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Resolve simple var(--site-x) one level against token map */
export function resolveTokenColor(
  tokens: Record<string, string>,
  name: string,
  depth = 0,
): string {
  if (depth > 4) return "";
  let v = (tokens[name] ?? "").trim();
  const m = v.match(/^var\(\s*(--site-[\w-]+)\s*\)$/);
  if (m) return resolveTokenColor(tokens, m[1]!, depth + 1);
  return v;
}

export function checkContrast(
  tokens: Record<string, string>,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): ContrastResult[] {
  return pairs.map((p) => {
    const fg = resolveTokenColor(tokens, p.fg);
    const bg = resolveTokenColor(tokens, p.bg);
    const ratio = contrastRatio(fg, bg);
    if (ratio == null) {
      return {
        id: p.id,
        label: p.label,
        fgToken: p.fg,
        bgToken: p.bg,
        fg,
        bg,
        ratio: null,
        minRatio: p.minRatio,
        pass: null,
        note: "Skipped (non-hex/rgb or var chain)",
      };
    }
    return {
      id: p.id,
      label: p.label,
      fgToken: p.fg,
      bgToken: p.bg,
      fg,
      bg,
      ratio: Math.round(ratio * 100) / 100,
      minRatio: p.minRatio,
      pass: ratio >= p.minRatio,
    };
  });
}
