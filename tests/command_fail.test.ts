import { assertEquals } from "@std/assert";
import { runPipeline, gameHooks } from "../packages/core/mod.ts";
import { loadDefaultCommands } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("command:fail hook and fallback message", OPTS, async () => {
  // Ensure default commands and mush:commands handler are registered
  await loadDefaultCommands();

  const { registerSender } = await import("@ursamu/core");

  const sent: string[] = [];
  registerSender((id: string, msg: string) => {
    if (id === "sock_fail_test") sent.push(msg);
  });

  const ctx = {
    socketId: "sock_fail_test",
    sessionId: null,
    input: "non_existent_command_123",
    args: [],
    send: (msg: string) => sent.push(msg),
  };

  let hookFired = false;
  const onFail = (e: {
    socketId: string;
    input: string;
    handled: boolean;
  }) => {
    hookFired = true;
    assertEquals(e.socketId, "sock_fail_test");
    assertEquals(e.input, "non_existent_command_123");
  };

  gameHooks.on("command:fail", onFail);
  await runPipeline(ctx as any);
  gameHooks.off("command:fail", onFail);

  assertEquals(hookFired, true, "command:fail hook should fire");
  assertEquals(
    sent.includes("Huh?  Type 'help' for help."),
    true,
    "Should send default Huh? message",
  );

  // 2. Test handled = true prevents the default message
  sent.length = 0;
  const onFailHandled = (e: { handled: boolean }) => {
    e.handled = true;
  };

  gameHooks.on("command:fail", onFailHandled);
  await runPipeline(ctx as any);
  gameHooks.off("command:fail", onFailHandled);

  assertEquals(
    sent.includes("Huh?  Type 'help' for help."),
    false,
    "Should NOT send default Huh? message if handled is true",
  );
});
