// Pure helpers used by commands.ts. Extracted so tests can import without
// triggering addCmd side-effects.

import type { Coord, MapBounds, MapEntity } from "./schemas.ts";

const COORD_MAX = 1_000_000;
const ADMIN_FLAGS = ["admin", "wizard", "superuser"];

const REALM_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function parseCoord(raw: string): Coord | null {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const parseOne = (s: string): number | null => {
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || Math.abs(n) > COORD_MAX) return null;
    return n;
  };
  const x = parseOne(parts[0]);
  const y = parseOne(parts[1]);
  // Optional Z then optional realm. If parts[2] is non-numeric and looks like
  // a realm slug, treat it as the realm and default Z to 0. Otherwise parts[2]
  // is Z and parts[3] (if any) is realm.
  let z = 0;
  let realm: string | undefined;
  if (parts.length === 3) {
    if (/^-?\d+$/.test(parts[2])) {
      const parsed = parseOne(parts[2]);
      if (parsed === null) return null;
      z = parsed;
    } else {
      if (!REALM_RE.test(parts[2])) return null;
      realm = parts[2];
    }
  } else if (parts.length >= 4) {
    const parsed = parseOne(parts[2]);
    if (parsed === null) return null;
    z = parsed;
    if (!REALM_RE.test(parts[3])) return null;
    realm = parts[3];
  }
  if (x === null || y === null) return null;
  const out: Coord = { x, y, z };
  if (realm !== undefined) out.realm = realm;
  return out;
}

// ─── Auth predicates ──────────────────────────────────────────────────────────

interface FlaggedActor {
  id: string;
  flags: { has(flag: string): boolean };
}

interface OwnedThing {
  id: string;
  owner?: string;
}

export function isAdminLike(actor: FlaggedActor): boolean {
  return ADMIN_FLAGS.some((f) => actor.flags.has(f));
}

/**
 * Pilot rule: vehicle owner OR admin/wizard/superuser. Passengers who are not
 * the owner cannot launch / move / land the vehicle.
 */
export function canPilot(actor: FlaggedActor, vehicle: OwnedThing): boolean {
  if (isAdminLike(actor)) return true;
  if (!vehicle.owner) return false;
  return vehicle.owner === actor.id;
}

/**
 * Claim rule for entity.controllerId. First claim of an unowned entity is
 * admin-only (sysop establishes who commands a remote scout). Builders can
 * re-link to entities they already control — that's a different code path
 * checked separately.
 */
export function canClaimEntity(
  actor: FlaggedActor,
  entity: Pick<MapEntity, "controllerId">,
): boolean {
  if (entity.controllerId === actor.id) return true;
  return isAdminLike(actor);
}

/**
 * Returns true iff a viewer with `active` (the result of getActiveEntity)
 * is allowed to see a render centered on `subject`. Rules:
 *   - admin spectate (active.mode === "spectate") — always allowed; admin
 *     deliberately watches through a specific entity, which may be `subject`
 *     or any other entity.
 *   - container mode — viewer must be looking at THEIR OWN container; i.e.
 *     subject must equal active.entity.
 *   - link mode — same: subject must equal active.entity.
 *   - faction-mate — a viewer's active entity in the same factionId as
 *     subject can see the same render (faction-shared FoV).
 */
export function canViewSubject(
  active: { entity: Pick<MapEntity, "id" | "factionId">; mode: "container" | "link" | "spectate" },
  subject: Pick<MapEntity, "id" | "factionId">,
): boolean {
  if (active.mode === "spectate") return true;
  if (active.entity.id === subject.id) return true;
  const af = active.entity.factionId;
  const sf = subject.factionId;
  if (af && sf && af === sf) return true;
  return false;
}

// ─── Bounds + movement math ───────────────────────────────────────────────────

/** Returns true iff coord is inside bounds (or no bounds provided). */
export function isInBounds(coord: Coord, bounds?: MapBounds): boolean {
  if (!bounds) return true;
  const { min, max } = bounds;
  return (
    coord.x >= min.x && coord.x <= max.x &&
    coord.y >= min.y && coord.y <= max.y &&
    coord.z >= min.z && coord.z <= max.z
  );
}

/**
 * Pre-validates a coord intended for `setEntity` — same rules as validateEntity
 * applies to coords, plus optional config bounds. Used at launch to reject bad
 * vehicle state.coord up front rather than failing inside setEntity with a
 * cryptic message.
 */
/**
 * Returns ok iff `mover` may enter a tile occupied by `tileOccupants` per the
 * stacking rule: same-faction stacks freely, different-faction (including
 * factionless on either side) blocks. An empty occupant list always returns ok.
 */
export function canStackWith(
  mover: Pick<MapEntity, "id" | "factionId">,
  tileOccupants: MapEntity[],
): { ok: true } | { ok: false; reason: string } {
  const others = tileOccupants.filter((o) => o.id !== mover.id);
  if (others.length === 0) return { ok: true };
  const myFaction = mover.factionId;
  for (const o of others) {
    if (!myFaction || !o.factionId || o.factionId !== myFaction) {
      return { ok: false, reason: "hostile entity blocks the tile" };
    }
  }
  return { ok: true };
}

export function validateCoord(coord: unknown, bounds?: MapBounds): Coord | null {
  if (!coord || typeof coord !== "object") return null;
  const { x, y, z } = coord as Record<string, unknown>;
  const ok = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= COORD_MAX;
  if (!ok(x) || !ok(y) || !ok(z)) return null;
  const c: Coord = { x, y, z };
  const realm = (coord as Record<string, unknown>).realm;
  if (realm !== undefined) {
    if (typeof realm !== "string" || realm.length === 0 || realm.length > 32) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(realm)) return null;
    c.realm = realm;
  }
  if (!isInBounds(c, bounds)) return null;
  return c;
}
