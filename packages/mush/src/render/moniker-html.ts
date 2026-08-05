/**
 * Convert a MUSH moniker (%c codes / <#rrggbb> truecolor) to safe HTML
 * with classic web-safe-ish palette colors for the public FE.
 */

/** Classic 16-color style mapped to hex (web-safe primaries where possible). */
const FG: Record<string, string> = {
  x: "#000000",
  r: "#FF0000",
  g: "#00CC00",
  y: "#FFFF00",
  b: "#0000FF",
  m: "#FF00FF",
  c: "#00FFFF",
  w: "#FFFFFF",
};

const BG: Record<string, string> = {
  X: "#000000",
  R: "#FF0000",
  G: "#00CC00",
  Y: "#FFFF00",
  B: "#0000FF",
  M: "#FF00FF",
  C: "#00FFFF",
  W: "#FFFFFF",
};

/** Snap 0–255 channel to nearest web-safe step (0/51/102/153/204/255). */
export function webSafeChannel(n: number): number {
  const steps = [0, 51, 102, 153, 204, 255];
  let best = steps[0]!;
  let bestD = Math.abs(n - best);
  for (const s of steps) {
    const d = Math.abs(n - s);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Snap #rrggbb to the 216-color web-safe palette. */
export function toWebSafeHex(hex: string): string {
  const h = hex.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(h)) return "#ffffff";
  const r = webSafeChannel(parseInt(h.slice(0, 2), 16));
  const g = webSafeChannel(parseInt(h.slice(2, 4), 16));
  const b = webSafeChannel(parseInt(h.slice(4, 6), 16));
  const p = (n: number) => n.toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Style = {
  color?: string;
  bg?: string;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
};

/**
 * %c / truecolor → closed spans. Escapes plain text. Keeps whitespace
 * (including leading indent and newlines). Does not convert %r/%t/%b.
 */
export function mushCodesToHtml(raw: string): string {
  // deno-lint-ignore no-control-regex
  const s = String(raw ?? "").replace(/\u001b\[[0-9;]*m/g, "");

  let style: Style = {};
  const parts: string[] = [];
  let buf = "";

  const flush = () => {
    if (!buf) return;
    const text = escHtml(buf);
    buf = "";
    const css: string[] = [];
    if (style.color) css.push(`color:${style.color}`);
    if (style.bg) css.push(`background-color:${style.bg}`);
    if (style.underline) {
      css.push("text-decoration:underline");
    }
    let open = "";
    let close = "";
    if (css.length) {
      open += `<span style="${css.join(";")}">`;
      close = `</span>${close}`;
    }
    if (style.bold) {
      open += "<b>";
      close = `</b>${close}`;
    }
    if (style.italic) {
      open += "<i>";
      close = `</i>${close}`;
    }
    parts.push(open ? `${open}${text}${close}` : text);
  };

  const re =
    /%c([nNrRgGyYbBmMcCwWxXhHuUiI])|%c<#([0-9a-fA-F]{6})>|<#([0-9a-fA-F]{6})>|%x([nNrRgGyYbBmMcCwWxXhHuUiI])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      buf += s.slice(last, m.index);
      flush();
    }
    last = m.index + m[0].length;

    if (m[2] || m[3]) {
      const hex = toWebSafeHex(m[2] || m[3] || "ffffff");
      flush();
      style = { ...style, color: hex };
      continue;
    }

    const code = (m[1] || m[4] || "").toLowerCase();
    const rawCode = m[1] || m[4] || "";
    flush();

    if (code === "n") {
      style = {};
      continue;
    }
    if (code === "h") {
      style = { ...style, bold: true };
      continue;
    }
    if (code === "u") {
      style = { ...style, underline: true };
      continue;
    }
    if (code === "i") {
      style = { ...style, italic: true };
      continue;
    }
    if (
      rawCode.length === 1 &&
      rawCode === rawCode.toUpperCase() &&
      BG[rawCode]
    ) {
      style = { ...style, bg: BG[rawCode] };
      continue;
    }
    if (FG[code]) {
      style = { ...style, color: FG[code] };
    }
  }
  if (last < s.length) {
    buf += s.slice(last);
    flush();
  }

  return parts.join("");
}

/**
 * Render moniker markup as nested spans. Escapes plain text.
 * Returns null if input is empty after stripping.
 *
 * Each styled run is open+text+close (no dangling spans). Safe for
 * innerHTML. Prefer this over open-only span tags.
 */
export function monikerToHtml(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const html = mushCodesToHtml(raw).trim();
  return html || null;
}
