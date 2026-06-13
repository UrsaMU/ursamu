// Tests for the look command layout and globals theme overlay integration.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { cofdGlobalsOverlay } from "../src/support/theme.ts";
import { currentTheme, setTheme, resetTheme } from "@ursamu/globals";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("Chronicles of Darkness look Theme Overlay", OPTS, () => {
  it("defines the expected red and gold format tokens and values", () => {
    // Assert tokens
    assertEquals(cofdGlobalsOverlay.tokens?.sep, "%cr");
    assertEquals(cofdGlobalsOverlay.tokens?.title, "%ch%cy");
    assertEquals(cofdGlobalsOverlay.tokens?.section, "%ch%cy");

    // Assert colors
    assertEquals(cofdGlobalsOverlay.colors?.border, "%cr");
    assertEquals(cofdGlobalsOverlay.colors?.header, "%ch%cy");
    assertEquals(cofdGlobalsOverlay.colors?.label, "%ch%cy");
    assertEquals(cofdGlobalsOverlay.colors?.accent, "%cc");

    // Assert format strings
    assert(cofdGlobalsOverlay.headerfmt?.includes("repeat"));
    assert(cofdGlobalsOverlay.dividerfmt?.includes("repeat"));
    assert(cofdGlobalsOverlay.footerfmt?.includes("repeat"));
  });

  it("can be applied and removed cleanly via @ursamu/globals", async () => {
    // Save the pre-test theme
    const originalHeaderFmt = currentTheme().headerfmt;

    try {
      // Apply theme
      await setTheme(cofdGlobalsOverlay);
      const applied = currentTheme();

      assertEquals(applied.tokens.sep, "%cr");
      assertEquals(applied.tokens.title, "%ch%cy");
      assertEquals(applied.tokens.section, "%ch%cy");
      assertEquals(applied.colors.border, "%cr");
      assertEquals(applied.colors.header, "%ch%cy");

      // Reset the theme
      await resetTheme();
      const restored = currentTheme();
      assertEquals(restored.headerfmt, originalHeaderFmt);
    } finally {
      // Clean up in case assertions fail
      await resetTheme();
    }
  });
});
