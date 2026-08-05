/**
 * Load / scrub DBO rows for admin WS push (from gameHooks).
 */

import { dbojs } from "@ursamu/mush";
import { broadcastAdmin, adminClientCount } from "./admin-ws-hub.ts";

const SECRET_KEYS = new Set([
  "password",
  "passwordHash",
  "hash",
  "resetToken",
  "resetExpires",
  "salt",
]);

/** Strip secrets before sending to the staff console. */
export function scrubObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...obj };
  if (copy.data && typeof copy.data === "object") {
    const d = { ...(copy.data as Record<string, unknown>) };
    for (const k of SECRET_KEYS) delete d[k];
    copy.data = d;
  }
  return copy;
}

export async function pushObjectById(
  rawId: string | undefined | null,
): Promise<void> {
  if (!rawId || adminClientCount() === 0) return;
  const id = String(rawId).replace(/^#/, "");
  if (!id) return;
  try {
    const row = await dbojs.queryOne({ id });
    if (!row) {
      broadcastAdmin({
        type: "object:delete",
        id,
      });
      return;
    }
    broadcastAdmin({
      type: "object:upsert",
      object: scrubObject(row as unknown as Record<string, unknown>),
    });
  } catch (e: unknown) {
    console.error("[web] pushObjectById failed:", e);
  }
}

export function pushObjectDelete(rawId: string | undefined | null): void {
  if (!rawId || adminClientCount() === 0) return;
  const id = String(rawId).replace(/^#/, "");
  if (!id) return;
  broadcastAdmin({ type: "object:delete", id });
}

export function objectTypeFromFlags(flags: unknown): string {
  const f = flags instanceof Set
    ? [...flags].map(String).join(" ").toLowerCase()
    : Array.isArray(flags)
    ? flags.map(String).join(" ").toLowerCase()
    : String(flags ?? "").toLowerCase();
  if (/\bplayer\b/.test(f)) return "player";
  if (/\broom\b/.test(f)) return "room";
  if (/\bexit\b/.test(f)) return "exit";
  return "thing";
}
