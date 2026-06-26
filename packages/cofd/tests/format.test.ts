import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { trunc } from "../src/support/format.ts";

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
