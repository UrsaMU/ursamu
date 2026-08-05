// Freehold dorm homes — where approved PCs land on `home`.
//
// Config (optional):
//   plugins.cofd.dorms.changeling   room id (e.g. "56")
//   plugins.cofd.dorms.werewolf     …
//   plugins.cofd.ctlDorm            alias for changeling
//
// When unset, no automatic home is applied.

import { getConfig, type IUrsamuSDK } from "@ursamu/ursamu";

/** Resolve dorm room id for a sheet template, or null. */
export function dormRoomIdForTemplate(
  template: string | undefined,
): string | null {
  const t = (template ?? "").toLowerCase().trim();
  if (!t) return null;

  const map = getConfig<Record<string, string>>(
    "plugins.cofd.dorms",
  );
  if (map && typeof map === "object") {
    const hit = map[t] ?? map[t === "lost" ? "changeling" : t];
    if (hit != null && String(hit).trim()) {
      return String(hit).replace(/^#/, "").trim();
    }
  }

  // Legacy single-key aliases
  if (t === "changeling" || t === "lost" || t === "ctl") {
    const one = getConfig<string>("plugins.cofd.ctlDorm") ??
      getConfig<string>("plugins.cofd.changelingDorm");
    if (one != null && String(one).trim()) {
      return String(one).replace(/^#/, "").trim();
    }
  }
  return null;
}

/**
 * Set player home to the template dorm (if configured).
 * Optionally teleport them there. Returns room id or null.
 */
export async function assignDormHome(
  u: IUrsamuSDK,
  targetId: string,
  template: string | undefined,
  opts: { teleport?: boolean } = {},
): Promise<string | null> {
  const roomId = dormRoomIdForTemplate(template);
  if (!roomId) return null;

  await u.db.modify(targetId, "$set", {
    "data.home": roomId,
  });

  if (opts.teleport && typeof u.teleport === "function") {
    try {
      await u.teleport(targetId, roomId);
    } catch {
      // home still set even if teleport fails (offline, etc.)
    }
  }
  return roomId;
}
