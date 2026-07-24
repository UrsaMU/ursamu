import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  formatDotTrack,
  formatDottedStatLine,
  trunc,
} from "../src/support/format.ts";

const vis = (s: string) =>
  s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");

describe("format support: trunc", () => {
  it("returns the string unchanged if shorter than width", () => {
    assertEquals(trunc("abc", 5), "abc");
  });

  it("returns the string unchanged if equal to width", () => {
    assertEquals(trunc("abc", 3), "abc");
  });

  it("truncates and appends '..' if longer than width", () => {
    assertEquals(trunc("abcdef", 4), "ab..");
    assertEquals(trunc("hello world", 7), "hello..");
  });

  it("truncates without '..' if width is 2 or less", () => {
    assertEquals(trunc("abc", 2), "ab");
    assertEquals(trunc("abc", 1), "a");
    assertEquals(trunc("abc", 0), "");
  });

  it("handles null and undefined gracefully", () => {
    assertEquals(trunc(null, 5), "");
    assertEquals(trunc(undefined, 5), "");
  });
});

describe("format support: formatDotTrack", () => {
  it("rating 1 is one filled star (attrs start at 1)", () => {
    assertEquals(vis(formatDotTrack(1)), "*.....");
  });

  it("rating 0 is empty 6-dot track", () => {
    assertEquals(vis(formatDotTrack(0)), "......");
  });

  it("rating 5 is almost full", () => {
    assertEquals(vis(formatDotTrack(5)), "*****.");
  });

  it("rating 6 fills the track", () => {
    assertEquals(vis(formatDotTrack(6)), "******");
  });

  it("clamps above 6", () => {
    assertEquals(vis(formatDotTrack(9)), "******");
  });
});

describe("format support: formatDottedStatLine", () => {
  it("shows filled dots + bare number for base rating 1", () => {
    const line = formatDottedStatLine(
      "Intelligence",
      1,
      undefined,
      24,
    );
    const v = vis(line);
    assertEquals(v.includes("*.....1"), true);
    assertEquals(v.includes("("), false);
    assertEquals(v.startsWith("Intelligence:"), true);
    assertEquals(v.length, 24);
  });

  it("shows base(temp) when temp differs", () => {
    const line = formatDottedStatLine("Wits", 2, 3, 24);
    const v = vis(line);
    assertEquals(v.includes("**....2(3)"), true);
    assertEquals(v.length, 24);
  });

  it("pads to requested visible width", () => {
    const line = formatDottedStatLine(
      "Presence",
      1,
      undefined,
      24,
    );
    assertEquals(vis(line).length, 24);
  });
});
