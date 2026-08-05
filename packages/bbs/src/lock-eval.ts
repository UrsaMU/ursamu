/**
 * Pure lock evaluation for BBS board locks (no DBO).
 *
 * Supports engine-style lockfuncs used on boards:
 *   flag(name), perm(level), type(name), is(#id)
 *   && || ! () grouping
 * Legacy bare ladders: admin+, wizard+, builder+, staff+
 *
 * Fail-closed on unknown tokens / parse errors.
 */

const MAX_LEN = 4096;
const MAX_TOKENS = 256;

/** Privilege ladder for perm() / bare name+ (low → high). */
const LADDER = [
  "player",
  "builder",
  "staff",
  "admin",
  "wizard",
  "superuser",
] as const;

function ladderIndex(name: string): number {
  const n = name.toLowerCase().replace(/\+$/, "");
  return LADDER.indexOf(n as (typeof LADDER)[number]);
}

/** True if flags include name, or name+ (this level or higher). */
export function flagsPassLevel(
  flags: Set<string>,
  level: string,
): boolean {
  const raw = level.trim().toLowerCase();
  if (!raw) return false;
  const wantPlus = raw.endsWith("+");
  const base = wantPlus ? raw.slice(0, -1) : raw;
  if (!wantPlus && flags.has(base)) return true;
  const need = ladderIndex(base);
  if (need < 0) {
    // Unknown level — exact flag only
    return flags.has(base);
  }
  for (const f of flags) {
    const i = ladderIndex(f);
    if (i >= need) return true;
  }
  return false;
}

type Tok =
  | { t: "op"; v: "&&" | "||" | "!" | "(" | ")" }
  | { t: "atom"; v: string };

function tokenize(src: string): Tok[] | null {
  const s = src.trim();
  if (!s || s.length > MAX_LEN) return null;
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "!") {
      out.push({ t: "op", v: "!" });
      i++;
      continue;
    }
    if (c === "&") {
      if (s[i + 1] === "&") i++;
      out.push({ t: "op", v: "&&" });
      i++;
      continue;
    }
    if (c === "|") {
      if (s[i + 1] === "|") i++;
      out.push({ t: "op", v: "||" });
      i++;
      continue;
    }
    // atom: flag(admin) or admin+ or bare word
    let j = i;
    let depth = 0;
    while (j < s.length) {
      const ch = s[j]!;
      if (ch === "(") depth++;
      if (ch === ")") {
        if (depth === 0) break;
        depth--;
      }
      if (depth === 0 && /[\s&|!]/.test(ch)) break;
      j++;
    }
    const atom = s.slice(i, j).trim();
    if (!atom) return null;
    out.push({ t: "atom", v: atom });
    i = j;
  }
  if (out.length > MAX_TOKENS) return null;
  return out;
}

function evalAtom(
  atom: string,
  flags: Set<string>,
  enactorId: string,
): boolean {
  const a = atom.trim();
  // lockfunc(args)
  const m = a.match(/^([a-zA-Z_][\w]*)\((.*)\)$/);
  if (m) {
    const name = m[1]!.toLowerCase();
    const args = m[2]!
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (name === "flag" || name === "type") {
      const f = (args[0] ?? "").toLowerCase();
      return f ? flags.has(f) : false;
    }
    if (name === "perm") {
      return flagsPassLevel(flags, args[0] ?? "");
    }
    if (name === "is") {
      const id = (args[0] ?? "").replace(/^#/, "");
      return id !== "" && id === enactorId.replace(/^#/, "");
    }
    // attr/holds need DB — fail closed in pure eval
    return false;
  }
  // Bare legacy ladder: admin+, wizard, etc.
  if (/^[a-zA-Z_][\w]*\+?$/.test(a)) {
    return flagsPassLevel(flags, a);
  }
  return false;
}

/**
 * Evaluate a board lock against a caller's flags.
 * Empty / all() → true (caller should handle before this).
 */
export function evalBoardLock(
  lockStr: string,
  flags: Set<string>,
  enactorId = "",
): boolean {
  const raw = String(lockStr ?? "").trim();
  if (!raw || raw === "all()") return true;

  const tokens = tokenize(raw);
  if (!tokens || tokens.length === 0) return false;

  let pos = 0;

  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  const parseOr = (): boolean => {
    let left = parseAnd();
    while (peek()?.t === "op" && peek()?.v === "||") {
      take();
      left = left || parseAnd();
    }
    return left;
  };

  const parseAnd = (): boolean => {
    let left = parseNot();
    while (peek()?.t === "op" && peek()?.v === "&&") {
      take();
      left = left && parseNot();
    }
    return left;
  };

  const parseNot = (): boolean => {
    if (peek()?.t === "op" && peek()?.v === "!") {
      take();
      return !parseNot();
    }
    return parsePrimary();
  };

  const parsePrimary = (): boolean => {
    const tok = peek();
    if (!tok) return false;
    if (tok.t === "op" && tok.v === "(") {
      take();
      const inner = parseOr();
      if (!(peek()?.t === "op" && peek()?.v === ")")) return false;
      take();
      return inner;
    }
    if (tok.t === "atom") {
      take();
      return evalAtom(tok.v, flags, enactorId);
    }
    return false;
  };

  try {
    const result = parseOr();
    if (pos !== tokens.length) return false;
    return result;
  } catch {
    return false;
  }
}
