import { assertEquals, assertExists } from "@std/assert";
import { execAct } from "../commands/act.ts";
import { execFeed } from "../commands/feed.ts";
import { execSphere } from "../commands/sphere.ts";
import { execWeek } from "../commands/week.ts";
import { memoryStore } from "../src/store.ts";
import { mockU } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("week/plan strips codes and emits week", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({ args: ["plan", "%chGet%cn the sample."] });
  await execWeek(u, store);
  assertEquals(u._sent.length, 1);
  assertEquals(u._sent[0].includes("Get the sample."), true);
  const ch = await store.loadChar("1", "Mira", "room1");
  assertEquals(ch.plan, "Get the sample.");
});

Deno.test("week/ready without plan errors", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({ args: ["ready", ""] });
  await execWeek(u, store);
  assertEquals(u._sent[0].includes("Set a plan"), true);
});

Deno.test("feed web layout type", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({ web: true, args: ["", ""] });
  await execFeed(u, store);
  assertEquals(u._layouts.length, 1);
  const bag = u._layouts[0] as { meta: { type: string } };
  assertEquals(bag.meta.type, "utopia-feed");
});

Deno.test("feed/tick denied for players", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({ args: ["tick", ""] });
  await execFeed(u, store);
  assertEquals(u._sent[0], "Permission denied.");
});

Deno.test("feed/tick staff advances week", OPTS, async () => {
  const store = memoryStore();
  const before = await store.loadCity();
  const u = mockU({
    args: ["tick", ""],
    me: { flags: new Set(["player", "connected", "wizard"]) },
  });
  await execFeed(u, store);
  const after = await store.loadCity();
  assertEquals(after.week, before.week + 1);
  assertEquals(u._sent[0].includes(after.name), true);
});

Deno.test("act unknown verb", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({ args: ["explode", ""] });
  await execAct(u, store);
  assertEquals(u._sent[0].includes("Unknown action"), true);
});

Deno.test("act/hitch emits ruling", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({
    web: true,
    args: ["hitch", "hack"],
  });
  await execAct(u, store);
  assertEquals(u._layouts.length, 1);
  const bag = u._layouts[0] as {
    meta: { type: string; result: string };
  };
  assertEquals(bag.meta.type, "utopia-ruling");
  assertExists(bag.meta.result);
});

Deno.test("sphere empty people", OPTS, async () => {
  const store = memoryStore();
  const u = mockU({ args: ["", ""] });
  await execSphere(u, store);
  assertEquals(u._sent[0].includes("Resources"), true);
});
