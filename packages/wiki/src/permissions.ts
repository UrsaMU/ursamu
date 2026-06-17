import { dbojs } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { WikiMeta } from "./fs.ts";

// ─── staff check ─────────────────────────────────────────────────────────────

/** Returns true if the SDK caller has admin, wizard, or superuser flag. */
export function isAdmin(u: IUrsamuSDK): boolean {
  return (
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser")
  );
}

// ─── read lock ────────────────────────────────────────────────────────────────

/**
 * Evaluate a page's `readLock` frontmatter field against the caller.
 *
 * Lock values:
 *   (absent / "connected") — any logged-in player
 *   "admin" | "staff"      — admin/wizard/superuser only
 *   "faction:<id>"         — player must be in that object's contents
 *
 * Returns true if the caller may read the page.
 */
export async function canReadPage(
  u: IUrsamuSDK,
  meta: WikiMeta
): Promise<boolean> {
  // Draft pages are staff-only regardless of readLock
  if (meta.draft === true) return isAdmin(u);

  const lock = (meta.readLock as string | undefined) ?? "connected";

  if (lock === "connected") return true;
  if (lock === "admin" || lock === "staff") return isAdmin(u);

  if (lock.startsWith("faction:")) {
    const objId = lock.slice("faction:".length);
    const obj   = await dbojs.queryOne({ id: objId });
    if (!obj) return false;
    const contents = ((obj as unknown as Record<string, unknown>).contents as string[]) ?? [];
    return contents.includes(u.me.id);
  }

  // Unknown lock type — deny by default
  return false;
}

/**
 * REST-context equivalent: evaluate readLock with only a userId string.
 * Returns true if the user may read the page.
 */
export async function canReadPageRest(
  userId: string | null,
  meta: WikiMeta
): Promise<boolean> {
  if (meta.draft === true) {
    if (!userId) return false;
    const player = await dbojs.queryOne({ id: userId });
    if (!player) return false;
    const f = player.flags as unknown;
    if (f instanceof Set) return (f as Set<string>).has("admin") || (f as Set<string>).has("wizard") || (f as Set<string>).has("superuser");
    const s = (f as string) || "";
    return s.includes("admin") || s.includes("wizard") || s.includes("superuser");
  }

  const lock = (meta.readLock as string | undefined) ?? "connected";
  if (lock === "connected") return !!userId;

  if (lock === "admin" || lock === "staff") {
    if (!userId) return false;
    const player = await dbojs.queryOne({ id: userId });
    if (!player) return false;
    const f = player.flags as unknown;
    if (f instanceof Set) return (f as Set<string>).has("admin") || (f as Set<string>).has("wizard") || (f as Set<string>).has("superuser");
    const s = (f as string) || "";
    return s.includes("admin") || s.includes("wizard") || s.includes("superuser");
  }

  if (lock.startsWith("faction:")) {
    if (!userId) return false;
    const objId = lock.slice("faction:".length);
    const obj   = await dbojs.queryOne({ id: objId });
    if (!obj) return false;
    const contents = ((obj as unknown as Record<string, unknown>).contents as string[]) ?? [];
    return contents.includes(userId);
  }

  return false;
}

/** Validate that a readLock string has one of the accepted forms. */
export function isValidReadLock(lock: string): boolean {
  return (
    lock === "connected" ||
    lock === "admin" ||
    lock === "staff" ||
    lock.startsWith("faction:")
  );
}
