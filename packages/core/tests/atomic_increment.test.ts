/**
 * Counters use `value`; atomicIncrement must not ignore it (id collapse).
 */
import { assertEquals } from "@std/assert";
import { DBO } from "../src/database/dbo.ts";
import { TypeGraphAdapter } from "../src/database/typegraph.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "atomicIncrement honors existing value field",
  OPTS,
  async () => {
    await TypeGraphAdapter.close();
    const counters = new DBO<{
      id: string;
      value?: number;
      seq?: number;
    }>("test.counters");
    await counters.clear();
    await counters.create({ id: "objid", value: 5 });
    const n1 = await counters.atomicIncrement("objid");
    const n2 = await counters.atomicIncrement("objid");
    assertEquals(n1, 6);
    assertEquals(n2, 7);
    const row = await counters.queryOne({ id: "objid" });
    assertEquals(row?.value, 7);
    assertEquals(row?.seq, 7);
    await counters.clear();
    await TypeGraphAdapter.close();
  },
);

Deno.test(
  "atomicIncrement starts at 1 when empty",
  OPTS,
  async () => {
    await TypeGraphAdapter.close();
    const counters = new DBO<{
      id: string;
      value?: number;
      seq?: number;
    }>("test.counters2");
    await counters.clear();
    const n = await counters.atomicIncrement("fresh");
    assertEquals(n, 1);
    await counters.clear();
    await TypeGraphAdapter.close();
  },
);
