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
 * Render a stat line with a dotted leader. The label sits flush-left,
 * the value sits flush-right within `width`, and dots fill the space
 * between. When `temp` is provided and differs from `base`, the trailing
 * value renders as `base(temp)`.
 *
 *   formatDottedStatLine("Intelligence", 3, undefined, 44)
 *     -> "Intelligence:..............................3"
 *
 *   formatDottedStatLine("Wits", 2, 3, 44)
 *     -> "Wits:.....................................2(3)"
 *
 * Color codes are applied: label is %ch, dots are %cx (dim), value is
 * %ch%cy. The width is the visible-character width AFTER color codes
 * are stripped.
 */
export function formatDottedStatLine(
  label: string,
  base: number,
  temp: number | undefined,
  width: number,
  ): string {
  const labelStr = label + ":";
  const valueStr = (temp !== undefined && temp !== base)
    ? `${base}(${temp})`
    : `${base}`;

  const dotsNeeded = width - labelStr.length - valueStr.length;
  const dots = ".".repeat(Math.max(1, dotsNeeded));

  return `%ch${labelStr}%cn%cx${dots}%cn%ch%cy${valueStr}%cn`;
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

export function header(title = "", _filler = "=", width = 78): string {
  let actualWidth = width;
  let actualFiller = "=";
  if (typeof _filler === "number") {
    actualWidth = _filler;
  } else if (typeof _filler === "string") {
    actualFiller = _filler;
  }
  if (!title) {
    return `%cr${actualFiller.repeat(actualWidth)}%cn`;
  }
  const rightPad = Math.max(0, actualWidth - 7 - title.length);
  return `%cr${actualFiller.repeat(5)}%cn %ch%cy${title}%cn %cr${actualFiller.repeat(rightPad)}%cn`;
}

export function divider(title = "", _filler = "-", width = 78): string {
  let actualWidth = width;
  let actualFiller = "-";
  if (typeof _filler === "number") {
    actualWidth = _filler;
  } else if (typeof _filler === "string") {
    actualFiller = _filler;
  }
  if (!title) {
    return `%cr${actualFiller.repeat(actualWidth)}%cn`;
  }
  const rightPad = Math.max(0, actualWidth - 7 - title.length);
  return `%cr${actualFiller.repeat(5)}%cn %ch%cy${title}%cn %cr${actualFiller.repeat(rightPad)}%cn`;
}

export function footer(title = "", _filler = "=", width = 78): string {
  let actualWidth = width;
  let actualTitle = title;
  let actualFiller = "=";
  if (typeof title === "number") {
    actualWidth = title;
    actualTitle = "";
  } else if (typeof title === "string") {
    actualTitle = title;
    if (typeof _filler === "number") {
      actualWidth = _filler;
    } else if (typeof _filler === "string") {
      actualFiller = _filler;
    }
  }
  if (!actualTitle) {
    return `%cr${actualFiller.repeat(actualWidth)}%cn`;
  }
  const rightPad = Math.max(0, actualWidth - 7 - actualTitle.length);
  return `%cr${actualFiller.repeat(5)}%cn %ch%cy${actualTitle}%cn %cr${actualFiller.repeat(rightPad)}%cn`;
}

