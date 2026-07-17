// String padding helpers used by sheet/chargen renderers.

export function ljust(s: string | undefined | null, w: number): string {
  return String(s ?? "").padEnd(w);
}

/** Truncate to w columns, appending ".." when the source was longer. */
export function trunc(s: string | undefined | null, w: number): string {
  const v = String(s ?? "");
  if (v.length <= w) return v;
  if (w <= 2) return v.slice(0, w);
  return v.slice(0, w - 2) + "..";
}

/** Truncate then left-pad to exactly w columns. */
export function fit(s: string | undefined | null, w: number): string {
  return trunc(s, w).padEnd(w);
}


export function center(s: string, w: number): string {
  s = String(s ?? "");
  if (s.length >= w) return s;
  const left = Math.floor((w - s.length) / 2);
  return " ".repeat(left) + s + " ".repeat(w - s.length - left);
}

/**
 * Fixed 6-slot trait track. PC attrs/skills/merits cap at 5 in
 * normal play; the 6th slot covers rare temps or edge cases.
 * Power stats (Primal Urge 1–10) use numeric lines, not this.
 */
export const DOT_TRACK_MAX = 6;

/**
 * Left-filled CofD track: `*.....` at 1, `******` at 6.
 * Clamped to 0..maxDots. Visible length is always maxDots.
 */
export function formatDotTrack(
  val: number,
  maxDots = DOT_TRACK_MAX,
): string {
  const v = Math.max(0, Math.min(maxDots, Math.floor(val)));
  return "%ch%cy" + "*".repeat(v) + "%cn%cx" +
    ".".repeat(maxDots - v) + "%cn";
}

/**
 * Trait line: `Label: *.....1` padded to `width` visible columns.
 * Temp differs: `Label: **....2(3)`.
 *
 * Color: label %ch; track yellow/dim; digits %ch%cy; parens plain.
 */
export function formatDottedStatLine(
  label: string,
  base: number,
  temp: number | undefined,
  width: number,
): string {
  const labelStr = label + ":";
  const track = formatDotTrack(base);
  const valueStr = (temp !== undefined && temp !== base)
    ? `${base}(${temp})`
    : `${base}`;
  const visibleLen = labelStr.length + DOT_TRACK_MAX +
    valueStr.length;
  const pad = Math.max(0, width - visibleLen);
  const valueColored = (temp !== undefined && temp !== base)
    ? `%ch%cy${base}%cn(%ch%cy${temp}%cn)`
    : `%ch%cy${base}%cn`;
  return `%ch${labelStr}%cn${" ".repeat(pad)}${track}` +
    valueColored;
}

/**
 * Like `formatDottedStatLine` but takes a pre-formatted string value
 * (e.g. "6/2" for Willpower current/max, or "7/12" for Vitae). Useful for
 * advantages that aren't simple base(temp) numeric stats.
 */
export function formatDottedLine(
  label: string,
  value: string,
  width: number,
): string {
  const labelStr = label + ":";
  const dotsNeeded = width - labelStr.length - value.length;
  const dots = ".".repeat(Math.max(1, dotsNeeded));
  return `%ch${labelStr}%cn%cx${dots}%cn%ch%cy${value}%cn`;
}

// Engine layout chrome — honors game.layout.* mushcode templates
// first, then registerHeader stacks / defaults. Same path as help,
// bbs, and native commands. Do not hardcode a CoFD color theme here.
// Import from @ursamu/mush (not @ursamu/ursamu) so showcase shims
// that re-export this module cannot create a circular import.
export {
  header,
  divider,
  footer,
} from "@ursamu/mush";

