// core/format.ts -- wod20th display chrome (78-col hard cap).
//
// Synchronous layout helpers. The @ursamu/globals renderer is async
// (softcode themes), which does not fit sync report call sites -- so
// wod20th renders chrome locally. All helpers respect visual width
// after stripping MUSH color codes.

export const WIDTH = 78;
const MAJ = "=";
const MIN = "-";

/** Visible length after stripping MUSH %c / %r-style codes. */
export function vlen(s: string): number {
  return String(s ?? "")
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[rntbR]/g, "")
    .length;
}

/**
 * Clip to max visible columns. Appends "..." when truncated.
 * Color codes are preserved and do not count toward width.
 */
export function clipVis(s: string, max: number): string {
  const raw = String(s ?? "");
  if (max <= 0) return "";
  if (vlen(raw) <= max) return raw;

  const limit = Math.max(0, max - 3);
  let visual = 0;
  let out = "";
  let i = 0;
  while (i < raw.length && visual < limit) {
    if (raw[i] === "%" && i + 1 < raw.length) {
      const n = raw[i + 1]!;
      if (/[a-zA-Z]/.test(n) || /[rntbR]/.test(n)) {
        out += raw.slice(i, i + 2);
        i += 2;
        continue;
      }
    }
    out += raw[i];
    visual++;
    i++;
  }
  return `${out}...`;
}

/** Pad (or clip) to exactly `width` visible columns. */
export function padVis(s: string, width: number): string {
  const clipped = clipVis(s, width);
  const pad = Math.max(0, width - vlen(clipped));
  return clipped + " ".repeat(pad);
}

function centerVis(text: string, pad: string, width: number): string {
  const t = clipVis(text, width);
  const len = vlen(t);
  if (len >= width) return t;
  const total = width - len;
  const left = Math.floor(total / 2);
  const right = total - left;
  return pad.repeat(left) + t + pad.repeat(right);
}

/** Full-width header bar with a centered title. */
export function header(title: string): string {
  const t = title.trim();
  if (!t) return MAJ.repeat(WIDTH);
  return centerVis(` ${t} `, MAJ, WIDTH);
}

/** Full-width section divider with an optional centered label. */
export function divider(label: string | null): string {
  if (!label) return MIN.repeat(WIDTH);
  return centerVis(` ${label.trim()} `, MIN, WIDTH);
}

/** Full-width footer bar. */
export function footer(): string {
  return MAJ.repeat(WIDTH);
}

/**
 * Framed panel: header(title), one line per body entry, footer.
 * Body lines render verbatim (callers pre-indent and pre-color).
 */
export function frame(
  title: string,
  body: readonly string[],
): string {
  return [
    header(title),
    ...body,
    footer(),
  ].join("%r");
}
