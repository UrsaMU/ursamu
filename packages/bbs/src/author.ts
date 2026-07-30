/**
 * Author labels for BBS posts/replies.
 *
 * `u.me.name` is moniker-aware (display name). BBS replies must
 * show the character's true name (`data.name` / `state.name`),
 * never the moniker.
 */

import { dbojs } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";

type Namey = {
  name?: string;
  state?: { name?: unknown };
};

/** True name from a live enactor (SDK me / hydrated player). */
export function trueNameFromMe(me: Namey): string {
  const fromState = String(me.state?.name ?? "").trim();
  if (fromState) return fromState;
  return String(me.name ?? "Unknown").trim() || "Unknown";
}

/** True name from a player id (for display of stored replies). */
export async function trueNameFromId(
  authorId: string,
  fallback = "Unknown",
): Promise<string> {
  const id = String(authorId ?? "").trim();
  if (!id) return fallback;
  try {
    const row = await dbojs.queryOne({ id });
    if (!row) return fallback;
    const data = row.data as { name?: unknown } | undefined;
    const n = String(data?.name ?? "").trim();
    return n || fallback;
  } catch (_e: unknown) {
    return fallback;
  }
}

/** Convenience for command handlers. */
export function enactorTrueName(u: IUrsamuSDK): string {
  return trueNameFromMe(u.me);
}
