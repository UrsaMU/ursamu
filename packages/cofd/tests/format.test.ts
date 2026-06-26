import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { ljust, trunc } from "../src/support/format.ts";

describe("format functions", () => {
  describe("ljust", () => {
    it("pads a string to the given width", () => {
      assertEquals(ljust("foo", 5), "foo  ");
    });

    it("does not pad if the string is already at the width", () => {
      assertEquals(ljust("foo", 3), "foo");
    });

    it("does not truncate if the string is longer than width", () => {
      assertEquals(ljust("foobar", 3), "foobar");
    });

    it("handles null and undefined by padding an empty string", () => {
      assertEquals(ljust(null, 5), "     ");
      assertEquals(ljust(undefined, 5), "     ");
    });
  });

  describe("trunc", () => {
    it("returns the string if it is shorter than or equal to the width", () => {
      assertEquals(trunc("foo", 5), "foo");
      assertEquals(trunc("foo", 3), "foo");
    });

    it("truncates and appends '..' if string is longer than width and width > 2", () => {
      assertEquals(trunc("foobar", 5), "foo..");
      assertEquals(trunc("foobar", 4), "fo..");
    });

    it("truncates without '..' if string is longer than width and width <= 2", () => {
      assertEquals(trunc("foobar", 2), "fo");
      assertEquals(trunc("foobar", 1), "f");
      assertEquals(trunc("foobar", 0), "");
    });

    it("handles null and undefined by treating as empty string", () => {
      assertEquals(trunc(null, 5), "");
      assertEquals(trunc(undefined, 5), "");
    });
  });
});
