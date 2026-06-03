/**
 * Security test — DBO $where code execution
 *
 * Exploit: the $where operator in matchesQuery calls an attacker-supplied
 * function with .call(value), executing arbitrary code in-process.
 *
 * Fix: remove $where support entirely. It has no place in a typed query
 * engine and is the primary NoSQL-injection attack vector.
 */
import { assertEquals } from "@std/assert";
import { DBO } from "../../src/database/dbo.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("DBO $where — must not execute attacker-supplied function", OPTS, async () => {
  const db = new DBO<{ id: string; value: number }>("test.where-security");

  await db.create({ id: "r1", value: 42 });

  let executed = false;

  // Craft a query with a $where function — the exploit
  const results = await db.query({
    // deno-lint-ignore no-explicit-any
    $where: function (this: any) {
      executed = true;   // proof of execution
      return true;
    },
  } as never);

  // The function must not have run
  assertEquals(executed, false, "$where function was executed — code execution vulnerability");
  // And the query must return no results (or throw), not all records
  assertEquals(results.length, 0, "$where should return no results after removal");

  await DBO.close();
});
