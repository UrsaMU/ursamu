// Hollow Merit ops (budget, owners, add/remove).

import type { HedgeRoom } from "./types.ts";
import { findHollowEnhancement } from "./hollow_catalog.ts";

export {
  findHollowEnhancement,
  HOLLOW_ENHANCEMENTS,
  type HollowEnhancementDef,
} from "./hollow_catalog.ts";

export function enhancementDotsUsed(
  enhancements: string[],
): number {
  let n = 0;
  for (const raw of enhancements) {
    const s = String(raw).toLowerCase().trim();
    const m = s.match(/^(.+)-(\d+)$/);
    if (m) {
      const def = findHollowEnhancement(m[1]);
      const dots = parseInt(m[2], 10);
      if (def && dots > 0) {
        n += Math.min(def.maxCost ?? def.cost, dots);
        continue;
      }
    }
    const def = findHollowEnhancement(s);
    if (def) n += def.cost;
  }
  return n;
}

export function freeHollowDots(room: HedgeRoom): number {
  const h = room.hollow;
  if (!h) return 0;
  const rating = Math.max(0, Math.min(5, h.rating));
  return Math.max(0, rating - enhancementDotsUsed(h.enhancements));
}

export function isHollowOwner(
  room: HedgeRoom | null,
  actorId: string,
): boolean {
  if (!room?.hollow) return false;
  return room.hollow.owners.includes(actorId);
}

export function hollowHas(
  room: HedgeRoom | null,
  slug: string,
  minDots = 1,
): boolean {
  if (!room?.hollow) return false;
  const q = slug.toLowerCase();
  for (const raw of room.hollow.enhancements) {
    const s = String(raw).toLowerCase();
    if (s === q) return minDots <= 1;
    const m = s.match(/^(.+)-(\d+)$/);
    if (m && m[1] === q) {
      return parseInt(m[2], 10) >= minDots;
    }
  }
  return false;
}

/**
 * Add enhancement if free dots allow.
 * Variable: pass "size" or "size-2"; stored as size-1 / size-2.
 */
export function addHollowEnhancement(
  room: HedgeRoom,
  slugOrVar: string,
): { ok: boolean; reason?: string; room?: HedgeRoom } {
  if (room.realm !== "hollow" || !room.hollow) {
    return { ok: false, reason: "Not a Hollow room." };
  }
  let base = slugOrVar.toLowerCase().trim();
  let want = 0;
  const m = base.match(/^(.+)-(\d+)$/);
  if (m) {
    base = m[1];
    want = parseInt(m[2], 10);
  }
  const def = findHollowEnhancement(base);
  if (!def) {
    return {
      ok: false,
      reason: `Unknown enhancement '${slugOrVar}'.`,
    };
  }
  const cost = want > 0
    ? Math.min(def.maxCost ?? def.cost, Math.max(1, want))
    : def.cost;
  if (def.maxCost && want === 0) {
    // first purchase of variable → 1
  }
  const finalCost = def.maxCost
    ? (want > 0 ? cost : 1)
    : def.cost;
  const token = def.maxCost
    ? `${def.slug}-${finalCost}`
    : def.slug;

  // replace existing same slug
  const others = room.hollow.enhancements.filter((e) => {
    const s = String(e).toLowerCase();
    return s !== def.slug && !s.startsWith(def.slug + "-");
  });
  const prevDots = enhancementDotsUsed(
    room.hollow.enhancements.filter((e) => {
      const s = String(e).toLowerCase();
      return s === def.slug || s.startsWith(def.slug + "-");
    }),
  );
  const nextList = [...others, token];
  const used = enhancementDotsUsed(nextList);
  if (used > room.hollow.rating) {
    return {
      ok: false,
      reason:
        `Need ${finalCost - prevDots} free Hollow dots ` +
        `(have ${freeHollowDots(room)}).`,
    };
  }
  return {
    ok: true,
    room: {
      ...room,
      hollow: {
        ...room.hollow,
        enhancements: nextList,
      },
    },
  };
}

export function removeHollowEnhancement(
  room: HedgeRoom,
  slug: string,
): HedgeRoom {
  if (!room.hollow) return room;
  const q = slug.toLowerCase().trim();
  return {
    ...room,
    hollow: {
      ...room.hollow,
      enhancements: room.hollow.enhancements.filter((e) => {
        const s = String(e).toLowerCase();
        return s !== q && !s.startsWith(q + "-");
      }),
    },
  };
}

/** Anonymity / track penalty = Hollow rating while inside. */
export function hollowAnonymityPenalty(
  room: HedgeRoom | null,
): number {
  if (!room?.hollow || room.realm !== "hollow") return 0;
  return Math.max(0, Math.min(5, room.hollow.rating));
}

export function homeTurfBonus(
  room: HedgeRoom | null,
): number {
  if (!hollowHas(room, "home-turf")) return 0;
  return hollowAnonymityPenalty(room);
}
