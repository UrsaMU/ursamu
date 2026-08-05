/**
 * @pcreate + global/@set *Name targeting.
 */
import { assertEquals, assertExists } from "@std/assert";
import {
  addCmd,
  cmds,
  dbojs,
  execPcreate,
  loadDefaultCommands,
} from "../mod.ts";
import type { IDBObj, IUrsamuSDK } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "pcreate_actor",
    name: "Staffer",
    flags: new Set(["player", "connected", "superuser"]),
    state: { name: "Staffer" },
    location: "room1",
    contents: [],
    ...overrides,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  searchResult?: IDBObj[];
  createResult?: IDBObj;
} = {}) {
  const sent: string[] = [];
  const created: unknown[] = [];
  const hashes: string[] = [];
  return Object.assign(
    {
      me: mockPlayer(opts.me ?? {}),
      here: {
        id: "room1",
        name: "Room",
        flags: new Set(["room"]),
        state: {},
        location: "",
        contents: [],
        broadcast: () => {},
      },
      cmd: {
        name: "@pcreate",
        original: "",
        args: opts.args ?? [],
        switches: [],
      },
      send: (m: string) => sent.push(m),
      broadcast: () => {},
      canEdit: () => Promise.resolve(true),
      db: {
        search: () => Promise.resolve(opts.searchResult ?? []),
        create: (d: Partial<IDBObj>) => {
          created.push(d);
          return Promise.resolve(
            opts.createResult ?? {
              id: "99",
              name: d.name ?? "New",
              flags: d.flags ?? new Set(["player"]),
              state: d.state ?? {},
              location: d.location,
              contents: [],
            },
          );
        },
        modify: () => Promise.resolve(),
        destroy: () => Promise.resolve(),
      },
      auth: {
        hash: (p: string) => {
          hashes.push(p);
          return Promise.resolve(`$2a$10$hashed_${p}`);
        },
        setPassword: () => Promise.resolve(),
        verify: () => Promise.resolve(false),
        login: () => Promise.resolve(),
      },
      util: {
        target: () => Promise.resolve(null),
        displayName: (o: IDBObj) => o.name ?? "Unknown",
        stripSubs: (s: string) =>
          s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
        center: (s: string) => s,
        ljust: (s: string, w: number) => s.padEnd(w),
        rjust: (s: string, w: number) => s.padStart(w),
      },
    } as unknown as IUrsamuSDK,
    { _sent: sent, _created: created, _hashes: hashes },
  );
}

Deno.test("loadDefaultCommands registers @pcreate", OPTS, async () => {
  await loadDefaultCommands();
  const cmd = cmds.find((c) => c.name === "@pcreate");
  assertExists(cmd);
  const m = "@pcreate Builder=animefan".match(cmd!.pattern);
  assertExists(m);
  assertEquals(m![1], "Builder=animefan");
});

Deno.test("@pcreate: creates player with hashed password", OPTS, async () => {
  // Unique name: isPlayerNameTaken hits real dbojs, not u.db.search.
  const name = `PcNew_${Date.now()}`;
  const u = mockU({ args: [`${name}=animefan`] });
  await execPcreate(u);
  const sent = (u as unknown as { _sent: string[] })._sent;
  const created = (u as unknown as { _created: Partial<IDBObj>[] })._created;
  const hashes = (u as unknown as { _hashes: string[] })._hashes;

  assertEquals(hashes, ["animefan"]);
  assertEquals(created.length, 1);
  assertEquals(created[0].name, name);
  assertEquals(created[0].flags?.has("player"), true);
  assertEquals(
    (created[0].state as { password?: string })?.password,
    "$2a$10$hashed_animefan",
  );
  assertEquals(
    sent.some((s) => s.includes(name) && s.includes("#99")),
    true,
  );
});

Deno.test("@pcreate: rejects non-admin", OPTS, async () => {
  const u = mockU({
    args: ["PcDenied=animefan"],
    me: {
      flags: new Set(["player", "connected"]),
    },
  });
  await execPcreate(u);
  const sent = (u as unknown as { _sent: string[] })._sent;
  const created = (u as unknown as { _created: unknown[] })._created;
  assertEquals(sent[0], "Permission denied.");
  assertEquals(created.length, 0);
});

Deno.test("@pcreate: rejects duplicate name", OPTS, async () => {
  // isPlayerNameTaken uses dbojs (not the mock search).
  const id = `pc_dup_${Date.now()}`;
  const name = `PcDup_${Date.now()}`;
  await dbojs.create({
    id,
    flags: "player",
    data: { name },
  } as never);
  try {
    const u = mockU({ args: [`${name}=animefan`] });
    await execPcreate(u);
    const sent = (u as unknown as { _sent: string[] })._sent;
    const created = (u as unknown as { _created: unknown[] })._created;
    assertEquals(sent[0], "That name is already taken.");
    assertEquals(created.length, 0);
  } finally {
    await dbojs.delete({ id });
  }
});

Deno.test("@pcreate: rejects short password", OPTS, async () => {
  const u = mockU({ args: ["PcShort=ab"] });
  await execPcreate(u);
  const sent = (u as unknown as { _sent: string[] })._sent;
  assertEquals(sent[0], "Password must be at least 5 characters.");
});

Deno.test("@pcreate: usage when missing =", OPTS, async () => {
  const u = mockU({ args: ["Builder only"] });
  await execPcreate(u);
  const sent = (u as unknown as { _sent: string[] })._sent;
  assertEquals(sent[0], "Usage: @pcreate <name>=<password>");
});

Deno.test("@set help mentions global *Name", OPTS, async () => {
  await loadDefaultCommands();
  // Ensure @set is present (may already be loaded).
  addCmd({
    name: "+pcreate-set-probe",
    pattern: /^\+pcreate-set-probe$/i,
    lock: "",
    category: "Test",
    help: "probe",
    exec: async () => {},
  });
  const setCmd = cmds.find((c) => c.name === "@set");
  assertExists(setCmd);
  assertEquals(
    (setCmd!.help ?? "").toLowerCase().includes("global") ||
      (setCmd!.help ?? "").includes("*"),
    true,
  );
});
