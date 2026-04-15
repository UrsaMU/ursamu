// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";
import type { UrsaEvalContext } from "../ursamu-context.ts";
import { makeSubCtx, toLibCtx, isTimedOut } from "../ursamu-context.ts";
import { int, splitList as split, joinList as join } from "./helpers.ts";

// ── basic list access ─────────────────────────────────────────────────────

register(["words","numwords","nwords"], async (a) => {
  if (!a[0]?.trim()) return "0";
  return String(split(a[0], a[1]).length);
});
register("word",  async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const i    = int(a[1]) - 1;
  return i >= 0 ? (list[i] ?? "") : "";
});
register("first", async (a) => split(a[0] ?? "", a[1])[0] ?? "");
register("rest",  async (a) => {
  const list = split(a[0] ?? "", a[1]);
  return join(list.slice(1), a[1]);
});
register("last",  async (a) => {
  const list = split(a[0] ?? "", a[1]);
  return list[list.length - 1] ?? "";
});
register("extract", async (a) => {
  const list  = split(a[0] ?? "", a[3]);
  const start = int(a[1]) - 1;
  const len   = int(a[2] ?? "1");
  return join(list.slice(start, start + len), a[3]);
});
register("elements", async (a) => {
  const list    = split(a[0] ?? "", a[2]);
  const indices = split(a[1] ?? "");
  return join(indices.map(i => list[int(i) - 1] ?? ""), a[2]);
});
register("member", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const el   = a[1] ?? "";
  const i    = list.findIndex(x => x.toLowerCase() === el.toLowerCase());
  return String(i === -1 ? 0 : i + 1);
});
register("lnum", async (a) => {
  const start = a[1] !== undefined ? int(a[0]) : 0;
  const end   = a[1] !== undefined ? int(a[1]) : int(a[0]) - 1;
  const step  = int(a[2] ?? "1") || 1;
  const out: string[] = [];
  for (let i = start; i <= end; i += step) out.push(String(i));
  return join(out, a[3]);
});

// ── list mutations ────────────────────────────────────────────────────────

register("ldelete", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const i    = int(a[1]) - 1;
  if (i < 0) return join(list, a[2]);
  list.splice(i, 1);
  return join(list, a[2]);
});
register("delete", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const i    = int(a[1]) - 1;
  if (i < 0) return join(list, a[2]);
  list.splice(i, 1);
  return join(list, a[2]);
});
register("insert", async (a) => {
  const list = split(a[0] ?? "", a[3]);
  const i    = int(a[1]) - 1;
  const el   = a[2] ?? "";
  list.splice(Math.max(0, i), 0, el);
  return join(list, a[3]);
});
register("replace", async (a) => {
  const list = split(a[0] ?? "", a[3]);
  const i    = int(a[1]) - 1;
  if (i >= 0 && i < list.length) list[i] = a[2] ?? "";
  return join(list, a[3]);
});
register("remove", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const el   = (a[1] ?? "").toLowerCase();
  return join(list.filter(x => x.toLowerCase() !== el), a[2]);
});
register("revwords", async (a) => join(split(a[0] ?? "", a[1]).reverse(), a[1]));
register("splice", async (a) => {
  const l1 = split(a[0] ?? "", a[3]);
  const l2 = split(a[1] ?? "", a[3]);
  const i  = int(a[2]) - 1;
  l1.splice(i, 0, ...l2);
  return join(l1, a[3]);
});
register("shuffle", async (a) => {
  const list = split(a[0] ?? "", a[1]);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return join(list, a[1]);
});

// ── search / pick ─────────────────────────────────────────────────────────

register("grab", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const pat  = a[1] ?? "";
  const re   = globRe(pat);
  return list.find(x => re.test(x)) ?? "";
});
register("graball", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const pat  = a[1] ?? "";
  const re   = globRe(pat);
  return join(list.filter(x => re.test(x)), a[2]);
});
register("match",    async (a) => {
  const list = split(a[0] ?? "");
  const pat  = a[1] ?? "";
  const re   = globRe(pat);
  const i    = list.findIndex(x => re.test(x));
  return String(i === -1 ? 0 : i + 1);
});
register("matchall", async (a) => {
  const list = split(a[0] ?? "");
  const pat  = a[1] ?? "";
  const re   = globRe(pat);
  return list
    .map((x, i) => re.test(x) ? String(i + 1) : null)
    .filter(Boolean)
    .join(" ");
});
register("pickrand", async (a) => {
  const list = split(a[0] ?? "", a[1]);
  return list[Math.floor(Math.random() * list.length)] ?? "";
});
register("choose", async (a) => {
  // choose(list, weights)
  const list    = split(a[0] ?? "", a[2]);
  const weights = split(a[1] ?? "", a[2]).map(x => Math.max(0, parseFloat(x) || 0));
  const total   = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return list[Math.floor(Math.random() * list.length)] ?? "";
  let rand = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    rand -= weights[i] ?? 0;
    if (rand <= 0) return list[i] ?? "";
  }
  return list[list.length - 1] ?? "";
});
register("lrand", async (a) => {
  const lo = int(a[0]); const hi = int(a[1]); const n = int(a[2] ?? "1");
  if (hi < lo) return "";
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(String(lo + Math.floor(Math.random() * (hi - lo + 1))));
  return join(out, a[3]);
});

