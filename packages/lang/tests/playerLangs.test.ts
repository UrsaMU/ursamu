import { assertEquals } from "@std/assert";
import {
  clampSkill,
  getPlayerLangs,
  setActive,
  setSkill,
  skillIn,
} from "../src/playerLangs.ts";
import { mockU } from "./helpers/mockU.ts";

Deno.test("clampSkill — clamps to 0..100 and floors", () => {
  assertEquals(clampSkill(-5), 0);
  assertEquals(clampSkill(150), 100);
  assertEquals(clampSkill(33.7), 33);
  assertEquals(clampSkill(NaN), 0);
});

Deno.test("getPlayerLangs — empty state yields empty known map", () => {
  const u = mockU();
  assertEquals(getPlayerLangs(u.me).known, {});
});

Deno.test("skillIn — returns 0 for unknown language", () => {
  const u = mockU();
  assertEquals(skillIn(u.me, "klingon"), 0);
});

Deno.test("setSkill — writes via u.db.modify with $set on language sub-path", async () => {
  const u = mockU();
  await setSkill(u, u.me, "Shyriiwook", 75);
  const calls = (u as unknown as { _dbCalls: unknown[][] })._dbCalls;
  assertEquals(calls.length, 1);
  const [id, op, payload] = calls[0] as [string, string, Record<string, unknown>];
  assertEquals(id, u.me.id);
  assertEquals(op, "$set");
  assertEquals(payload["data.languages.known.shyriiwook"], 75);
  assertEquals(skillIn(u.me, "shyriiwook"), 75);
});

Deno.test("getPlayerLangs — ignores non-numeric and out-of-range entries safely", () => {
  const u = mockU({
    me: {
      id: "1",
      flags: new Set(["player", "connected"]),
      state: {
        languages: {
          known: { goodlang: 50, badstr: "100", badnan: NaN, badinf: Infinity, neg: -10, over: 9999 },
          active: 42,
        },
      },
    },
  });
  const langs = getPlayerLangs(u.me);
  assertEquals(langs.known.goodlang, 50);
  assertEquals(langs.known.badstr, undefined);
  assertEquals(langs.known.badnan, undefined);
  assertEquals(langs.known.badinf, undefined);
  assertEquals(langs.known.neg, 0);
  assertEquals(langs.known.over, 100);
  assertEquals(langs.active, undefined);
});

Deno.test("setActive — sets and clears", async () => {
  const u = mockU();
  await setSkill(u, u.me, "huttese", 40);
  await setActive(u, u.me, "Huttese");
  assertEquals(getPlayerLangs(u.me).active, "huttese");
  await setActive(u, u.me, null);
  assertEquals(getPlayerLangs(u.me).active, undefined);
});
