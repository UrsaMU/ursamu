/**
 * Unit tests for globals-style commands (SGP parity).
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "../src/commands/types.ts";
import {
  fmtIdle,
  fmtOnFor,
  fmtDurationMs,
  isStaffFlags,
} from "../src/verbs/globals/time-fmt.ts";
import {
  attrFor,
  humanize,
  readFingerField,
  dotLine,
} from "../src/verbs/globals/finger-fields.ts";
import { execDuty } from "../src/verbs/globals/duty.ts";
import { execUptime } from "../src/verbs/globals/uptime.ts";
import { execStaff } from "../src/verbs/globals/staff.ts";
import { execGlance } from "../src/verbs/globals/glance.ts";
import { execExitType } from "../src/verbs/globals/exittype.ts";
import { execPlusInv } from "../src/verbs/globals/plus-inv.ts";
import {
  execSummon,
  execRSummon,
  execJoin,
  execRJoin,
} from "../src/verbs/globals/teleport.ts";
import { execGName } from "../src/verbs/globals/gname.ts";
import {
  oocPrefixOf,
  defaultOocLine,
  execOocTag,
} from "../src/verbs/ooc.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(o: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "p1",
    name: "Tester",
    flags: new Set(["player", "connected"]),
    state: { name: "Tester" },
    location: "r1",
    contents: [],
    ...o,
  };
}

function mockU(opts: {
  me?: Partial<IDBObj>;
  args?: string[];
  search?: IDBObj[];
  target?: IDBObj | null;
  canEdit?: boolean;
  uptimeMs?: number;
  clientType?: "web" | "telnet";
} = {}) {
  const sent: string[] = [];
  const layouts: unknown[] = [];
  const dbCalls: unknown[][] = [];
  const attrCalls: unknown[][] = [];
  const teleports: [string, string][] = [];
  const me = mockPlayer(opts.me ?? {});

  const u = {
    me,
    clientType: opts.clientType ?? "telnet",
    here: {
      id: "r1",
      name: "Room",
      flags: new Set(["room"]),
      state: {},
      location: "",
      contents: opts.search?.filter((p) =>
        p.location === "r1" || !p.location
      ) ?? [me],
      broadcast: () => {},
    },
    cmd: {
      name: "test",
      original: "",
      args: opts.args ?? [],
      switches: [],
    },
    socketId: "s1",
    send: (m: string) => sent.push(m),
    ui: {
      layout: (opt: unknown) => {
        layouts.push(opt);
      },
    },
    canEdit: async () => opts.canEdit ?? true,
    db: {
      search: async () => opts.search ?? [],
      modify: async (...a: unknown[]) => {
        dbCalls.push(a);
      },
      create: async () => me,
      destroy: async () => {},
    },
    attr: {
      get: async () => null,
      set: async (...a: unknown[]) => {
        attrCalls.push(["set", ...a]);
      },
      clear: async (...a: unknown[]) => {
        attrCalls.push(["clear", ...a]);
        return true;
      },
    },
    util: {
      target: async () => opts.target ?? null,
      displayName: (o: IDBObj) =>
        String(o.state?.name || o.name || "Unknown"),
      stripSubs: (s: string) =>
        s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    sys: {
      uptime: async () => opts.uptimeMs ?? 65_000,
    },
    teleport: (t: string, d: string) => {
      teleports.push([t, d]);
    },
  } as unknown as IUrsamuSDK;

  return Object.assign(u, {
    _sent: sent,
    _layouts: layouts,
    _dbCalls: dbCalls,
    _attrCalls: attrCalls,
    _teleports: teleports,
  });
}

Deno.test("time-fmt: idle on-for duration staff", OPTS, () => {
  assertEquals(fmtIdle(undefined), "---");
  assertEquals(fmtIdle(Date.now() - 5000).endsWith("s"), true);
  assertEquals(fmtOnFor(undefined), "??:??");
  assertStringIncludes(fmtDurationMs(3661000), "1h");
  assertEquals(isStaffFlags(new Set(["admin"])), true);
  assertEquals(isStaffFlags(new Set(["player"])), false);
});

Deno.test("finger-fields: attr map and dots", OPTS, () => {
  assertEquals(attrFor("pronouns"), "PRONOUNS");
  assertEquals(attrFor("custom_x"), "FINGER-CUSTOM-X");
  assertEquals(humanize("rp_preferences"), "Rp Preferences");
  const p = mockPlayer({
    state: { name: "A", alias: "Al", attributes: [] },
  });
  assertEquals(readFingerField(p, "alias"), "Al");
  assertStringIncludes(dotLine("Alias", "Al"), ":");
});

Deno.test("execDuty: rejects non-staff", OPTS, async () => {
  const u = mockU();
  await execDuty(u);
  assertStringIncludes(u._sent[0], "Only staff");
  assertEquals(u._dbCalls.length, 0);
});

Deno.test("execDuty: toggles offduty", OPTS, async () => {
  const u = mockU({
    me: {
      flags: new Set(["player", "connected", "admin"]),
      state: { name: "Staff" },
    },
  });
  await execDuty(u);
  assertEquals(u._dbCalls[0][1], "$set");
  assertStringIncludes(u._sent[0], "off-duty");

  const u2 = mockU({
    me: {
      flags: new Set(["player", "connected", "wizard"]),
      state: { name: "Wiz", offduty: true },
    },
  });
  await execDuty(u2);
  assertEquals(u2._dbCalls[0][1], "$unset");
  assertStringIncludes(u2._sent[0], "on-duty");
});

Deno.test("execUptime: panel lines", OPTS, async () => {
  const u = mockU({ uptimeMs: 125_000 });
  await execUptime(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Server Uptime");
  assertStringIncludes(out, "In operation");
});

Deno.test("execStaff: empty and filters offduty", OPTS, async () => {
  const on = mockPlayer({
    id: "a1",
    flags: new Set(["player", "connected", "admin"]),
    state: { name: "Ada", lastLogin: Date.now() },
  });
  const off = mockPlayer({
    id: "a2",
    flags: new Set(["player", "connected", "wizard"]),
    state: { name: "Oz", offduty: true, lastLogin: Date.now() },
  });
  const u = mockU({ search: [on, off] });
  await execStaff(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Ada");
  assertEquals(out.includes("Oz"), false);
  assertStringIncludes(out, "1 staff");
});

Deno.test("execGlance: lists room players", OPTS, async () => {
  const other = mockPlayer({
    id: "p2",
    name: "Bob",
    state: {
      name: "Bob",
      lastCommand: Date.now(),
      attributes: [{ name: "SHORT-DESC", value: "tall" }],
    },
  });
  const u = mockU();
  (u.here as { contents: IDBObj[] }).contents = [
    u.me,
    other,
  ];
  await execGlance(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Bob");
  assertStringIncludes(out, "tall");
  assertStringIncludes(out, "glance");
});

Deno.test("execGlance web: entity-list layout", OPTS, async () => {
  const other = mockPlayer({
    id: "p2",
    name: "Bob",
    state: {
      name: "Bob",
      lastCommand: Date.now(),
      attributes: [{ name: "SHORT-DESC", value: "tall" }],
    },
  });
  const u = mockU({ clientType: "web" });
  (u.here as { contents: IDBObj[] }).contents = [
    u.me,
    other,
  ];
  await execGlance(u);
  assertEquals(u._sent.length, 0);
  assertEquals(u._layouts.length, 1);
  const lay = u._layouts[0] as {
    meta?: { type?: string };
    components: Array<Record<string, unknown>>;
  };
  assertEquals(lay.meta?.type, "glance");
  const list = lay.components.find(
    (c) => c.type === "entity-list",
  ) as { items?: Array<Record<string, unknown>> };
  assertEquals((list?.items?.length ?? 0) >= 1, true);
  const bob = list?.items?.find((i) => i.label === "Bob");
  assertEquals(bob?.sublabel, "tall");
  assertEquals(
    (bob?.action as { cmd?: string })?.cmd,
    "look Bob",
  );
});

Deno.test("execExitType: guards and set", OPTS, async () => {
  const u0 = mockU({ args: ["", ""] });
  await execExitType(u0);
  assertStringIncludes(u0._sent[0], "Usage");

  const exit = mockPlayer({
    id: "e1",
    name: "north",
    flags: new Set(["exit"]),
    state: { name: "north" },
  });
  const u = mockU({
    args: ["north", "direction"],
    target: exit,
    canEdit: true,
  });
  await execExitType(u);
  assertEquals(u._attrCalls[0][0], "set");
  assertEquals(u._attrCalls[0][2], "TYPE");
  assertEquals(u._attrCalls[0][3], "direction");
});

Deno.test("execExitType: permission denied", OPTS, async () => {
  const exit = mockPlayer({
    id: "e1",
    flags: new Set(["exit"]),
    state: { name: "north" },
  });
  const u = mockU({
    args: ["north", "x"],
    target: exit,
    canEdit: false,
  });
  await execExitType(u);
  assertStringIncludes(u._sent[0], "Permission denied");
  assertEquals(u._attrCalls.length, 0);
});

Deno.test("execPlusInv: same-room and remote staff", OPTS, async () => {
  const target = mockPlayer({
    id: "p2",
    name: "Bob",
    location: "r1",
    state: { name: "Bob" },
  });
  const item = mockPlayer({
    id: "t1",
    name: "Lamp",
    flags: new Set(),
    location: "p2",
    state: { name: "Lamp" },
  });
  const u = mockU({
    args: ["Bob"],
    target,
    search: [item],
    canEdit: false,
  });
  await execPlusInv(u);
  assertStringIncludes(u._sent.join("\n"), "Lamp");

  const far = mockPlayer({
    id: "p3",
    location: "r9",
    state: { name: "Carol" },
  });
  const u2 = mockU({
    args: ["Carol"],
    target: far,
    canEdit: false,
  });
  await execPlusInv(u2);
  assertStringIncludes(u2._sent[0], "isn't here");
});

Deno.test("execPlusInv web: inventory layout", OPTS, async () => {
  const target = mockPlayer({
    id: "p2",
    name: "Bob",
    location: "r1",
    state: { name: "Bob" },
  });
  const item = mockPlayer({
    id: "t1",
    name: "Lamp",
    flags: new Set(),
    location: "p2",
    state: { name: "Lamp" },
  });
  const u = mockU({
    args: ["Bob"],
    target,
    search: [item],
    canEdit: false,
    clientType: "web",
  });
  await execPlusInv(u);
  assertEquals(u._sent.length, 0);
  assertEquals(u._layouts.length, 1);
  const lay = u._layouts[0] as {
    meta?: { type?: string };
    components: Array<Record<string, unknown>>;
  };
  assertEquals(lay.meta?.type, "inventory");
  const list = lay.components.find(
    (c) => c.type === "entity-list",
  ) as { items?: Array<Record<string, unknown>> };
  assertEquals(list?.items?.[0]?.label, "Lamp");
});

Deno.test("teleport: summon join round-trip", OPTS, async () => {
  const target = mockPlayer({
    id: "p2",
    name: "Bob",
    location: "r2",
    flags: new Set(["player", "connected"]),
    state: { name: "Bob" },
  });
  const u = mockU({ args: ["Bob"], target });
  await execSummon(u);
  assertEquals(u._dbCalls[0][1], "$set");
  assertEquals(u._teleports[0], ["p2", "r1"]);

  const withOrigin = mockPlayer({
    id: "p2",
    name: "Bob",
    location: "r1",
    flags: new Set(["player", "connected"]),
    state: { name: "Bob", summon_origin: "r2" },
  });
  const u2 = mockU({ args: ["Bob"], target: withOrigin });
  await execRSummon(u2);
  assertEquals(u2._teleports[0], ["p2", "r2"]);

  const u3 = mockU({ args: ["Bob"], target });
  await execJoin(u3);
  assertEquals(u3._teleports[0], ["p1", "r2"]);

  const u4 = mockU({
    me: {
      state: { name: "Tester", join_origin: "r1" },
    },
  });
  await execRJoin(u4);
  assertEquals(u4._teleports[0], ["p1", "r1"]);
});

Deno.test("execGName: set and clear", OPTS, async () => {
  const u = mockU({ args: ["red blue"] });
  await execGName(u);
  assertEquals(u._dbCalls[0][1], "$set");
  assertStringIncludes(u._sent[0], "Moniker set");

  const u2 = mockU({ args: ["reset"] });
  await execGName(u2);
  assertEquals(u2._dbCalls[0][1], "$unset");
});

Deno.test("ooctag: prefix and set", OPTS, async () => {
  assertEquals(oocPrefixOf({}), "%cr<OOC>%cn ");
  assertEquals(
    oocPrefixOf({ state: { ooctag: "[OOC]" } }),
    "[OOC] ",
  );
  assertEquals(
    defaultOocLine('X says, "hi"', "[T] "),
    '[T] X says, "hi"',
  );

  const u = mockU({ args: ["[%cyOOC%cn]"] });
  await execOocTag(u);
  assertEquals(u._dbCalls[0][1], "$set");
  assertStringIncludes(u._sent[0], "OOC tag set");

  const u2 = mockU({ args: ["reset"] });
  await execOocTag(u2);
  assertEquals(u2._dbCalls[0][1], "$unset");
});