// ── set operations ────────────────────────────────────────────────────────

register("setunion",  async (a) => {
  const l1 = split(a[0] ?? "", a[2]);
  const l2 = split(a[1] ?? "", a[2]);
  const seen = new Set(l1.map(x => x.toLowerCase()));
  const out  = [...l1];
  for (const x of l2) if (!seen.has(x.toLowerCase())) { out.push(x); seen.add(x.toLowerCase()); }
  return join(out, a[2]);
});
register("setinter",  async (a) => {
  const l1   = split(a[0] ?? "", a[2]);
  const l2   = split(a[1] ?? "", a[2]);
  const s2   = new Set(l2.map(x => x.toLowerCase()));
  return join(l1.filter(x => s2.has(x.toLowerCase())), a[2]);
});
register("setdiff",   async (a) => {
  const l1 = split(a[0] ?? "", a[2]);
  const l2 = split(a[1] ?? "", a[2]);
  const s2 = new Set(l2.map(x => x.toLowerCase()));
  return join(l1.filter(x => !s2.has(x.toLowerCase())), a[2]);
});

// ── sorting ───────────────────────────────────────────────────────────────

register("sort", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const type = (a[1] ?? "a").toLowerCase();
  const sorted = [...list].sort((x, y) => {
    if (type === "n") return parseFloat(x) - parseFloat(y);
    if (type === "d") return y.localeCompare(x);
    return x.localeCompare(y);
  });
  return join(sorted, a[2]);
});
register("sortby", async (a, ctx) => {
  const list = split(a[1] ?? "", a[2]);
  const attr = a[0] ?? "";
  // For each pair of items, run the attr with them as args — complex, simplified:
  const scored = await Promise.all(list.map(async (item) => {
    const result = await callUserAttr(attr, [item], ctx);
    return { item, score: parseFloat(result) || 0 };
  }));
  return join(scored.sort((a2, b) => a2.score - b.score).map(x => x.item), a[2]);
});

// ── aggregation ───────────────────────────────────────────────────────────

register("ladd",  async (a) => String(split(a[0] ?? "", a[1]).reduce((s, x) => s + (parseFloat(x) || 0), 0)));
register("lmin",  async (a) => String(Math.min(...split(a[0] ?? "", a[1]).map(x => parseFloat(x) || 0))));
register("lmax",  async (a) => String(Math.max(...split(a[0] ?? "", a[1]).map(x => parseFloat(x) || 0))));
register("land",  async (a) => split(a[0] ?? "", a[1]).every(x => x !== "0" && x !== "") ? "1" : "0");
register("lor",   async (a) => split(a[0] ?? "", a[1]).some(x => x !== "0" && x !== "") ? "1" : "0");

// ── iter / map / filter ───────────────────────────────────────────────────
// Note: iter and parse are handled as lazy FunctionImpl by the engine factory
// (ursamu-engine.ts). They are NOT registered here to avoid double registration.

register("map", async (a, ctx) => {
  const list = split(a[1] ?? "", a[2]);
  const attr = a[0] ?? "";
  const results = await Promise.all(
    list.map(item => callUserAttr(attr, [item], ctx))
  );
  return join(results, a[2]);
});

register("filter", async (a, ctx) => {
  const list   = split(a[1] ?? "", a[2]);
  const attr   = a[0] ?? "";
  const passed: string[] = [];
  for (const item of list) {
    const r = await callUserAttr(attr, [item], ctx);
    if (r !== "" && r !== "0") passed.push(item);
  }
  return join(passed, a[2]);
});
register("filterbool", async (a, ctx) => {
  const list   = split(a[1] ?? "", a[2]);
  const attr   = a[0] ?? "";
  const passed: string[] = [];
  for (const item of list) {
    const r = await callUserAttr(attr, [item], ctx);
    if (r !== "" && r !== "0") passed.push(item);
  }
  return join(passed, a[2]);
});

register("fold", async (a, ctx) => {
  const attr  = a[0] ?? "";
  const list  = split(a[1] ?? "", a[3]);
  const init  = a[2] ?? "";
  let acc = init;
  for (const item of list) {
    acc = await callUserAttr(attr, [acc, item], ctx);
  }
  return acc;
});

register("foreach", async (a, ctx) => {
  const attr = a[0] ?? "";
  const str  = a[1] ?? "";
  const chars = str.split("");
  const results = await Promise.all(chars.map(c => callUserAttr(attr, [c], ctx)));
  return results.join("");
});

