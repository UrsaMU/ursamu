import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import {
  getNpcTemplate,
  objectStateFromSheet,
  sheetFromTemplate,
} from "../src/npc/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("sheetFromTemplate builds thug from catalog", OPTS, () => {
  const t = getNpcTemplate("thug")!;
  const sheet = sheetFromTemplate(t, undefined, { rng: () => 0 });
  assertEquals(sheet.template, "mortal");
  assertEquals(sheet.npc.archetype, "thug");
  assertEquals(sheet.npc.tier, "minor");
  assertEquals(sheet.attributes.strength, 3);
  assertEquals(
    (sheet.skills as Record<string, number>).brawl,
    3,
  );
  assertExists(sheet.npc.shortDesc);
  assertExists(sheet.npc.aiArchetype);
});

Deno.test("sheetFromTemplate changeling sets Wyrd/Glamour/contracts", OPTS, () => {
  const t = getNpcTemplate("autumn-courtier")!;
  const sheet = sheetFromTemplate(t, undefined, { rng: () => 0 });
  assertEquals(sheet.template, "changeling");
  assertEquals(sheet.powerStatValue, 3);
  assertEquals(sheet.energyCurrent, 8);
  assertEquals(sheet.moralityValue, 6);
  assertEquals(sheet.customFields.court, "Autumn");
  assertEquals(
    (sheet.contracts ?? []).includes("Mask of Superiority"),
    true,
  );
  assertExists(sheet.npc.mask);
});

Deno.test("sheetFromTemplate werewolf sets renown and form", OPTS, () => {
  const t = getNpcTemplate("pure-raider")!;
  const sheet = sheetFromTemplate(t, undefined, { rng: () => 0 });
  assertEquals(sheet.template, "werewolf");
  assertEquals(sheet.powerStatValue, 3);
  assertEquals(sheet.customFields.form, "urshul");
  assertEquals(sheet.customFields.faction, "pure");
  assertEquals(sheet.powers.purity, 3);
  assertEquals(sheet.npc.presence, "ambush");
});

Deno.test("objectStateFromSheet applies dark for ambush", OPTS, () => {
  const t = getNpcTemplate("pure-raider")!;
  const sheet = sheetFromTemplate(t, undefined, { rng: () => 0 });
  const built = objectStateFromSheet(sheet, "Raider");
  assertEquals(built.flags.includes("dark"), true);
  assertEquals(built.flags.includes("npc"), true);
  assertStringIncludes(
    JSON.stringify(built.state.attributes),
    "short-desc",
  );
  assertExists(built.state.description);
});

Deno.test("objectStateFromSheet ghost is dark when presence hidden", OPTS, () => {
  const t = getNpcTemplate("ghost")!;
  const sheet = sheetFromTemplate(t, undefined, { rng: () => 0 });
  const built = objectStateFromSheet(sheet, "Ghost");
  assertEquals(built.flags.includes("dark"), true);
});

Deno.test("+npc path: tier override scales sheet", OPTS, () => {
  const t = getNpcTemplate("thug")!;
  const minor = sheetFromTemplate(t, "minor", { rng: () => 0 });
  const major = sheetFromTemplate(t, "major", { rng: () => 0 });
  assertEquals(minor.attributes.strength + 1, major.attributes.strength);
});
