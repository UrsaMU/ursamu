/**
 * +cg on web → Character tab navigate payload.
 */
import { assertEquals } from "@std/assert";
import { cgExec } from "../src/commands/chargen.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("cgExec web: navigate to /chargen", OPTS, async () => {
  const layouts: unknown[] = [];
  const me = mockPlayer({ id: "p1", name: "T" });
  const base = mockU({ me });
  const u = Object.assign(base, {
    clientType: "web",
    ui: {
      layout: (o: unknown) => {
        layouts.push(o);
      },
    },
    cmd: {
      name: "+cg",
      original: "+cg",
      args: ["", ""],
      switches: [],
    },
  });
  await cgExec(u as never);
  assertEquals(layouts.length, 1);
  const lay = layouts[0] as {
    meta?: { type?: string; path?: string };
  };
  assertEquals(lay.meta?.type, "navigate");
  assertEquals(lay.meta?.path, "/chargen");
  assertEquals((u as { _sent: string[] })._sent.length, 0);
});
