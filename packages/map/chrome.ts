// Plain ASCII layout chrome for the map renderer.
// Avoids game.layout softcode templates (which can emit unevaluated
// mushcode / garbage like "0 0 0…" when center() is incomplete).

const WIDTH = 78;

const stripColor = (s: string): string => s.replace(/%c[a-z]/gi, "");
const visibleLen = (s: string): number => stripColor(s).length;

function padCenter(text: string, width: number, fill: string): string {
  const t = text.length ? ` ${text} ` : "";
  const v = visibleLen(t);
  if (v >= width) return stripColor(t).slice(0, width);
  const pad = width - v;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  const f = fill.slice(0, 1) || "=";
  return f.repeat(left) + t + f.repeat(right);
}

/** Full-width section header. */
export function mapHeader(title: string, width = WIDTH): string {
  return padCenter(title, width, "=");
}

/** Mid-section divider. */
export function mapDivider(title = "", width = WIDTH): string {
  return padCenter(title, width, "-");
}

/** Closing bar. */
export function mapFooter(width = WIDTH): string {
  return "=".repeat(width);
}
