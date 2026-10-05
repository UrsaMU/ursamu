import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  formatFeedNote,
  formatRollNote,
  formatWeekNote,
  stripMush,
} from "../src/emit.ts";
import { utopiaSystemRecord } from "../src/gm-bridge.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("stripMush removes color codes", OPTS, () => {
  assertEquals(stripMush("%chMira%cn"), "Mira");
});

Deno.test("formatRollNote has result and no mush", OPTS, () => {
  const note = formatRollNote({
    name: "%chMira%cn",
    verb: "hack",
    total: 14,
    dv: 18,
    result: "hitch",
    dangerFrom: 2,
    dangerTo: 3,
  });
  assertStringIncludes(note, "HITCH");
  assertStringIncludes(note, "14 vs DV 18");
  assertEquals(note.includes("%c"), false);
});

Deno.test("formatWeekNote lists plans", OPTS, () => {
  const note = formatWeekNote({
    city: "New Cascadia",
    week: 12,
    plans: [
      { playerName: "%chMira%cn", plan: "Get the sample." },
    ],
  });
  assertStringIncludes(note, "Week 12");
  assertStringIncludes(note, "Mira: Get the sample.");
  assertEquals(note.includes("%c"), false);
});

Deno.test("formatFeedNote names the week", OPTS, () => {
  const note = formatFeedNote({
    city: "New Cascadia",
    week: 13,
    headlines: ["Stack-weeds sev 3"],
  });
  assertStringIncludes(note, "Week 13");
  assertStringIncludes(note, "Stack-weeds");
});

Deno.test("system record has charCollection", OPTS, () => {
  const rec = utopiaSystemRecord();
  assertEquals(rec.id, "utopia");
  assertEquals(rec.charCollection, "utopia.chars");
  assertEquals(rec.source, "ingested");
  assertEquals(rec.events[0].name, "utopia:roll");
});
