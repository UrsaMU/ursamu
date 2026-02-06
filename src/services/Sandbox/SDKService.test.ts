import { assertEquals } from "@std/assert";
import { sandboxService } from "./SandboxService.ts";

Deno.test("SDK & State Interaction Tests", async (t) => {
  const mockCtx = {
    id: "obj1",
    location: "room1",
    state: { hp: 100 },
  };

  await t.step("Update State (Reactive Proxy)", async () => {
    const script = "u.state.hp = 90;";
    await sandboxService.runScript(script, { ...mockCtx, state: mockCtx.state });
    assertEquals(mockCtx.state.hp, 90);
  });

  await t.step("Functional Helpers (u.me, u.here)", async () => {
    const script = "return u.me.id + ' in ' + u.here.id";
    const result = await sandboxService.runScript(script, { ...mockCtx, state: mockCtx.state });
    assertEquals(result, "obj1 in room1");
  });

  await t.step("Functional Helpers (u.send)", async () => {
    // Verifying it doesn't throw. Full verification requires event capturing.
    const script = "u.send('Hello')";
    await sandboxService.runScript(script, { ...mockCtx, state: mockCtx.state });
  });
});
