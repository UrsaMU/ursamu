/**
 * tests/scripts_listen.test.ts
 *
 * Tests for @listen / @ahear NPC reaction system wired into execSay.
 *
 * Verifies that when a player says something in a room, any object in that
 * room with a matching LISTEN attribute has its AHEAR attribute triggered.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execSay } from "../src/commands/comms.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ROOM_ID  = "sl_room1";
const ACTOR_ID = "sl_actor1";
const NPC_ID   = "sl_npc1";

type TriggerCall = { id: string; attr: string; args: string[] };

function makeU(opts: {
  msg?: string;
  roomContents?: IDBObj[];
} = {}) {
  const broadcasts: string[] = [];
  const triggers: TriggerCall[] = [];
  const me: IDBObj = {
    id: ACTOR_ID, name: "Speaker",
    flags: new Set(["player", "connected"]),
    state: { name: "Speaker" },
    location: ROOM_ID, contents: [],
  };
  const here = {
    id: ROOM_ID, name: "Test Room",
    flags: new Set(["room"]),
    state: {}, location: "", contents: [] as IDBObj[],
    broadcast: (m: string) => broadcasts.push(m),
  };

  return Object.assign({
    me, here,
    cmd: {
      name: "say",
      original: `say ${opts.msg ?? ""}`,
      args: [opts.msg ?? ""],
      switches: [],
    },
    send: () => {},
    broadcast: () => {},
    canEdit: () => Promise.resolve(true),
    db: {
      search: (_q: unknown) => Promise.resolve(opts.roomContents ?? [] as IDBObj[]),
      modify: () => Promise.resolve(),
      create: (d: unknown) => Promise.resolve(d as IDBObj),
      destroy: () => Promise.resolve(),
    },
    util: {
      target:      () => Promise.resolve(null),
      displayName: (o: IDBObj) => (o.state?.name as string) || o.name || "Unknown",
      stripSubs:   (s: string) => s,
      center:      (s: string) => s,
    },
    evalString: (s: string) => Promise.resolve(s),
    events: {
      emit: () => Promise.resolve(),
      on:   () => Promise.resolve(""),
      off:  () => Promise.resolve(),
    },
    trigger: async (id: string, attr: string, args: string[]) => {
      triggers.push({ id, attr, args });
    },
  } as unknown as IUrsamuSDK, { _broadcasts: broadcasts, _triggers: triggers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test(
  "say — no LISTEN objects in room means no triggers fired",
  OPTS,
  async () => {
    const u = makeU({ msg: "hello world", roomContents: [] });
    await execSay(u);

    assertEquals(u._triggers.length, 0);
    assertStringIncludes(u._broadcasts.join(" "), "hello world");
  }
);

Deno.test(
  "say — NPC with matching LISTEN pattern fires AHEAR trigger",
  OPTS,
  async () => {
    const npc: IDBObj = {
      id: NPC_ID, name: "Guard",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "hello", setter: "god", type: "attribute" },
          { name: "AHEAR",  value: "u.send('Guard stirs.');", setter: "god", type: "attribute" },
        ],
      },
      location: ROOM_ID, contents: [],
    };
    const u = makeU({ msg: "hello world", roomContents: [npc] });
    await execSay(u);

    assertEquals(u._triggers.length, 1);
    assertEquals(u._triggers[0].id, NPC_ID);
    assertEquals(u._triggers[0].attr, "AHEAR");
    assertStringIncludes(u._triggers[0].args[0], "hello world");
  }
);

Deno.test(
  "say — NPC with non-matching LISTEN pattern does not fire AHEAR",
  OPTS,
  async () => {
    const npc: IDBObj = {
      id: NPC_ID, name: "Guard",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "goodbye", setter: "god", type: "attribute" },
        ],
      },
      location: ROOM_ID, contents: [],
    };
    const u = makeU({ msg: "hello world", roomContents: [npc] });
    await execSay(u);

    assertEquals(u._triggers.length, 0);
  }
);

Deno.test(
  "say — LISTEN wildcard '*' matches any message",
  OPTS,
  async () => {
    const npc: IDBObj = {
      id: NPC_ID, name: "Echo",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "*", setter: "god", type: "attribute" },
          { name: "AHEAR",  value: "u.send('Echo hears you.');", setter: "god", type: "attribute" },
        ],
      },
      location: ROOM_ID, contents: [],
    };
    const u = makeU({ msg: "anything at all", roomContents: [npc] });
    await execSay(u);

    assertEquals(u._triggers.length, 1);
    assertEquals(u._triggers[0].id, NPC_ID);
    assertEquals(u._triggers[0].attr, "AHEAR");
  }
);

Deno.test(
  "say — speaker is not triggered even if they match their own LISTEN",
  OPTS,
  async () => {
    // Speaker has a LISTEN attribute on themselves — should be skipped (obj.id === actor.id check)
    const speaker: IDBObj = {
      id: ACTOR_ID, name: "Speaker",
      flags: new Set(["player", "connected"]),
      state: {
        name: "Speaker",
        attributes: [
          { name: "LISTEN", value: "*", setter: "god", type: "attribute" },
        ],
      },
      location: ROOM_ID, contents: [],
    };
    const u = makeU({ msg: "self-referential", roomContents: [speaker] });
    await execSay(u);

    assertEquals(u._triggers.length, 0);
  }
);

// ---------------------------------------------------------------------------
// Security: C1 — oversized message must be truncated before AHEAR trigger
// ---------------------------------------------------------------------------

Deno.test(
  "C1 — oversized say message is truncated before being passed to AHEAR trigger",
  OPTS,
  async () => {
    const hugMsg = "A".repeat(10_000);
    const npc: IDBObj = {
      id: NPC_ID, name: "Guard",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: "*", setter: "god", type: "attribute" },
          { name: "AHEAR",  value: "u.send('ok');", setter: "god", type: "attribute" },
        ],
      },
      location: ROOM_ID, contents: [],
    };
    const u = makeU({ msg: hugMsg, roomContents: [npc] });
    await execSay(u);

    assertEquals(u._triggers.length, 1);
    if (u._triggers[0].args[0].length > 2000) {
      throw new Error(
        `C1 EXPLOIT: AHEAR received ${u._triggers[0].args[0].length}-char message (> 2000); no truncation in place`
      );
    }
  }
);

Deno.test(
  "C1 — oversized LISTEN pattern is skipped even if inner substring matches",
  OPTS,
  async () => {
    const hugePattern = "hello" + " ".repeat(9_995);
    const npc: IDBObj = {
      id: NPC_ID, name: "Bot",
      flags: new Set(["thing"]),
      state: {
        attributes: [
          { name: "LISTEN", value: hugePattern, setter: "god", type: "attribute" },
        ],
      },
      location: ROOM_ID, contents: [],
    };
    const u = makeU({ msg: "hello world", roomContents: [npc] });
    await execSay(u);

    if (u._triggers.length > 0) {
      throw new Error("C1 EXPLOIT: oversized LISTEN pattern was not rejected; DoS vector open");
    }
  }
);
