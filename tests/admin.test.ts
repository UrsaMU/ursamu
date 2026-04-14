// deno-lint-ignore-file require-await
/**
 * tests/admin.test.ts
 *
 * Tests for admin commands: @boot, @toad, @newpassword, @chown, @site,
 * @reboot, @shutdown, and permission enforcement.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";
import { execBoot, execToad, execNewpassword, execChown, execSite, execShutdown } from "../src/commands/admin.ts";
import { execReboot } from "../src/commands/restart.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ACTOR_ID  = "adm_actor1";
const TARGET_ID = "adm_target1";
const THING_ID  = "adm_thing1";
const ROOM_ID   = "adm_room1";

type ModifyCall = [string, string, unknown];

function makeU(opts: {
  cmdName?: string;
  args?: string[];
  flags?: string[];
  /** Sequential target() returns */
  targetSeq?: Array<IDBObj | undefined>;
  modifyCalls?: ModifyCall[];
  destroyCalls?: string[];
  setPasswordCalls?: Array<[string, string]>;
  setConfigCalls?: Array<[string, string]>;
  disconnectCalls?: string[];
  rebootCalled?: { called: boolean };
  shutdownCalled?: { called: boolean };
}): IUrsamuSDK & { msgs: Array<{ msg: string; target?: string }>; broadcasts: string[] } {
  const msgs: Array<{ msg: string; target?: string }> = [];
  const broadcasts: string[] = [];
  let targetIdx = 0;

  const me: IDBObj = {
    id: ACTOR_ID,
    name: "Admin",
    flags: new Set(opts.flags ?? ["player", "wizard", "connected"]),
    state: { name: "Admin" },
    location: ROOM_ID,
    contents: [],
  };

  const u = {
    me,
    here: {
      id: ROOM_ID, name: "Test Room",
      flags: new Set(["room"]), state: {}, location: "", contents: [],
      broadcast: (m: string) => broadcasts.push(m),
    },
    cmd: {
      name: opts.cmdName ?? "@boot",
      original: opts.cmdName ?? "@boot",
      args: opts.args ?? [],
      switches: [],
    },
    send: (m: string, tgt?: string) => msgs.push({ msg: m, target: tgt }),
    canEdit: async () => true,
    db: {
      search: async () => [],
      modify: async (id: string, op: string, data: unknown) => {
        opts.modifyCalls?.push([id, op, data]);
      },
      create: async (t: Partial<IDBObj>) => ({ id: "newobj", name: "", flags: new Set<string>(), state: {}, contents: [], ...t } as IDBObj),
      destroy: async (id: string) => {
        opts.destroyCalls?.push(id);
      },
    },
    util: {
      target: async (_a: IDBObj, _name: string): Promise<IDBObj | undefined> => {
        const seq = opts.targetSeq ?? [];
        return seq[targetIdx++];
      },
      displayName: (o: IDBObj) => o.name || o.id,
      stripSubs: (s: string) => s,
    },
    auth: {
      setPassword: async (id: string, pass: string) => {
        opts.setPasswordCalls?.push([id, pass]);
      },
      hash: async (s: string) => s,
      compare: async () => false,
    },
    sys: {
      disconnect: async (id: string) => {
        opts.disconnectCalls?.push(id);
      },
      reboot: async () => {
        if (opts.rebootCalled) opts.rebootCalled.called = true;
      },
      shutdown: async () => {
        if (opts.shutdownCalled) opts.shutdownCalled.called = true;
      },
      setConfig: async (key: string, val: string) => {
        opts.setConfigCalls?.push([key, val]);
      },
      uptime: () => 0,
      gameTime: () => new Date(),
      setGameTime: async () => {},
    },
  } as unknown as IUrsamuSDK & { msgs: Array<{ msg: string; target?: string }>; broadcasts: string[] };

  (u as unknown as Record<string, unknown>).msgs = msgs;
  (u as unknown as Record<string, unknown>).broadcasts = broadcasts;
  return u;
}

