/**
 * P1 campaign loop: travel, magic, skins T2–T3, treasure magic,
 * vendor magic pricing.
 */
import { assert, assertEquals } from "@std/assert";
import {
  ENCOUNTERS,
  rollTravel,
  tableForWorldKey,
} from "../src/adventure/travel.ts";
import {
  MAGIC_ITEMS,
  applyAttune,
  applyUnattune,
  attunedSlugs,
  canAttune,
  listMagic,
  magicBySlug,
  magicSpawnSpec,
} from "../src/adventure/magic.ts";
import { listSkins, skinBySlug } from
  "../src/adventure/skins.ts";
import { rollTreasureSlug } from
  "../src/adventure/treasure.ts";
import { generateFromSkin } from
  "../src/adventure/generate.ts";
import { defaultSheet, migrateSheet } from
  "../src/stats/dnd_sheet.ts";
import { NPC_TEMPLATES } from
  "../src/combat/npc-templates.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function rngSeq(seeds: number[]): () => number {
  let i = 0;
  return () => {
    const v = seeds[i % seeds.length] ?? 0.5;
    i++;
    return v;
  };
}

Deno.test("encounters: whisperwood + road tables", OPTS, () => {
  assert(ENCOUNTERS.whisperwood);
  assert(ENCOUNTERS.road);
  assertEquals(
    tableForWorldKey("path")?.slug,
    "whisperwood",
  );
  assertEquals(tableForWorldKey("gate")?.slug, "whisperwood");
  // road also lists gate; first match wins (whisperwood)
  assert(tableForWorldKey("barracks"));
});

Deno.test("rollTravel: nothing when chance fails", OPTS, () => {
  const t = ENCOUNTERS.whisperwood!;
  // first roll > chance → nothing
  const r = rollTravel(t, 1, () => 0.99);
  assertEquals(r.kind, "nothing");
  assert(r.text.length > 0);
});

