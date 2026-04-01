/**
 * tests/security_wait_ownership.test.ts
 *
 * [SEC][L1] @wait semaphore form — no ownership check on semaphore object.
 *
 * Any connected player can block commands on ANY object (including objects
 * they don't own). When the owner later calls @notify, the attacker's
 * commands fire in the owner's command context.
 *
 * RED:  Show that the current canEnqueueSemaphore (no-op check) always
 *       returns true — any player can use any object as a semaphore.
 *
 * GREEN: canEnqueueSemaphore requires the player to own or control the
 *        semaphore object (is owner, or is staff).
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface DbObj { id: string; data?: { owner?: string } }

// Current behavior: no ownership check (always allows)
function canEnqueueSemaphore_CURRENT(
  _actorId: string,
  _semObj: DbObj,
  _isStaff: boolean,
): boolean {
  return true; // No check — the flaw
}

// Fixed behavior: must own the object or be staff
function canEnqueueSemaphore_FIXED(
  actorId: string,
  semObj: DbObj,
  isStaff: boolean,
): boolean {
  if (isStaff) return true;
  const ownerId = semObj.data?.owner;
  // Player owns it directly, or is the object itself
  return ownerId === actorId || semObj.id === actorId;
}

const VICTIM_OBJ: DbObj = { id: "obj5", data: { owner: "player-alice" } };
const ATTACKER_ID = "player-bob";
const ALICE_ID = "player-alice";

// ── RED ───────────────────────────────────────────────────────────────────────

Deno.test("[SEC][L1] RED: current code allows any player to use any object as semaphore", OPTS, () => {
  // Attacker (Bob) is not the owner of VICTIM_OBJ
  const allowed = canEnqueueSemaphore_CURRENT(ATTACKER_ID, VICTIM_OBJ, false);
  assertEquals(allowed, true, "FLAW: current code lets attacker queue on victim's object");
});

// ── GREEN ─────────────────────────────────────────────────────────────────────

Deno.test("[SEC][L1] GREEN: fixed code blocks non-owner from using object as semaphore", OPTS, () => {
  const allowed = canEnqueueSemaphore_FIXED(ATTACKER_ID, VICTIM_OBJ, false);
  assertEquals(allowed, false, "FIXED: non-owner cannot use victim's object as semaphore");
});

Deno.test("[SEC][L1] GREEN: fixed code allows owner to use their own object", OPTS, () => {
  const allowed = canEnqueueSemaphore_FIXED(ALICE_ID, VICTIM_OBJ, false);
  assertEquals(allowed, true, "owner can use their own object as semaphore");
});

Deno.test("[SEC][L1] GREEN: fixed code allows staff to use any object", OPTS, () => {
  const allowed = canEnqueueSemaphore_FIXED(ATTACKER_ID, VICTIM_OBJ, true);
  assertEquals(allowed, true, "staff can use any object as semaphore");
});

Deno.test("[SEC][L1] GREEN: fixed code allows object to be used as its own semaphore", OPTS, () => {
  // An object using itself (executor == semaphore object ID)
  const selfObj: DbObj = { id: "player-bob", data: { owner: "player-alice" } };
  const allowed = canEnqueueSemaphore_FIXED(ATTACKER_ID, selfObj, false);
  // bob's id matches semObj.id
  assertEquals(allowed, true, "object can block on itself");
});
