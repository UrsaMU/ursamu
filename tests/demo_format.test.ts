import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { divider, footer, header } from "../src/utils/format.ts";
import { center } from "../src/utils/format.ts";

// Snapshot the byte-for-byte output that the demo command previously built
// inline (HR / hr / section). The TS layout helpers in src/utils/format.ts
// must produce the same strings, otherwise the demo output changes visibly.

const HR = "=".repeat(78);
const hr = "-".repeat(78);
const oldSection = (title: string) => `\n%ch${title}%cn\n${hr}`;
const oldOverviewBlock = (title: string) =>
  `${HR}\n${center(`%ch${title}%cn`, 78)}\n${HR}`;

Deno.test("format.footer() matches old HR rule", () => {
  assertEquals(footer(), HR);
});

Deno.test("format.divider(title) matches old section()", () => {
  assertEquals(divider("BASICS — Actor"), oldSection("BASICS — Actor"));
  assertEquals(divider("FORMAT — util.sprintf"), oldSection("FORMAT — util.sprintf"));
});

Deno.test("format.header(title) matches old HR-title-HR block", () => {
  const title = " UrsaMU Script Engine Demo ";
  assertEquals(header(title), oldOverviewBlock(title));
});

Deno.test("format.header() with no title is a plain rule", () => {
  assertEquals(header(), HR);
});

Deno.test("format.divider() with no title is a plain dash rule", () => {
  assertEquals(divider(), hr);
});
