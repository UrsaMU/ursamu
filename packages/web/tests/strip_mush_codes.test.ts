/**
 * stripMushCodes — used by jobs web UI for CGEN sheet snapshots.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { stripMushCodes } from "../ui/src/utils/text.ts";

Deno.test("stripMushCodes removes color sequences", () => {
  const raw =
    "%ch%cy Character Sheet%cn for: Diablerie";
  assertEquals(
    stripMushCodes(raw),
    "Character Sheet for: Diablerie",
  );
});

Deno.test("stripMushCodes keeps border equals from %cg=", () => {
  const raw = "%cg=%cn%cg=%cn%cg=%cn";
  assertEquals(stripMushCodes(raw), "===");
});

Deno.test("stripMushCodes converts %r to newlines", () => {
  const raw = "Line1%rLine2%RLine3";
  assertEquals(stripMushCodes(raw), "Line1\nLine2\nLine3");
});

Deno.test("stripMushCodes sheet row sample", () => {
  const raw =
    "%ch%ccName:%cn Diablerie  %ch%ccConcept:%cn Awesome guy";
  assertEquals(
    stripMushCodes(raw),
    "Name: Diablerie  Concept: Awesome guy",
  );
});
