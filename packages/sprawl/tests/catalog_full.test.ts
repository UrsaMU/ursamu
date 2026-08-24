import { assertEquals, assert } from "@std/assert";
import {
  AMMO,
  ANTAGONISTS,
  ARMOR,
  AUGS,
  BACKGROUNDS,
  BELONGINGS,
  COMPANY_DATA,
  CONSOLES,
  DRONES,
  FIREARMS,
  FLOW_DISTRICTS,
  FLOW_LOCATIONS,
  HEAVY,
  LEXICON,
  MARKET,
  MELEE,
  NARCOTICS,
  NET_AI,
  NET_EXPLOITS,
  NODEJACKER_HW,
  PARADOXWARE,
  QUIRKS,
  SHARDS,
  SHOWROOM,
  SOFTWARE,
  SYSTEM_RESPONSES,
  WEAPON_MODS,
  find,
} from "../engine/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("full book table sizes", OPTS, () => {
  assertEquals(BACKGROUNDS.length, 32);
  assertEquals(BELONGINGS.length, 36);
  assertEquals(QUIRKS.length, 11);
  assertEquals(FIREARMS.length, 13);
  assertEquals(MELEE.length, 11);
  assertEquals(ARMOR.length, 11);
  assertEquals(HEAVY.length, 11);
  assertEquals(AMMO.length, 12);
  assertEquals(WEAPON_MODS.length, 11);
  assertEquals(DRONES.length, 11);
  assert(AUGS.length >= 45);
  assertEquals(SHARDS.length, 11);
  assertEquals(NARCOTICS.length, 11);
  assert(SOFTWARE.length >= 36);
  assertEquals(CONSOLES.length, 12);
  assertEquals(SYSTEM_RESPONSES.length, 36);
  assertEquals(NET_EXPLOITS.length, 36);
  assertEquals(COMPANY_DATA.length, 36);
  assertEquals(NET_AI.length, 5);
  assertEquals(PARADOXWARE.length, 14);
  assertEquals(NODEJACKER_HW.length, 13);
  assertEquals(ANTAGONISTS.length, 28);
  assertEquals(FLOW_LOCATIONS.length, 80);
  assert(FLOW_DISTRICTS.length >= 16);
  assert(SHOWROOM.length >= 20);
  assert(MARKET.length >= 100);
  assert(LEXICON.length >= 20);
});

Deno.test("priced gear has costs", OPTS, () => {
  for (const g of [...FIREARMS, ...MELEE, ...HEAVY, ...ARMOR]) {
    assert(
      typeof g.cost === "number" && (g.cost as number) > 0,
      `${g.slug} missing cost`,
    );
  }
});

Deno.test("augments have blurbs", OPTS, () => {
  const neo = find("aug", "neurochem");
  assert(neo);
  assert(String(neo.blurb).length > 5);
  const shell = find("aug", "cybershell");
  assertEquals(shell?.mod, 2);
});

Deno.test("npc roster includes tanksuit DS20", OPTS, () => {
  const t = find("antagonist", "corporate-tanksuit");
  assertEquals(t?.ds, 20);
});

Deno.test("showroom BMW exists", OPTS, () => {
  const b = find("showroom", "bmw-r21");
  assert(b);
  assertEquals(b.ds, 8);
  assertEquals(b.cost, 10000);
});

Deno.test("narcotic addiction DS present", OPTS, () => {
  const h = find("narcotic", "hyperdex");
  assertEquals(h?.addictionDs, 12);
  const rr = find("narcotic", "red-rapture");
  assertEquals(rr?.addictionDs, 20);
});

Deno.test("nodejacker console has RAM/slots/firewall", OPTS, () => {
  const h = find("console", "hyperion");
  assertEquals(h?.ram, 3);
  assertEquals(h?.slots, 6);
  assertEquals(h?.firewall, 14);
  assertEquals(h?.cost, 3000);
  const g = find("console", "gestalt");
  assertEquals(g?.slots, "cognition");
  assertEquals(g?.ram, 4);
});

Deno.test("nodejacker d66 response 11 is Log-Off", OPTS, () => {
  const r = SYSTEM_RESPONSES.find((x) => x.roll === "11");
  assertEquals(r?.slug, "log-off");
  const ice = find("systemResponse", "ice-ii");
  assertEquals(ice?.forceGlitch, true);
});

Deno.test("nodejacker software includes Demon IV", OPTS, () => {
  const d = find("software", "demon-iv");
  assertEquals(d?.packSize, 5);
  assertEquals(d?.cost, 2000);
});
