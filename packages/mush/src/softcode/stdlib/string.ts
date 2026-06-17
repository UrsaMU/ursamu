// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import { int, stripAnsi } from "./helpers.ts";

// Hard cap on any softcode-controlled width / repeat-count to prevent DoS
// via memory blowup (e.g. `[repeat(x,99999999)]`). 10 000 chars is well
// above any sane terminal width (max ~250) yet bounded to ~10 KB per call.
const MAX_LEN = 10_000;
const clampLen = (n: number) => Math.min(Math.max(0, n | 0), MAX_LEN);

// ── concatenation ─────────────────────────────────────────────────────────

register("cat",    async (a) => a.join(" "));
register("strcat", async (a) => a.join(""));

// ── length ────────────────────────────────────────────────────────────────

register("strlen",   async (a) => String(stripAnsi(a[0] ?? "").length));
register("strmem",   async (a) => String(new TextEncoder().encode(a[0] ?? "").length));

// ── case conversion ───────────────────────────────────────────────────────

register("upcase",  async (a) => (a[0] ?? "").toUpperCase());
register("lowcase", async (a) => (a[0] ?? "").toLowerCase());
register("lcstr",   async (a) => (a[0] ?? "").toLowerCase());
register("ucstr",   async (a) => (a[0] ?? "").toUpperCase());
register("capstr",  async (a) => {
  const s = a[0] ?? "";
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase();
});

// ── trimming ──────────────────────────────────────────────────────────────

register("trim", async (a) => {
  const s = a[0] ?? "";
  const which = (a[1] ?? "b").toLowerCase();
  if (which === "l" || which === "left")  return s.trimStart();
  if (which === "r" || which === "right") return s.trimEnd();
  return s.trim();
});
register("squish", async (a) => (a[0] ?? "").trim().replace(/\s+/g, " "));

// ── substrings ────────────────────────────────────────────────────────────

register("left",  async (a) => {
  const s = a[0] ?? ""; const n = int(a[1]);
  return n <= 0 ? "" : s.slice(0, n);
});
register("right", async (a) => {
  const s = a[0] ?? ""; const n = int(a[1]);
  return n <= 0 ? "" : s.slice(-n);
});
register("mid", async (a) => {
  const s = a[0] ?? "";
  const start = int(a[1]);
  const len   = int(a[2]);
  return s.slice(start, start + len);
});
register("strtrunc", async (a) => {
  const s = a[0] ?? ""; const n = int(a[1]);
  return n <= 0 ? "" : s.slice(0, n);
});

// ── padding / justification ───────────────────────────────────────────────

register("ljust",  async (a) => {
  const s = a[0] ?? ""; const w = clampLen(int(a[1])); const fill = a[2]?.[0] ?? " ";
  return s.padEnd(w, fill).slice(0, Math.max(w, s.length));
});
register("rjust",  async (a) => {
  const s = a[0] ?? ""; const w = clampLen(int(a[1])); const fill = a[2]?.[0] ?? " ";
  return s.padStart(w, fill).slice(-Math.max(w, s.length));
});
register("center", async (a) => {
  const s = a[0] ?? ""; const w = clampLen(int(a[1])); const fill = a[2]?.[0] ?? " ";
  const total = Math.max(w - s.length, 0);
  const left  = Math.floor(total / 2);
  const right = total - left;
  return fill.repeat(left) + s + fill.repeat(right);
});
register("lpad", async (a) => {
  const s = a[0] ?? ""; const w = clampLen(int(a[1])); const fill = a[2]?.[0] ?? " ";
  return s.padStart(w, fill);
});
register("rpad", async (a) => {
  const s = a[0] ?? ""; const w = clampLen(int(a[1])); const fill = a[2]?.[0] ?? " ";
  return s.padEnd(w, fill);
});
register("cpad", async (a) => {
  const s = a[0] ?? ""; const w = clampLen(int(a[1]));
  const total = Math.max(w - s.length, 0);
  return " ".repeat(Math.floor(total/2)) + s + " ".repeat(total - Math.floor(total/2));
});

// ── header / divider / footer ─────────────────────────────────────────────
// Layout helpers so attribute authors can write [header(The Void)] instead
// of [ljust(===== %0 ,78,=)]. Shape: 5 fill + space + title + space + pad.

