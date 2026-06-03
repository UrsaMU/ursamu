// deno-lint-ignore-file require-await
/**
 * @module stdlib/misc-compat
 *
 * Additional RhostMUSH/TinyMUX compatibility functions:
 * template, writable, parents, cmds, listfunctions, listflags.
 *
 * Note: while() is registered in ursamu-engine.ts as a lazy function
 * (it needs per-iteration re-evaluation of both cond and body).
 */

import { register, lookup, entries } from "./registry.ts";
import { resolveObj } from "./object-shared.ts";

// ── template(attr, list, [sep], [osep]) — alias for map() ────────────────────
// In TinyMUX/Rhost, template() evaluates attr for each list element with item
// as %0. This is identical to map(attr, list, sep). Alias directly.

const _mapFn = lookup("map");
if (_mapFn) register("template", _mapFn);

// ── writable(obj, attr) — check if attr can be set by enactor ────────────────
// UrsaMU does not yet have per-attribute write locks, so this always returns 1.

register("writable", async (_a, _ctx) => "1");

// ── parents(obj) — full ancestor chain (excluding the object itself) ──────────
// Returns space-separated list of parent #dbrefs, from immediate parent upward.
// Same as lparent() but omits the object itself from the result.

register("parents", async (a, ctx) => {
  const obj = await resolveObj(a[0] ?? "me", ctx);
  if (!obj) return "#-1 NOT FOUND";
  const chain: string[] = [];
  const visited = new Set<string>([obj.id]);
  let cur = obj;
  while (true) {
    const pid = (cur.state as Record<string, unknown>)?.parent as string | undefined;
    if (!pid || visited.has(pid)) break;
    visited.add(pid);
    chain.push(`#${pid}`);
    const parent = await ctx.db.queryById(pid);
    if (!parent) break;
    cur = parent;
  }
  return chain.join(" ") || "#-1";
});

// ── cmds(obj) — alias for lcmds() ─────────────────────────────────────────────

const _lcmdsFn = lookup("lcmds");
if (_lcmdsFn) register("cmds", _lcmdsFn);

// ── listfunctions() — list all registered softcode function names ─────────────
// Includes both stdlib-registry functions and the engine-registered lazy forms
// (iter/parse/while/localize/switch) that are not in the stdlib registry.

const ENGINE_LAZY_FUNCS = ["if", "ifelse", "iter", "localize", "parse", "switch", "while"];

register("listfunctions", async () => {
  const all = new Set<string>([
    ...ENGINE_LAZY_FUNCS,
    ...Array.from(entries()).map(([name]) => name),
  ]);
  return Array.from(all).sort().join(" ");
});

// ── listflags() — list all known flag names ────────────────────────────────────
// Returns the known flags in the UrsaMU flag system.

const KNOWN_FLAGS = [
  "abode", "admin", "ansi", "audible", "blind", "builder", "chown_ok",
  "connected", "dark", "destroy_ok", "enter_ok", "exit", "fixed",
  "going", "guest", "haven", "inherit", "jump_ok", "keep_key",
  "link_ok", "listener", "loud", "monitor", "no_command", "no_inherit",
  "no_tel", "opaque", "parent_ok", "player", "puppet", "quiet",
  "robot", "room", "safe", "slave", "startup", "sticky", "storyteller",
  "superuser", "suspended", "thing", "transparent", "unfindable",
  "verbose", "visual", "void", "wizard",
];

register("listflags", async () => KNOWN_FLAGS.join(" "));
