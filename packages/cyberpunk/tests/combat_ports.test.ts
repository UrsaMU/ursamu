/**
 * CPR combat ports — initiative, attack, incap.
 */
import { assertEquals, assertExists } from "@std/assert";
import {
  actorToView,
  createCprEncounter,
  cprEncounterStore,
  initCprCombat,
  makeCprPorts,
  removeCprCombat,
} from "../src/combat/ports.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type { ICPRNpc } from "../db/schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockActor(
  id: string,
  name: string,
  opts: {
    cpr?: ReturnType<typeof buildNewCharacter>;
    npc?: ICPRNpc;
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
    location: "room1",
    contents: [],
  } as unknown as IDBObj;
}

function mockU(actors: Map<string, IDBObj>) {
  const sent: string[] = [];
  return {
    me: actors.values().next().value,
    here: {
      id: "room1",
      broadcast: (m: string) => sent.push(m),
    },
    send: (m: string) => sent.push(m),
    broadcast: (m: string) => sent.push(m),
    db: {
      search: async (q: { id: string }) => {
        const a = actors.get(q.id);
        return a ? [a] : [];
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
    _sent: sent,
  } as unknown as IUrsamuSDK & { _sent: string[] };
}

Deno.test("actorToView maps CPR HP and role tags", OPTS, () => {
  const cpr = buildNewCharacter("solo");
  cpr.chargenComplete = true;
  cpr.hp.current = 5;
  const a = mockActor("p1", "V", { cpr });
  const view = actorToView(a);
  assertEquals(view.kind, "pc");
  assertEquals(view.healthFrac < 1, true);
  assertEquals(view.tags?.some((t) => t.startsWith("role:")), true);
});

Deno.test("rollInitiative uses REF + d10", OPTS, async () => {
  initCprCombat();
  try {
    const cpr = buildNewCharacter("solo");
    cpr.stats.ref = 8;
    const a = mockActor("p1", "V", { cpr });
    const actors = new Map([["p1", a]]);
    const u = mockU(actors);
    const ports = makeCprPorts(u);
    assertExists(ports.rollInitiative);
    const init = await ports.rollInitiative!("p1");
    // REF 8 + d10 with crit explode / fumble (can go negative)
    assertEquals(typeof init, "number");
    assertEquals(Number.isFinite(init), true);
    assertEquals(init <= 28, true);
  } finally {
    removeCprCombat();
  }
});

Deno.test("executeAction attack deals damage", OPTS, async () => {
  initCprCombat();
  try {
    const atk = buildNewCharacter("solo");
    atk.chargenComplete = true;
    atk.stats.ref = 8;
    atk.skills = { ...atk.skills, handgun: 6 };
    const def = buildNewCharacter("fixer");
    def.chargenComplete = true;
    def.hp = { max: 20, current: 20 };
    def.stats.dex = 2;
    def.skills = { ...def.skills, evasion: 0 };

    const a1 = mockActor("p1", "Attacker", { cpr: atk });
    const a2 = mockActor("p2", "Target", { cpr: def });
    const actors = new Map([
      ["p1", a1],
      ["p2", a2],
    ]);
    const u = mockU(actors);
    const ports = makeCprPorts(u);

    const enc = await createCprEncounter("room1");
    await cprEncounterStore.save({
      ...enc,
      status: "active",
      participants: [
        {
          actorId: "p1",
          name: "Attacker",
          initiative: 15,
          appliedDefense: 0,
          isDodging: false,
          isOut: false,
          kind: "pc",
        },
        {
          actorId: "p2",
          name: "Target",
          initiative: 10,
          appliedDefense: 0,
          isDodging: false,
          isOut: false,
          kind: "pc",
        },
      ],
    });
    const live = await cprEncounterStore.get(enc.id);
    assertExists(live);

    // Force many attempts until hit or give up
    let hit = false;
    for (let i = 0; i < 20; i++) {
      const r = await ports.executeAction(
        "p1",
        { type: "attack", targetId: "p2" },
        {
          encounter: live!,
          actor: actorToView(a1),
          participant: live!.participants[0],
        },
      );
      if (r.ok && (r.damageApplied ?? 0) > 0) {
        hit = true;
        break;
      }
    }
    // With REF 8 + skill 6 vs low DV, should hit eventually
    assertEquals(hit, true);
  } finally {
    removeCprCombat();
  }
});
