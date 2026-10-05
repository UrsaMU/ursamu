// Behaviour tests for the extended +npc command (/build, /show, /powers,
// /addpower, /rmpower).

import { assert, assertStringIncludes } from "@std/assert";
import { mockU } from "./helpers/mockU.ts";
import { npcExec } from "../src/commands/npc.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("/build with tier override spawns at that tier", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["build", "Karl=hunter/storyteller"],
  });
  await npcExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Created");
  assertStringIncludes(out, "storyteller");
  // Find created object
  const npcs = u._store.search({ location: "2" });
  const karl = npcs.find((o) => o.name === "Karl");
  assert(karl, "Karl not created");
  // deno-lint-ignore no-explicit-any
  const sheet = karl.state.cofd as any;
  assert(sheet.npc.tier === "storyteller", "expected storyteller tier");
});

Deno.test("/build rejects bad tier", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["build", "Goon=thug/godlike"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Unknown tier");
});

Deno.test("/build is staff-gated", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["build", "Goon=thug"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("/powers lists the catalog", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["powers", ""],
  });
  await npcExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Telekinesis");
  assertStringIncludes(out, "Mortal Mask");
});

Deno.test("/show prints the full stat block", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["build", "Goon=thug"],
  });
  await npcExec(u);
  const npcs = u._store.search({ location: "2" });
  const goon = npcs.find((o) => o.name === "Goon")!;
  u.util.target = () => Promise.resolve(goon);
  u._sent.length = 0;
  u.cmd.args = ["show", "Goon"];
  await npcExec(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "Attributes:");
  assertStringIncludes(out, "Defense:");
  assertStringIncludes(out, "Speed:");
  assertStringIncludes(out, "Goon");
});

Deno.test("/addpower attaches a tier-legal power and rmpower removes it", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["build", "Karl=hunter/storyteller"],
  });
  await npcExec(u);
  const karl = u._store.search({ location: "2" }).find((o) => o.name === "Karl")!;
  u.util.target = () => Promise.resolve(karl);

  u._sent.length = 0;
  u.cmd.args = ["addpower", "Karl=mortal-mask"];
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Attached");
  // deno-lint-ignore no-explicit-any
  const sheet = karl.state.cofd as any;
  assert(sheet.npc.dreadPowers.includes("mortal-mask"));

  u._sent.length = 0;
  u.cmd.args = ["rmpower", "Karl=mortal-mask"];
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Removed");
  // deno-lint-ignore no-explicit-any
  const sheet2 = karl.state.cofd as any;
  assert(!sheet2.npc.dreadPowers.includes("mortal-mask"));
});

Deno.test("/addpower refuses tier-locked powers", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["build", "Goon=thug"],   // minor tier
  });
  await npcExec(u);
  const goon = u._store.search({ location: "2" }).find((o) => o.name === "Goon")!;
  u.util.target = () => Promise.resolve(goon);
  u._sent.length = 0;
  u.cmd.args = ["addpower", "Goon=possession"];   // major-tier-min
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "cannot take");
});

Deno.test("/addpower is staff-gated", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected"]) },
    args: ["addpower", "Goon=mortal-mask"],
  });
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Permission denied");
});

Deno.test("/addpower strips color subs from input", OPTS, async () => {
  const u = mockU({
    me: { flags: new Set(["player", "connected", "admin"]) },
    args: ["build", "Karl=hunter"],
  });
  await npcExec(u);
  const karl = u._store.search({ location: "2" }).find((o) => o.name === "Karl")!;
  u.util.target = () => Promise.resolve(karl);
  u._sent.length = 0;
  u.cmd.args = ["addpower", "%crKarl%cn=%cwmortal-mask%cn"];
  await npcExec(u);
  assertStringIncludes(u._sent.join("\n"), "Attached");
});
