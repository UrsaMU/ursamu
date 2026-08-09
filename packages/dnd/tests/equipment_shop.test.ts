/**
 * Equipment catalog + shop proficiency annotations.
 */
import { assertEquals, assert } from "@std/assert";
import {
  canUseGear,
  gearByName,
  gearBySlug,
  gearToDndState,
  resolveGear,
} from "../src/data/equipment.ts";
import { defaultSheet, migrateSheet } from
  "../src/stats/dnd_sheet.ts";
import {
  onAnnotateWares,
  onSpawnItem,
} from "../src/integrations/vendor-gear.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("catalog resolves longsword", OPTS, () => {
  const g = gearBySlug("longsword");
  assert(g);
  assertEquals(g?.type, "weapon");
  assertEquals(g?.category, "martial");
  assertEquals(gearByName("Longsword")?.slug, "longsword");
  assertEquals(resolveGear("Longsword", "")?.slug, "longsword");
  assertEquals(
    resolveGear("", "slug:longsword")?.slug,
    "longsword",
  );
});

Deno.test("fighter is proficient with martial + heavy", OPTS, () => {
  const s = migrateSheet({ ...defaultSheet(), class: "Fighter" });
  const sword = gearBySlug("longsword")!;
  const mail = gearBySlug("chain-mail")!;
  const kit = gearBySlug("healers-kit")!;
  assertEquals(canUseGear(s, sword), true);
  assertEquals(canUseGear(s, mail), true);
  assertEquals(canUseGear(s, kit), true);
});

Deno.test("wizard not proficient with longsword/heavy", OPTS, () => {
  const s = migrateSheet({ ...defaultSheet(), class: "Wizard" });
  assertEquals(canUseGear(s, gearBySlug("longsword")!), false);
  assertEquals(canUseGear(s, gearBySlug("chain-mail")!), false);
  assertEquals(canUseGear(s, gearBySlug("dagger")!), true);
  assertEquals(canUseGear(s, gearBySlug("quarterstaff")!), true);
});

Deno.test("gearToDndState has combat fields", OPTS, () => {
  const d = gearToDndState(gearBySlug("longsword")!);
  assertEquals(d.type, "weapon");
  assertEquals(d.damage, "1d8");
  assertEquals(d.slug, "longsword");
  assertEquals(d.equipped, false);
});

Deno.test("annotate hides junk and marks proficiency", OPTS, async () => {
  const sheet = migrateSheet({
    ...defaultSheet(),
    class: "Wizard",
  });
  const bag = {
    actorId: "p1",
    wares: [
      { name: "Longsword", price: 15, spec: "slug:longsword", desc: "" },
      { name: "Dagger", price: 2, spec: "slug:dagger", desc: "" },
      { name: "Fake Laser", price: 99, spec: "weapon:9d9:laser", desc: "" },
    ],
    db: {
      search: async () => [{
        id: "p1",
        state: { dnd: sheet },
      }],
    },
  };
  await onAnnotateWares(bag);
  const shown = bag.wares.filter((w) => !w.hide);
  assertEquals(shown.length, 2);
  const ls = shown.find((w) => w.name === "Longsword")!;
  const dg = shown.find((w) => w.name === "Dagger")!;
  assertEquals(ls.usable, false);
  assertEquals(dg.usable, true);
  assert(bag.wares.find((w) => w.name === "Fake Laser")?.hide);
});

Deno.test("spawn dryRun does not create", OPTS, async () => {
  let created = 0;
  const data = {
    itemName: "Longsword",
    spec: "slug:longsword",
    price: 15,
    success: false,
    dryRun: true,
    actorId: "p1",
    db: {
      create: async () => {
        created++;
        return { id: "x" };
      },
    },
  };
  await onSpawnItem(data);
  assertEquals(data.success, true);
  assertEquals(created, 0);
});

Deno.test("spawn refuses non-catalog", OPTS, async () => {
  const data = {
    itemName: "Laser Rifle",
    spec: "weapon:9d9:laser",
    success: true,
    actorId: "p1",
    db: { create: async () => ({ id: "x" }) },
  };
  await onSpawnItem(data);
  assertEquals(data.success, false);
});
