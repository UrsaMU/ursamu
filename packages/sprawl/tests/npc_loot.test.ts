import { assertEquals } from "@std/assert";
import {
  applyKillLoot,
  formatLootLine,
  lootForHorde,
  lootForNpc,
} from "../engine/npc-loot.ts";
import { defaultChar } from "../db/schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("lootForNpc scales with dsMax", OPTS, () => {
  const a = lootForNpc({
    dsMax: 10,
    name: "Sprawl Cop",
    slug: "sprawl-cop",
  });
  // 10 * 12 = 120 b¥, 10 * 0.5 = 5 AP
  assertEquals(a.bityuan, 120);
  assertEquals(a.ap, 5);

  const tank = lootForNpc({
    dsMax: 20,
    name: "Tanksuit",
    slug: "corporate-tanksuit",
  });
  assertEquals(tank.bityuan, 240);
  assertEquals(tank.ap, 10);
});

Deno.test("catalog loot override wins", OPTS, () => {
  const L = lootForNpc(
    { dsMax: 10, name: "Boss", slug: "x" },
    {
      slug: "x",
      name: "Boss",
      loot: { bityuan: 500, ap: 12 },
    } as never,
  );
  assertEquals(L.bityuan, 500);
  assertEquals(L.ap, 12);
});

Deno.test("applyKillLoot adds wallet and AP", OPTS, () => {
  const c = defaultChar("Goon");
  c.bityuan = 100;
  c.ap = 20;
  const next = applyKillLoot(c, {
    bityuan: 120,
    ap: 5,
    label: "Cop",
  });
  assertEquals(next.bityuan, 220);
  assertEquals(next.ap, 25);
  assertEquals(next.apTotal, 5);
  const line = formatLootLine({
    bityuan: 120,
    ap: 5,
    label: "Cop",
  });
  assertEquals(line, "LOOT +120 b¥ · +5 AP (Cop)");
});

Deno.test("horde wipe loot from sizeMax", OPTS, () => {
  const L = lootForHorde(8, "punks");
  // 8 * 8 = 64 b¥, 8 * 0.25 = 2 AP
  assertEquals(L.bityuan, 64);
  assertEquals(L.ap, 2);
});