register("munge", async (a, ctx) => {
  // munge(attr, list1, list2, delim) — sort list1 by attr, apply same permutation to list2
  const attr  = a[0] ?? "";
  const list1 = split(a[1] ?? "", a[3]);
  const list2 = split(a[2] ?? "", a[3]);
  const scored = await Promise.all(
    list1.map(async (item, i) => ({ item, pair: list2[i] ?? "", score: await callUserAttr(attr, [item], ctx) }))
  );
  scored.sort((x, y) => x.score.localeCompare(y.score));
  return join(scored.map(x => x.pair), a[3]);
});

register("step", async (a, ctx) => {
  // step(attr, list, step_size, iDelim, oDelim)
  const attr    = a[0] ?? "";
  const list    = split(a[1] ?? "", a[3]);
  const step    = int(a[2] ?? "1") || 1;
  const results: string[] = [];
  for (let i = 0; i < list.length; i += step) {
    const chunk = list.slice(i, i + step);
    results.push(await callUserAttr(attr, chunk, ctx));
  }
  return join(results, a[4] ?? a[3]);
});

register("mix", async (a, ctx) => {
  // mix(attr, list1, list2, ...) — zip lists and call attr on each tuple
  const attr  = a[0] ?? "";
  const lists = a.slice(1).map(l => split(l, undefined));
  const len   = Math.min(...lists.map(l => l.length));
  const results: string[] = [];
  for (let i = 0; i < len; i++) {
    results.push(await callUserAttr(attr, lists.map(l => l[i] ?? ""), ctx));
  }
  return results.join(" ");
});

register("distribute", async (a) => {
  // distribute(list1, list2) — all combinations
  const l1 = split(a[0] ?? "");
  const l2 = split(a[1] ?? "");
  const out: string[] = [];
  for (const x of l1) for (const y of l2) out.push(`${x}/${y}`);
  return out.join(" ");
});

// ── merge ─────────────────────────────────────────────────────────────────

register("merge", async (a) => {
  // merge(list1, list2, word) — replace elements of list1 that equal word with list2 elements
  const l1   = split(a[0] ?? "");
  const l2   = split(a[1] ?? "");
  const word = a[2] ?? " ";
  let j = 0;
  return join(l1.map(x => x === word ? (l2[j++] ?? x) : x));
});

// ── misc list ─────────────────────────────────────────────────────────────

register("table", async (a) => {
  const list  = split(a[0] ?? "");
  const width = int(a[1] ?? "78");
  const flen  = int(a[2] ?? "20");
  const sep   = a[3] ?? " ";
  const cols  = Math.max(1, Math.floor(width / (flen + sep.length)));
  const rows: string[] = [];
  for (let i = 0; i < list.length; i += cols) {
    rows.push(list.slice(i, i + cols).map(x => x.padEnd(flen)).join(sep));
  }
  return rows.join("\r\n");
});

// ── internal helpers ──────────────────────────────────────────────────────

function globRe(pattern: string): RegExp {
  const re = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$";
  return new RegExp(re, "i");
}

async function callUserAttr(attr: string, args: string[], ctx: EvalContext): Promise<string> {
  // attr may be "obj/attr" or just "attr" (defaults to executor).
  const uctx     = ctx as unknown as UrsaEvalContext;
  const parts    = attr.split("/");
  const attrName = parts.length > 1 ? parts[1] : parts[0];
  const objId    = parts.length > 1 ? parts[0].replace(/^#/,"") : uctx.executor.id;

  const obj = await uctx.db.queryById(objId);
  if (!obj) return "";

  const code = await uctx.db.getAttribute(obj, attrName);
  if (!code) return "";

  const subCtx = makeSubCtx(uctx, obj, args, false);
  return uctx._engine.evalString(code, toLibCtx(subCtx));
}

// ── iter context accessors ────────────────────────────────────────────────────
// itext(n) — current item at iter depth n (0 = innermost)
// inum(n)  — 1-based position counter at iter depth n (0 = innermost)

register("itext", async (a, ctx) => {
  const uctx  = ctx as unknown as UrsaEvalContext;
  const n     = int(a[0] ?? "0");
  const stack = uctx.iterStack;
  const frame = stack[stack.length - 1 - n];
  return frame?.item ?? "";
});

register("inum", async (a, ctx) => {
  const uctx  = ctx as unknown as UrsaEvalContext;
  const n     = int(a[0] ?? "0");
  const stack = uctx.iterStack;
  const frame = stack[stack.length - 1 - n];
  return frame ? String((frame as unknown as { index?: number }).index ?? 0) : "0";
});

// ── elist ─────────────────────────────────────────────────────────────────────
// elist(list, conj, delim) → "A, B, and C"  (Oxford comma style)

register("elist", async (a) => {
  const items = split(a[0] ?? "", a[2]).filter(s => s.trim() !== "");
  const conj  = a[1] ?? "and";
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return items.slice(0, -1).join(", ") + `, ${conj} ` + items[items.length - 1];
});
