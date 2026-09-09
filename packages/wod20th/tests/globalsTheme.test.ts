// tests/globalsTheme.test.ts -- Structural assertions for the sgp overlay.
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import { wod20thGlobalsOverlay } from "../core/globalsTheme.ts";

describe("wod20thGlobalsOverlay", () => {
  it("exports overlay object", () => {
    assert(wod20thGlobalsOverlay);
  });

  it("defines the expected token shape", () => {
    const t = wod20thGlobalsOverlay.tokens!;
    assert(t, "tokens block present");
    assert("sep" in t,     "tokens.sep present");
    assert("title" in t,   "tokens.title present");
    assert("section" in t, "tokens.section present");
  });

  it("disables player short-desc and idle columns in look", () => {
    const look = wod20thGlobalsOverlay.look!;
    assert(look, "look block present");
    assertEquals(look.showShortDesc, true);
    assertEquals(look.showIdle,      true);
  });

  it("defines roleTags for admin/wizard/staff/superuser with %c codes", () => {
    const tags = wod20thGlobalsOverlay.look?.roleTags;
    assert(Array.isArray(tags), "roleTags is an array");
    const flags = tags!.map((t) => t.flag);
    for (const need of ["admin", "wizard", "staff", "superuser"]) {
      assert(flags.includes(need), `roleTags contains ${need}`);
    }
    for (const tag of tags!) {
      assert(/%c[a-zA-Z]/.test(tag.display), `${tag.flag} display has %c code`);
    }
  });
});
