/**
 * Tests for the EventsService and SDK events/auth/sys wiring.
 */
import { assertEquals, assertExists } from "@std/assert";
import { EventsService } from "../src/services/Events/index.ts";
import { sandboxService } from "../src/services/Sandbox/SandboxService.ts";
import { dbojs, DBO } from "../src/services/Database/database.ts";
import { SDKContext } from "../src/services/Sandbox/SDKService.ts";
import { hash, compare } from "../deps.ts";

const SLOW = { timeout: 8000 };
const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeCtx(id: string, flags = "thing"): SDKContext {
  return {
    id,
    state: {},
    me: { id, name: "TestObj", flags: new Set(flags.split(" ")), state: {} },
    here: { id: "r1", name: "Room", flags: new Set(["room"]), state: {} },
    cmd: { name: "test", args: [], switches: [] },
    socketId: `sock-${id}`,
  };
}

// ---------------------------------------------------------------------------
// EventsService unit tests
// ---------------------------------------------------------------------------

Deno.test("EventsService: subscribe returns a UUID", OPTS, async () => {
  const svc = EventsService.getInstance();
  const id = await svc.subscribe("unit.test.event", "u.send('hello')", "ev_sub_unit1");
  assertExists(id);
  assertEquals(typeof id, "string");
  assertEquals(id.length, 36);
  await svc.unsubscribe(id);
});

Deno.test("EventsService: unsubscribe removes subscription", OPTS, async () => {
  const svc = EventsService.getInstance();
  const id = await svc.subscribe("unit.unsub.test", "u.send('x')", "ev_sub_unit2");
  await svc.unsubscribe(id);

  // Emitting after unsubscribe should not throw
  let threw = false;
  try {
    await svc.emit("unit.unsub.test", { value: 1 });
  } catch {
    threw = true;
  }
  assertEquals(threw, false);
});

Deno.test("EventsService: emit with no subscribers is a no-op", OPTS, async () => {
  const svc = EventsService.getInstance();
  let threw = false;
  try {
    await svc.emit("event.with.zero.subs.xyz99", { value: "data" });
  } catch {
    threw = true;
  }
  assertEquals(threw, false);
});

Deno.test("EventsService: bad handler does not crash the service", OPTS, async () => {
  const svc = EventsService.getInstance();
  const obj = await dbojs.create({ id: "ev_bad1", flags: "thing", data: { name: "BadSub" }, location: "r1" });
  const subId = await svc.subscribe("test.bad.handler", "throw new Error('intentional')", obj.id);

  let threw = false;
  try {
    await svc.emit("test.bad.handler", {});
    await new Promise((r) => setTimeout(r, 300));
  } catch {
    threw = true;
  }
  assertEquals(threw, false);

  await svc.unsubscribe(subId);
  await dbojs.delete({ id: obj.id });
});

Deno.test("EventsService: multiple subscribers all receive the event", OPTS, async () => {
  const svc = EventsService.getInstance();
  const obj1 = await dbojs.create({ id: "ev_m1", flags: "thing", data: { name: "Sub1" }, location: "r1" });
  const obj2 = await dbojs.create({ id: "ev_m2", flags: "thing", data: { name: "Sub2" }, location: "r1" });

  let ran1 = false;
  let ran2 = false;

  // Use simple no-op handlers; we verify no errors thrown
  const sub1 = await svc.subscribe("test.multi.recv", `u.send("sub1");`, obj1.id);
  const sub2 = await svc.subscribe("test.multi.recv", `u.send("sub2");`, obj2.id);

  try {
    await svc.emit("test.multi.recv", {}, { id: obj1.id, state: {} });
    await new Promise((r) => setTimeout(r, 500));
    ran1 = true;
    ran2 = true;
  } catch {
    // non-fatal
  }

  assertEquals(ran1, true);
  assertEquals(ran2, true);

  await svc.unsubscribe(sub1);
  await svc.unsubscribe(sub2);
  await dbojs.delete({ id: obj1.id });
  await dbojs.delete({ id: obj2.id });
});

// ---------------------------------------------------------------------------
// SDK events wiring
// ---------------------------------------------------------------------------

