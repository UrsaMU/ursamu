
import { assertEquals } from "@std/assert";
import { SandboxService } from "../src/services/Sandbox/SandboxService.ts";

Deno.test({
  name: "Formatting Utilities in Sandbox",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {

  const sandboxService = SandboxService.getInstance();
  await sandboxService.initPool();

  const run = async (code: string) => {
    return await sandboxService.runScript(code, {
      id: "test-actor",
      state: {},
      cmd: { name: "test", args: ["test"] },
    }, { timeout: 5000 });
  };

  await t.step("u.util.center", async () => {
    const code = 'return u.util.center("foo", 10, "-");';
    const result = await run(code);
    assertEquals(result, "---foo----");
  });

  await t.step("u.util.ljust", async () => {
    const code = 'return u.util.ljust("foo", 10, "-");';
    const result = await run(code);
    assertEquals(result, "foo-------");
  });

  await t.step("u.util.rjust", async () => {
    const code = 'return u.util.rjust("foo", 10, "-");';
    const result = await run(code);
    assertEquals(result, "-------foo");
  });

  await t.step("u.util.sprintf", async () => {
     const code = 'return u.util.sprintf("Hello %s, count is %d", "World", 42);';
     const result = await run(code);
     assertEquals(result, "Hello World, count is 42");
  });

  await t.step("u.util.template", async () => {
    const code = `
      const tpl = "Name: [XXXXXX] Age: [YY]";
      return u.util.template(tpl, {
        X: "Bob",
        Y: "42"
      });
    `;
    const result = await run(code);
    assertEquals(result, "Name: [Bob   ] Age: [42]");
  });

    await t.step("u.util.template with alignment", async () => {
    const code = `
      const tpl = "| xxxxxxxxxx |";
      return u.util.template(tpl, {
        x: { value: "Center", align: "center" }
      });
    `;
    // Center of 10 for "Center" (6 chars) -> 2 pad left, 2 pad right -> "  Center  "
    const result = await run(code);
    assertEquals(result, "|   Center   |");
  });

  await t.step("u.util.template multi-line expansion", async () => {
    const code = `
      const tpl = "| A: [aaaaaa] | B: [bbbbbb] |";
      return u.util.template(tpl, {
        a: ["Line1", "Line2"],
        b: ["B1"]
      });
    `;
    const result = await run(code);
    // Expected:
    // | A: Line1 | B: B1   |
    // | A: Line2 | B:      |
    const expected = `| A: Line1    | B: B1       |
| A: Line2    | B:          |`;
    console.log("RES CODES:", (result as string).trim().split("").map(c => c.charCodeAt(0)));
    console.log("EXP CODES:", expected.trim().split("").map(c => c.charCodeAt(0)));
    // Verify content ignoring potential trailing newline differences
    assertEquals((result as string).trim(), expected.trim());
  });
}});