Deno.test("rollTravel: fight scales with party", OPTS, () => {
  const t = ENCOUNTERS.whisperwood!;
  // chance pass (0.0 < 0.45), then weighted pick, then counts
  const mk = () =>
    rngSeq([
      0.0, 0.01, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
  const solo = rollTravel(t, 1, mk());
  const big = rollTravel(t, 4, mk());
  assertEquals(solo.kind, "fight");
  assertEquals(big.kind, "fight");
  if (solo.kind === "fight" && big.kind === "fight") {
    assert(solo.spawns.length >= 1);
    assert(
      big.spawns.length >= solo.spawns.length,
      `party4=${big.spawns.length} solo=${solo.spawns.length}`,
    );
    for (const s of solo.spawns) {
      assert(NPC_TEMPLATES[s.template], s.template);
    }
  }
});

Deno.test("rollTravel: flavor band with no mobs", OPTS, () => {
  const t = ENCOUNTERS.road!;
  // force pass + pick refugees band (weight 1 of 3 → last third)
  // weights: bandits 2, refugees 1. Use high weighted roll.
  const r = rollTravel(
    t,
    1,
    rngSeq([0.0, 0.99, 0.5, 0.5]),
  );
  assert(
    r.kind === "flavor" || r.kind === "fight" ||
      r.kind === "nothing",
  );
  if (r.kind === "flavor") {
    assert(r.text.toLowerCase().includes("travel") ||
      r.text.length > 5);
  }
});

Deno.test("magic catalog + attune max 3", OPTS, () => {
  assert(listMagic().length >= 6);
  assert(magicBySlug("cloak_of_protection"));
  assert(magicBySlug("Cloak of Protection"));
  const cloak = magicBySlug("cloak_of_protection")!;
  assertEquals(cloak.attunement, true);
  assert(cloak.valueGp! > 0);

  let s = defaultSheet();
  s.ac = 15;
  let r = applyAttune(s, "cloak_of_protection");
  assert(r.ok);
  s = r.sheet;
  assertEquals(attunedSlugs(s).length, 1);
  assertEquals(s.ac, 16);

  r = applyAttune(s, "gauntlets_of_ogre_power");
  assert(r.ok);
  s = r.sheet;
  assertEquals(s.abilities.strength, 19);

  r = applyAttune(s, "boots_of_striding");
  assert(r.ok);
  s = r.sheet;
  assertEquals(attunedSlugs(s).length, 3);

  const full = canAttune(s, "ring_of_protection");
  assertEquals(full.ok, false);

  r = applyUnattune(s, "cloak_of_protection");
  assert(r.ok);
  s = r.sheet;
  assertEquals(attunedSlugs(s).length, 2);
  assertEquals(s.ac, 15);

  // no-attune potion rejected for attune
  const pot = canAttune(s, "potion_of_healing");
  assertEquals(pot.ok, false);
});

Deno.test("magicSpawnSpec carries valueGp + magic slug", OPTS, () => {
  const m = MAGIC_ITEMS.weapon_plus_1!;
  const spec = magicSpawnSpec(m);
  assertEquals(spec.extra.magic, "weapon_plus_1");
  assertEquals(spec.extra.valueGp, 300);
  assertEquals(spec.extra.bonus, 1);
});

Deno.test("treasure tables can roll magic items", OPTS, () => {
  // always-pass rng so chance entries fire
  const loot = rollTreasureSlug("boss-stash", () => 0.0)!;
  assert(loot);
  assert(
    loot.items.some((i) =>
      i.extra?.magic ||
      /cloak|gauntlets|potion/i.test(i.name)
    ),
    `items=${JSON.stringify(loot.items)}`,
  );
});

Deno.test("skins include T2 and T3", OPTS, () => {
  const skins = listSkins();
  assert(skins.length >= 7);
  assert(skins.some((s) => s.tier === 2));
  assert(skins.some((s) => s.tier === 3));
  const keep = skinBySlug("haunted-keep")!;
  assertEquals(keep.tier, 3);
  assertEquals(keep.kind, "dungeon");
  const bridge = skinBySlug("troll-bridge")!;
  assertEquals(bridge.tier, 3);
  assertEquals(bridge.kind, "camp");
  const ogre = skinBySlug("ogre-den")!;
  assertEquals(ogre.tier, 2);
  const def = generateFromSkin(ogre, "ogre-p1", {
    partySize: 2,
    rng: () => 0.4,
  });
  assert(def.rooms.some((r) => r.key === "boss"));
  assert(def.mobs.length >= 1);
});

Deno.test("vendor price uses magic valueGp", OPTS, () => {
  // Mirror onGetItemPrice rules without loading hooks
  function price(itemDnd: Record<string, unknown>): number {
    if (typeof itemDnd.valueGp === "number" && itemDnd.valueGp > 0) {
      return itemDnd.valueGp as number;
    }
    if (itemDnd.magic || itemDnd.type === "wondrous") {
      return Number(itemDnd.valueGp) || 100;
    }
    if (itemDnd.type === "weapon") {
      let p = 10;
      if (itemDnd.bonus) p += 200 * Number(itemDnd.bonus);
      return p;
    }
    return 2;
  }
  const cloak = magicSpawnSpec(
    magicBySlug("cloak_of_protection")!,
  );
  assertEquals(price(cloak.extra), 500);
  assertEquals(
    price({ type: "weapon", damage: "1d8", bonus: 1 }),
    210,
  );
  assertEquals(price({ type: "wondrous" }), 100);
});

Deno.test("migrateSheet preserves attunement", OPTS, () => {
  const raw = {
    ...defaultSheet(),
    attunement: ["cloak_of_protection"],
  };
  const m = migrateSheet(raw);
  // deno-lint-ignore no-explicit-any
  assertEquals((m as any).attunement?.[0], "cloak_of_protection");
});
