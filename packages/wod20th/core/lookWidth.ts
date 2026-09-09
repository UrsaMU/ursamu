// core/lookWidth.ts -- NAWS width + visual length (CoFD-compatible).

export const DEFAULT_LOOK_WIDTH = 78;
export const MIN_LOOK_WIDTH = 40;
export const MAX_LOOK_WIDTH = 250;

/** Looker's NAWS termWidth, else 78. */
// deno-lint-ignore no-explicit-any
export function lookerWidth(me: any): number {
  const bag = {
    ...(me?.data ?? {}),
    ...(me?.state ?? {}),
  } as Record<string, unknown>;
  const raw = bag.termWidth;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= MIN_LOOK_WIDTH && n <= MAX_LOOK_WIDTH) return n;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = parseInt(raw, 10);
    if (n >= MIN_LOOK_WIDTH && n <= MAX_LOOK_WIDTH) return n;
  }
  return DEFAULT_LOOK_WIDTH;
}

/** Visible length -- same strip rules as CoFD look_format.ts. */
export function visualLen(s: string): number {
  return s
    .replace(/<#[0-9a-fA-F]{6}>/g, "")
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "")
    .length;
}

/** Truncate to max visible cols; append "..." (CoFD look_format.ts). */
export function visualTruncate(s: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (visualLen(s) <= maxLen) return s;

  const limit = Math.max(0, maxLen - 3);
  let visualCount = 0;
  let result = "";
  let i = 0;

  while (i < s.length && visualCount < limit) {
    if (s[i] === "%" && i + 1 < s.length) {
      const next = s[i + 1]!;
      if (/[a-zA-Z]/.test(next) || /[nrtbR]/.test(next)) {
        result += s.slice(i, i + 2);
        i += 2;
        continue;
      }
    }
    if (s[i] === "<") {
      const match = s.slice(i).match(/^<#[0-9a-fA-F]{6}>/);
      if (match) {
        result += match[0];
        i += match[0].length;
        continue;
      }
    }
    result += s[i];
    visualCount++;
    i++;
  }

  return `${result}...%cn`;
}
