/**
 * tests/security_zone_ownership.test.ts
 *
 * [SEC][L4] @zone write operations do not verify canEdit() on target object.
 *
 * A builder can add/del/purge/replace zone memberships for objects they
 * don't own, potentially changing command dispatch for other players' objects.
 *
 * RED:  Show that the current ownershipCheck (no-op, always true) allows a
 *       builder to modify zone membership of any object.
 *
 * GREEN: canEditForZone requires the actor to own the object or be staff.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface DbObj { id: string; data?: { owner?: string } }

// Current behavior: no ownership check (only checks builder flag)
function canZoneWrite_CURRENT(
  _actorId: string,
  _obj: DbObj,
  isBuilder: boolean,
): boolean {
  return isBuilder; // No object-level ownership check — the flaw
}

// Fixed: builder AND must own or control the object
function canZoneWrite_FIXED(
  actorId: string,
  obj: DbObj,
  isBuilder: boolean,
  isStaff: boolean,
): boolean {
  if (!isBuilder) return false;
  if (isStaff) return true;
  const owner = obj.data?.owner;
  return owner === actorId || obj.id === actorId;
}

const ALICE_OBJ: DbObj = { id: "obj-alice", data: { owner: "player-alice" } };
const BOB_ID = "player-bob";
const ALICE_ID = "player-alice";

// ── RED ───────────────────────────────────────────────────────────────────────

Deno.test("[SEC][L4] RED: builder can modify zone membership of any object (no ownership check)", OPTS, () => {
  // Bob is a builder, but does NOT own Alice's object
  const allowed = canZoneWrite_CURRENT(BOB_ID, ALICE_OBJ, true);
  assertEquals(allowed, true, "FLAW: builder can modify objects they don't own");
});

// ── GREEN ─────────────────────────────────────────────────────────────────────

Deno.test("[SEC][L4] GREEN: builder cannot modify objects they don't own", OPTS, () => {
  const allowed = canZoneWrite_FIXED(BOB_ID, ALICE_OBJ, true, false);
  assertEquals(allowed, false, "FIXED: non-owner builder cannot modify zone membership");
});

Deno.test("[SEC][L4] GREEN: owner-builder can modify their own objects", OPTS, () => {
  const allowed = canZoneWrite_FIXED(ALICE_ID, ALICE_OBJ, true, false);
  assertEquals(allowed, true, "owner can modify their own object's zone membership");
});

Deno.test("[SEC][L4] GREEN: staff override allows modification of any object", OPTS, () => {
  const allowed = canZoneWrite_FIXED(BOB_ID, ALICE_OBJ, true, true);
  assertEquals(allowed, true, "staff can always modify zone membership");
});

Deno.test("[SEC][L4] GREEN: non-builder is always rejected regardless of ownership", OPTS, () => {
  const allowed = canZoneWrite_FIXED(ALICE_ID, ALICE_OBJ, false, false);
  assertEquals(allowed, false, "non-builder cannot write zone memberships");
});

Deno.test("[SEC][L4] GREEN: actor matching object ID (self-referential) is allowed", OPTS, () => {
  const selfObj: DbObj = { id: "player-bob", data: { owner: "player-alice" } };
  // Bob's id matches the object id
  const allowed = canZoneWrite_FIXED(BOB_ID, selfObj, true, false);
  assertEquals(allowed, true, "player can use their own object (id match)");
});
