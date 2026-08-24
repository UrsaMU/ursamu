/**
 * Tests — Smartgun Link enforcement.
 */
import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { checkSmartgunLink, hasSmartgunLink } from "../engine/smartgun.ts";
import type { ICyberware } from "../db/schemas.ts";

const cw = (name: string): ICyberware => ({
  id: name, name, category: "neuralware", hl: 0,
  installType: "clinic", installedAt: 0,
});

describe("checkSmartgunLink()", () => {
  it("allows non-smart ammo with no penalty regardless of cyberware", () => {
    const r = checkSmartgunLink({ cyberware: [] }, "basic");
    assertEquals(r.allowed, true);
    assertEquals(r.penalty, 0);
  });

  it("allows smart ammo cleanly when Smartgun Link is installed", () => {
    const r = checkSmartgunLink(
      { cyberware: [cw("smartgun_link")] }, "smart",
    );
    assertEquals(r.allowed, true);
    assertEquals(r.penalty, 0);
    assertEquals(r.fallbackAmmo, undefined);
  });

  it("smart ammo without link: -2 penalty, falls back to basic", () => {
    const r = checkSmartgunLink({ cyberware: [] }, "smart");
    assertEquals(r.allowed, true);
    assertEquals(r.penalty, -2);
    assertEquals(r.fallbackAmmo, "basic");
    assert(typeof r.reason === "string" && r.reason.length > 0);
  });

  it("hasSmartgunLink() detects the cyberware by name", () => {
    assertEquals(hasSmartgunLink({ cyberware: [] }), false);
    assertEquals(hasSmartgunLink({ cyberware: [cw("kerenzikov")] }), false);
    assertEquals(hasSmartgunLink({ cyberware: [cw("smartgun_link")] }), true);
  });
});
