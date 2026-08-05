/**
 * MUSH text → safe HTML for the game client.
 *
 * ANSI SGR (wire format), %c, truecolor, legacy shredded HTML.
 * Colors snapped to the 216-color web-safe palette.
 *
 * @see packages/web/design.md § Game client output
 */

const FG_LETTER: Record<string, string> = {
  x: "#000000",
  r: "#FF0000",
  g: "#00CC00",
  y: "#FFFF00",
  b: "#0000FF",
  m: "#FF00FF",
  c: "#00FFFF",
  w: "#FFFFFF",
};

const FG_SGR: Record<number, string> = {
  30: "#000000",
  31: "#FF0000",
  32: "#00CC00",
  33: "#FFFF00",
  34: "#0000FF",
  35: "#FF00FF",
  36: "#00FFFF",
  37: "#FFFFFF",
};

const BG_LETTER: Record<string, string> = {
  X: "#000000",
  R: "#FF0000",
  G: "#00CC00",
  Y: "#FFFF00",
  B: "#0000FF",
  M: "#FF00FF",
  C: "#00FFFF",
  W: "#FFFFFF",
};

const BG_SGR: Record<number, string> = {
  40: "#000000",
  41: "#FF0000",
  42: "#00CC00",
  43: "#FFFF00",
  44: "#0000FF",
  45: "#FF00FF",
  46: "#00FFFF",
  47: "#FFFFFF",
};

