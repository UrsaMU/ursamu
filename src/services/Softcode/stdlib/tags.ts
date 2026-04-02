/**
 * Tag registry stdlib functions — RhostMUSH-style global and personal named
 * object registry.
 *
 * tag(tagname)            — return dbref of globally-tagged object, or #-1
 * istag(tagname)          — 1 if global tag exists, 0 otherwise
 * listtags([delim])       — space-separated list of all global tag names
 * tagmatch(obj, tagname)  — 1 if obj is tagged with tagname, 0 otherwise
 * ltag(tagname)           — return dbref of actor's personal tag, or #-1
 * isltag(tagname)         — 1 if actor has personal tag, 0 otherwise
 * listltags([delim])      — list of actor's personal tag names
 * ltagmatch(obj, tagname) — 1 if obj matches actor's personal tag
 */
import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";

// ── Global tags ───────────────────────────────────────────────────────────

/**
 * tag(tagname) — return the dbref of the globally-tagged object, or #-1.
 */
register("tag", async (a, ctx: EvalContext) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "#-1 INVALID TAG NAME";
  const id = await ctx.db.getTagById(name);
  return id ? `#${id}` : "#-1";
});

/**
 * istag(tagname) — 1 if the global tag exists, 0 if not.
 */
register("istag", async (a, ctx: EvalContext) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "0";
  const id = await ctx.db.getTagById(name);
  return id ? "1" : "0";
});

/**
 * listtags([delim]) — space-separated (or delim-separated) list of all global
 * tag names. Returns empty string if no tags are set.
 *
 * Note: requires full scan of the server.tags collection; use sparingly.
 */
register("listtags", async (a, ctx: EvalContext) => {
  const delim = a[0] ?? " ";
  // We resolve all tags by querying via a broad DB scan.
  // The DbAccessor doesn't expose list-all directly, so we use a convention:
  // getTagById("") returns null; we use a sentinel "__listtags__" request.
  // For now delegate to the worker's db module — the worker exposes lattr for
  // objects; tag listing is handled via a dedicated db op in _handleDbQuery.
  const raw = await ctx.db.getTagById("__listtags__");
  if (!raw) return "";
  return raw.split(",").join(delim);
});

/**
 * tagmatch(obj, tagname) — 1 if the given object reference is the target of
 * the named global tag, 0 otherwise.
 */
register("tagmatch", async (a, ctx: EvalContext) => {
  const objRef  = (a[0] ?? "").trim();
  const tagName = (a[1] ?? "").trim().toLowerCase();
  if (!objRef || !tagName) return "0";

  const tagId = await ctx.db.getTagById(tagName);
  if (!tagId) return "0";

  // Resolve the object reference
  let resolvedId: string | null = null;
  if (objRef.toLowerCase() === "me")      resolvedId = ctx.executor.id;
  else if (objRef.toLowerCase() === "here") {
    resolvedId = ctx.executor.location ?? null;
  } else if (/^#(\d+)$/.test(objRef)) {
    resolvedId = objRef.slice(1);
  } else {
    const obj = await ctx.db.queryByName(objRef);
    resolvedId = obj?.id ?? null;
  }

  return resolvedId === tagId ? "1" : "0";
});

// ── Personal (ltag) tags ──────────────────────────────────────────────────

/**
 * ltag(tagname) — return the dbref of the actor's personal tag, or #-1.
 */
register("ltag", async (a, ctx: EvalContext) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "#-1 INVALID TAG NAME";
  const id = await ctx.db.getPlayerTagById(ctx.actor.id, name);
  return id ? `#${id}` : "#-1";
});

/**
 * isltag(tagname) — 1 if the actor has a personal tag by this name, 0 if not.
 */
register("isltag", async (a, ctx: EvalContext) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "0";
  const id = await ctx.db.getPlayerTagById(ctx.actor.id, name);
  return id ? "1" : "0";
});

/**
 * listltags([delim]) — list of the actor's personal tag names.
 */
register("listltags", async (a, ctx: EvalContext) => {
  const delim = a[0] ?? " ";
  // Use the sentinel pattern for ltag listing
  const raw = await ctx.db.getPlayerTagById(ctx.actor.id, "__listltags__");
  if (!raw) return "";
  return raw.split(",").join(delim);
});

/**
 * ltagmatch(obj, tagname) — 1 if obj matches the actor's personal tag.
 */
register("ltagmatch", async (a, ctx: EvalContext) => {
  const objRef  = (a[0] ?? "").trim();
  const tagName = (a[1] ?? "").trim().toLowerCase();
  if (!objRef || !tagName) return "0";

  const tagId = await ctx.db.getPlayerTagById(ctx.actor.id, tagName);
  if (!tagId) return "0";

  let resolvedId: string | null = null;
  if (objRef.toLowerCase() === "me")        resolvedId = ctx.executor.id;
  else if (objRef.toLowerCase() === "here") resolvedId = ctx.executor.location ?? null;
  else if (/^#(\d+)$/.test(objRef))         resolvedId = objRef.slice(1);
  else {
    const obj = await ctx.db.queryByName(objRef);
    resolvedId = obj?.id ?? null;
  }

  return resolvedId === tagId ? "1" : "0";
});
