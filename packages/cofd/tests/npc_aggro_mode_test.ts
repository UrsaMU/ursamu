// Behaviour tests for +npc/aggro-mode using the in-repo MockObjectStore.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { mockU } from "./helpers/mockU.ts";
import { npcExec } from "../src/commands/npc.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("non-staff cannot /aggro-mode", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["aggro-mode", "Goon=hunter"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("/aggro-mode rejects invalid mode", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "Goon=thug"],
  });
  await npcExec(u);
  const npc = u._store.search({ location: "2" }).find((o) => o.name === "Goon")!;
  u.util.target = () => Promise.resolve(npc);
  u._sent.length = 0;
  u.cmd.args = ["aggro-mode", "Goon=rampage"];
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Unknown aggro mode");
});

Deno.test("/aggro-mode writes data.cofd with new aggro value", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["create", "Goon=thug"],
  });
  await npcExec(u);
  const npc = u._store.search({ location: "2" }).find((o) => o.name === "Goon")!;
  u.util.target = () => Promise.resolve(npc);
  u._sent.length = 0;
  u._dbCalls.length = 0;
  u.cmd.args = ["aggro-mode", "Goon=hunter"];
  await npcExec(u);

  assertStringIncludes(u._sent.join("\n"), "Set Goon aggro to 'hunter'");

  // Verify u.db.modify was called with "data.cofd"
  const modifyCall = u._dbCalls.find((c) => c[1] === "$set" && (c[2] as Record<string, unknown>)["data.cofd"]);
  assert(modifyCall, "expected a $set on data.cofd");
  // deno-lint-ignore no-explicit-any
  const cofd = (modifyCall[2] as any)["data.cofd"];
  assertEquals(cofd.npc.aggro, "hunter");

  // Verify it persisted to the store sheet.
  // deno-lint-ignore no-explicit-any
  const sheet = (npc.state.cofd as any);
  assertEquals(sheet.npc.aggro, "hunter");
});

Deno.test("/aggro-mode requires name=mode syntax", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["aggro-mode", "no equals here"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Syntax");
});