register("header", async (a) => {
  const title = a[0] ?? "";
  const width = clampLen(int(a[1] ?? "78") || 78);
  const fill  = (a[2] ?? "=")[0] || "=";
  if (title.length === 0) return fill.repeat(width);
  const prefix = fill.repeat(5) + " " + title + " ";
  return prefix.length >= width ? prefix.slice(0, width)
    : prefix + fill.repeat(width - prefix.length);
});

register("divider", async (a) => {
  const title = a[0] ?? "";
  const width = clampLen(int(a[1] ?? "78") || 78);
  const fill  = (a[2] ?? "-")[0] || "-";
  if (title.length === 0) return fill.repeat(width);
  const prefix = fill.repeat(5) + " " + title + " ";
  return prefix.length >= width ? prefix.slice(0, width)
    : prefix + fill.repeat(width - prefix.length);
});

register("footer", async (a) => {
  const width = clampLen(int(a[0] ?? "78") || 78);
  const fill  = (a[1] ?? "=")[0] || "=";
  return fill.repeat(width);
});

// ── space / repeat ────────────────────────────────────────────────────────

register("space",  async (a) => " ".repeat(clampLen(int(a[0]))));
register("repeat", async (a) => (a[0] ?? "").repeat(clampLen(int(a[1]))));

// ── reverse ───────────────────────────────────────────────────────────────

register("reverse", async (a) => (a[0] ?? "").split("").reverse().join(""));

// ── search ────────────────────────────────────────────────────────────────

register("before", async (a) => {
  const s = a[0] ?? ""; const sep = a[1] ?? " ";
  const i = s.indexOf(sep);
  return i === -1 ? s : s.slice(0, i);
});
register("after", async (a) => {
  const s = a[0] ?? ""; const sep = a[1] ?? " ";
  const i = s.indexOf(sep);
  return i === -1 ? "" : s.slice(i + sep.length);
});
register("index", async (a) => {
  // index(string, char, which) — return which-th occurrence position (1-indexed), or 0
  const s = a[0] ?? ""; const ch = a[1] ?? " "; const n = int(a[2] ?? "1");
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ch[0]) {
      count++;
      if (count === n) return String(i + 1);
    }
  }
  return "0";
});
register("pos", async (a) => {
  const needle = a[0] ?? ""; const hay = a[1] ?? "";
  const i = hay.indexOf(needle);
  return String(i === -1 ? 0 : i + 1);
});
register("lpos", async (a) => {
  // lpos(list, element) — 0-indexed position in space-delimited list, or -1
  const list = (a[0] ?? "").trim().split(/\s+/);
  const el   = a[1] ?? "";
  const i    = list.findIndex(x => x.toLowerCase() === el.toLowerCase());
  return String(i);
});
register("wordpos", async (a) => {
  const s = a[0] ?? ""; const word = a[1] ?? "";
  const words = s.trim().split(/\s+/);
  const i = words.findIndex(w => w.toLowerCase() === word.toLowerCase());
  return String(i === -1 ? 0 : i + 1);
});

// ── edit / substitute ─────────────────────────────────────────────────────

register("edit", async (a) => {
  // edit(string, from, to) — replace all occurrences; from can be %r %t %b
  const s = a[0] ?? "";
  const from = a[1]?.replace(/%r/gi,"\r\n").replace(/%t/gi,"\t").replace(/%b/gi," ") ?? "";
  const to   = a[2]?.replace(/%r/gi,"\r\n").replace(/%t/gi,"\t").replace(/%b/gi," ") ?? "";
  if (from === "") return s;
  return s.split(from).join(to);
});

// ── escape / secure ───────────────────────────────────────────────────────