// ===========================================================================
// Permission guard
// ===========================================================================

Deno.test("admin — non-admin is denied", OPTS, async () => {
  const u = makeU({ flags: ["player", "connected"], args: ["someone"] });
  await execBoot(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Permission denied");
});

// ===========================================================================
// @boot
// ===========================================================================

Deno.test("@boot — missing arg sends Usage", OPTS, async () => {
  const u = makeU({ args: [""] });
  await execBoot(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Usage");
});

Deno.test("@boot — target not found sends error", OPTS, async () => {
  const u = makeU({ args: ["NoExist99999"], targetSeq: [undefined] });
  await execBoot(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "not found");
});

Deno.test("@boot — cannot boot a non-player", OPTS, async () => {
  const thing: IDBObj = { id: THING_ID, name: "ABox", flags: new Set(["thing"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ args: ["ABox"], targetSeq: [thing] });
  await execBoot(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "only boot players");
});

Deno.test("@boot — cannot boot a superuser", OPTS, async () => {
  const god: IDBObj = { id: TARGET_ID, name: "GodBoot", flags: new Set(["player", "superuser"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ args: ["GodBoot"], targetSeq: [god] });
  await execBoot(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "cannot boot a superuser");
});

Deno.test("@boot — boots a valid player and calls disconnect", OPTS, async () => {
  const disconnectCalls: string[] = [];
  const victim: IDBObj = { id: TARGET_ID, name: "BootVictim", flags: new Set(["player", "connected"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ args: ["BootVictim"], targetSeq: [victim], disconnectCalls });
  await execBoot(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "booted");
  assertEquals(disconnectCalls[0], TARGET_ID);
});

// ===========================================================================
// @toad
// ===========================================================================

Deno.test("@toad — target not found sends error", OPTS, async () => {
  const u = makeU({ cmdName: "@toad", args: ["NoOne"], targetSeq: [undefined] });
  await execToad(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "not found");
});

Deno.test("@toad — cannot toad a superuser", OPTS, async () => {
  const god: IDBObj = { id: TARGET_ID, name: "GodToad", flags: new Set(["player", "superuser"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "@toad", args: ["GodToad"], targetSeq: [god] });
  await execToad(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "cannot toad a superuser");
});

Deno.test("@toad — destroys target player and calls disconnect/destroy", OPTS, async () => {
  const destroyCalls: string[] = [];
  const disconnectCalls: string[] = [];
  const victim: IDBObj = { id: TARGET_ID, name: "ToadVictim", flags: new Set(["player", "connected"]), state: { name: "ToadVictim" }, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "@toad", args: ["ToadVictim"], targetSeq: [victim], destroyCalls, disconnectCalls });
  await execToad(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "toaded");
  assertEquals(disconnectCalls[0], TARGET_ID);
  assertEquals(destroyCalls[0], TARGET_ID);
});

// ===========================================================================
// @newpassword
// ===========================================================================

Deno.test("@newpassword — empty args sends Usage", OPTS, async () => {
  const u = makeU({ cmdName: "@newpassword", args: ["", ""] });
  await execNewpassword(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Usage");
});

Deno.test("@newpassword — missing password sends Usage", OPTS, async () => {
  const u = makeU({ cmdName: "@newpassword", args: ["noequalsign", ""] });
  await execNewpassword(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Usage");
});

Deno.test("@newpassword — player not found sends error", OPTS, async () => {
  const u = makeU({ cmdName: "@newpassword", args: ["Ghost", "newpass"], targetSeq: [undefined] });
  await execNewpassword(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "not found");
});

Deno.test("@newpassword — changes password and calls auth.setPassword", OPTS, async () => {
  const setPasswordCalls: Array<[string, string]> = [];
  const victim: IDBObj = { id: TARGET_ID, name: "PassVictim", flags: new Set(["player"]), state: {}, location: ROOM_ID, contents: [] };
  const u = makeU({ cmdName: "@newpassword", args: ["PassVictim", "newSecret99"], targetSeq: [victim], setPasswordCalls });
  await execNewpassword(u);
  assertStringIncludes(u.msgs.map((m) => m.msg).join(" "), "changed");
  assertEquals(setPasswordCalls[0][0], TARGET_ID);
  assertEquals(setPasswordCalls[0][1], "newSecret99");
});

// ===========================================================================
// @chown
// ===========================================================================

Deno.test("@chown — missing args sends Usage", OPTS, async () => {
  const u = makeU({ cmdName: "@chown", args: ["noequal", ""] });
  await execChown(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Usage");
});

Deno.test("@chown — object not found sends error", OPTS, async () => {
  const u = makeU({ cmdName: "@chown", args: ["GhostThing", "SomePlayer"], targetSeq: [undefined, undefined] });
  await execChown(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "not found");
});

Deno.test("@chown — transfers ownership and calls db.modify", OPTS, async () => {
  const modifyCalls: ModifyCall[] = [];
  const obj: IDBObj = { id: THING_ID, name: "TheBox", flags: new Set(["thing"]), state: { owner: ACTOR_ID }, location: ROOM_ID, contents: [] };
  const newOwner: IDBObj = { id: TARGET_ID, name: "NewOwner", flags: new Set(["player"]), state: {}, location: ROOM_ID, contents: [] };
  // target() returns obj first, then newOwner
  const u = makeU({ cmdName: "@chown", args: ["TheBox", "NewOwner"], targetSeq: [obj, newOwner], modifyCalls });
  await execChown(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "changed");
  assertEquals(modifyCalls[0][0], THING_ID);
  assertEquals((modifyCalls[0][2] as Record<string, unknown>)["data.owner"], TARGET_ID);
});

// ===========================================================================
// @site
// ===========================================================================

Deno.test("@site — empty key sends Usage", OPTS, async () => {
  const u = makeU({ cmdName: "@site", args: ["", ""] });
  await execSite(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Usage");
});

Deno.test("@site — unknown config key sends error", OPTS, async () => {
  const u = makeU({ cmdName: "@site", args: ["noequal", "value"] });
  await execSite(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "Unknown or protected");
});

Deno.test("@site — sets config value and calls sys.setConfig", OPTS, async () => {
  const setConfigCalls: Array<[string, string]> = [];
  const u = makeU({ cmdName: "@site", args: ["server.motd", "Welcome!"], setConfigCalls });
  await execSite(u);
  assertStringIncludes(u.msgs[0]?.msg ?? "", "set to");
  assertEquals(setConfigCalls[0][0], "server.motd");
  assertEquals(setConfigCalls[0][1], "Welcome!");
});

// ===========================================================================
// @reboot / @restart
// ===========================================================================

Deno.test("@reboot — broadcasts and calls sys.reboot", OPTS, async () => {
  const rebootCalled = { called: false };
  const u = makeU({ cmdName: "@reboot", args: [], rebootCalled });
  await execReboot(u);
  assertEquals(rebootCalled.called, true);
  assertEquals(u.broadcasts.length > 0, true);
});

Deno.test("@restart — same exec, also calls sys.reboot", OPTS, async () => {
  const rebootCalled = { called: false };
  const u = makeU({ cmdName: "@restart", args: [], rebootCalled });
  await execReboot(u);
  assertEquals(rebootCalled.called, true);
});

// ===========================================================================
// @shutdown
// ===========================================================================

Deno.test("@shutdown — broadcasts and calls sys.shutdown", OPTS, async () => {
  const shutdownCalled = { called: false };
  const u = makeU({ cmdName: "@shutdown", args: [], shutdownCalled });
  await execShutdown(u);
  assertEquals(shutdownCalled.called, true);
  assertEquals(u.broadcasts.length > 0, true);
});
