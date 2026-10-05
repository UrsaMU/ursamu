// Pure parse / build for data.hedge on rooms.

import type { HedgeDanger, HedgeRealm, HedgeRoom } from "./types.ts";

const REALMS = new Set<HedgeRealm>(["mortal", "hedge", "hollow"]);
const DANGERS = new Set<HedgeDanger>(["trod", "hedge", "thorns"]);

export function isHedgeRealm(s: string): s is HedgeRealm {
  return REALMS.has(s.toLowerCase().trim() as HedgeRealm);
}

export function isHedgeDanger(s: string): s is HedgeDanger {
  return DANGERS.has(s.toLowerCase().trim() as HedgeDanger);
}

/** Read HedgeRoom from room.state.hedge (or null). */
export function parseHedgeRoom(raw: unknown): HedgeRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const realm = String(o.realm ?? "").toLowerCase().trim();
  if (!isHedgeRealm(realm)) return null;
  const dangerRaw = String(o.danger ?? "hedge").toLowerCase().trim();
  const danger: HedgeDanger = isHedgeDanger(dangerRaw)
    ? dangerRaw
    : "hedge";
  const out: HedgeRoom = { realm, danger };
  if (typeof o.trodRating === "number" && o.trodRating >= 1) {
    out.trodRating = Math.min(5, Math.floor(o.trodRating));
  }
  if (typeof o.flavor === "string" && o.flavor.trim()) {
    out.flavor = o.flavor.trim().slice(0, 200);
  }
  if (typeof o.maskFlavor === "string" && o.maskFlavor.trim()) {
    out.maskFlavor = o.maskFlavor.trim().slice(0, 200);
  }
  if (o.hollow && typeof o.hollow === "object") {
    const h = o.hollow as Record<string, unknown>;
    const owners = Array.isArray(h.owners)
      ? h.owners.map((x) => String(x)).filter(Boolean)
      : [];
    const rating = typeof h.rating === "number"
      ? Math.max(0, Math.min(5, Math.floor(h.rating)))
      : 0;
    const enhancements = Array.isArray(h.enhancements)
      ? h.enhancements.map((x) => String(x)).filter(Boolean)
      : [];
    const escapeRoomId =
      typeof h.escapeRoomId === "string" && h.escapeRoomId.trim()
        ? h.escapeRoomId.trim()
        : undefined;
    out.hollow = {
      owners,
      rating,
      enhancements,
      escapeRoomId,
    };
  }
  return out;
}

export function defaultHedgeRoom(realm: HedgeRealm): HedgeRoom {
  if (realm === "hollow") {
    return {
      realm: "hollow",
      danger: "hedge",
      hollow: { owners: [], rating: 1, enhancements: [] },
    };
  }
  if (realm === "hedge") {
    return { realm: "hedge", danger: "hedge" };
  }
  return { realm: "mortal", danger: "hedge" };
}

export function isInHedge(room: HedgeRoom | null): boolean {
  return room?.realm === "hedge" || room?.realm === "hollow";
}

export function roomRealmLabel(room: HedgeRoom | null): string {
  if (!room) return "mortal (untagged)";
  if (room.realm === "hollow") return "Hollow";
  if (room.realm === "hedge") {
    if (room.danger === "thorns") return "Hedge (Thorns)";
    if (room.danger === "trod") {
      return `Hedge (trod •${room.trodRating ?? 1})`;
    }
    return "Hedge";
  }
  return "mortal";
}
