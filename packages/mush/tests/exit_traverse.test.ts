/**
 * TinyMUX-style exit message defaults and attr resolution.
 */
import { assertEquals } from "@std/assert";
import {
  defaultExitMsgs,
  resolveExitAttr,
} from "../src/commands/exit-traverse.ts";
import type { IDBOBJ } from "../src/world/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("defaultExitMsgs: enter dest / leaves.", OPTS, () => {
  const d = defaultExitMsgs({
    exitName: "Chargen",
    destName: "Character Generation",
  });
  assertEquals(d.succ, "You enter Character Generation.");
  assertEquals(d.osucc, "leaves.");
  assertEquals(d.fail, "You can't go that way.");
  assertEquals(
    d.ofail,
    "tries to leave through Chargen, but fails.",
  );
  assertEquals(d.odrop, "has arrived.");
});

Deno.test(
  "resolveExitAttr prefers attributes over legacy data",
  OPTS,
  async () => {
    const exit = {
      id: "e1",
      flags: "exit",
      location: "r1",
      data: {
        name: "North;n",
        destination: "r2",
        osucc: "legacy osucc",
        attributes: [
          { name: "OSUCC", value: "heads north." },
        ],
      },
    } as IDBOBJ;

    const v = await resolveExitAttr(exit, "OSUCC");
    assertEquals(v, "heads north.");
  },
);

Deno.test(
  "resolveExitAttr falls back to legacy data.osucc",
  OPTS,
  async () => {
    const exit = {
      id: "e1",
      flags: "exit",
      location: "r1",
      data: {
        name: "North;n",
        osucc: "slips away north.",
      },
    } as IDBOBJ;

    const v = await resolveExitAttr(exit, "OSUCC");
    assertEquals(v, "slips away north.");
  },
);

Deno.test("resolveExitAttr empty when unset", OPTS, async () => {
  const exit = {
    id: "e1",
    flags: "exit",
    location: "r1",
    data: { name: "North;n" },
  } as IDBOBJ;
  assertEquals(await resolveExitAttr(exit, "OSUCC"), "");
  assertEquals(await resolveExitAttr(exit, "FAIL"), "");
});
