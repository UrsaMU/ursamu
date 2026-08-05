// String padding helpers used by sheet/chargen renderers.
// Width math uses *visible* columns: MUSH %c codes, truecolor
// <#rrggbb>, and ANSI escapes do not count.

/** MUSH / truecolor / ANSI tokens that paint but take no columns. */
const COLOR_TOKEN =
  /%c[a-zA-Z]|%[nrtbR]|<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>|\x1b\[[0-9;]*m/gi;

/** Strip display codes; leave plain text for length checks. */
export function stripColors(s: string | undefined | null): string {
  return String(s ?? "").replace(COLOR_TOKEN, "");
}

/** Visible column count (color codes ignored). */
export function visibleLen(s: string | undefined | null): number {
  return stripColors(s).length;
}

/**
 * Walk `s`, calling `onColor(token)` and `onChar(ch)`.
 * Stops early if onChar returns false.
 */
function walkDisplay(
  s: string,
  onColor: (tok: string) => void,
  onChar: (ch: string) => boolean,
): void {
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const m = rest.match(
      /^(?:%c[a-zA-Z]|%[nrtbR]|<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>|\x1b\[[0-9;]*m)/i,
    );
    if (m) {
      onColor(m[0]);
      i += m[0].length;
      continue;
    }
    const cp = s.codePointAt(i);
    if (cp === undefined) break;
    const ch = String.fromCodePoint(cp);
    if (!onChar(ch)) return;
    i += ch.length;
  }
}

export function ljust(
  s: string | undefined | null,
  w: number,
): string {
  const v = String(s ?? "");
  const pad = Math.max(0, w - visibleLen(v));
  return v + " ".repeat(pad);
}

/** Truncate to w *visible* columns; append ".." when shortened. */
export function trunc(
  s: string | undefined | null,
  w: number,
): string {
  const v = String(s ?? "");
  if (w <= 0) return "";
  if (visibleLen(v) <= w) return v;

  const keep = w <= 2 ? w : w - 2;
  let out = "";
  let n = 0;
  walkDisplay(
    v,
    (tok) => {
      out += tok;
    },
    (ch) => {
      if (n >= keep) return false;
      out += ch;
      n++;
      return true;
    },
  );
  if (w <= 2) return out;
  // Close color so ".." is not painted mid-gradient.
  return out + "%cn..";
}

/** Truncate then left-pad to exactly w *visible* columns. */
export function fit(
  s: string | undefined | null,
  w: number,
): string {
  return ljust(trunc(s, w), w);
}

export function center(s: string, w: number): string {
  const v = String(s ?? "");
  const len = visibleLen(v);
  if (len >= w) return trunc(v, w);
  const left = Math.floor((w - len) / 2);
  return " ".repeat(left) + v + " ".repeat(w - len - left);
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
  const visible = labelStr.length + DOT_TRACK_MAX +
    valueStr.length;
  const pad = Math.max(0, width - visible);
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
