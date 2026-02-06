import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs } from "../src/services/Database/index.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";

Deno.test({ name: "Core Migration: connect script", sanitizeResources: false }, async () => {
  const code = await Deno.readTextFile("./system/scripts/connect.ts");
  
  const player = await dbojs.create({
    id: "p1",
    flags: "player",
    data: { name: "TestPlayer", password: "password" }
  });

  const context: SDKContext = {
    id: "#-1",
    state: {},
    cmd: { name: "connect", args: ["TestPlayer password"] },
    socketId: "s1"
  };

  await sandboxService.runScript(code, context);
  
  const updated = await dbojs.queryOne({ id: player.id });
  assertEquals(!!updated, true);
  
  await dbojs.delete({ id: player.id });
});

Deno.test({ name: "Core Migration: flags script", sanitizeResources: false }, async () => {
  const code = await Deno.readTextFile("./system/scripts/flags.ts");
  
  const player = await dbojs.create({
    id: "p2",
    flags: "player connected",
    location: "r1",
    data: { name: "FlagsPlayer" }
  });

  const target = await dbojs.create({
    id: "t1",
    flags: "builder+",
    location: "r1",
    data: { name: "TargetThing" }
  });

  const context: SDKContext = {
    id: player.id,
    state: {},
    cmd: { name: "@flags", args: ["TargetThing", "safe"] },
    socketId: "s2"
  };

  await sandboxService.runScript(code, context);
  
  const updated = await dbojs.queryOne({ id: target.id });
  if (updated && typeof updated === "object") {
    console.log("Updated flags:", updated.flags);
    assertEquals(updated.flags.includes("safe"), true);
  } else {
    throw new Error("Target not found");
  }

  await dbojs.delete({ id: player.id });
  await dbojs.delete({ id: target.id });
});

Deno.test({ name: "Core Migration: channels script join", sanitizeResources: false }, async () => {
  const code = await Deno.readTextFile("./system/scripts/channels.ts");
  
  const player = await dbojs.create({
    id: "p3",
    flags: "player connected",
    data: { name: "ChanPlayer" }
  });

  const context: SDKContext = {
    id: player.id,
    state: {},
    cmd: { name: "channels/join", args: ["Public=P"] },
    socketId: "s3"
  };

  await sandboxService.runScript(code, context);
  
  const updated = await dbojs.queryOne({ id: player.id });
  if (updated && typeof updated === "object") {
    const chans = (updated.data?.channels as any[]) || [];
    assertEquals(chans.some(c => c.channel === "Public" && c.alias === "P"), true);
  } else {
    throw new Error("Player not found");
  }

  await dbojs.delete({ id: player.id });
});
