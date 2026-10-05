import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  getNpcTemplate,
  listNpcTemplates,
  NPC_CATALOG_ERRORS,
  npcTemplateKeys,
  resolveAiConfig,
  templatesByLineage,
  templatesByTag,
} from "../src/npc/catalog.ts";
import {
  pickFlavor,
  resolveSpawnFlavor,
} from "../src/npc/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("NPC JSON catalog", OPTS, () => {
  it("loads without validation errors", () => {
    assertEquals(
      NPC_CATALOG_ERRORS,
      [],
      NPC_CATALOG_ERRORS.map((e) => `${e.file}: ${e.message}`)
        .join("; "),
    );
  });

  it("includes mortal, changeling, werewolf examples", () => {
    const keys = npcTemplateKeys();
    assertStringIncludes(keys.join(","), "thug");
    assertStringIncludes(keys.join(","), "autumn-courtier");
    assertStringIncludes(keys.join(","), "pure-raider");
    // Full legacy set migrated + lineage examples.
    assertEquals(listNpcTemplates().length >= 14, true);
  });

  it("thug is minor mortal with club and territorial default", () => {
    const t = getNpcTemplate("thug");
    assertExists(t);
    assertEquals(t.lineage, "mortal");
    assertEquals(t.tier, "minor");
    assertEquals(t.defaultWeapon, "metal-club");
    assertEquals(t.defaults?.aggro, "territorial");
    assertEquals(t.defaults?.presence, "visible");
    assertEquals(t.attributes.strength, 3);
    const ai = resolveAiConfig(t.ai);
    assertEquals(ai.archetype, "beshilu-swarmer");
    assertEquals(ai.preferMelee, true);
  });

  it("autumn-courtier has changeling Mask/Mien and contracts", () => {
    const t = getNpcTemplate("autumn-courtier");
    assertExists(t);
    assertEquals(t.lineage, "changeling");
    assertEquals(t.tier, "major");
    assertExists(t.changeling);
    assertEquals(t.changeling.court, "Autumn");
    assertEquals(t.changeling.seeming, "Fairest");
    assertEquals(t.changeling.wyrd, 3);
    assertEquals(
      (t.changeling.contracts ?? []).includes(
        "Mask of Superiority",
      ),
      true,
    );
    assertEquals(Array.isArray(t.changeling.mask), true);
    assertEquals(Array.isArray(t.changeling.mien), true);
    assertStringIncludes(
      (t.changeling.mask as string[])[0],
      "charcoal",
    );
    assertStringIncludes(
      (t.changeling.mien as string[])[0],
      "leaves",
    );
    assertEquals(t.defaults?.lookMode, "mask");
  });

  it("pure-raider is ambush Pure werewolf in urshul", () => {
    const t = getNpcTemplate("pure-raider");
    assertExists(t);
    assertEquals(t.lineage, "werewolf");
    assertExists(t.werewolf);
    assertEquals(t.werewolf.faction, "pure");
    assertEquals(t.werewolf.form, "urshul");
    assertEquals(t.werewolf.primalUrge, 3);
    assertEquals(t.werewolf.renown?.purity, 3);
    assertEquals(t.defaults?.presence, "ambush");
    assertEquals(t.defaults?.aggro, "hunter");
    const ai = resolveAiConfig(t.ai);
    assertEquals(ai.startRevealed, false);
  });

  it("filters by lineage and tags", () => {
    assertEquals(templatesByLineage("mortal").length >= 1, true);
    assertEquals(
      templatesByLineage("changeling").some(
        (t) => t.slug === "autumn-courtier",
      ),
      true,
    );
    assertEquals(
      templatesByTag("pure").some(
        (t) => t.slug === "pure-raider",
      ),
      true,
    );
  });

  it("case-insensitive slug lookup", () => {
    assertEquals(getNpcTemplate("THUG")?.slug, "thug");
    assertEquals(getNpcTemplate("  Pure-Raider  ")?.slug, "pure-raider");
  });

  it("pickFlavor: string passes through; array picks by rng", () => {
    assertEquals(pickFlavor("  alone  "), "alone");
    assertEquals(pickFlavor(null), null);
    assertEquals(pickFlavor(undefined), undefined);
    assertEquals(pickFlavor([]), undefined);
    // rng always 0 -> first entry
    assertEquals(
      pickFlavor(["alpha", "beta", "gamma"], () => 0),
      "alpha",
    );
    // rng near 1 -> last entry (clamped)
    assertEquals(
      pickFlavor(["alpha", "beta", "gamma"], () => 0.999),
      "gamma",
    );
  });

  it("resolveSpawnFlavor picks thug shortDesc from array", () => {
    const t = getNpcTemplate("thug");
    assertExists(t);
    assertEquals(Array.isArray(t.shortDesc), true);
    const f = resolveSpawnFlavor(t, () => 0);
    assertExists(f.shortDesc);
    assertEquals(
      (t.shortDesc as string[]).includes(f.shortDesc!),
      true,
    );
    assertExists(f.description);
  });

  it("resolveSpawnFlavor resolves changeling mask/mien arrays", () => {
    const t = getNpcTemplate("autumn-courtier");
    assertExists(t);
    const f = resolveSpawnFlavor(t, () => 0);
    assertExists(f.mask);
    assertExists(f.mien);
    assertEquals(
      (t.changeling!.mask as string[]).includes(f.mask as string),
      true,
    );
  });
});
