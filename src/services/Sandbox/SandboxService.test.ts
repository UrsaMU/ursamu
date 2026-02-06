import { assertEquals, assertRejects } from "@std/assert";
import { sandboxService } from "./SandboxService.ts";

Deno.test("SandboxService Tests", async (t) => {
  await t.step("Pool Initialization", async () => {
    await sandboxService.initPool();
    // Assuming we can check the pool size or just ensure it doesn't throw
  });

  await t.step("Basic Script Execution", async () => {
    const result = await sandboxService.runScript("return 1 + 1", { id: "test", state: {} });
    assertEquals(result, 2);
  });

  await t.step("Timeout Handling", async () => {
    await assertRejects(
      async () => {
        await sandboxService.runScript("while(true) {}", { id: "test", state: {} }, { timeout: 100 });
      },
      Error,
      "Script execution timed out"
    );
  });
});