const NAMED: Record<string, string> = {
  black: "#000000",
  grey: "#808080",
  gray: "#808080",
  red: "#FF0000",
  green: "#00CC00",
  yellow: "#FFFF00",
  blue: "#0000FF",
  magenta: "#FF00FF",
  cyan: "#00FFFF",
  white: "#FFFFFF",
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function webSafeChannel(n: number): number {
  const steps = [0, 51, 102, 153, 204, 255];
  let best = 0;
  let bestD = Math.abs(n - 0);
  for (const s of steps) {
    const d = Math.abs(n - s);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Snap #rrggbb / rgb() / named CSS color to web-safe hex. */
export function toWebSafeColor(color: string): string | null {
  const c = String(color || "").trim().toLowerCase();
  if (!c || c === "inherit" || c === "transparent") return null;
  if (NAMED[c]) return NAMED[c]!;

  const hex = c.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    const r = webSafeChannel(parseInt(h.slice(0, 2), 16));
    const g = webSafeChannel(parseInt(h.slice(2, 4), 16));
    const b = webSafeChannel(parseInt(h.slice(4, 6), 16));
    const p = (n: number) => n.toString(16).padStart(2, "0");
    return `#${p(r)}${p(g)}${p(b)}`;
  }

  const rgb = c.match(
    /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/,
  );
  if (rgb) {
    const r = webSafeChannel(+rgb[1]!);
    const g = webSafeChannel(+rgb[2]!);
    const b = webSafeChannel(+rgb[3]!);
    const p = (n: number) => n.toString(16).padStart(2, "0");
    return `#${p(r)}${p(g)}${p(b)}`;
  }
  return null;
}

type Style = {
  color?: string;
  bg?: string;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
};

function styleToEsc(styleAttr: string): string {
  const st = String(styleAttr || "");
  const m = st.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  const col = m?.[1]?.trim() ?? "";
  if (!col || /^inherit$/i.test(col)) return "\x1b[0m";
  const hex = toWebSafeColor(col);
  if (!hex) return "\x1b[0m";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** Intact or wordWrap-shredded engine HTML → markers + text. */
function htmlToMarkers(s: string): string {
  if (!/[<>]|style\s*=/i.test(s)) return s;
  let out = s;
  out = out.replace(/&nbsp;/gi, " ");
  out = out.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/span>/gi, "\x1b[0m");
  out = out.replace(/<\/?[bi]>/gi, "");
  out = out.replace(/<\/?(div|pre|font)[^>]*>/gi, "");
  out = out.replace(
    /<span\b[^>]*\bstyle\s*=\s*['"]([^'"]*)['"][^>]*>/gi,
    (_m, style: string) => styleToEsc(style),
  );
  out = out.replace(
    /\bstyle\s*=\s*['"]([^'"]*)['"]\s*>/gi,
    (_m, style: string) => styleToEsc(style),
  );
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  out = out.replace(/\bstyle\s*=\s*['"][^'"]*['"]/gi, "");
  return out;
}

function applySgr(style: Style, params: string[]): Style {
  let next: Style = { ...style };
  const list = params.length ? params : ["0"];
  for (let i = 0; i < list.length; i++) {
    const p = list[i] ?? "0";
    const n = parseInt(p, 10);
    if (p === "0" || n === 0) {
      next = {};
      continue;
    }
    if (n === 1) {
      next = { ...next, bold: true };
      continue;
    }
    if (n === 3) {
      next = { ...next, italic: true };
      continue;
    }
    if (n === 4) {
      next = { ...next, underline: true };
      continue;
    }
    if (n === 22) {
      const { bold: _b, ...rest } = next;
      next = rest;
      continue;
    }
    if (n === 23) {
      const { italic: _i, ...rest } = next;
      next = rest;
      continue;
    }
    if (n === 24) {
      const { underline: _u, ...rest } = next;
      next = rest;
      continue;
    }
    if (n === 38 && list[i + 1] === "2" && i + 4 < list.length) {
      const hex = toWebSafeColor(
        `rgb(${list[i + 2]},${list[i + 3]},${list[i + 4]})`,
      );
      if (hex) next = { ...next, color: hex };
      i += 4;
      continue;
    }
    if (n === 48 && list[i + 1] === "2" && i + 4 < list.length) {
      const hex = toWebSafeColor(
        `rgb(${list[i + 2]},${list[i + 3]},${list[i + 4]})`,
      );
      if (hex) next = { ...next, bg: hex };
      i += 4;
      continue;
    }
    if (n === 38 || n === 48) {
      if (list[i + 1] === "5") i += 2;
      continue;
    }
    if (FG_SGR[n]) {
      next = { ...next, color: FG_SGR[n] };
      continue;
    }
    if (BG_SGR[n]) {
      next = { ...next, bg: BG_SGR[n] };
    }
  }
  return next;
}

/**
 * Convert MUSH / ANSI / legacy HTML game text to closed spans.
 */
export function mushTextToHtml(raw: unknown): string {
  if (raw == null) return "";
  let s = htmlToMarkers(String(raw));

  s = s
    .replace(/%r/gi, "\n")
    .replace(/%t/gi, "\t")
    .replace(/%b/gi, " ");

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
    if (style.underline) css.push("text-decoration:underline");
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

  // deno-lint-ignore no-control-regex
  const re =
    /\u001b\[([0-9;]*)m|%c([nNrRgGyYbBmMcCwWxXhHuUiI])|%c<#([0-9a-fA-F]{6})>|<#([0-9a-fA-F]{6})>|%x([nNrRgGyYbBmMcCwWxXhHuUiI])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      buf += s.slice(last, m.index);
      flush();
    }
    last = m.index + m[0].length;

    if (m[1] != null && m[0].startsWith("\x1b")) {
      flush();
      const params = m[1] === "" ? ["0"] : m[1].split(";");
      style = applySgr(style, params);
      continue;
    }

    if (m[3] || m[4]) {
      const hex = toWebSafeColor("#" + (m[3] || m[4] || "ffffff"));
      flush();
      if (hex) style = { ...style, color: hex };
      continue;
    }

    const code = (m[2] || m[5] || "").toLowerCase();
    const rawCode = m[2] || m[5] || "";
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
      BG_LETTER[rawCode]
    ) {
      style = { ...style, bg: BG_LETTER[rawCode] };
      continue;
    }
    if (FG_LETTER[code]) {
      style = { ...style, color: FG_LETTER[code] };
    }
  }
  if (last < s.length) {
    buf += s.slice(last);
    flush();
  }

  return parts.join("");
}

/** True when a WS payload carries structured UI layout. */
export function hasGameLayout(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const ui = d.ui;
  if (!ui || typeof ui !== "object") return false;
  const u = ui as Record<string, unknown>;
  return Array.isArray(u.components) || u.type === "layout";
}

export function gameLayoutOf(
  data: unknown,
): { components: unknown[]; meta?: Record<string, unknown> } | null {
  if (!hasGameLayout(data)) return null;
  const ui = (data as { ui: Record<string, unknown> }).ui;
  const components = Array.isArray(ui.components)
    ? ui.components
    : [];
  const meta =
    ui.meta && typeof ui.meta === "object"
      ? (ui.meta as Record<string, unknown>)
      : undefined;
  return { components, meta };
}
