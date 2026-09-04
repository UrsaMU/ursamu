/**
 * +npc spawn shape + walker advances NPC turns.
 */
import { assertEquals, assert } from "@std/assert";
import { buildNpc } from "../engine/npc.ts";
import { getNpcTemplate } from "../data/npcs.ts";
import { actorToView, kindOfActor } from
  "../src/combat/ports.ts";
import {
  createCprEncounter,
  cprEncounterStore,
  initCprCombat,
  makeCprPorts,
  removeCprCombat,
} from "../src/combat/ports.ts";
import { advanceTurnSmart } from "../src/combat/walker.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockActor(
  id: string,
  name: string,
  opts: {
    cpr?: ReturnType<typeof buildNewCharacter>;
    npc?: ReturnType<typeof buildNpc>;
    flags?: string[];
  } = {},
): IDBObj {
  const state: Record<string, unknown> = {};
  if (opts.cpr) state.cpr = opts.cpr;
  if (opts.npc) state.cprNpc = opts.npc;
  return {
    id,
    name,
    flags: new Set(opts.flags ?? ["player", "connected"]),
    state,
    location: "room_npc",
    contents: [],
  } as unknown as IDBObj;
}

function mockU(actors: Map<string, IDBObj>) {
  const sent: string[] = [];
  return {
    me: actors.get("pc1"),
    here: {
      id: "room_npc",
      broadcast: (m: string) => sent.push(m),
    },
    send: (m: string) => sent.push(m),
    broadcast: (m: string) => sent.push(m),
    db: {
      search: async (q: { id?: string; location?: string }) => {
        if (q.id) {
          const a = actors.get(q.id);
          return a ? [a] : [];
        }
        if (q.location) {
          return [...actors.values()].filter(
            (a) => a.location === q.location,
          );
        }
        return [];
      },
      modify: async (
        id: string,
        _op: string,
        data: Record<string, unknown>,
      ) => {
        const a = actors.get(id);
        if (!a) return;
        if (data["state.cpr"]) {
          // deno-lint-ignore no-explicit-any
          (a.state as any).cpr = data["state.cpr"];
        }
        if (data["state.cprNpc"]) {
          // deno-lint-ignore no-explicit-any
          (a.state as any).cprNpc = data["state.cprNpc"];
        }
      },
    },
    util: {
      displayName: (o: IDBObj) => o.name ?? "?",
    },
    _sent: sent,
  } as unknown as IUrsamuSDK & { _sent: string[] };
}

Deno.test("buildNpc defaults aiKey aggressive", OPTS, () => {
  const tpl = getNpcTemplate("boosterganger");
  assert(tpl);
  const n = buildNpc(tpl!, "staff1", "Razor");
  assertEquals(n.aiKey, "aggressive");
  assertEquals(n.displayName, "Razor");
  assertEquals(n.archetype, "boosterganger");
});

Deno.test("actorToView NPC uses aiKey", OPTS, () => {
  const tpl = getNpcTemplate("boosterganger")!;
  const n = buildNpc(tpl, "s", "Booster", "aggressive");
  const a = mockActor("n1", "Booster", {
    npc: n,
    flags: ["npc", "thing"],
  });
  assertEquals(kindOfActor(a), "npc");
  const v = actorToView(a);
  assertEquals(v.kind, "npc");
  assertEquals(v.aiKey, "aggressive");
});

Deno.test("walker: NPC acts then halts on PC", OPTS, async () => {
  initCprCombat();
  try {
    const pc = buildNewCharacter("solo");
    pc.chargenComplete = true;
    pc.stats.ref = 5;
    pc.hp = { max: 40, current: 40 };
    pc.skills = { ...pc.skills, evasion: 2, handgun: 4 };

    const tpl = getNpcTemplate("boosterganger")!;
    const npc = buildNpc(tpl, "s", "Razor", "aggressive");
    // Soft target so AI can land
    pc.stats.dex = 2;
    pc.skills.evasion = 0;
    pc.armorBody = null;

    const aPc = mockActor("pc1", "V", { cpr: pc });
    const aNpc = mockActor("npc1", "Razor", {
      npc,
      flags: ["npc", "thing"],
    });
    const actors = new Map([
      ["pc1", aPc],
      ["npc1", aNpc],
    ]);
    const u = mockU(actors);

    const enc = await createCprEncounter("room_npc");
    await cprEncounterStore.save({
      ...enc,
      status: "active",
      round: 0,
      turnIdx: 0,
      participants: [
        {
          actorId: "npc1",
          name: "Razor",
          initiative: 20,
          appliedDefense: 0,
          isDodging: false,
          isOut: false,
          kind: "npc",
        },
        {
          actorId: "pc1",
          name: "V",
          initiative: 5,
          appliedDefense: 0,
          isDodging: false,
          isOut: false,
          kind: "pc",
        },
      ],
    });

    const after = await advanceTurnSmart(enc.id, u);
    assert(after, "walker returned encounter");
    // Should halt on PC turn
    const cur = after!.participants[after!.turnIdx];
    assertEquals(cur.kind, "pc");
    // NPC should have attempted something (broadcast or damage)
    const hp = (aPc.state as { cpr: { hp: { current: number } } })
      .cpr.hp.current;
    // Either hit or miss is fine — AI ran without hanging
    assert(hp <= 40, "PC HP tracked");
    assert(
      u._sent.length > 0 || hp < 40,
      "walker produced output or damage",
    );
  } finally {
    removeCprCombat();
  }
});
