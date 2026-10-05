// Sum prereqs: "attr1+attr2>=N" (e.g. Smile Through It needs Composure+Resolve >= 5).

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { defaultSheet } from "../src/stats/sheet.ts";
import { checkPrerequisites } from "../src/support/prereq.ts";

describe("sum prereq evaluator", () => {
  it("passes when the two-attribute sum meets the target", () => {
    const sheet = defaultSheet();
    sheet.attributes.composure = 3;
    sheet.attributes.resolve = 2;
    const r = checkPrerequisites(["composure+resolve>=5"], sheet);
    assertEquals(r.valid, true);
  });

  it("fails when the sum is below target, with a helpful reason", () => {
    const sheet = defaultSheet();
    sheet.attributes.composure = 2;
    sheet.attributes.resolve = 2;
    const r = checkPrerequisites(["composure+resolve>=5"], sheet);
    assertEquals(r.valid, false);
    assertEquals(
      r.reason,
      "Requires Composure + Resolve >= 5 (Current value: 4)",
    );
  });
});
