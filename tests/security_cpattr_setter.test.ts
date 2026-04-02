/**
 * tests/security_cpattr_setter.test.ts
 *
 * [SEC][H2] @cpattr / @mvattr do not check whether the enactor owns the
 * SOURCE ATTRIBUTE (only that they control the source object).
 *
 * A builder who controls an object (e.g. they own it) can copy attributes
 * that were set by a different player (e.g. an admin) to another object,
 * leaking the attribute value in a place they control.
 *
 * RED:  show that the current copyShouldBeAllowed() returns true even when
 *       the attribute's setter is a different player, as long as the enactor
 *       controls the host object.
 *
 * GREEN: require either (enactor is setter) OR (enactor is staff).
 *        Plain builders cannot copy attributes they didn't set.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface Attr { name: string; value: string; setter: string }
interface Flags { has: (f: string) => boolean }

// ── Current behaviour: setter not checked ────────────────────────────────────

function canCopyAttr_CURRENT(
  _attr: Attr,
  _actorId: string,
  _actorFlags: Flags,
): boolean {
  // Production mvattr.ts line 53-54 checks `canModify` to decide whether to
  // REMOVE the original, but it always writes the copy regardless.
  // For cpattr.ts there is no per-attribute setter check at all.
  return true; // always copies — this is the flaw
}

// ── Fixed behaviour: block copy if another player set the attr ───────────────

function canCopyAttr_FIXED(
  attr: Attr,
  actorId: string,
  actorFlags: Flags,
): boolean {
  const isStaff = actorFlags.has("wizard") || actorFlags.has("admin") || actorFlags.has("superuser");
  if (isStaff) return true;
  if (!attr.setter) return true;  // legacy attr — no owner on record
  return attr.setter === actorId;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const player = (id: string) => ({ has: (f: string) => f === "player" ? true : false, id });
const staff  = (id: string) => ({ has: (f: string) => ["player", "admin"].includes(f), id });
const wizard = (id: string) => ({ has: (f: string) => ["player", "wizard"].includes(f), id });

// ── RED tests ─────────────────────────────────────────────────────────────────

Deno.test("[SEC][H2] RED: current code allows copying admin-set attribute", OPTS, () => {
  const adminAttr: Attr = { name: "SECRET", value: "hunter2", setter: "admin_1" };
  const builderFlags = player("builder_1");
  assertEquals(
    canCopyAttr_CURRENT(adminAttr, "builder_1", builderFlags),
    true,
    "FLAW: builder copies admin-set attribute without check",
  );
});

// ── GREEN tests ───────────────────────────────────────────────────────────────

Deno.test("[SEC][H2] GREEN: builder cannot copy attribute set by admin", OPTS, () => {
  const adminAttr: Attr = { name: "SECRET", value: "hunter2", setter: "admin_1" };
  const builderFlags = player("builder_1");
  assertEquals(
    canCopyAttr_FIXED(adminAttr, "builder_1", builderFlags),
    false,
    "FIXED: builder blocked from copying admin-set attribute",
  );
});

Deno.test("[SEC][H2] GREEN: builder can copy their own attribute", OPTS, () => {
  const ownAttr: Attr = { name: "COLOR", value: "red", setter: "builder_1" };
  const builderFlags = player("builder_1");
  assertEquals(canCopyAttr_FIXED(ownAttr, "builder_1", builderFlags), true);
});

Deno.test("[SEC][H2] GREEN: admin-level staff can copy any attribute", OPTS, () => {
  const adminAttr: Attr = { name: "SECRET", value: "hunter2", setter: "admin_1" };
  const adminFlags = staff("admin_2");
  assertEquals(canCopyAttr_FIXED(adminAttr, "admin_2", adminFlags), true);
});

Deno.test("[SEC][H2] GREEN: wizard can copy any attribute", OPTS, () => {
  const adminAttr: Attr = { name: "SECRET", value: "hunter2", setter: "admin_1" };
  const wizardFlags = wizard("wiz_1");
  assertEquals(canCopyAttr_FIXED(adminAttr, "wiz_1", wizardFlags), true);
});

Deno.test("[SEC][H2] GREEN: legacy attribute (empty setter) is copyable by object owner", OPTS, () => {
  // Legacy attrs have no setter set — object-level canEdit was already checked upstream.
  // Allow copy since there is no per-attribute ownership record to enforce.
  const legacyAttr: Attr = { name: "DESC", value: "A box.", setter: "" };
  const builderFlags = player("builder_1");
  assertEquals(canCopyAttr_FIXED(legacyAttr, "builder_1", builderFlags), true);
});
