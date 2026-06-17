// Behaviour tests for +npc using the in-repo MockObjectStore.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { mockU } from "./helpers/mockU.ts";
import { npcExec } from "../src/commands/npc.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("non-staff cannot /create", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["create", "Goon=thug"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("staff /create spawns a flagged NPC in the room", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "Goon=thug"],
  });
  await npcExec(u);
  const msg = u._sent.join("\n");
  assertStringIncludes(msg, "Created");
  assertStringIncludes(msg, "Thug");
  // Find the created object in the store.
  const npcs = u._store.search({ location: "2" });
  const npc = npcs.find((o) => o.name === "Goon");
  assert(npc, "NPC not created");
  assert(npc.flags.has("npc"), "NPC missing 'npc' flag");
  const sheet = npc.state.cofd as Record<string, unknown>;
  assert(sheet, "NPC sheet missing");
  // deno-lint-ignore no-explicit-any
  assertEquals((sheet as any).npc.archetype, "thug");
});

Deno.test("/create requires name=archetype syntax", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "no equals here"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Syntax");
});

Deno.test("/create rejects unknown archetype", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "Goon=dragon"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Unknown archetype");
});

Deno.test("/create strips color subs from name", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "%crGoon%cn=thug"],
  });
  await npcExec(u);
  const npcs = u._store.search({ location: "2" });
  const npc = npcs.find((o) => o.name === "Goon");
  assert(npc, `expected NPC named 'Goon', got: ${npcs.map((n) => n.name).join(",")}`);
});

Deno.test("/list shows NPCs in the room", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "Goon=thug"],
  });
  await npcExec(u);
  u._sent.length = 0;
  u.cmd.args = ["list", ""];
  await npcExec(u);
  const msg = u._sent.join("\n");
  assertStringIncludes(msg, "Goon");
  assertStringIncludes(msg, "Thug");
});

Deno.test("/list works without staff", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["list", ""],
  });
  await npcExec(u);
  const msg = u._sent.join("\n");
  // Should not be permission-denied; either lists NPCs or shows the no-NPC hint.
  assert(!msg.includes("Permission denied"), "list must not be staff-gated");
});

Deno.test("non-staff cannot /destroy", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["destroy", "Goon"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("/destroy removes the NPC", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "Goon=thug"],
  });
  await npcExec(u);
  const npcs1 = u._store.search({ location: "2" });
  const npc = npcs1.find((o) => o.name === "Goon")!;

  // Make util.target return this npc by reassigning.
  u.util.target = () => Promise.resolve(npc);
  u._sent.length = 0;
  u.cmd.args = ["destroy", "Goon"];
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Destroyed");
  const npcs2 = u._store.search({ location: "2" });
  assertEquals(npcs2.find((o) => o.name === "Goon"), undefined);
});

Deno.test("/destroy refuses non-NPC targets", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["destroy", "RealPlayer"],
  });
  const fakePlayer = u._store.create({
    name: "RealPlayer",
    flags: new Set(["player", "connected"]),
    location: "2",
  });
  u.util.target = () => Promise.resolve(fakePlayer);
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "not an NPC");
});

Deno.test("unknown switch returns hint", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["frobnicate", ""],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Unknown +npc switch");
});

Deno.test("non-staff /show cannot read NPC in a different room by id", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]), location: "2" },
    args: ["show", ""],
  });
  // Stage an NPC in a DIFFERENT room. Use the real id assigned by the store.
  const hidden = u._store.create({
    name: "Hidden Beshilu",
    flags: new Set(["npc", "thing"]),
    location: "elsewhere-room",
    state: { cofd: { npc: { archetype: "thug" } } },
  });
  u.cmd.args = ["show", hidden.id];
  await npcExec(u);
  const out = u._sent.join("\n");
  assert(
    !out.includes("Hidden Beshilu") && !out.includes("S T A T   B L O C K"),
    "non-staff leaked NPC from another room: " + out,
  );
});
