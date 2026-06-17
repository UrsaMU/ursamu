// deno-lint-ignore-file require-await
/**
 * @module stdlib/list-compat
 *
 * RhostMUSH/TinyMUX list compatibility functions:
 * listdiff/listinter/listunion aliases, sortlist, shift, avg/lavg, lmath,
 * nummatch/nummember/numpos, lset/lreplace, firstof/allof, dice/die.
 */

import { register, lookup } from "./registry.ts";
import { int, splitList as split, joinList as join, num, fmt } from "./helpers.ts";

// ── set-operation aliases ─────────────────────────────────────────────────────
// listdiff/listinter/listunion are RhostMUSH names for setdiff/setinter/setunion.

// Registered after list.ts runs, so lookup() returns the existing implementations.
[
  ["listdiff",  "setdiff"],
  ["listinter", "setinter"],
  ["listunion", "setunion"],
  ["sortlist",  "sort"],
].forEach(([alias, original]) => {
  const fn = lookup(original);
  if (fn) register(alias, fn);
});

// ── shift(list, delim) — first element (alias for first()) ───────────────────

register("shift", async (a) => split(a[0] ?? "", a[1])[0] ?? "");

// ── lset / lreplace — set/replace element at position (alias for replace()) ──

register(["lset", "lreplace"], async (a) => {
  const list = split(a[0] ?? "", a[3]);
  const i    = int(a[1]) - 1;
  if (i >= 0 && i < list.length) list[i] = a[2] ?? "";
  return join(list, a[3]);
});

// ── firstof(list, delim) — first non-empty element ───────────────────────────

register("firstof", async (a) => {
  return split(a[0] ?? "", a[1]).find(x => x.trim() !== "") ?? "";
});

// ── allof(list, delim) — all non-empty elements ──────────────────────────────

register("allof", async (a) => {
  return join(split(a[0] ?? "", a[1]).filter(x => x.trim() !== ""), a[1]);
});

// ── avg / lavg — arithmetic mean ──────────────────────────────────────────────

register(["avg", "lavg"], async (a) => {
  const items = split(a[0] ?? "", a[1]).map(x => num(x));
  if (items.length === 0) return "0";
  return fmt(items.reduce((s, x) => s + x, 0) / items.length);
});

// ── lmath(op, list, delim) — apply a math op across a list ───────────────────
// Supported ops: sum, add, sub, mul, div, max, min, mean, avg

register("lmath", async (a) => {
  const op    = (a[0] ?? "sum").toLowerCase();
  const items = split(a[1] ?? "", a[2]).map(x => num(x));
  if (items.length === 0) return "0";
  if (op === "sum" || op === "add") return fmt(items.reduce((s, x) => s + x, 0));
  if (op === "mul")                 return fmt(items.reduce((s, x) => s * x, 1));
  if (op === "max")                 return fmt(Math.max(...items));
  if (op === "min")                 return fmt(Math.min(...items));
  if (op === "mean" || op === "avg") return fmt(items.reduce((s, x) => s + x, 0) / items.length);
  if (op === "sub" && items.length >= 2) return fmt(items.slice(1).reduce((s, x) => s - x, items[0]));
  if (op === "div" && items.length >= 2) {
    return items.slice(1).every(x => x !== 0)
      ? fmt(items.slice(1).reduce((s, x) => s / x, items[0]))
      : "#-1 DIVISION BY ZERO";
  }
  return "#-1 INVALID OPERATION";
});

// ── nummatch / nummember — count of elements equal to value ──────────────────

register(["nummatch", "nummember"], async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const val  = (a[1] ?? "").toLowerCase();
  return String(list.filter(x => x.toLowerCase() === val).length);
});

// ── numpos — position count: how many positions before first match ────────────
// (In Rhost this is 1-indexed position of element matching value)

register("numpos", async (a) => {
  const list = split(a[0] ?? "", a[2]);
  const val  = (a[1] ?? "").toLowerCase();
  const i    = list.findIndex(x => x.toLowerCase() === val);
  return String(i === -1 ? 0 : i + 1);
});

// ── dice / die — dice rolling ─────────────────────────────────────────────────
// die(sides) — roll one die; dice(num, sides) — roll N dice and return total

register("die",  async (a) => {
  const sides = int(a[0] ?? "6");
  if (sides < 1) return "0";
  return String(1 + Math.floor(Math.random() * sides));
});

register("dice", async (a) => {
  const count = Math.max(1, int(a[0] ?? "1"));
  const sides = int(a[1] ?? "6");
  if (sides < 1 || count > 100) return "0";
  let total = 0;
  for (let i = 0; i < count; i++) total += 1 + Math.floor(Math.random() * sides);
  return String(total);
});

// ── lsub — subtract: remove all elements of list2 from list1 -----------------
// Same as setdiff but preserves duplicates in list1.

register("lsub", async (a) => {
  const l1  = split(a[0] ?? "", a[2]);
  const set = new Set(split(a[1] ?? "", a[2]).map(x => x.toLowerCase()));
  return join(l1.filter(x => !set.has(x.toLowerCase())), a[2]);
});
