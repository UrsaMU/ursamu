/**
 * Delayed queue enqueue / cancel / list.
 */
import { assertEquals } from "@std/assert";
import { queue } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("queue enqueue returns pid and list finds it", OPTS, async () => {
  const pid = await queue.enqueue({
    command: "test-cmd",
    executor: "core-test-exec",
    enactor: "core-test-enactor",
  }, 60_000);
  assertEquals(typeof pid, "number");
  assertEquals(pid > 0, true);

  const listed = await queue.list("core-test-exec");
  assertEquals(listed.some((e) => e.pid === pid), true);

  const cancelled = await queue.cancel(pid);
  assertEquals(cancelled, true);
  const after = await queue.list("core-test-exec");
  assertEquals(after.some((e) => e.pid === pid), false);
});

Deno.test("queue cancel missing pid is false", OPTS, async () => {
  const ok = await queue.cancel(999_999_999);
  assertEquals(ok, false);
});

Deno.test("queue cancelAll by executor", OPTS, async () => {
  const tag = `core-test-batch-${Date.now()}`;
  await queue.enqueue({
    command: "a",
    executor: tag,
    enactor: "e",
  }, 60_000);
  await queue.enqueue({
    command: "b",
    executor: tag,
    enactor: "e",
  }, 60_000);
  const n = await queue.cancelAll(tag);
  assertEquals(n >= 2, true);
  assertEquals((await queue.list(tag)).length, 0);
});
