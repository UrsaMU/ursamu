/**
 * Web +sheet HTML — in-line compact (deep browse is /chargen).
 */
import { assertEquals, assert } from "@std/assert";
import { buildNewCharacter } from "../engine/character.ts";
import {
  buildScoreWebHtml,
  buildScoreWebLayout,
  buildSheetHtml,
  buildSheetWebLayoutHtml,
  buildVitalsHtml,
  mushToHtml,
  sheetCmd,
  stripMoniker,
} from "../src/sheet/sheet-html.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("sheetCmd builds switches and target", OPTS, () => {
  assertEquals(sheetCmd("overview"), "+sheet");
  assertEquals(sheetCmd("skills"), "+sheet/skills");
  assertEquals(sheetCmd("cyber", "Rogue"), "+sheet/cyber Rogue");
  assertEquals(sheetCmd("overview", "Rogue"), "+sheet Rogue");
});

Deno.test("mushToHtml renders moniker truecolor", OPTS, () => {
  const raw =
    "<#ff0000>g<#ff1604>L<#ffffff>x%cn";
  const html = mushToHtml(raw);
  assert(html.includes("mush-fg-ff0000"), html);
  assert(html.includes(">g<") || html.includes(">g</"), html);
  assert(html.includes("L") || html.includes("x"), html);
  assert(!html.includes("<#ff0000>"), html);
  assert(!html.includes("%cn"), html);
  assertEquals(stripMoniker(raw), "gLx");
});

Deno.test("sheet header uses moniker HTML not raw codes", OPTS, () => {
  const cpr = buildNewCharacter("solo");
  cpr.chargenComplete = true;
  const mon =
    "<#ff0000>g<#ff1604>L<#ff2c09>i%cn";
  const html = buildSheetHtml(mon, cpr, { view: "overview" });
  assert(html.includes("mush-fg-"), html);
  assert(!html.includes("<#ff0000>"), html);
  assert(!html.includes("%cn"), html);
});

Deno.test("overview is in-line compact with chips + vitals", OPTS, () => {
  const cpr = buildNewCharacter("solo");
  cpr.chargenComplete = true;
  cpr.skills = { handgun: 6, athletics: 4 };
  cpr.eurodollars = 2500;
  cpr.luckRemaining = 5;

  const html = buildSheetHtml("gLitch", cpr, {
    view: "overview",
  });
  assert(html.includes("cpr-sheet--inline"), html);
  assert(html.includes("cpr-sheet__chips"), html);
  assert(!html.includes("cpr-sheet__nav"), html);
  assert(html.includes('data-play-cmd="+sheet/skills"'), html);
  assert(html.includes("gLitch"), html);
  assert(html.includes("cpr-vbar--hp"), html);
  assert(html.includes("/chargen"), html);
  assert(!html.includes("<script"), html);

  const vitalsAt = html.indexOf('aria-label="Vitals"');
  const statsAt = html.indexOf('aria-label="Stats"');
  assert(statsAt >= 0 && vitalsAt > statsAt, "vitals under stats");
  assert(html.includes("cpr-stat-meter"), html);
  assert(html.includes("Stats"), html);
  assert(!html.includes(">STATs<"), html);
});

Deno.test("skills view lists full catalog", OPTS, () => {
  const cpr = buildNewCharacter("solo");
  cpr.skills = { handgun: 6 };
  const html = buildSheetHtml("Net", cpr, {
    view: "skills",
    targetArg: "Net",
  });
  assert(html.includes('data-cpr-view="skills"'), html);
  assert(html.includes("cpr-skill"), html);
  assert(html.includes("Handgun") || html.includes("handgun"), html);
  // Untrained skills still appear (full catalog)
  assert(html.includes("is-empty"), html);
  assert(html.includes("cpr-skill__stat"), html);
  // Many skills — not just ranked ones
  const n = (html.match(/data-skill=/g) || []).length;
  assert(n > 20, "expected full skill list, got " + n);
});

Deno.test("buildVitalsHtml has bars and badges", OPTS, () => {
  const cpr = buildNewCharacter("netrunner");
  cpr.woundState = "lightly";
  cpr.hp = { max: 20, current: 12 };
  const v = buildVitalsHtml(cpr);
  assert(v.includes("cpr-vbar--hp"));
  assert(v.includes("LIGHTLY") || v.includes("lightly"));
});

Deno.test("buildSheetWebLayoutHtml meta for play", OPTS, () => {
  const cpr = buildNewCharacter("fixer");
  const lay = buildSheetWebLayoutHtml("Rogue", cpr, {
    view: "combat",
  });
  assertEquals(lay.meta.type, "cpr-sheet");
  assertEquals(lay.meta.view, "combat");
  assertEquals(lay.meta.className, "play-layout--cpr-sheet");
  const content = String(
    (lay.components[0] as { content: string }).content,
  );
  assert(content.includes("cpr-sheet--inline"));
  assert(content.includes("Combat"));
});

Deno.test("buildScoreWebHtml is combat vitals strip", OPTS, () => {
  const cpr = buildNewCharacter("solo");
  cpr.chargenComplete = true;
  cpr.woundState = "lightly";
  cpr.hp = { max: 17, current: 12 };
  cpr.humanityLoss = 0;
  cpr.eurodollars = 400;
  const html = buildScoreWebHtml("gLitch", cpr);
  assert(html.includes("data-cpr-score"), html);
  assert(html.includes("cpr-sheet--score"), html);
  assert(html.includes("cpr-vbar--hp"), html);
  assert(html.includes("cpr-vbar--stun"), html);
  assert(html.includes("LIGHTLY") || html.includes("lightly"), html);
  assert(html.includes("SW "), html);
  assert(html.includes("DEATH "), html);
  assert(html.includes("EB ") || html.includes("400"), html);
  assert(html.includes("Body") || html.includes("BODY"), html);
});

Deno.test("buildScoreWebLayout matches ui.layout bag", OPTS, () => {
  const cpr = buildNewCharacter("solo");
  cpr.chargenComplete = true;
  const lay = buildScoreWebLayout("Runner", cpr);
  assertEquals(lay.meta.type, "cpr-score");
  assertEquals(lay.meta.className, "play-layout--cpr-score");
  assert(Array.isArray(lay.components));
  assertEquals(lay.components.length, 1);
  assertEquals(lay.components[0].type, "html");
  const content = String(lay.components[0].content || "");
  assert(content.includes("data-cpr-score"), content);
  assert(content.includes("cpr-vbar--hp"), content);
});
