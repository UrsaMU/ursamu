/**
 * Tokenizer + recursive-descent parser for +jobs/select.
 */
export type Tok =
  | { t: "id"; v: string }
  | { t: "str"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "and" }
  | { t: "or" }
  | { t: "not" };

export type SelectAst =
  | { k: "atom"; name: string; op?: string; val?: string }
  | { k: "not"; x: SelectAst }
  | { k: "and" | "or"; a: SelectAst; b: SelectAst };

export type TokStream = { list: Tok[]; i: number };

export function tokenize(s: string): TokStream {
  const list: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      list.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      list.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === "&") {
      list.push({ t: "and" });
      i++;
      continue;
    }
    if (c === "|") {
      list.push({ t: "or" });
      i++;
      continue;
    }
    if (c === "!" && s[i + 1] !== "=") {
      list.push({ t: "not" });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let v = "";
      while (i < s.length && s[i] !== q) v += s[i++];
      if (s[i] !== q) throw new Error("unclosed quote");
      i++;
      list.push({ t: "str", v });
      continue;
    }
    if (c === "=" || c === "<" || c === ">") {
      let op = c;
      i++;
      if (s[i] === "=") {
        op += "=";
        i++;
      }
      list.push({ t: "op", v: op });
      continue;
    }
    if (/[a-zA-Z0-9_@.#-]/.test(c)) {
      let v = "";
      while (i < s.length && /[a-zA-Z0-9_@.#-]/.test(s[i])) {
        v += s[i++];
      }
      const low = v.toLowerCase();
      if (low === "and") list.push({ t: "and" });
      else if (low === "or") list.push({ t: "or" });
      else if (low === "not") list.push({ t: "not" });
      else list.push({ t: "id", v });
      continue;
    }
    throw new Error(`bad char '${c}'`);
  }
  return { list, i: 0 };
}

function peek(t: TokStream): Tok | undefined {
  return t.list[t.i];
}
function take(t: TokStream): Tok {
  const x = t.list[t.i++];
  if (!x) throw new Error("unexpected end");
  return x;
}

export function parseExpr(t: TokStream): SelectAst {
  let left = parseAnd(t);
  while (peek(t)?.t === "or") {
    take(t);
    left = { k: "or", a: left, b: parseAnd(t) };
  }
  return left;
}

function parseAnd(t: TokStream): SelectAst {
  let left = parseUnary(t);
  while (peek(t)?.t === "and") {
    take(t);
    left = { k: "and", a: left, b: parseUnary(t) };
  }
  return left;
}

function parseUnary(t: TokStream): SelectAst {
  if (peek(t)?.t === "not") {
    take(t);
    return { k: "not", x: parseUnary(t) };
  }
  return parsePrimary(t);
}

function parsePrimary(t: TokStream): SelectAst {
  const p = peek(t);
  if (!p) throw new Error("expected term");
  if (p.t === "lp") {
    take(t);
    const e = parseExpr(t);
    if (take(t).t !== "rp") throw new Error("expected )");
    return e;
  }
  if (p.t !== "id") throw new Error("expected criterion");
  const name = take(t).v!.toLowerCase();
  const n = peek(t);
  if (n?.t === "op") {
    const op = take(t).v!;
    const vtok = take(t);
    if (vtok.t !== "id" && vtok.t !== "str") {
      throw new Error("expected value");
    }
    return { k: "atom", name, op, val: vtok.v };
  }
  return { k: "atom", name };
}