register("escape",  async (a) => (a[0] ?? "").replace(/%/g, "%%"));
register("secure",  async (a) => (a[0] ?? "").replace(/[;,\[\]{}()"'\\%]/g, " "));
register("stripansi",  async (a) => stripAnsi(a[0] ?? ""));
register("strip",      async (a) => stripAnsi(a[0] ?? ""));
register("stripaccents", async (a) => (a[0] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

// ── translate ─────────────────────────────────────────────────────────────

register("translate", async (a) => {
  // translate(string, type) — type: "telnet" or "html"; convert ANSI/color codes
  const s = a[0] ?? "";
  return stripAnsi(s);  // simplified: strip codes
});

// ── character ops ─────────────────────────────────────────────────────────

register("chr", async (a) => String.fromCodePoint(int(a[0])));
register("ord", async (a) => String((a[0] ?? " ").codePointAt(0) ?? 0));

// ── matching ──────────────────────────────────────────────────────────────

register("strmatch", async (a) => {
  const s = a[0] ?? ""; const pat = a[1] ?? "";
  return globMatch(s, pat, true) ? "1" : "0";
});
register("comp", async (a) => {
  const r = (a[0] ?? "").localeCompare(a[1] ?? "");
  return r < 0 ? "-1" : r > 0 ? "1" : "0";
});
register("alpha", async (a) => /^[a-zA-Z]+$/.test(a[0] ?? "") ? "1" : "0");
register("alphamax", async (a) => {
  const words = a.filter(Boolean);
  return words.reduce((max, w) => w.localeCompare(max) > 0 ? w : max, words[0] ?? "");
});
register("alphamin", async (a) => {
  const words = a.filter(Boolean);
  return words.reduce((min, w) => w.localeCompare(min) < 0 ? w : min, words[0] ?? "");
});

// ── regex ─────────────────────────────────────────────────────────────────

register("regmatch",  async (a) => safeRegex(a[0], a[1], false) ? "1" : "0");
register("regmatchi", async (a) => safeRegex(a[0], a[1], true)  ? "1" : "0");
register("regrab",    async (a) => {
  const m = safeRegexExec(a[0], a[1], false);
  return m ? m[int(a[2] ?? "0")] ?? "" : "";
});
register("regraball", async (a) => {
  const matches: string[] = [];
  const re = buildRe(a[1], false);
  if (!re) return "";
  let m: RegExpExecArray | null;
  const src = a[0] ?? "";
  while ((m = re.exec(src)) !== null) {
    matches.push(m[int(a[2] ?? "0")] ?? "");
    if (!re.global) break;
  }
  return matches.join(a[3] ?? " ");
});
register("regraballi", async (a) => {
  const matches: string[] = [];
  const re = buildRe(a[1], true);
  if (!re) return "";
  let m: RegExpExecArray | null;
  const src = a[0] ?? "";
  while ((m = re.exec(src)) !== null) {
    matches.push(m[int(a[2] ?? "0")] ?? "");
    if (!re.global) break;
  }
  return matches.join(a[3] ?? " ");
});
register("regrabi",   async (a) => {
  const m = safeRegexExec(a[0], a[1], true);
  return m ? m[int(a[2] ?? "0")] ?? "" : "";
});
register("grep",  async (a) => {
  const list = (a[0] ?? "").trim().split(/\s+/);
  const re   = buildRe(a[1], false);
  if (!re) return "";
  return list.filter(w => re.test(w)).join(" ");
});
register("grepi", async (a) => {
  const list = (a[0] ?? "").trim().split(/\s+/);
  const re   = buildRe(a[1], true);
  if (!re) return "";
  return list.filter(w => re.test(w)).join(" ");
});

// ── wrap ──────────────────────────────────────────────────────────────────

register("wrap", async (a) => {
  const s    = a[0] ?? "";
  const w    = int(a[1] ?? "78");
  const lead = a[2] ?? "";
  if (w <= 0) return s;
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (cur.length > 0 && cur.length + 1 + word.length > w) {
      lines.push(cur);
      cur = lead + word;
    } else {
      cur = cur.length === 0 ? (lines.length === 0 ? "" : lead) + word : cur + " " + word;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines.join("\r\n");
});

// ── columns / table ───────────────────────────────────────────────────────

register("columns", async (a) => {
  // columns(list, width, sep, iSep) — format list into columns
  const items = (a[0] ?? "").trim().split(/\s+/);
  const w     = int(a[1] ?? "20");
  const sep   = a[2] ?? " ";
  const iSep  = a[3] ?? " ";
  return items.map(x => x.padEnd(w)).join(sep) + iSep;
});

// ── accent (stub) ─────────────────────────────────────────────────────────

register("accent",   async (a) => a[0] ?? "");

// ── crypto / hash (stubs) ─────────────────────────────────────────────────

register("sha1",    async (a) => {
  const data = new TextEncoder().encode(a[0] ?? "");
  const buf  = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
});
register("digest",  async (a) => {
  const algo = (a[0] ?? "SHA1").replace("-","").toUpperCase();
  const name = algo === "SHA1" ? "SHA-1" : algo === "SHA256" ? "SHA-256" : "SHA-1";
  const data = new TextEncoder().encode(a[1] ?? "");
  try {
    const buf = await crypto.subtle.digest(name, data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  } catch { return "#-1 UNSUPPORTED ALGORITHM"; }
});
register("crc32",   async () => "0");  // stub
register("encrypt", async (a) => a[1] ?? "");  // stub passthrough
register("decrypt", async (a) => a[1] ?? "");  // stub passthrough

// ── pack / unpack (stubs) ─────────────────────────────────────────────────
register("pack",   async (a) => a.join(" "));
register("unpack", async (a) => a[0] ?? "");

// ── spell number ─────────────────────────────────────────────────────────

register("spellnum", async (a) => {
  const n = parseInt(a[0], 10);
  if (isNaN(n)) return "#-1 NOT A NUMBER";
  return spellNumber(n);
});

// ── itemize ───────────────────────────────────────────────────────────────

register("itemize", async (a) => {
  const items = (a[0] ?? "").trim().split(/\s+/).filter(Boolean);
  const conj  = a[1] ?? "and";
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return items.slice(0,-1).join(", ") + `, ${conj} ${items[items.length-1]}`;
});

// ── ANSI ──────────────────────────────────────────────────────────────────

register("ansi", async (a) => {
  // ansi(codes, text) — wrap text in ANSI escape codes
  // codes: h=bold, r=red, g=green, etc. or "normal"/"reset"
  const codes = a[0] ?? "";
  const text  = a[1] ?? "";
  const ANSI: Record<string,string> = {
    h: "\x1b[1m", u: "\x1b[4m", f: "\x1b[5m", i: "\x1b[3m",
    r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", b: "\x1b[34m",
    m: "\x1b[35m", c: "\x1b[36m", w: "\x1b[37m", x: "\x1b[30m",
    R: "\x1b[41m", G: "\x1b[42m", Y: "\x1b[43m", B: "\x1b[44m",
    M: "\x1b[45m", C: "\x1b[46m", W: "\x1b[47m", X: "\x1b[40m",
    n: "\x1b[0m",
  };
  if (codes === "normal" || codes === "reset") return `\x1b[0m${text}\x1b[0m`;
  const esc = codes.split("").map(c => ANSI[c] ?? "").join("");
  return `${esc}${text}\x1b[0m`;
});
register("beep", async () => "");  // no-op in WebSocket context

// ── internal helpers ──────────────────────────────────────────────────────

function globMatch(s: string, pat: string, caseInsensitive: boolean): boolean {
  const re = "^" + pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$";
  return new RegExp(re, caseInsensitive ? "i" : "").test(s);
}

function buildRe(pattern: string, i: boolean): RegExp | null {
  try { return new RegExp(pattern ?? "", (i ? "ig" : "g")); }
  catch { return null; }
}

function safeRegex(s: string, pattern: string, i: boolean): boolean {
  try { return new RegExp(pattern, i ? "i" : "").test(s); }
  catch { return false; }
}

function safeRegexExec(s: string, pattern: string, i: boolean): RegExpExecArray | null {
  try { return new RegExp(pattern, i ? "i" : "").exec(s); }
  catch { return null; }
}

// ── Phonetic matching ─────────────────────────────────────────────────────

/** Soundex algorithm — returns 4-character code. */
function soundex(s: string): string {
  if (!s) return "";
  const MAP: Record<string, string> = {
    b:"1", f:"1", p:"1", v:"1",
    c:"2", g:"2", j:"2", k:"2", q:"2", s:"2", x:"2", z:"2",
    d:"3", t:"3",
    l:"4",
    m:"5", n:"5",
    r:"6",
  };
  const upper = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!upper) return "";
  let code = upper[0];
  let last = MAP[upper[0].toLowerCase()] ?? "0";
  for (let i = 1; i < upper.length && code.length < 4; i++) {
    const d = MAP[upper[i].toLowerCase()] ?? "0";
    if (d !== "0" && d !== last) { code += d; last = d; }
    else if (d === "0") { last = "0"; }
  }
  return code.padEnd(4, "0");
}

register("soundex", async (a) => soundex(a[0] ?? ""));
register("soundslike", async (a) => soundex(a[0] ?? "") === soundex(a[1] ?? "") ? "1" : "0");

// ── Character class tests ─────────────────────────────────────────────────

register("isalnum", async (a) => /^[a-zA-Z0-9]+$/.test(a[0] ?? "") ? "1" : "0");
register("ispunct", async (a) => {
  const s = a[0] ?? "";
  return s.length > 0 && /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/.test(s) ? "1" : "0";
});

// ── article ───────────────────────────────────────────────────────────────

/**
 * art(word) — returns "an" if word starts with a vowel sound, else "a".
 * Handles the most common English cases (hour, honest, uniform, etc.).
 */
register("art", async (a) => {
  const w = (a[0] ?? "").trim().toLowerCase();
  if (!w) return "a";
  // Words that start with vowel letters but use "a" (starts with /j/ or /w/ sound)
  const aExceptions = /^(uni|use|u[rs][ei]|eur|ewe|one\b|out\b)/i;
  // Words that start with consonant letters but use "an" (silent h)
  const anExceptions = /^(hour|hon|heir|herb)/i;
  if (anExceptions.test(w)) return "an";
  if (aExceptions.test(w)) return "a";
  return /^[aeiou]/i.test(w) ? "an" : "a";
});

// ── speech formatter ──────────────────────────────────────────────────────

/**
 * speak(name, string[, type]) — format speech/pose output.
 *   type 0 / "say" (default) → `Name says "string."`
 *   type 1 / "pose" / ":"    → `Name string`
 *   type 2 / "semipose" / ";"→ `Namestring`
 *   type 3 / "emit"          → `string`
 * Adds a period at end of say if the string lacks terminal punctuation.
 */
register("speak", async (a) => {
  const name = a[0] ?? "";
  const str  = a[1] ?? "";
  const type = (a[2] ?? "0").toLowerCase().trim();
  if (type === "3" || type === "emit") return str;
  if (type === "1" || type === "pose" || type === ":") return `${name} ${str}`;
  if (type === "2" || type === "semipose" || type === ";") return `${name}${str}`;
  // say — wrap in quotes, add terminal period if needed
  const punct = /[.!?'")\]]$/.test(str);
  return `${name} says "${str}${punct ? "" : "."}"`
});

const ONES = ["","one","two","three","four","five","six","seven","eight","nine",
  "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function spellNumber(n: number): string {
  if (n < 0) return "negative " + spellNumber(-n);
  if (n === 0) return "zero";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n/10)] + (n%10 ? "-" + ONES[n%10] : "");
  if (n < 1000) return ONES[Math.floor(n/100)] + " hundred" + (n%100 ? " " + spellNumber(n%100) : "");
  if (n < 1_000_000) return spellNumber(Math.floor(n/1000)) + " thousand" + (n%1000 ? " " + spellNumber(n%1000) : "");
  return String(n);
}

// ── align ─────────────────────────────────────────────────────────────────────
// align(widths, cols...) — columnar layout. widths is a space-separated list of
// column widths. Positive = left-justified, negative = right-justified.
// e.g. align(10 -8, "Name", "Value")

register("align", async (a) => {
  const widthSpecs = (a[0] ?? "").trim().split(/\s+/);
  const cols       = a.slice(1);
  const parts: string[] = [];
  for (let i = 0; i < widthSpecs.length; i++) {
    const w    = int(widthSpecs[i] ?? "0");
    const text = stripAnsi(cols[i] ?? "");
    if (w === 0) { parts.push(text); continue; }
    const abs  = Math.abs(w);
    if (text.length >= abs) {
      parts.push(text.slice(0, abs));
    } else if (w > 0) {
      parts.push(text + " ".repeat(abs - text.length));   // left-justify
    } else {
      parts.push(" ".repeat(abs - text.length) + text);   // right-justify
    }
  }
  return parts.join("");
});
