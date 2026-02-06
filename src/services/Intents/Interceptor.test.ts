import { assertEquals } from "@std/assert";
import { intentRegistry } from "./IntentRegistry.ts";
import { InterceptorService } from "./InterceptorService.ts";

Deno.test("Intent Registry Tests", () => {
  const say = intentRegistry.getIntent("say");
  assertEquals(say?.priority, 10);
  assertEquals(say?.enabled, true);

  const look = intentRegistry.getIntent("look");
  assertEquals(look?.priority, 1);
});

Deno.test("Interceptor Service Tests", async (t) => {
  const mockIntent = {
    name: "get",
    actorId: "player1",
    targetId: "ruby1",
    args: []
  };

  await t.step("Allow Intent (No Interceptors)", async () => {
    const result = await InterceptorService.intercept(mockIntent, []);
    assertEquals(result, true);
  });

  await t.step("Halt Intent (Script returns false)", async () => {
    const candidates = [
      {
        id: "ruby1",
        script: "u.intercept = (intent) => { return false; };",
        state: {}
      }
    ];
    const result = await InterceptorService.intercept(mockIntent, candidates);
    assertEquals(result, false);
  });

  await t.step("Priority Queue (FIFO)", async () => {
    // We can't easily verify order without side effects in this mock,
    // but we can verify multiple interceptors work.
    const candidates = [
      { id: "obj1", script: "u.state.order = 1;", state: {} },
      { id: "obj2", script: "u.state.order = 2;", state: {} }
    ];
    const result = await InterceptorService.intercept(mockIntent, candidates);
    assertEquals(result, true);
    assertEquals((candidates[0].state as any).order, 1);
    assertEquals((candidates[1].state as any).order, 2);
  });
});
