/**
 * Underworld room — spirits wait here until raised.
 */
import { createObj, dbojs } from "@ursamu/mush";

const UW_NAME = "The Grey Veil";
const UW_KEY = "dnd-underworld";

function flagStr(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Set) return [...raw].map(String).join(" ");
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  return String(raw ?? "");
}

/** Find or create the underworld room. Idempotent. */
export async function ensureUnderworld(): Promise<string> {
  const rooms = await dbojs.query({ flags: /room/i });
  for (const r of rooms) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    if (d.dndRoomKey === UW_KEY || d.dndUnderworld === true) {
      return String(r.id);
    }
    const n = String(d.name ?? "").toLowerCase();
    if (n.includes("grey veil") || n.includes("underworld")) {
      return String(r.id);
    }
  }

  const made = await createObj("room safe", {
    name: UW_NAME,
    description:
      "Mist hangs over featureless stone. Distant bells toll " +
      "without source. The living cannot walk here — only " +
      "spirits wait for a call back to flesh. " +
      "(+res when raised, or wait for allies.)",
    dndRoomKey: UW_KEY,
    dndUnderworld: true,
    owner: "1",
  });
  const id = made[0]?.id;
  if (!id) throw new Error("underworld create failed");
  await dbojs.modify({ id }, "$set", {
    flags: "room safe",
    "data.name": UW_NAME,
    "data.dndRoomKey": UW_KEY,
    "data.dndUnderworld": true,
    "data.description":
      "Mist hangs over featureless stone. Distant bells toll " +
      "without source. The living cannot walk here — only " +
      "spirits wait for a call back to flesh.",
  });
  return id;
}

export async function isUnderworldRoom(
  roomId: string,
): Promise<boolean> {
  const o = await dbojs.queryOne({ id: roomId });
  if (!o || !flagStr(o.flags).includes("room")) return false;
  const d = (o.data ?? {}) as Record<string, unknown>;
  return d.dndUnderworld === true || d.dndRoomKey === UW_KEY;
}

export { UW_NAME, UW_KEY };
