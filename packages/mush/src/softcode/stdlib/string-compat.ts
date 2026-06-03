// deno-lint-ignore-file require-await
/**
 * @module stdlib/string-compat
 *
 * RhostMUSH/TinyMUX compatibility functions not in the core string module:
 * asc, flip, chomp, isalpha/isdigit/islower/isupper/isspace/isxdigit,
 * tr, printf, regedit variants, reswitch variants, regrep/regrepi,
 * reglmatch variants, regnummatch, wrapcolumns, encode64/decode64,
 * strdistance, nameq/nameqm.
 */

import { register } from "./registry.ts";
import { int, stripAnsi } from "./helpers.ts";

// ── aliases ───────────────────────────────────────────────────────────────────

register("asc",   async (a) => String((a[0] ?? " ").codePointAt(0) ?? 0));
register("flip",  async (a) => (a[0] ?? "").split("").reverse().join(""));
register("chomp", async (a) => (a[0] ?? "").replace(/\r?\n$/, ""));

// ── character class predicates ────────────────────────────────────────────────

register("isalpha",  async (a) => /^[a-zA-Z]+$/.test(a[0] ?? "")    ? "1" : "0");
register("isdigit",  async (a) => /^[0-9]+$/.test(a[0] ?? "")        ? "1" : "0");
register("islower",  async (a) => /^[a-z]+$/.test(a[0] ?? "")        ? "1" : "0");
register("isupper",  async (a) => /^[A-Z]+$/.test(a[0] ?? "")        ? "1" : "0");
register("isspace",  async (a) => /^\s+$/.test(a[0] ?? "")           ? "1" : "0");
register("isxdigit", async (a) => /^[0-9a-fA-F]+$/.test(a[0] ?? "") ? "1" : "0");

// ── tr(from, to, string) — character-set translation ─────────────────────────
// Each char in `from` maps to the corresponding char in `to`.
// If `to` is shorter, the last char in `to` fills remaining mappings.
// If `to` is empty, matching characters are deleted.

register("tr", async (a) => {
  const from = a[0] ?? "";
  const to   = a[1] ?? "";
  const s    = a[2] ?? "";
  if (from.length === 0) return s;
  return s.split("").map((c) => {
    const i = from.indexOf(c);
    if (i === -1) return c;
    if (to.length === 0) return "";
    return to[Math.min(i, to.length - 1)];
  }).join("");
});

// ── printf(format, args...) — C-style formatted output ───────────────────────
// Supports: %s %d %i %f %F %e %E %g %G %o %x %X %% with width/precision.

register("printf", async (a) => {
  const fmt  = a[0] ?? "";
  const args = a.slice(1);
  let ai = 0;
  return fmt.replace(/%(-)?(0?)(\d*)(?:\.(\d+))?([sdifFeEgGoxX%])/g, (_, left, zero, wStr, prec, spec) => {
    if (spec === "%") return "%";
    const raw    = args[ai++] ?? "";
    const w      = wStr ? parseInt(wStr, 10) : 0;
    const p      = prec !== undefined ? parseInt(prec, 10) : undefined;
    const padCh  = zero === "0" ? "0" : " ";
    const n      = parseFloat(raw) || 0;
    let out: string;
    if (spec === "d" || spec === "i") {
      out = String(Math.trunc(n));
    } else if (spec === "f" || spec === "F") {
      out = n.toFixed(p ?? 6);
    } else if (spec === "e") {
      out = n.toExponential(p ?? 6);
    } else if (spec === "E") {
      out = n.toExponential(p ?? 6).toUpperCase();
    } else if (spec === "g" || spec === "G") {
      out = p !== undefined ? n.toPrecision(p || 1) : String(n);
      if (spec === "G") out = out.toUpperCase();
    } else if (spec === "o") {
      out = Math.trunc(n).toString(8);
    } else if (spec === "x") {
      out = Math.trunc(n).toString(16);
    } else if (spec === "X") {
      out = Math.trunc(n).toString(16).toUpperCase();
    } else {
      out = p !== undefined ? raw.slice(0, p) : raw;
    }
    if (w === 0) return out;
    if (left === "-") return out.padEnd(w);
    return out.padStart(w, padCh);
  });
});

// ── regedit variants — regex find-replace ────────────────────────────────────

function regeditFn(s: string, pat: string, repl: string, flags: string, literal: boolean): string {
  let re: RegExp;
  try { re = new RegExp(pat, flags); } catch { return s; }
  // For literal mode, escape $ so JS .replace() doesn't treat $1/$& as capture refs.
  return literal ? s.replace(re, repl.replace(/\$/g, "$$$$")) : s.replace(re, repl);
}

register("regedit",        async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "",   false));
register("regeditall",     async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "g",  false));
register("regediti",       async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "i",  false));
register("regeditalli",    async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "gi", false));
register("regeditlit",     async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "",   true));
register("regeditalllit",  async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "g",  true));
register("regeditilit",    async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "i",  true));
register("regeditallilit", async (a) => regeditFn(a[0]??"", a[1]??"", a[2]??"", "gi", true));

// ── reswitch variants — regex-based switch ────────────────────────────────────
// reswitch(str, pat1, val1, ...[, default]) — first match; reswitchall — all matches

