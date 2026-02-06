import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { type SDKContext } from "../src/services/Sandbox/SDKService.ts";

Deno.test({
  name: "Core Script: look.ts",
  fn: async () => {
    const lookCode = await Deno.readTextFile("./system/scripts/look.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player", "connected"], contents: [] },
      here: { id: "room1", name: "The Void", state: { description: "You are in a void." }, flags: ["room"], contents: [] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(lookCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: say.ts",
  fn: async () => {
    const sayCode = await Deno.readTextFile("./system/scripts/say.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player"], contents: [] },
      here: { id: "room1", name: "The Void", flags: ["room"], contents: [] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(sayCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: set.ts",
  fn: async () => {
    const setCode = await Deno.readTextFile("./system/scripts/set.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: {}, flags: ["player"], contents: [] },
      cmd: { name: "set", args: ["PlayerOne/COLOR=Blue"] },
      id: "actor1",
      state: {},
      searchResults: {
        [JSON.stringify("PlayerOne")]: [{ id: "actor1", name: "PlayerOne", state: {}, flags: ["player"], contents: [] }]
      }
    };
    
    await sandboxService.runScript(setCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: page.ts",
  fn: async () => {
    const pageCode = await Deno.readTextFile("./system/scripts/page.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player"], contents: [] },
      cmd: { name: "page", args: ["Target=Hello!"] },
      id: "actor1",
      state: {},
      searchResults: {
        [JSON.stringify("Target")]: [{ id: "actor2", name: "TargetPlayer", state: { name: "TargetPlayer" }, flags: ["player", "connected"], contents: [] }]
      }
    };
    
    await sandboxService.runScript(pageCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: pose.ts",
  fn: async () => {
    const poseCode = await Deno.readTextFile("./system/scripts/pose.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player"], contents: [] },
      here: { id: "room1", flags: ["room"], contents: [] },
      cmd: { name: ":", args: ["poses here."] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(poseCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: think.ts",
  fn: async () => {
    const thinkCode = await Deno.readTextFile("./system/scripts/think.ts");
    const context = {
      cmd: { name: "think", args: ["I am thinking."] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(thinkCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: examine.ts",
  fn: async () => {
    const examineCode = await Deno.readTextFile("./system/scripts/examine.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player", "connected"], contents: [] },
      cmd: { name: "examine", args: ["me"] },
      id: "actor1",
      state: {},
      searchResults: {
        [JSON.stringify("me")]: [{ id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player", "connected"], contents: [] }]
      }
    };
    
    await sandboxService.runScript(examineCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: inventory.ts",
  fn: async () => {
    const invCode = await Deno.readTextFile("./system/scripts/inventory.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", flags: ["player"], state: {}, contents: [{ id: "item1", name: "A Torch", state: {}, flags: ["item"], contents: [] }] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(invCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: score.ts",
  fn: async () => {
    const scoreCode = await Deno.readTextFile("./system/scripts/score.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", state: { name: "PlayerOne" }, flags: ["player"], contents: [] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(scoreCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: who.ts",
  fn: async () => {
    const whoCode = await Deno.readTextFile("./system/scripts/who.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", flags: ["player"], contents: [] },
      id: "actor1",
      state: {},
      searchResults: {
        [JSON.stringify("connected")]: [
          { id: "actor1", name: "PlayerOne", state: {}, flags: ["player", "connected"], contents: [] },
          { id: "actor2", name: "PlayerTwo", state: {}, flags: ["player", "connected"], contents: [] }
        ]
      }
    };
    
    await sandboxService.runScript(whoCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});

Deno.test({
  name: "Core Script: doing.ts",
  fn: async () => {
    const doingCode = await Deno.readTextFile("./system/scripts/doing.ts");
    const context = {
      me: { id: "actor1", name: "PlayerOne", flags: ["player"], state: {}, contents: [] },
      cmd: { name: "doing", args: ["Building the MUSH."] },
      id: "actor1",
      state: {}
    };
    
    await sandboxService.runScript(doingCode, context as SDKContext);
  },
  sanitizeResources: false,
  sanitizeOps: false
});
