/**
 * Terminal chrome for Sprawl commands.
 *
 * Multi-line panels use engine header / divider / footer so
 * game.layout.* config and registerHeader stacks win (same path
 * as help, bbs, cofd). Do not hardcode frame borders here.
 *
 * Accents (ARR, OK, val, gauge…) stay local.
 */
// Engine layout — game.layout.* config first, then registerHeader
// stacks, then defaults. Same path as help / bbs / cofd.
import {
  divider as engDivider,
  footer as engFooter,
  header as engHeader,
} from "@ursamu/mush";
import { AsyncLocalStorage } from "node:async_hooks";

export const W = 78;
export type GlyphMode = "ascii" | "utf8";

const glyphCtx = new AsyncLocalStorage<GlyphMode>();
let forcedMode: GlyphMode | null = null;

export const runWithMode = <T>(m: GlyphMode, fn: () => T): T =>
  glyphCtx.run(m, fn);
export const withAscii = <T>(fn: () => T): T =>
  glyphCtx.run("ascii", fn);
export const setGlyphs = (m: GlyphMode | null) => {
  forcedMode = m;
};
export const getMode = (): GlyphMode =>
  forcedMode ?? glyphCtx.getStore() ?? "ascii";

/**
 * Engine layout — honors game.layout.header mushcode first,
 * then registerHeader stack, then engine default.
 */
export function header(
  title = "",
  filler = "=",
  width = W,
): string {
  return engHeader(title, filler, width);
}

export function divider(
  title = "",
  filler = "-",
  width = W,
): string {
  return engDivider(title, filler, width);
}

export function footer(
  title = "",
  filler = "=",
  width = W,
): string {
  return engFooter(title, filler, width);
}

/** Panel title with optional right badge: "SHEET · LIVE". */
export function titleOf(
  title: string,
  right?: string,
): string {
  const t = title.trim();
  const r = (right ?? "").trim();
  if (t && r) return `${t} · ${r}`;
  return t || r;
}

/**
 * Open a multi-line command panel.
 * Prefer this over ad-hoc = rules.
 */
export function panelOpen(
  title: string,
  right?: string): string {
  return header(titleOf(title, right));
}

/** Close a multi-line command panel. */
export function panelClose(right = "SPRAWL"): string {
  return footer(right);
}

// ── backward-compat aliases (migrate call sites off these) ──

/** @deprecated use header() / panelOpen() */
export const bar = (_ch?: string) => header();
/** @deprecated use divider(title) */
export const hdr = (t: string) => divider(t);
/** @deprecated use divider() */
export const div = () => divider();
/** @deprecated use panelOpen(title, right) */
export const frameTop = (
  opts: { title?: string; right?: string } = {},
) => panelOpen(opts.title ?? "", opts.right);
/** @deprecated use panelClose(right) */
export const frameBot = (opts: { right?: string } = {}) =>
  panelClose(opts.right ?? "SPRAWL");

const GLYPHS = {
  ascii: {
    pipOn: "#",
    pipOff: "-",
  },
  utf8: {
    pipOn: "█",
    pipOff: "░",
  },
} as const;

const g = () => GLYPHS[getMode()];

/** Optional scan line under a header (utf8 only). */
export const scan = (): string => "";

export type PillTone = "ok" | "warn" | "bad" | "info" | "alt";
const PILL_COLOR: Record<PillTone, string> = {
  ok: "%cg",
  warn: "%cy",
  bad: "%cr",
  info: "%cc",
  alt: "%cm",
};

export const pill = (
  text: string,
  tone: PillTone = "info",
): string => {
  const inner = 10;
  const t = text.toUpperCase().slice(0, inner).padEnd(inner, " ");
  return `${PILL_COLOR[tone]}[ ${t} ]%cn`;
};

export const gauge = (
  cur: number,
  max: number,
  width = 10,
): string => {
  const c = Math.max(0, Math.min(max, cur));
  const filled = max <= 0 ? 0 : Math.round((c / max) * width);
  const gl = g();
  return (
    `%cc[%cg${gl.pipOn.repeat(filled)}%cw` +
    `${gl.pipOff.repeat(width - filled)}%cc]%cn`
  );
};

/**
 * Centered "Name · ROLE" under a sheet/look header.
 *
 * display  — what the player sees (moniker / gradient OK)
 * role     — background / title (plain)
 * countAs  — plain name used only for centering width
 *            (defaults to strip(display)). Use sheet `name`
 *            so gradient monikers do not break padding.
 */
export function nameHdr(
  display: string,
  roleRaw: string,
  countAs?: string,
): string {
  const show = String(display ?? "").replace(/\r?\n/g, " ")
    .trim() || "UNKNOWN";
  const role = plain(roleRaw || "GOON").toUpperCase()
    .slice(0, 28);
  const forCount = (
    plain(countAs ?? show).trim() || plain(show) || "?"
  );
  const visible = `${forCount}  ·  ${role}`;
  const pad = Math.max(0, W - plain(visible).length);
  const l = Math.floor(pad / 2);
  // Reset after moniker so role yellow is clean
  const mon = show.replace(/%cn\s*$/i, "");
  return (
    " ".repeat(l) +
    `%cn${mon}%cn%cy  ·  ${role}%cn`
  );
}

export const lbl = (s: string) => `%cm${s}%cn`;
export const val = (s: string | number) => `%cc${s}%cn`;
export const acc = (s: string) => `%cb${s}%cn`;
export const dim = (s: string) => `%cw${s}%cn`;
export const good = (s: string) => `%cg${s}%cn`;
export const bad = (s: string) => `%cr${s}%cn`;
export const ylw = (s: string) => `%cy${s}%cn`;

/**
 * Sparse accent lead-in for one-line status / callouts.
 * Prefer plain `  ` indent for list rows and prose.
 */
export const ARR = `%cc>>%cn `;
/** Plain list/body indent (no accent). */
export const IND = `  `;
export const ERR = `%cr!!%cn `;
export const OK = `%cg::%cn `;

export function row(label: string, value: string): string {
  const lPad = 22;
  const labelPlain = label.padEnd(lPad);
  return `  ${lbl(labelPlain)} ${value}`;
}

/** Strip MUSH %c, truecolor <#rrggbb>, and raw ANSI (visible text only). */
export function plain(s: string): string {
  return String(s ?? "")
    .replace(/%c[a-zA-Z]/gi, "")
    .replace(/%[nrtbR]/gi, "")
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "");
}

export function wrap(
  text: string,
  max = W - 2,
  indent = "  ",
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (plain(next).length > max && cur) {
      lines.push(indent + cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(indent + cur);
  return lines;
}

export function grid(
  items: string[],
  per = 3,
  indent = "    ",
  col = 24,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += per) {
    const slice = items.slice(i, i + per);
    const cells = slice.map((s) => {
      const p = plain(s);
      const pad = Math.max(0, col - p.length);
      return s + " ".repeat(pad);
    });
    lines.push(indent + cells.join(""));
  }
  return lines;
}