function reswitchFirst(str: string, pairs: string[], ci: boolean): string {
  const flags = ci ? "i" : "";
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    let re: RegExp;
    try { re = new RegExp(pairs[i] ?? "", flags); } catch { continue; }
    if (re.test(str)) return pairs[i + 1] ?? "";
  }
  return pairs.length % 2 !== 0 ? (pairs[pairs.length - 1] ?? "") : "";
}

function reswitchAll(str: string, pairs: string[], ci: boolean): string {
  const flags = ci ? "i" : "";
  const out: string[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    let re: RegExp;
    try { re = new RegExp(pairs[i] ?? "", flags); } catch { continue; }
    if (re.test(str)) out.push(pairs[i + 1] ?? "");
  }
  return out.join(" ");
}

register("reswitch",     async (a) => reswitchFirst(a[0]??"", a.slice(1), false));
register("reswitchi",    async (a) => reswitchFirst(a[0]??"", a.slice(1), true));
register("reswitchall",  async (a) => reswitchAll(a[0]??"",  a.slice(1), false));
register("reswitchalli", async (a) => reswitchAll(a[0]??"",  a.slice(1), true));

// ── regrep / regrepi — regex grep over a word list ───────────────────────────

register("regrep",  async (a) => {
  const words = (a[0] ?? "").trim().split(/\s+/).filter(Boolean);
  let re: RegExp; try { re = new RegExp(a[1] ?? ""); } catch { return ""; }
  return words.filter(w => re.test(w)).join(" ");
});
register("regrepi", async (a) => {
  const words = (a[0] ?? "").trim().split(/\s+/).filter(Boolean);
  let re: RegExp; try { re = new RegExp(a[1] ?? "", "i"); } catch { return ""; }
  return words.filter(w => re.test(w)).join(" ");
});

// ── reglmatch variants — regex match over a list, returning position(s) ───────

function reglmatchFn(list: string, pat: string, delim: string | undefined, ci: boolean, all: boolean): string {
  const sep   = delim !== undefined && delim !== "" ? delim : /\s+/;
  const items = list.trim().split(sep).filter(Boolean);
  let re: RegExp; try { re = new RegExp(pat, ci ? "i" : ""); } catch { return "0"; }
  if (all) return items.map((x, i) => re.test(x) ? String(i + 1) : "").filter(Boolean).join(" ");
  const i = items.findIndex(x => re.test(x));
  return String(i === -1 ? 0 : i + 1);
}

register("reglmatch",     async (a) => reglmatchFn(a[0]??"", a[1]??"", a[2], false, false));
register("reglmatchi",    async (a) => reglmatchFn(a[0]??"", a[1]??"", a[2], true,  false));
register("reglmatchall",  async (a) => reglmatchFn(a[0]??"", a[1]??"", a[2], false, true));
register("reglmatchalli", async (a) => reglmatchFn(a[0]??"", a[1]??"", a[2], true,  true));

register("regnummatch",  async (a) => {
  const items = (a[0]??"").trim().split(/\s+/).filter(Boolean);
  let re: RegExp; try { re = new RegExp(a[1]??""); } catch { return "0"; }
  return String(items.filter(x => re.test(x)).length);
});
register("regnummatchi", async (a) => {
  const items = (a[0]??"").trim().split(/\s+/).filter(Boolean);
  let re: RegExp; try { re = new RegExp(a[1]??"", "i"); } catch { return "0"; }
  return String(items.filter(x => re.test(x)).length);
});

// ── wrapcolumns(string, cols, width[, lead]) ──────────────────────────────────

register("wrapcolumns", async (a) => {
  const s    = a[0] ?? "";
  const cols = Math.max(1, int(a[1] ?? "1"));
  const w    = Math.max(1, int(a[2] ?? "78"));
  const lead = a[3] ?? "";
  const colW = Math.floor(w / cols);
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (cur.length > 0 && cur.length + 1 + word.length > colW) {
      lines.push(cur);
      cur = lead + word;
    } else {
      cur = cur.length === 0 ? (lines.length === 0 ? "" : lead) + word : cur + " " + word;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines.join("\r\n");
});

// ── base64 ────────────────────────────────────────────────────────────────────

register("encode64", async (a) => btoa(unescape(encodeURIComponent(a[0] ?? ""))));
register("decode64", async (a) => {
  try { return decodeURIComponent(escape(atob(a[0] ?? ""))); }
  catch { return "#-1 INVALID BASE64"; }
});

// ── strdistance(s1, s2) — Levenshtein distance ────────────────────────────────

register("strdistance", async (a) => {
  const a0 = a[0] ?? "", a1 = a[1] ?? "";
  const m = a0.length, n = a1.length;
  if (m === 0) return String(n);
  if (n === 0) return String(m);
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]++;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a0[i-1] === a1[j-1] ? prev : 1 + Math.min(prev, dp[i], dp[i-1]);
      prev = tmp;
    }
  }
  return String(dp[m]);
});

// ── nameq / nameqm ────────────────────────────────────────────────────────────

register("nameq", async (a) =>
  stripAnsi(a[0]??"").trim().toLowerCase() === stripAnsi(a[1]??"").trim().toLowerCase() ? "1" : "0"
);
register("nameqm", async (a) => {
  const name = stripAnsi(a[0] ?? "").trim().toLowerCase();
  const pat  = (a[1] ?? "").toLowerCase();
  const re   = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
  return re.test(name) ? "1" : "0";
});
