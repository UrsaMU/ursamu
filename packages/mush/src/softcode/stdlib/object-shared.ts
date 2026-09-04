/**
 * @module stdlib/object-shared
 *
 * Shared helpers used across all stdlib/object-*.ts sub-modules.
 * Imported by object-identity, object-attrs, object-location, object-server.
 */

import type { EvalContext } from "../context.ts";
import type { IDBObj } from "../../world/types.ts";

/**
 * Resolve an object reference with per-eval memoization.
 * "me", "here", "#N", "#tagname", and name lookups are cached in ctx._objCache
 * so repeated references in a single softcode eval hit the DB only once.
 */
export async function resolveObj(ref: string, ctx: EvalContext): Promise<IDBObj | null> {
  const r = ref.trim();
  if (!r) return null;

  // Fast-path: identity aliases never change within an eval, no cache needed.
  if (r.toLowerCase() === "me")                       return ctx.executor;
  if (r.toLowerCase() === "enactor" || r === "%#")    return ctx.actor;

  // Per-eval cache — stored on ctx as a side-channel map.
  // deno-lint-ignore no-explicit-any
  const cache: Map<string, IDBObj | null> = ((ctx as any)._objCache ??= new Map());
  if (cache.has(r)) return cache.get(r) ?? null;

  let result: IDBObj | null = null;
  if (r.toLowerCase() === "here") {
    result = await ctx.db.queryById(ctx.executor.location ?? "") ?? null;
  } else if (r.startsWith("#") && r.length > 1) {
    const idOrTag = r.slice(1);
    // Exact dbref first (numeric or slug ids like "room_limbo")
    result = await ctx.db.queryById(idOrTag);
    if (!result && !/^\d+$/.test(idOrTag)) {
      // #tagname — personal tags, then global
      const personalId = await ctx.db.getPlayerTagById(
        ctx.actor.id,
        idOrTag,
      );
      if (personalId) {
        result = await ctx.db.queryById(personalId);
      } else {
        const globalId = await ctx.db.getTagById(idOrTag);
        result = globalId
          ? await ctx.db.queryById(globalId)
          : null;
      }
    }
  } else {
    result = await ctx.db.queryByName(r);
  }

  cache.set(r, result);
  return result;
}
