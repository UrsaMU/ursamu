/**
 * Tests for @emit command (src/commands/comms.ts — execEmit).
 *
 * Covers:
 *   [NOARG]   No message → usage error
 *   [NOTGT]   No target — emit to current room (builder+)
 *   [ADMIN]   Room-targeted form (@emit room=msg) requires admin+
 *   [L2]      Builder message containing '=' gets a helpful error, not bare "Permission denied."
 *   [ROOM]    Admin can target a named room
 *   [NOROOM]  Admin targets a non-existent room → not-found message
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execEmit } from "../src/commands/comms.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockRoom(overrides: Partial<IDBObj> = {}): IDBObj {
  return { id: "2", name: "Lobby", flags: new Set(["room"]), state: {}, location: "", contents: [], ...overrides };
}
function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return { id: "1", name: "Alice", flags: new Set(["player", "connected", "builder"]), state: {}, location: "2", contents: [], ...overrides };
}

function mockU(opts: { me?: Partial<IDBObj>; arg?: string; searchResults?: IDBObj[] } = {}) {
  const sent: string[] = [];
  const me   = mockPlayer(opts.me ?? {});
  const here = mockRoom();
  return Object.assign({
    me, here,
    cmd: { name: "emit", original: `@emit ${opts.arg ?? ""}`, args: [opts.arg ?? ""], switches: [] },
    send:      (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit:   () => Promise.resolve(true),
    db: {
      search:  () => Promise.resolve((opts.searchResults ?? []) as IDBObj[]),
      modify:  () => Promise.resolve(),
      create:  (d: unknown) => Promise.resolve(d as IDBObj),
      destroy: () => Promise.resolve(),
    },
    util: {
      target:      () => Promise.resolve(null),
      displayName: (o: IDBObj) => o.name ?? "",
      stripSubs:   (s: string) => s,
      center:      (s: string) => s,
      ljust:       (s: string, w: number) => s.padEnd(w),
      rjust:       (s: string, w: number) => s.padStart(w),
    },
    events: {
      emit:  () => Promise.resolve(),
      on:    () => Promise.resolve(""),
      off:   () => Promise.resolve(),
    },
    evalString: (s: string) => Promise.resolve(s),
  } as unknown as IUrsamuSDK, { _sent: sent });
}

Deno.test("[NOARG] @emit — no message → usage error", OPTS, async () => {
  const u = mockU({ arg: "" });
  await execEmit(u);
  assertStringIncludes(u._sent[0], "Usage");
});

Deno.test("[NOTGT] @emit — no '=' broadcasts to current room (builder+)", OPTS, async () => {
  const occ1 = mockPlayer({ id: "10", name: "Bob" });
  const occ2 = mockPlayer({ id: "11", name: "Eve" });
  const sentTo: Array<[string, string | undefined]> = [];
  const u = mockU({ arg: "Thunder rolls!", searchResults: [occ1, occ2] });
  u.send = (m: string, target?: string) => { sentTo.push([m, target]); };
  await execEmit(u);
  assertEquals(sentTo.filter(([, t]) => t === "10").length, 1);
  assertEquals(sentTo.filter(([, t]) => t === "11").length, 1);
});

Deno.test("[ADMIN] @emit <room>=<msg> — non-admin builder is rejected", OPTS, async () => {
  const u = mockU({ arg: "here=Hello world" });
  await execEmit(u);
  assertStringIncludes(u._sent[0], "Permission denied");
});

Deno.test("[L2] @emit — builder message containing '=' gets helpful error mentioning '=' syntax", OPTS, async () => {
  // Previously: bare "Permission denied." — user had no idea why.
  // Now: error mentions the '=' ambiguity and suggests @oemit.
  const u = mockU({ arg: "HP: 50=100" });
  await execEmit(u);
  assertStringIncludes(u._sent[0], "=",      "error must mention the '=' syntax");
  assertStringIncludes(u._sent[0], "@oemit", "error must suggest @oemit as alternative");
});

Deno.test("[ROOM] @emit <room>=<msg> — admin can target a named room", OPTS, async () => {
  const targetRoom = mockRoom({ id: "5", name: "Library" });
  const occ        = mockPlayer({ id: "10", name: "Bob" });
  const sentTo: Array<[string, string | undefined]> = [];
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    arg: "Library=Lights flicker.",
    searchResults: [targetRoom, occ],
  });
  // Override search so first call returns the room, second returns occupants
  let call = 0;
  u.db.search = () => { call++; return Promise.resolve(call === 1 ? [targetRoom] : [occ]); };
  u.send = (m: string, target?: string) => { sentTo.push([m, target]); };
  await execEmit(u);
  assertEquals(sentTo.filter(([, t]) => t === "10").length, 1);
});

Deno.test("[NOROOM] @emit <room>=<msg> — admin targets non-existent room → not-found", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    arg: "Narnia=Hello",
    searchResults: [],
  });
  await execEmit(u);
  assertStringIncludes(u._sent[0], "find");
});
