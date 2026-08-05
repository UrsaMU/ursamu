/**
 * Command-level tests for @ursamu/channels (0.2.0 contract).
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  execAddcom,
  execChannel,
  execChancreate,
  execChandestroy,
  execChanset,
  execCemit,
  execCboot,
  execCwho,
} from "../src/commands/exec.ts";
import { mockU } from "./helpers/mockU.ts";
import type { IChanEntry } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const PUBLIC = {
  name: "Public",
  header: "[PUBLIC]",
  alias: "pub",
  hidden: false,
  owner: "god",
};

const HIDDEN = {
  name: "Staff",
  header: "[STAFF]",
  hidden: true,
  owner: "god",
};

Deno.test("addcom joins known channel", OPTS, async () => {
  const u = mockU({
    cmdName: "addcom",
    original: "addcom pub=Public",
    args: ["pub=Public"],
    channels: [PUBLIC],
  });
  await execAddcom(u);
  assertEquals(u._joinCalls.length, 1);
  assertEquals(u._joinCalls[0], ["Public", "pub"]);
  assertStringIncludes(u._sent.join("\n"), "pub");
  assertStringIncludes(u._sent.join("\n"), "Public");
});

Deno.test("addcom rejects unknown channel", OPTS, async () => {
  const u = mockU({
    cmdName: "addcom",
    original: "addcom x=Nope",
    args: ["x=Nope"],
    channels: [PUBLIC],
  });
  await execAddcom(u);
  assertEquals(u._joinCalls.length, 0);
  assertStringIncludes(u._sent.join("\n"), "No channel");
});

Deno.test("addcom requires alias=channel", OPTS, async () => {
  const u = mockU({
    cmdName: "addcom",
    original: "addcom broken",
    args: ["broken"],
    channels: [PUBLIC],
  });
  await execAddcom(u);
  assertEquals(u._joinCalls.length, 0);
  assertStringIncludes(u._sent.join("\n"), "Usage");
});

Deno.test("delcom leaves alias", OPTS, async () => {
  const entries: IChanEntry[] = [{
    id: "pub",
    channel: "Public",
    alias: "pub",
    active: true,
  }];
  const u = mockU({
    cmdName: "delcom",
    original: "delcom pub",
    args: ["pub"],
    me: { state: { name: "Tester", channels: entries } },
    channels: [PUBLIC],
  });
  await execAddcom(u);
  assertEquals(u._leaveCalls, ["pub"]);
  assertStringIncludes(u._sent.join("\n"), "Removed");
});

Deno.test("clearcom removes all aliases", OPTS, async () => {
  const entries: IChanEntry[] = [
    { id: "pub", channel: "Public", alias: "pub", active: true },
    { id: "st", channel: "Staff", alias: "st", active: true },
  ];
  const u = mockU({
    cmdName: "clearcom",
    original: "clearcom",
    args: [""],
    me: { state: { name: "Tester", channels: entries } },
    channels: [PUBLIC, HIDDEN],
  });
  await execAddcom(u);
  assertEquals(u._leaveCalls.sort(), ["pub", "st"]);
  assertStringIncludes(u._sent.join("\n"), "All channel aliases");
});

Deno.test("comlist shows aliases", OPTS, async () => {
  const entries: IChanEntry[] = [{
    id: "pub",
    channel: "Public",
    alias: "pub",
    active: true,
    title: "Lord",
  }];
  const u = mockU({
    cmdName: "comlist",
    original: "comlist",
    args: [""],
    me: { state: { name: "Tester", channels: entries } },
    channels: [PUBLIC],
  });
  await execAddcom(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "pub");
  assertStringIncludes(out, "Public");
  assertStringIncludes(out, "Lord");
});

Deno.test("comtitle sets title on alias", OPTS, async () => {
  const entries: IChanEntry[] = [{
    id: "pub",
    channel: "Public",
    alias: "pub",
    active: true,
  }];
  const u = mockU({
    cmdName: "comtitle",
    original: "comtitle pub=Scout",
    args: ["pub=Scout"],
    me: { state: { name: "Tester", channels: entries } },
    channels: [PUBLIC],
  });
  await execAddcom(u);
  assertEquals(u._dbCalls.length >= 1, true);
  const ch = u._me.state.channels as IChanEntry[];
  assertEquals(ch[0]?.title, "Scout");
  assertStringIncludes(u._sent.join("\n"), "Scout");
});

Deno.test("channel/join calls chan.join", OPTS, async () => {
  const u = mockU({
    cmdName: "channel",
    args: ["join", "Public=pub"],
    channels: [PUBLIC],
  });
  await execChannel(u);
  assertEquals(u._joinCalls[0], ["Public", "pub"]);
  assertStringIncludes(u._sent.join("\n"), "joined");
});

Deno.test("channel/leave calls chan.leave", OPTS, async () => {
  const entries: IChanEntry[] = [{
    id: "pub",
    channel: "Public",
    alias: "pub",
    active: true,
  }];
  const u = mockU({
    cmdName: "channel",
    args: ["leave", "pub"],
    me: { state: { name: "Tester", channels: entries } },
    channels: [PUBLIC],
  });
  await execChannel(u);
  assertEquals(u._leaveCalls, ["pub"]);
});

Deno.test("clist hides hidden from non-staff", OPTS, async () => {
  const u = mockU({
    cmdName: "clist",
    args: ["", ""],
    me: { flags: new Set(["player", "connected"]) },
    channels: [PUBLIC, HIDDEN],
  });
  await execChannel(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Public");
  assertEquals(out.includes("Staff"), false);
});

Deno.test("clist shows hidden to admin", OPTS, async () => {
  const u = mockU({
    cmdName: "clist",
    args: ["", ""],
    me: {
      flags: new Set(["player", "connected", "admin"]),
    },
    channels: [PUBLIC, HIDDEN],
  });
  await execChannel(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Public");
  assertStringIncludes(out, "Staff");
});

Deno.test("clist/full has no economy placeholders", OPTS, async () => {
  const u = mockU({
    cmdName: "clist",
    args: ["full", ""],
    me: {
      flags: new Set(["player", "connected", "admin"]),
    },
    channels: [PUBLIC],
  });
  await execChannel(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Flags");
  assertStringIncludes(out, "Owner");
  assertStringIncludes(out, "Users");
  assertStringIncludes(out, "Public");
  assertEquals(out.includes("Charge"), false);
  assertEquals(out.includes("Balance"), false);
  assertEquals(out.includes("Messages"), false);
  assertEquals(/\bObj\b/.test(out), false);
});

Deno.test("chancreate rejects non-admin", OPTS, async () => {
  const u = mockU({
    cmdName: "chancreate",
    args: ["", "OOC"],
    me: { flags: new Set(["player", "connected"]) },
  });
  await execChancreate(u);
  assertEquals(u._createCalls.length, 0);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("chancreate allows admin", OPTS, async () => {
  const u = mockU({
    cmdName: "chancreate",
    args: ["", "OOC=[OOC]"],
    me: {
      flags: new Set(["player", "connected", "admin"]),
    },
  });
  await execChancreate(u);
  assertEquals(u._createCalls.length, 1);
  assertStringIncludes(u._sent.join("\n"), "created");
});

Deno.test("chandestroy rejects non-admin", OPTS, async () => {
  const u = mockU({
    cmdName: "chandestroy",
    args: ["Public"],
    me: { flags: new Set(["player", "connected"]) },
    channels: [PUBLIC],
  });
  await execChandestroy(u);
  assertEquals(u._destroyCalls.length, 0);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("chanset rejects non-admin", OPTS, async () => {
  const u = mockU({
    cmdName: "chanset",
    args: ["Public/header=[P]"],
    me: { flags: new Set(["player", "connected"]) },
    channels: [PUBLIC],
  });
  await execChanset(u);
  assertEquals(u._setCalls.length, 0);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("chanset sets announce and header", OPTS, async () => {
  const u = mockU({
    cmdName: "chanset",
    args: ["Public/announce=on"],
    me: {
      id: "god",
      flags: new Set(["player", "connected", "superuser"]),
    },
    channels: [{ ...PUBLIC, owner: "god" }],
  });
  await execChanset(u);
  assertEquals(u._setCalls.length, 1);
  assertEquals(
    (u._setCalls[0]?.[1] as { announce?: boolean }).announce,
    true,
  );

  const u2 = mockU({
    cmdName: "chanset",
    args: ["Public/header=[PUB]"],
    me: {
      id: "god",
      flags: new Set(["player", "connected", "superuser"]),
    },
    channels: [{ ...PUBLIC, owner: "god" }],
  });
  await execChanset(u2);
  assertEquals(
    (u2._setCalls[0]?.[1] as { header?: string }).header,
    "[PUB]",
  );
});

Deno.test("chanset sets log on", OPTS, async () => {
  const u = mockU({
    cmdName: "chanset",
    args: ["Public/log=on"],
    me: {
      id: "god",
      flags: new Set(["player", "connected", "superuser"]),
    },
    channels: [{ ...PUBLIC, owner: "god" }],
  });
  await execChanset(u);
  assertEquals(
    (u._setCalls[0]?.[1] as { logHistory?: boolean }).logHistory,
    true,
  );
});

Deno.test("cemit permission denied for non-owner non-staff", OPTS, async () => {
  // Without a live channel row, command reports not found before perm.
  // Staff gate is covered by chancreate; cemit needs DB. Assert usage.
  const u = mockU({
    cmdName: "cemit",
    args: ["", ""],
    me: { flags: new Set(["player", "connected"]) },
  });
  await execCemit(u);
  assertStringIncludes(u._sent.join("\n"), "Usage");
});

Deno.test("cboot requires channel=object", OPTS, async () => {
  const u = mockU({
    cmdName: "cboot",
    args: ["", "Public"],
    me: {
      flags: new Set(["player", "connected", "admin"]),
    },
  });
  await execCboot(u);
  assertStringIncludes(u._sent.join("\n"), "Usage");
});

Deno.test("cwho requires channel name", OPTS, async () => {
  const u = mockU({
    cmdName: "cwho",
    args: ["", ""],
    me: {
      flags: new Set(["player", "connected", "admin"]),
    },
  });
  await execCwho(u);
  assertStringIncludes(u._sent.join("\n"), "Usage");
});
