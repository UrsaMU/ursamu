import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { cmdParser } from "../src/services/commands/cmdParser.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";

Deno.test("Script Engine - Hello World via Sandbox", async () => {
  const _result = await sandboxService.runScript('u.send("Hello World")', { 
      id: "test", 
      location: "test", 
      state: {} 
  });
});

Deno.test({
  name: "Command Routing - SCRIPT_NODE Bypass",
  fn: async () => {
    // Mock a player with SCRIPT_NODE flag
    await dbojs.create({
        id: "100",
        flags: "player connected SCRIPT_NODE",
        data: {
            name: "Tester",
            "cmd:hello": 'u.send("World")'
        },
        location: "1"
    });
    
    // Simulate a context
    const ctx = {
        socket: { id: "sock1", cid: "100" },
        msg: "hello",
        data: {}
    };
    
    // Run parser
    await cmdParser.run(ctx as any);
    
    // Cleanup
    await dbojs.delete({ id: "100" });
    await DBO.close();
  },
  sanitizeResources: false, // Sandbox/Worker often leaves handles that Deno's sanitizer catches
  sanitizeOps: false
});