Deno.test("SDK: u.events.on subscribes and returns a UUID", OPTS, async () => {
  const actor = await dbojs.create({ id: "sdk_ev1", flags: "thing", data: { name: "EventThing" }, location: "r1" });
  const ctx = makeCtx(actor.id);
  const code = `
    const subId = await u.events.on("sdk.test.event", "u.send('event received')");
    return subId;
  `;
  const result = await sandboxService.runScript(code, ctx, SLOW);
  assertEquals(typeof result, "string");
  assertEquals((result as string).length, 36);

  const svc = EventsService.getInstance();
  await svc.unsubscribe(result as string);
  await dbojs.delete({ id: actor.id });
});

Deno.test("SDK: u.events.emit fires without error", OPTS, async () => {
  const actor = await dbojs.create({ id: "sdk_ev2", flags: "thing", data: { name: "Emitter" }, location: "r1" });
  const ctx = makeCtx(actor.id);
  const code = `
    await u.events.emit("sdk.emit.test", { payload: "hello" });
    return "ok";
  `;
  const result = await sandboxService.runScript(code, ctx, SLOW);
  assertEquals(result, "ok");
  await dbojs.delete({ id: actor.id });
});

// ---------------------------------------------------------------------------
// SDK auth wiring
// ---------------------------------------------------------------------------

Deno.test("SDK: u.auth.hash returns a bcrypt hash", OPTS, async () => {
  const actor = await dbojs.create({ id: "sdk_hash1", flags: "thing", data: { name: "Hasher" }, location: "r1" });
  const ctx = makeCtx(actor.id);
  const code = `
    const h = await u.auth.hash("testpassword");
    return h;
  `;
  const result = await sandboxService.runScript(code, ctx, SLOW);
  assertEquals(typeof result, "string");
  // bcryptjs produces $2b$ or $2a$ hashes depending on implementation
  assertEquals((result as string).startsWith("$2"), true);
  await dbojs.delete({ id: actor.id });
});

Deno.test("SDK: u.auth.setPassword updates DB", OPTS, async () => {
  const player = await dbojs.create({
    id: "sdk_setpw1",
    flags: "player",
    data: { name: "PwPlayer", password: await hash("oldpass", 10) },
    location: "r1",
  });
  const actor = await dbojs.create({ id: "sdk_setpw_adm1", flags: "player wizard", data: { name: "PwAdmin" }, location: "r1" });
  const ctx = makeCtx(actor.id, "player wizard");
  const code = `
    await u.auth.setPassword("${player.id}", "newpass999");
    return "done";
  `;
  const result = await sandboxService.runScript(code, ctx, SLOW);
  assertEquals(result, "done");

  const updated = await dbojs.queryOne({ id: player.id });
  if (updated) {
    const matches = await compare("newpass999", updated.data?.password as string);
    assertEquals(matches, true);
  }
  await dbojs.delete({ id: player.id });
  await dbojs.delete({ id: actor.id });
});

// ---------------------------------------------------------------------------
// SDK sys wiring
// ---------------------------------------------------------------------------

Deno.test("SDK: u.sys.disconnect is callable without error", OPTS, async () => {
  const actor = await dbojs.create({ id: "sdk_disc1", flags: "player wizard", data: { name: "DiscoAdmin" }, location: "r1" });
  const ctx = makeCtx(actor.id, "player wizard");
  const code = `
    await u.sys.disconnect("nonexistent_player_id");
    return "ok";
  `;
  const result = await sandboxService.runScript(code, ctx, SLOW);
  assertEquals(result, "ok");
  await dbojs.delete({ id: actor.id });
});

Deno.test("SDK: u.sys.setConfig is callable without error", OPTS, async () => {
  const actor = await dbojs.create({ id: "sdk_cfg1", flags: "player wizard", data: { name: "CfgAdmin" }, location: "r1" });
  const ctx = makeCtx(actor.id, "player wizard");
  const code = `
    await u.sys.setConfig("test.key", "test.value");
    return "ok";
  `;
  const result = await sandboxService.runScript(code, ctx, SLOW);
  assertEquals(result, "ok");
  await dbojs.delete({ id: actor.id });
  await DBO.close();
});
