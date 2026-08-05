import { assertEquals } from "@std/assert";
import { withTileLock } from "../move.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("withTileLock: serializes concurrent work on same key", OPTS, async () => {
  const order: number[] = [];
  const a = withTileLock("t:0,0,0", async () => {
    order.push(1);
    await new Promise((r) => setTimeout(r, 30));
    order.push(2);
    return "a";
  });
  const b = withTileLock("t:0,0,0", async () => {
    order.push(3);
    return "b";
  });
  const [ra, rb] = await Promise.all([a, b]);
  assertEquals(ra, "a");
  assertEquals(rb, "b");
  // a fully completes before b starts
  assertEquals(order, [1, 2, 3]);
});

Deno.test("withTileLock: different keys run concurrent", OPTS, async () => {
  let concurrent = 0;
  let max = 0;
  const run = (k: string) =>
    withTileLock(k, async () => {
      concurrent += 1;
      max = Math.max(max, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent -= 1;
    });
  await Promise.all([run("a"), run("b"), run("c")]);
  assertEquals(max >= 2, true);
});
