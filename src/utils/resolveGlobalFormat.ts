/**
 * Two-tier format-attribute lookup for "global-list" commands (WHO, @ps,
 * @event/list, +mail, etc.) that don't bind to a specific target object.
 *
 *   1. attr on #0  — game-wide skin. Skipped if #0 doesn't exist (avoids
 *                    phantom-target plugin-handler invocations; see M1 in
 *                    the v2.3.0 TDD audit).
 *   2. attr on the enactor (`u.me`) — per-player skin.
 *   3. null → caller renders built-in default.
 *
 * Plugins consuming this helper from JSR see the same priority chain as
 * the engine-bundled `who` / `@ps` commands. See ursamu/src/commands/social.ts
 * and ursamu/src/commands/ps.ts for the original callers.
 */
import type { IDBObj, IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { dbojs } from "../services/Database/database.ts";
import { hydrate } from "./evaluateLock.ts";
import { resolveFormat } from "./resolveFormat.ts";
import type { FormatSlot } from "./formatHandlers.ts";

export async function resolveGlobalFormat(
  u:          IUrsamuSDK,
  slot:       FormatSlot,
  defaultArg: string,
): Promise<string | null> {
  const root = await dbojs.queryOne({ id: "0" });
  if (root) {
    const rootObj = hydrate(root as unknown as Parameters<typeof hydrate>[0]) as IDBObj;
    const onRoot  = await resolveFormat(u, rootObj, slot, defaultArg);
    if (onRoot != null) return onRoot;
  }
  return await resolveFormat(u, u.me, slot, defaultArg);
}

/** As `resolveGlobalFormat`, but returns `fallback` when the resolver yields null. */
export async function resolveGlobalFormatOr(
  u:          IUrsamuSDK,
  slot:       FormatSlot,
  defaultArg: string,
  fallback:   string,
): Promise<string> {
  return (await resolveGlobalFormat(u, slot, defaultArg)) ?? fallback;
}
