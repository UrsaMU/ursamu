/**
 * When the only PC drops, walker resolves instead of spinning.
 */
import { assertEquals, assert } from "@std/assert";
import {
  beginEncounter,
  joinEncounter,
  startEncounter,
  advanceTurnSmart,
} from "@ursamu/combat";
import {
  dndEncounterStore,
  initDndCombat,
  makeDndPorts,
  removeDndCombat,
} from "../src/combat/ports.ts";
import { defaultSheet } from "../src/stats/dnd_sheet.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type Obj = IDBObj & { state: Record<string, unknown> };

function world() {
  const map = new Map<string, Obj>();
  const put = (
    id: string,
    name: string,
    kind: "pc" | "npc",
    hp: number,
  ) => {
    const sheet = defaultSheet();
    sheet.hp = { max: hp, current: hp, temp: 0 };
    sheet.ac = 10;
    if (kind === "npc") {
      sheet.class = "Monster";
      // deno-lint-ignore no-explicit-any
      (sheet as any).aiKey = "aggressive";
    }
    sheet.abilities.strength = 16;
    sheet.abilities.dexterity = 14;
    const o = {
      id,
      name,
      flags: new Set(
        kind === "npc"
          ? ["npc", "thing"]
          : ["player", "connected"],
      ),
      location: "r1",
      contents: [],
      state: { name, dnd: sheet },
    } as Obj;
    map.set(id, o);
    return o;
  };
  return {
    map,
    put,
    db: {
      search: (q: Record<string, unknown>) => {
        if (q.id) {
          const o = map.get(String(q.id));
          return Promise.resolve(o ? [o] : []);
        }
        return Promise.resolve([...map.values()]);
      },
      modify: (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        const o = map.get(id);
        if (!o) return Promise.resolve();
        if (data["data.dnd"]) {
          o.state = { ...o.state, dnd: data["data.dnd"] };
        }
        return Promise.resolve();
      },
    },
  };
}

Deno.test("walker ends when PC is out", OPTS, async () => {
  removeDndCombat();
  initDndCombat();
  const w = world();
  w.put("pc1", "Hero", "pc", 1); // 1 HP — one hit drops
  w.put("n1", "Wolf", "npc", 30);
  const msgs: string[] = [];
  const u = {
    me: w.map.get("pc1")!,
    here: {
      id: "r1",
      broadcast: (m: string) => msgs.push(m),
    },
    send: (m: string) => msgs.push(m),
    broadcast: (m: string) => msgs.push(m),
    db: w.db,
    util: {
      displayName: (o: IDBObj) => o.name || "?",
      ljust: (s: string, n: number) => s.padEnd(n),
    },
  } as unknown as IUrsamuSDK;

  const ports = makeDndPorts(u);
  let enc = await startEncounter("r1", {
    store: dndEncounterStore,
  });
  await joinEncounter(enc.id, {
    actorId: "n1",
    name: "Wolf",
    kind: "npc",
  }, { store: dndEncounterStore, ports });
  await joinEncounter(enc.id, {
    actorId: "pc1",
    name: "Hero",
    kind: "pc",
    isOut: true, // already down
  }, { store: dndEncounterStore, ports });
  enc = (await beginEncounter(enc.id, {
    store: dndEncounterStore,
    ports,
  }))!;
  // Force NPC first
  const nIdx = enc.participants.findIndex((p) => p.actorId === "n1");
  enc = {
    ...enc,
    turnIdx: nIdx,
    participants: enc.participants.map((p) =>
      p.actorId === "pc1" ? { ...p, isOut: true } : p
    ),
  };
  await dndEncounterStore.save(enc);

  const out = await advanceTurnSmart(enc.id, {
    ports,
    store: dndEncounterStore,
  });
  assert(out);
  assertEquals(out!.status, "resolved");
  assert(
    msgs.some((m) => /party falls|Encounter resolved|defeated/i.test(m)),
    `expected end message, got: ${msgs.slice(-5).join(" | ")}`,
  );
  removeDndCombat();
});
