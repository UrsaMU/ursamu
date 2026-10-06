/** Command-flow tests via the exported cmds registry. */
import { assert, assertEquals } from "@std/assert";

import { cmds } from "@ursamu/mush";
import { formatCharacterContext } from "../src/context.ts";
import { formatSheet } from "../src/display.ts";
import { resolveRoll } from "../commands/roll.ts";
import { readChar, type ICinChar } from "../src/types.ts";
import { mockU } from "./helpers/mockU.ts";
import "../commands.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function heroChar(): ICinChar {
  const c = readChar({ cinematic: null });
  c.type = "hero";
  c.status = "draft";
  c.attrs.strength = 3;
  c.attrs.dexterity = 4;
  c.attrs.constitution = 3;
  c.attrs.intelligence = 3;
  c.attrs.perception = 3;
  c.attrs.willpower = 4;
  c.skills["kung-fu"] = 4;
  c.dramaPoints = 10;
  return c;
}

function execFor(name: string) {
  const cmd = cmds.find((c) => c.name === name);
  assert(cmd, `command ${name} not registered`);
  return cmd.exec;
}

Deno.test("resolveRoll — SL mapping", OPTS, () => {
  const r = resolveRoll(5, 5);
  assertEquals(r.total, 10);
  assertEquals(r.sl, 1);
  assertEquals(resolveRoll(2, 3).sl, 0);
});

Deno.test("+chargen/type sets type and drama pool", OPTS, async () => {
  const u = mockU({ args: ["type", "hero"] });
  await execFor("+chargen")(u);
  assertEquals(u._sent.length, 1);
  const c = readChar(u._me.state);
  assertEquals(c.type, "hero");
  assertEquals(c.dramaPoints, 10);
  assertEquals(u._dbCalls[0][1], "$set");
});

Deno.test("+chargen/start resets draft", OPTS, async () => {
  const u = mockU({ args: ["start"] });
  await execFor("+chargen")(u);
  assertEquals(readChar(u._me.state).status, "draft");
});

Deno.test("+chargen/submit incomplete — blocked", OPTS, async () => {
  const u = mockU({ args: ["submit"] });
  await execFor("+chargen")(u);
  assertEquals(u._dbCalls.length, 0);
  assert(u._sent[0].includes("Cannot submit"));
});

Deno.test("+stat happy path writes $set", OPTS, async () => {
  const u = mockU({ args: ["strength", "2"] });
  u._me.state.cinematic = heroChar();
  await execFor("+stat")(u);
  assertEquals(u._dbCalls.length, 1);
  assertEquals(u._dbCalls[0][1], "$set");
});

Deno.test("+stat unknown attribute — no write", OPTS, async () => {
  const u = mockU({ args: ["charisma", "3"] });
  u._me.state.cinematic = heroChar();
  await execFor("+stat")(u);
  assertEquals(u._dbCalls.length, 0);
  assert(u._sent[0].includes("Unknown attribute"));
});

Deno.test("+stat over budget — no write", OPTS, async () => {
  const u = mockU({ args: ["strength", "6"] });
  u._me.state.cinematic = heroChar();
  await execFor("+stat")(u);
  assertEquals(u._dbCalls.length, 0);
});

Deno.test("+drama/heroic spends one point", OPTS, async () => {
  const u = mockU({ args: ["heroic"] });
  u._me.state.cinematic = heroChar();
  await execFor("+drama")(u);
  const c = readChar(u._me.state);
  assertEquals(c.dramaSpent, 1);
});

Deno.test("formatSheet — colors closed", OPTS, () => {
  const out = formatSheet("Tester", heroChar());
  assert(out.includes("%cn"));
});

Deno.test("formatCharacterContext — no MUSH codes", OPTS, () => {
  const out = formatCharacterContext(heroChar(), "Tester");
  assertEquals(/%c[a-z]/.test(out), false);
  assert(out.includes("kung-fu 4"));
});
