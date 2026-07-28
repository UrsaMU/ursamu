/**
 * Middleware registration order and removeMiddleware.
 */
import { assertEquals } from "@std/assert";
import {
  addMiddleware,
  removeMiddleware,
  clearMiddleware,
  getMiddleware,
  runPipeline,
  addHandler,
  removeHandler,
} from "../mod.ts";
import type { ICoreContext } from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeCtx(input: string): ICoreContext & { log: string[] } {
  const log: string[] = [];
  return {
    socketId: "s1",
    sessionId: null,
    input,
    args: [],
    send: (m: string) => {
      log.push(`send:${m}`);
    },
    log,
  } as ICoreContext & { log: string[] };
}

Deno.test("middleware runs in registration order", OPTS, async () => {
  clearMiddleware();
  removeHandler("mw-echo");
  const order: string[] = [];

  const a = async (
    _ctx: ICoreContext,
    next: () => Promise<void>,
  ) => {
    order.push("a");
    await next();
  };
  const b = async (
    _ctx: ICoreContext,
    next: () => Promise<void>,
  ) => {
    order.push("b");
    await next();
  };

  addMiddleware(a);
  addMiddleware(b);
  addHandler({
    name: "mw-echo",
    pattern: /^ping$/i,
    exec: (ctx) => {
      order.push("handler");
      ctx.send("pong");
    },
  });

  const ctx = fakeCtx("ping");
  const ran = await runPipeline(ctx);
  assertEquals(ran, true);
  assertEquals(order, ["a", "b", "handler"]);
  assertEquals(ctx.log, ["send:pong"]);

  removeMiddleware(a);
  removeMiddleware(b);
  removeHandler("mw-echo");
  clearMiddleware();
});

Deno.test("removeMiddleware drops by reference", OPTS, () => {
  clearMiddleware();
  const fn = async (
    _c: ICoreContext,
    next: () => Promise<void>,
  ) => {
    await next();
  };
  addMiddleware(fn);
  assertEquals(getMiddleware().length, 1);
  assertEquals(removeMiddleware(fn), true);
  assertEquals(getMiddleware().length, 0);
  assertEquals(removeMiddleware(fn), false);
  clearMiddleware();
});

Deno.test("middleware can short-circuit without next", OPTS, async () => {
  clearMiddleware();
  removeHandler("mw-never");
  const order: string[] = [];

  const block = async (ctx: ICoreContext, _next: () => Promise<void>) => {
    order.push("block");
    ctx.send("blocked");
  };
  addMiddleware(block);
  addHandler({
    name: "mw-never",
    pattern: /^x$/i,
    exec: () => {
      order.push("handler");
    },
  });

  const ctx = fakeCtx("x");
  const ran = await runPipeline(ctx);
  assertEquals(ran, false);
  assertEquals(order, ["block"]);
  assertEquals(ctx.log, ["send:blocked"]);

  removeMiddleware(block);
  removeHandler("mw-never");
  clearMiddleware();
});
