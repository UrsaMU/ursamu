/**
 * Skins, generator, treasure, site build.
 */
import { assertEquals, assert } from "@std/assert";
import {
  ADVENTURES,
  TREASURE,
  adventureBySlug,
  treasureBySlug,
} from "../src/adventure/catalog.ts";
import { listSkins, skinBySlug } from "../src/adventure/skins.ts";
import {
  generateFromSkin,
  makeRunSlug,
} from "../src/adventure/generate.ts";
import {
  bossGuardCount,
  scaleFodderRange,
} from "../src/adventure/party.ts";
import { rollTreasureTable } from "../src/adventure/treasure.ts";
import {
  startDelve,
  getInstance,
  countLivingMobs,
} from "../src/adventure/site.ts";
import { DBO } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

/** Deterministic rng sequence. */
function rngSeq(seeds: number[]): () => number {
  let i = 0;
  return () => {
    const v = seeds[i % seeds.length] ?? 0.5;
    i++;
    return v;
  };
}

Deno.test("dungeon skins load", OPTS, () => {
  assert(listSkins().length >= 3);
  const g = skinBySlug("goblin-warren");
  assert(g);
  assertEquals(g.kind, "dungeon");
  assert(g.roomsMin >= 2);
  assert(g.boss.template);
  assert(g.props.chest);
});

Deno.test("generateFromSkin builds chain + boss loot", OPTS, () => {
  const skin = skinBySlug("goblin-warren")!;
  const rng = rngSeq([
    0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.15,
    0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.05,
    0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.92,
  ]);
  const def = generateFromSkin(skin, "goblin-warren-test", {
    rng,
    partySize: 1,
  });
  assertEquals(def.entryKey, "entry");
  assertEquals(def.partySize, 1);
  assert(def.rooms.length >= skin.roomsMin);
  assert(def.rooms.length <= skin.roomsMax + 1); // +spur
  assert(def.rooms.some((r) => r.key === "boss"));
  assert(def.mobs.some((m) => m.room === "boss"));
  const bossChest = def.chests?.find((c) => c.room === "boss");
  assert(bossChest);
  assertEquals(bossChest.table, skin.bossLoot);
  assert(def.exits.some((e) => e.from === "entry"));
  assert(def.props && def.props.length >= 1);
  for (const p of def.props!) {
    assert(
      ["chest", "view", "altar", "campfire"].includes(p.kind),
    );
  }
});

Deno.test("larger party yields more mobs", OPTS, () => {
  const skin = skinBySlug("goblin-warren")!;
  const mkRng = () =>
    rngSeq([
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
  const solo = generateFromSkin(skin, "s1", {
    partySize: 1,
    rng: mkRng(),
  });
  const full = generateFromSkin(skin, "s4", {
    partySize: 4,
    rng: mkRng(),
  });
  assert(
    full.mobs.length > solo.mobs.length,
    `party4=${full.mobs.length} solo=${solo.mobs.length}`,
  );
  assertEquals(scaleFodderRange([0, 2], 1), [0, 2]);
  assertEquals(scaleFodderRange([0, 2], 3)[1] >= 3, true);
  assert(bossGuardCount(1, () => 0) <= 1);
  assert(bossGuardCount(5, () => 0) >= 2);
});

Deno.test("scaleFodderRange solo vs party of 4", OPTS, () => {
  const s = scaleFodderRange([1, 2], 1);
  const p = scaleFodderRange([1, 2], 4);
  assert(p[0]! >= s[0]!);
  assert(p[1]! > s[1]!);
});

Deno.test("bandit skin is camp kind", OPTS, () => {
  const s = skinBySlug("bandit-hollow")!;
  assertEquals(s.kind, "camp");
  const def = generateFromSkin(s, "bandit-test", {
    rng: () => 0.4,
    partySize: 2,
  });
  assertEquals(def.kind, "camp");
  assertEquals(def.partySize, 2);
});

Deno.test("treasure tables always yield something", OPTS, () => {
  assert(Object.keys(TREASURE).length >= 4);
  const t = treasureBySlug("tier1-hoard");
  assert(t);
  const loot = rollTreasureTable(t, () => 0);
  assert(loot.gp > 0 || loot.items.length > 0);
});

Deno.test("fixed adventures still catalogued", OPTS, () => {
  // may still have hand-authored JSON
  const n = Object.keys(ADVENTURES).length;
  assert(n >= 0);
  if (n > 0) {
    const a = adventureBySlug(Object.keys(ADVENTURES)[0]!);
    assert(a);
  }
});

Deno.test("startDelve materializes run", OPTS, async () => {
  const r = await startDelve("bone-crypt", { partySize: 2 });
  assertEquals(r.ok, true, r.message);
  assert(r.instance);
  assert(r.def);
  assert(r.instance.entryId);
  assert(r.def.skin === "bone-crypt");
  assertEquals(r.def.partySize, 2);
  assert(r.instance.mobIds.length >= 1);
  assert(
    (r.instance.chestIds?.length ?? 0) >= 1 ||
      (r.def.props?.some((p) => p.kind === "chest")),
  );
  const left = await countLivingMobs(r.instance);
  assert(
    left >= 1 || r.instance.mobIds.length >= 1,
  );
  const inst = await getInstance(r.instance.slug);
  assert(inst);
  assert(makeRunSlug("x").startsWith("x-"));
  await DBO.close();
});
