/**
 * Web sheet layout components.
 */
import { assertEquals, assert } from "@std/assert";
import { defaultSheet, migrateSheet } from "../src/stats/dnd_sheet.ts";
import { buildSheetWebLayout } from "../src/sheet/web-layout.ts";
import {
  buildSheetHtml,
  buildSheetWebLayoutHtml,
  mushToHtml,
} from "../src/sheet/sheet-html.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("buildSheetWebLayout has header and vitals", OPTS, () => {
  const s = migrateSheet(defaultSheet());
  s.skillProficiency.athletics = "proficient";
  s.savingThrowProficiency = ["strength", "constitution"];
  s.feats = ["Alert"];
  s.spells = ["fire_bolt"];
  s.spellSlotsMax[1] = 2;
  s.spellSlotsCurrent[1] = 2;
  const lay = buildSheetWebLayout("Hero", s);
  assert(lay.components.length >= 4);
  assertEquals(lay.meta.system, "dnd");
  assertEquals(lay.meta.type, "dnd-sheet");
  const types = lay.components.map((c) =>
    (c as { type: string }).type
  );
  assert(types.includes("header"));
  assert(types.includes("grid"));
  assert(types.includes("list"));
  const titles = lay.components.map((c) =>
    String((c as { title?: string }).title || "")
  );
  assert(titles.includes("Combat"));
  assert(titles.includes("Skills"));
  assert(titles.includes("Saving Throws"));
  assert(titles.includes("Spells"));
});

Deno.test("mushToHtml turns %c into palette spans", OPTS, () => {
  const html = mushToHtml("%cyHero%cn");
  assert(html.includes("mush-fg-ffff00"), html);
  assert(html.includes("Hero"), html);
  assert(!html.includes("%cy"), html);
  assert(!html.includes("%cn"), html);
  const bold = mushToHtml("%ch%crRed%cn");
  assert(bold.includes("mush-bold"), bold);
  assert(bold.includes("mush-fg-ff0000"), bold);
});

Deno.test("buildSheetHtml is full dnd-sheet markup", OPTS, () => {
  const s = migrateSheet(defaultSheet());
  s.skillProficiency.athletics = "proficient";
  s.savingThrowProficiency = ["strength", "constitution"];
  s.feats = ["Alert"];
  s.spells = ["fire_bolt"];
  s.spellSlotsMax[1] = 2;
  s.spellSlotsCurrent[1] = 1;
  const html = buildSheetHtml("%cyHero%cn", s);
  assert(html.includes('class="dnd-sheet"'));
  assert(html.includes("dnd-sheet__banner"));
  assert(html.includes("mush-fg-ffff00"));
  assert(!html.includes("%cy"));
  assert(html.includes("dnd-sheet__abils"));
  assert(html.includes("Saving throws"));
  assert(html.includes("Skills"));
  assert(html.includes("Spellcasting"));
  assert(html.includes("Athletics") || html.includes("athletics"));
  assert(!html.includes("<script"));
  const lay = buildSheetWebLayoutHtml("Hero", s);
  assertEquals(lay.meta.type, "dnd-sheet");
  assertEquals(lay.meta.className, "play-layout--dnd-sheet");
  assertEquals(
    (lay.components[0] as { type: string }).type,
    "html",
  );
});
