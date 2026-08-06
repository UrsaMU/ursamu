/**
 * +cg on web runs the normal stepper (no forced Character navigate).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { cgExec } from "../src/commands/chargen.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "cgExec web: terminal stepper, not Character navigate",
  OPTS,
  async () => {
    const layouts: unknown[] = [];
    const me = mockPlayer({ id: "p1", name: "T" });
    const base = mockU({
      me,
      dbModify: (_id, op, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (op === "$set" && d["data.cofd_cg"] !== undefined) {
          me.state.cofd_cg = d["data.cofd_cg"];
        }
        return Promise.resolve();
      },
    });
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
    assertEquals(layouts.length, 0);
    const out = (u as { _sent: string[] })._sent.join("\n")
      .toLowerCase();
    assertStringIncludes(out, "welcome");
  },
);
