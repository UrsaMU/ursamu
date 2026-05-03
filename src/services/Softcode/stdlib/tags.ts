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
import type { UrsaEvalContext } from "../ursamu-context.ts";
import { resolveObj } from "./object-shared.ts";

// Cast helper — at runtime ctx is always UrsaEvalContext.
function ursa(ctx: EvalContext): UrsaEvalContext {
  return ctx as unknown as UrsaEvalContext;
}

// ── Global tags ───────────────────────────────────────────────────────────────

/** tag(tagname) — return the dbref of the globally-tagged object, or #-1. */
register("tag", async (a, ctx) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "#-1 INVALID TAG NAME";
  const id = await ursa(ctx).db.getTagById(name);
  return id ? `#${id}` : "#-1";
});

/** istag(tagname) — 1 if the global tag exists, 0 if not. */
register("istag", async (a, ctx) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "0";
  const id = await ursa(ctx).db.getTagById(name);
  return id ? "1" : "0";
});

/**
 * listtags([delim]) — space-separated (or delim-separated) list of all global tag names.
 * Uses the "__listtags__" sentinel so the worker can serve the full list.
 */
register("listtags", async (a, ctx) => {
  const delim = a[0] ?? " ";
  const raw = await ursa(ctx).db.getTagById("__listtags__");
  if (!raw) return "";
  return raw.split(",").join(delim);
});

/**
 * tagmatch(obj, tagname) — 1 if the given object reference points to the
 * same object as the named global tag, 0 otherwise.
 */
register("tagmatch", async (a, ctx) => {
  const objRef  = (a[0] ?? "").trim();
  const tagName = (a[1] ?? "").trim().toLowerCase();
  if (!objRef || !tagName) return "0";

  const tagId = await ursa(ctx).db.getTagById(tagName);
  if (!tagId) return "0";

  const obj = await resolveObj(objRef, ctx);
  return obj?.id === tagId ? "1" : "0";
});

// ── Personal (ltag) tags ──────────────────────────────────────────────────────

/** ltag(tagname) — return the dbref of the actor's personal tag, or #-1. */
register("ltag", async (a, ctx) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "#-1 INVALID TAG NAME";
  const id = await ursa(ctx).db.getPlayerTagById(ursa(ctx).enactor, name);
  return id ? `#${id}` : "#-1";
});

/** isltag(tagname) — 1 if the actor has a personal tag by this name, 0 if not. */
register("isltag", async (a, ctx) => {
  const name = (a[0] ?? "").trim().toLowerCase();
  if (!name) return "0";
  const id = await ursa(ctx).db.getPlayerTagById(ursa(ctx).enactor, name);
  return id ? "1" : "0";
});

/**
 * listltags([delim]) — list of the actor's personal tag names.
 * Uses the "__listltags__" sentinel so the worker can serve the full list.
 */
register("listltags", async (a, ctx) => {
  const delim = a[0] ?? " ";
  const raw = await ursa(ctx).db.getPlayerTagById(ursa(ctx).enactor, "__listltags__");
  if (!raw) return "";
  return raw.split(",").join(delim);
});

/**
 * ltagmatch(obj, tagname) — 1 if obj matches the actor's personal tag.
 */
register("ltagmatch", async (a, ctx) => {
  const objRef  = (a[0] ?? "").trim();
  const tagName = (a[1] ?? "").trim().toLowerCase();
  if (!objRef || !tagName) return "0";

  const tagId = await ursa(ctx).db.getPlayerTagById(ursa(ctx).enactor, tagName);
  if (!tagId) return "0";

  const obj = await resolveObj(objRef, ctx);
  return obj?.id === tagId ? "1" : "0";
});
