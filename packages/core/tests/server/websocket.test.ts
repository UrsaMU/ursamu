import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { clampTermWidth } from "../../src/server/websocket.ts";

describe("clampTermWidth", () => {
  it("returns null for non-number types", () => {
    assertEquals(clampTermWidth("80"), null);
    assertEquals(clampTermWidth(null), null);
    assertEquals(clampTermWidth(undefined), null);
    assertEquals(clampTermWidth(true), null);
    assertEquals(clampTermWidth({}), null);
    assertEquals(clampTermWidth([]), null);
  });

  it("returns null for non-finite numbers", () => {
    assertEquals(clampTermWidth(NaN), null);
    assertEquals(clampTermWidth(Infinity), null);
    assertEquals(clampTermWidth(-Infinity), null);
  });

  it("returns null for values out of bounds (40-250)", () => {
    assertEquals(clampTermWidth(39), null);
    assertEquals(clampTermWidth(251), null);
    assertEquals(clampTermWidth(-100), null);
    assertEquals(clampTermWidth(1000), null);
  });

  it("returns exact value for integers within bounds", () => {
    assertEquals(clampTermWidth(40), 40);
    assertEquals(clampTermWidth(80), 80);
    assertEquals(clampTermWidth(120), 120);
    assertEquals(clampTermWidth(250), 250);
  });

  it("floors float values within bounds", () => {
    assertEquals(clampTermWidth(80.5), 80);
    assertEquals(clampTermWidth(249.9), 249);
    assertEquals(clampTermWidth(40.1), 40);
  });
});
