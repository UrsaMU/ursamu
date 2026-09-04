/**
 * startRoomFight must use the post-teleport room, not stale u.here.
 */
import { assertEquals, assert } from "@std/assert";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import {
  isHostileMob,
  startRoomFight,
} from "../src/combat/start-fight.ts";
import { roomIdOf } from "../src/combat/session.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import {
  initDndCombat,
  removeDndCombat,
  dndEncounterStore,
  dndEncounterDb,
} from "../src/combat/ports.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheetMonster() {
  const s = defaultSheet();
  s.class = "Monster";
  s.species = "NPC";
  s.hp = { max: 10, current: 10, temp: 0 };
  s.abilities.strength = 14;
  s.abilities.dexterity = 12;
  // deno-lint-ignore no-explicit-any
  (s as any).aiKey = "aggressive";
  return s;
}

function sheetPc() {
  const s = defaultSheet();
  s.class = "Fighter";
  s.hp = { max: 20, current: 20, temp: 0 };
  s.abilities.dexterity = 14;
  return s;
}

Deno.test("roomIdOf prefers me.location over here", OPTS, () => {
  const u = {
    me: { id: "p1", location: "entry-room" },
    here: { id: "old-town" },
  } as unknown as IUrsamuSDK;
  assertEquals(roomIdOf(u), "entry-room");
});

Deno.test("dndEncounterStore has create/save/findInRoom", OPTS, () => {
  assert(typeof dndEncounterStore.create === "function");
  assert(typeof dndEncounterStore.save === "function");
  assert(typeof dndEncounterStore.findInRoom === "function");
});

Deno.test(
  "startRoomFight with stale here still finds hostiles",
  OPTS,
  async () => {
    initDndCombat();
    const pc = {
      id: `p-sfr-${Date.now()}`,
      name: "Hero",
      flags: new Set(["player", "connected"]),
      location: "crypt-entry",
      contents: [],
      state: { name: "Hero", dnd: sheetPc() },
    } as unknown as IDBObj;
    const skel = {
      id: `n-sfr-${Date.now()}`,
      name: "Skeleton",
      flags: new Set(["thing", "npc"]),
      location: "crypt-entry",
      contents: [],
      state: { name: "Skeleton", dnd: sheetMonster() },
    } as unknown as IDBObj;
    assert(isHostileMob(skel));

    const objs = [pc, skel];
    const msgs: string[] = [];
    const u = {
      me: pc,
      // Stale room — player was teleported but here not refreshed
      here: {
        id: "havenbrook",
        broadcast: (m: string) => msgs.push(m),
      },
      send: (m: string) => msgs.push(m),
      broadcast: (m: string) => msgs.push(m),
      util: {
        displayName: (o: IDBObj) => o.name || "?",
        ljust: (s: string, w: number) => s.padEnd(w),
      },
      db: {
        search: async (q: Record<string, unknown>) => {
          if (q.id) {
            return objs.filter((o) => o.id === String(q.id));
          }
          if (q.location) {
            return objs.filter(
              (o) => o.location === String(q.location),
            );
          }
          return objs;
        },
        modify: async () => {},
      },
    } as unknown as IUrsamuSDK;

    const r = await startRoomFight(u, { roomId: "crypt-entry" });
    assertEquals(r.ok, true, r.message ?? "no message");
    assertEquals(r.hostileCount, 1);

    // Cleanup encounter docs if DBO backed
    try {
      const enc = await dndEncounterStore.findInRoom?.(
        "crypt-entry",
      );
      if (enc) {
        await dndEncounterStore.save({
          ...enc,
          status: "resolved",
        });
      }
    } catch {
      /* ignore */
    }

    removeDndCombat();
  },
);

// Close DBO if open (last test in file)
Deno.test("cleanup dnd encounters dbo", OPTS, async () => {
  try {
    await DBOClose();
  } catch {
    /* ok */
  }
});

async function DBOClose() {
  const { DBO } = await import("@ursamu/mush");
  await DBO.close?.();
}
