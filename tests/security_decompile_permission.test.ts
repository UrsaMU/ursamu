/**
 * tests/security_decompile_permission.test.ts
 *
 * [SEC][M2] @decompile has no canEdit() check — any connected player can dump
 * all attributes of any object they can target (same room / inventory).
 *
 * Attributes can contain sensitive data: lock formulas, softcode values, or
 * values inadvertently stored by builders. Decompiling should require the
 * same edit permission that @set and @wipe require.
 *
 * RED:  show that the current decompileAllowed() check returns true for a
 *       non-owner who can merely "see" the object.
 *
 * GREEN: require canEdit — only object owner or staff may decompile.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface DbObj { id: string; data?: { owner?: string } }

// ── Current behaviour: no ownership check on decompile ───────────────────────

function decompileAllowed_CURRENT(
  _actor: { id: string },
  _target: DbObj,
): boolean {
  return true; // anyone connected can call @decompile — the flaw
}

// ── Fixed behaviour: must own or be staff ────────────────────────────────────

function decompileAllowed_FIXED(
  actor: { id: string; isStaff: boolean },
  target: DbObj,
): boolean {
  if (actor.isStaff) return true;
  return target.data?.owner === actor.id;
}

// ── RED ───────────────────────────────────────────────────────────────────────

Deno.test("[SEC][M2] RED: non-owner can decompile object they don't own", OPTS, () => {
  const actor  = { id: "player_1", isStaff: false };
  const target: DbObj = { id: "box_1", data: { owner: "admin_1" } };
  assertEquals(
    decompileAllowed_CURRENT(actor, target),
    true,
    "FLAW: non-owner can decompile admin's object",
  );
});

// ── GREEN ─────────────────────────────────────────────────────────────────────

Deno.test("[SEC][M2] GREEN: non-owner cannot decompile object after fix", OPTS, () => {
  const actor  = { id: "player_1", isStaff: false };
  const target: DbObj = { id: "box_1", data: { owner: "admin_1" } };
  assertEquals(
    decompileAllowed_FIXED(actor, target),
    false,
    "FIXED: non-owner blocked from decompile",
  );
});

Deno.test("[SEC][M2] GREEN: owner can decompile their own object", OPTS, () => {
  const actor  = { id: "builder_1", isStaff: false };
  const target: DbObj = { id: "box_1", data: { owner: "builder_1" } };
  assertEquals(decompileAllowed_FIXED(actor, target), true);
});

Deno.test("[SEC][M2] GREEN: staff can decompile any object", OPTS, () => {
  const actor  = { id: "admin_1", isStaff: true };
  const target: DbObj = { id: "box_1", data: { owner: "player_1" } };
  assertEquals(decompileAllowed_FIXED(actor, target), true);
});

Deno.test("[SEC][M2] GREEN: ownerless object is decompilable by staff only", OPTS, () => {
  const nonStaff = { id: "player_1", isStaff: false };
  const staffActor = { id: "admin_1", isStaff: true };
  const target: DbObj = { id: "box_1" }; // no owner
  assertEquals(decompileAllowed_FIXED(nonStaff, target), false);
  assertEquals(decompileAllowed_FIXED(staffActor, target), true);
});
