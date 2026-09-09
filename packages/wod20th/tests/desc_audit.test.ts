// tests/desc_audit.test.ts -- /tdd-audit security pass for @desc.
//
// @desc is a thin builder command: target -> canEdit -> validate plane slug ->
// write/clear state.<plane>Description. The exec body itself is not trivially
// unit-testable (depends on SDK shape), so we use source-text regression
// guards plus pure-logic assertions for the plane regex and length cap.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

const DESC_SRC = await Deno.readTextFile(
  new URL("../commands/desc.ts", import.meta.url),
);

// Re-derive the regex from the source so the tests match the live constant.
const PLANE_RX = /^[a-z][a-z0-9-]*$/;
const MAX_DESC = 4096;

describe("/tdd-audit @desc", () => {
  // D-1: canEdit required.
  it("D-1: requires u.canEdit on target before writing (regression guard)", () => {
    assert(
      /await\s+u\.canEdit\(\s*u\.me\s*,\s*target\s*\)/.test(DESC_SRC),
      "@desc must gate writes behind canEdit(me, target)",
    );
    assert(
      /Permission denied/.test(DESC_SRC),
      "@desc must surface a permission-denied message",
    );
  });

  // D-2: plane slug regex rejects traversal / HTML / uppercase / spaces.
  it("D-2: plane slug regex rejects path traversal, HTML, uppercase, spaces", () => {
    // hardened forms accepted:
    assert(PLANE_RX.test("penumbra"));
    assert(PLANE_RX.test("deep-umbra"));
    assert(PLANE_RX.test("shadowlands"));
    assert(PLANE_RX.test("astral2"));

    // exploit attempts rejected:
    assertFalse(PLANE_RX.test("../etc"));
    assertFalse(PLANE_RX.test("../../passwd"));
    assertFalse(PLANE_RX.test("<script>"));
    assertFalse(PLANE_RX.test("Penumbra"));      // uppercase
    assertFalse(PLANE_RX.test("PENUMBRA"));
    assertFalse(PLANE_RX.test("deep umbra"));    // space
    assertFalse(PLANE_RX.test("deep.umbra"));    // dot
    assertFalse(PLANE_RX.test("-leading"));      // must start with [a-z]
    assertFalse(PLANE_RX.test("9digit"));        // must start with [a-z]
    assertFalse(PLANE_RX.test(""));              // empty
    assertFalse(PLANE_RX.test("plane/sub"));     // slash
    assertFalse(PLANE_RX.test("plane$"));        // mongo operator
    assertFalse(PLANE_RX.test("__proto__"));     // proto pollution form

    // and source must reference the same regex, with a clear rejection path:
    assert(
      /PLANE_RX\s*=\s*\/\^\[a-z\]\[a-z0-9-\]\*\$\//.test(DESC_SRC),
      "PLANE_RX must remain the constrained slug regex",
    );
    assert(
      /Invalid plane/.test(DESC_SRC),
      "invalid slug must surface an error -- never silently coerce",
    );
  });

  // D-3: empty value clears via $unset, not silent no-op.
  it("D-3: empty value clears via $unset on the resolved field key", () => {
    // The exec must `$unset` the computed fieldKey when value === "".
    assert(
      /if\s*\(\s*value\s*===\s*""\s*\)/.test(DESC_SRC),
      "empty-value branch must be explicit",
    );
    assert(
      /\$unset"?\s*,\s*\{\s*\[fieldKey\]:\s*""\s*\}/.test(DESC_SRC),
      "empty value must call db.modify(..., '$unset', { [fieldKey]: '' })",
    );
    assert(/cleared/i.test(DESC_SRC), "clear path must confirm to the caller");
  });

  // D-4: 4096-char cap rejected without truncation.
  it("D-4: oversize values are rejected, not silently truncated", () => {
    assert(
      /MAX_DESC\s*=\s*4096/.test(DESC_SRC),
      "MAX_DESC must remain 4096",
    );
    assert(
      /value\.length\s*>\s*MAX_DESC/.test(DESC_SRC),
      "must compare length > MAX_DESC and short-circuit (not truncate)",
    );
    // Source must NOT contain a silent slice/substring of value down to MAX_DESC.
    assertFalse(
      /value\.slice\(0,\s*MAX_DESC\)|value\.substring\(0,\s*MAX_DESC\)/.test(DESC_SRC),
      "value must never be silently truncated to MAX_DESC",
    );
    // sanity: cap is what we expect
    assertEquals(MAX_DESC, 4096);
  });

  // D-5: fieldKey derives only from `state.<slug>Description`, never raw state[slug].
  it("D-5: fieldKey is always state.<slug>Description -- never state.<slug>", () => {
    // The only assignment forms allowed:
    //   fieldKey = "state.description"
    //   fieldKey = `state.${switchArg}Description`
    const explicit = /fieldKey\s*=\s*"state\.description"/.test(DESC_SRC);
    const planeKey = /fieldKey\s*=\s*`state\.\$\{switchArg\}Description`/.test(DESC_SRC);
    assert(explicit, "no-switch path must write to state.description");
    assert(planeKey, "switch path must always suffix `Description`");

    // Anti-pattern guard: any `state.${switchArg}` form NOT followed by
    // `Description` would let a caller overwrite e.g. state.owner.
    assertFalse(
      /state\.\$\{switchArg\}(?!Description)/.test(DESC_SRC),
      "must never write to state.${switchArg} directly",
    );
  });

  // D-6: no-switch path writes only state.description -- no attributes-array touch.
  it("D-6: no side effects on attributes[] from @desc", () => {
    // @desc must not touch state.attributes -- it owns state.description only.
    assertFalse(
      /state\.attributes/.test(DESC_SRC),
      "@desc must never write to state.attributes",
    );
    // Verify exactly one $set and one $unset site reachable from exec.
    const sets = DESC_SRC.match(/\$set"/g) ?? [];
    const unsets = DESC_SRC.match(/\$unset"/g) ?? [];
    assertEquals(sets.length, 1, "exactly one $set call");
    assertEquals(unsets.length, 1, "exactly one $unset call");
  });

  // Bonus: switch is lower-cased before validation -- attacker can't bypass via case.
  it("normalises switch to lower case before regex", () => {
    assert(
      /u\.cmd\.args\[0\][^\n]*toLowerCase\(\)/.test(DESC_SRC),
      "switchArg must be lower-cased before PLANE_RX test",
    );
  });
});
