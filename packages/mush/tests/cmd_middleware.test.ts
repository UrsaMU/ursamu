/**
 * Command middleware register / unregister / order (1.0 lifecycle).
 */
import { assertEquals } from "@std/assert";
import {
  clearCmdMiddleware,
  listCmdMiddleware,
  registerCmdMiddleware,
  runWithCmdMiddleware,
  unregisterCmdMiddleware,
} from "../src/commands/middleware.ts";
import type { CmdMiddlewareCtx } from "../src/commands/middleware.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("cmd middleware: order and remove by reference", OPTS, async () => {
  clearCmdMiddleware();
  const order: string[] = [];

  const a = async (
    _ctx: CmdMiddlewareCtx,
    next: () => Promise<void>,
  ) => {
    order.push("a");
    await next();
  };
  const b = async (
    _ctx: CmdMiddlewareCtx,
    next: () => Promise<void>,
  ) => {
    order.push("b");
    await next();
  };

  registerCmdMiddleware(a);
  registerCmdMiddleware(b);
  assertEquals(listCmdMiddleware().length, 2);

  await runWithCmdMiddleware(
    { raw: "test", socketId: "s1" } as CmdMiddlewareCtx,
    () => {
      order.push("core");
    },
  );
  assertEquals(order, ["a", "b", "core"]);

  unregisterCmdMiddleware(a);
  assertEquals(listCmdMiddleware().length, 1);

  order.length = 0;
  await runWithCmdMiddleware(
    { raw: "test", socketId: "s1" } as CmdMiddlewareCtx,
    () => {
      order.push("core");
    },
  );
  assertEquals(order, ["b", "core"]);

  clearCmdMiddleware();
  assertEquals(listCmdMiddleware().length, 0);
});
