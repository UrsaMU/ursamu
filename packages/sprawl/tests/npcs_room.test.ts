import { assert, assertEquals } from "@std/assert";
import {
  bodyBaseName,
  bodyStackKey,
  catalogNpc,
  formatNpcDescription,
  formatNpcLook,
  formatNpcShortDesc,
  isSprawlNpc,
  npcData,
  resolveNpcInRoom,
  type SprawlNpcData,
} from "../engine/npcs.ts";
import { ammoSpecialty } from "../engine/specialty-combat.ts";
import { ANTAGONISTS } from "../engine/catalog.ts";
import type { IDBObj } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeNpc(
  slug: string,
  name: string,
  ds: number,
  id = "n1",
  extra: Partial<SprawlNpcData> = {},
): IDBObj {
  return {
    id,
    name,
    flags: new Set(["thing", "npc"]),
    location: "room1",
    contents: [],
    state: {
      sprawl_npc: {
        slug,
        name,
        ds,
        dsMax: ds,
        dead: false,
        at: 1,
        ...extra,
      },
    },
  } as unknown as IDBObj;
}

Deno.test("catalogNpc finds antagonists", OPTS, () => {
  const row = catalogNpc("sprawl-cop");
  assert(row);
  assertEquals(row!.slug, "sprawl-cop");
  assert(typeof row!.ds === "number");
});

Deno.test("resolveNpcInRoom by slug and name", OPTS, () => {
  const a = fakeNpc("sprawl-cop", "Sprawl Cop", 10, "1");
  const b = fakeNpc("eswat", "ESWAT", 14, "2");
  const room = [a, b];
  assertEquals(resolveNpcInRoom(room, "eswat")?.id, "2");
  assertEquals(resolveNpcInRoom(room, "cop")?.id, "1");
  assertEquals(resolveNpcInRoom(room, "#2")?.id, "2");
});

Deno.test("isSprawlNpc and formatNpcLook", OPTS, () => {
  const o = fakeNpc("gang-member", "Gang Member", 10, "n1", {
    shortDesc: "Mohawk, chrome, and attitude.",
  });
  assert(isSprawlNpc(o));
  const d = npcData(o)!;
  assertEquals(d.ds, 10);
  const text = formatNpcLook(o);
  assert(text.includes("Gang Member"));
  assert(text.includes("DS 10"));
  assert(text.includes("+attack"));
});

Deno.test("formatNpcShortDesc includes live DS", OPTS, () => {
  const live = formatNpcShortDesc({
    slug: "sprawl-cop",
    name: "Sprawl Cop",
    ds: 7,
    dsMax: 10,
    shortDesc: "Badge, IR visor, baton ready.",
    at: 1,
  });
  assertEquals(
    live,
    "DS7/10 · Badge, IR visor, baton ready.",
  );
  const dead = formatNpcShortDesc({
    slug: "sprawl-cop",
    name: "Sprawl Cop",
    ds: 0,
    dsMax: 10,
    shortDesc: "Badge, IR visor, baton ready.",
    dead: true,
    at: 1,
  });
  assert(dead.startsWith("DS0/10 DOWN"));
});

Deno.test("body stack key ignores numbered suffixes", OPTS, () => {
  assertEquals(bodyBaseName("Goon 1"), "Goon");
  assertEquals(bodyBaseName("Goon #2"), "Goon");
  const a = bodyStackKey({
    slug: "gang-member",
    name: "Goon 1",
    ds: 0,
    dsMax: 10,
    at: 1,
  });
  const b = bodyStackKey({
    slug: "gang-member",
    name: "Goon 3",
    ds: 0,
    dsMax: 10,
    at: 1,
  });
  assertEquals(a, b);
});

Deno.test("stacked corpses format as pile", OPTS, () => {
  const d: SprawlNpcData = {
    slug: "gang-member",
    name: "Goon",
    ds: 0,
    dsMax: 10,
    dead: true,
    stack: 4,
    at: 1,
  };
  const short = formatNpcShortDesc(d);
  assert(short.includes("4×"));
  assert(short.includes("dead Goon"));
  const long = formatNpcDescription(d);
  assert(long.includes("pile of 4"));
});

Deno.test("all antagonist templates have short-desc", OPTS, () => {
  for (const a of ANTAGONISTS) {
    const sd = (a as Record<string, unknown>)["short-desc"];
    assert(
      typeof sd === "string" && String(sd).trim().length > 0,
      `${a.slug} missing short-desc`,
    );
  }
});

Deno.test("dead NPC still resolves by slug", OPTS, () => {
  const o = fakeNpc("eswat", "ESWAT", 0, "9");
  const d = npcData(o)!;
  d.dead = true;
  d.ds = 0;
  (o.state as { sprawl_npc: typeof d }).sprawl_npc = d;
  const hit = resolveNpcInRoom([o], "eswat");
  assertEquals(hit?.id, "9");
});

Deno.test("attack prefers live over dead same name", OPTS, () => {
  const dead = fakeNpc("gang-member", "dead Goon (×2)", 0, "d1", {
    name: "Goon",
    dead: true,
    stack: 2,
  });
  const live1 = fakeNpc("gang-member", "Goon 1", 10, "l1", {
    name: "Goon 1",
  });
  const live2 = fakeNpc("gang-member", "Goon 2", 10, "l2", {
    name: "Goon 2",
  });
  // Dead listed first (as contents often are)
  const room = [dead, live1, live2];
  const hit = resolveNpcInRoom(room, "goon");
  assertEquals(hit?.id, "l1");
  const bySlug = resolveNpcInRoom(room, "gang-member");
  assertEquals(bySlug?.id, "l1");
  // Only corpses left → may target dead pile
  const onlyDead = resolveNpcInRoom([dead], "goon");
  assertEquals(onlyDead?.id, "d1");
});
