import { assertEquals } from "@std/assert";
import {
  clearCmdMiddleware,
  registerCmdMiddleware,
  runWithCmdMiddleware,
} from "../src/commands/middleware.ts";
import { rewriteStatePaths } from "../src/commands/sdk.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("rewriteStatePaths maps state.* to data.*", OPTS, () => {
  const out = rewriteStatePaths({
    "state.cpr.hp": 5,
    "data.foo": 1,
    plain: true,
  }) as Record<string, unknown>;
  assertEquals(out["data.cpr.hp"], 5);
  assertEquals(out["data.foo"], 1);
  assertEquals(out.plain, true);
  assertEquals(out["state.cpr.hp"], undefined);
});

Deno.test("rewriteStatePaths maps bare state key", OPTS, () => {
  const out = rewriteStatePaths({ state: { cpr: {} } }) as Record<
    string,
    unknown
  >;
  assertEquals(out.data, { cpr: {} });
});

Deno.test("cmd middleware onion order", OPTS, async () => {
  clearCmdMiddleware();
  const order: number[] = [];
  registerCmdMiddleware(async (_c, next) => {
    order.push(1);
    await next();
    order.push(4);
  });
  registerCmdMiddleware(async (_c, next) => {
    order.push(2);
    await next();
    order.push(3);
  });
  await runWithCmdMiddleware(
    {
      socketId: "s",
      actorId: "a",
      msg: "x",
      socket: { socketId: "s" },
      // deno-lint-ignore no-explicit-any
      u: {} as any,
    },
    () => {
      order.push(99);
    },
  );
  assertEquals(order, [1, 2, 99, 3, 4]);
  clearCmdMiddleware();
});
