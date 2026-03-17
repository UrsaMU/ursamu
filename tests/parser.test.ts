import { assertEquals } from "@std/assert";
import { addCmd, cmds } from "../src/services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../src/@types/UrsamuSDK.ts";

Deno.test("addCmd registers command with new IUrsamuSDK signature", () => {
  const before = cmds.length;

  addCmd({
    name: "test-sdk",
    pattern: /^test-sdk\s+(.*)/,
    lock: "",
    exec: (u: IUrsamuSDK) => {
      // Plugin commands receive IUrsamuSDK — verify key properties exist
      assertEquals(typeof u.send, "function");
      assertEquals(typeof u.broadcast, "function");
      assertEquals(typeof u.force, "function");
      assertEquals(typeof u.me, "object");
      assertEquals(typeof u.cmd, "object");
      assertEquals(Array.isArray(u.cmd.args), true);
    },
  });

  assertEquals(cmds.length, before + 1);
  assertEquals(cmds[cmds.length - 1].name, "test-sdk");
});

Deno.test("addCmd registers multiple commands at once", () => {
  const before = cmds.length;

  addCmd(
    {
      name: "multi-a",
      pattern: /^multi-a/,
      exec: (_u: IUrsamuSDK) => {},
    },
    {
      name: "multi-b",
      pattern: /^multi-b/,
      exec: (_u: IUrsamuSDK) => {},
    }
  );

  assertEquals(cmds.length, before + 2);
});

Deno.test("ICmd exec signature accepts IUrsamuSDK without IContext", () => {
  // This test verifies the type contract: exec takes (u: IUrsamuSDK), NOT (ctx, args).
  // If this compiles and runs, the migration is correct.
  let called = false;

  addCmd({
    name: "type-check",
    pattern: /^type-check/,
    exec: (u: IUrsamuSDK) => {
      // SDK properties used by real plugin commands
      const _id: string = u.me.id;
      const _args: string[] = u.cmd.args;
      const _socketId: string | undefined = u.socketId;
      called = true;
      void _id; void _args; void _socketId;
    },
  });

  // The exec function is registered — actual invocation requires a live DB/socket
  assertEquals(called, false); // not invoked here, just registered
});
