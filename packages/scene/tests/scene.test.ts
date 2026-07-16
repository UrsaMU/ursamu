import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { scenes } from "../src/db.ts";
import "../src/commands.ts"; // register commands
import { cmds } from "@ursamu/mush";

interface IDBObj {
  id: string;
  name: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  location?: string;
  contents: string[];
}

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "1",
    name: "TestPlayer",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "2",
    contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  targetResult?: any;
  canEditResult?: boolean;
} = {}) {
  const sent: string[] = [];
  const teleports: string[][] = [];
  const modifies: any[] = [];
  const creates: any[] = [];
  const destroys: string[] = [];

  return Object.assign({
    me: mockPlayer(opts.me ?? {}),
    here: { ...mockPlayer({ id: "2", name: "Room", flags: new Set(["room"]) }), broadcast: () => {} },
    cmd: { name: "", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string) => { sent.push(m); },
    broadcast: () => {},
    teleport: (target: string, dest: string) => { teleports.push([target, dest]); },
    canEdit: () => Promise.resolve(opts.canEditResult ?? true),
    db: {
      modify: (id: string, op: string, data: any) => {
        modifies.push({ id, op, data });
        return Promise.resolve();
      },
      search: () => Promise.resolve([]),
      create: (d: any) => {
        creates.push(d);
        return Promise.resolve({ ...d, id: "instanced_room_1", flags: new Set(d.flags || []), contents: [] });
      },
      destroy: (id: string) => {
        destroys.push(id);
        return Promise.resolve();
      },
    },
    util: {
      target: () => Promise.resolve(opts.targetResult ?? null),
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    evalString: (s: string) => Promise.resolve(s),
  }, { _sent: sent, _teleports: teleports, _modifies: modifies, _creates: creates, _destroys: destroys });
}

describe("Scene Plugin - Commands", () => {
  it("shows invalid switch message for unknown switch", async () => {
    const u = mockU({ args: ["badswitch", "arg"] });
    const cmd = cmds.find(c => c.name === "+scene");
    if (!cmd) throw new Error("+scene command not found");

    await cmd.exec(u as any);
    assertEquals(u._sent.length, 1);
    assertStringIncludes(u._sent[0], "Invalid +scene switch");
  });

  it("starts a scene successfully", async () => {
    const u = mockU({ args: ["start", "My Scene/A test scene description"] });
    const cmd = cmds.find(c => c.name === "+scene");
    if (!cmd) throw new Error("+scene command not found");

    await cmd.exec(u as any);
    // Should create instanced room
    assertEquals(u._creates.length, 1);
    assertEquals(u._creates[0].flags.has("room"), true);
    
    // Should teleport creator to instanced room
    assertEquals(u._teleports.length, 1);
    assertEquals(u._teleports[0][0], "1");
    assertEquals(u._teleports[0][1], "instanced_room_1");

    // Success message sent
    assertEquals(u._sent.length, 1);
    assertStringIncludes(u._sent[0], "Scene #1 started");
  });
});
