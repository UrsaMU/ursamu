import { assertEquals, assertNotEquals } from "@std/assert";
import { DBO } from "../src/services/Database/database.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// Mock Deno.KV with in-memory store
const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

const db = new DBO<IDBOBJ>("integrity_test");

/**
 * These tests verify that db.modify() with dot-notation $set and $unset
 * does NOT wipe sibling fields. This is the class of bug that destroyed
 * player data (names, passwords, money) when any script modified a single field.
 */

Deno.test("DB Integrity: dot-notation $set", async (t) => {
  // Setup: create object with multiple data fields
  await db.create({
    id: "100",
    flags: "player connected",
    data: {
      name: "TestPlayer",
      password: "hashed_pw_123",
      money: 500,
      quota: 20,
      home: "1",
      description: "A test player.",
    },
  });

  await t.step("$set data.description preserves name, password, money", async () => {
    await db.modify({ id: "100" }, "$set", { "data.description": "Updated desc" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "100" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.description, "Updated desc");
    assertEquals(obj.data?.name, "TestPlayer");
    assertEquals(obj.data?.password, "hashed_pw_123");
    assertEquals(obj.data?.money, 500);
    assertEquals(obj.data?.quota, 20);
    assertEquals(obj.data?.home, "1");
  });

  await t.step("$set data.mood adds field without wiping siblings", async () => {
    await db.modify({ id: "100" }, "$set", { "data.mood": "happy" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "100" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.mood, "happy");
    assertEquals(obj.data?.name, "TestPlayer");
    assertEquals(obj.data?.password, "hashed_pw_123");
    assertEquals(obj.data?.money, 500);
  });

  await t.step("$set data.name preserves password and money", async () => {
    await db.modify({ id: "100" }, "$set", { "data.name": "RenamedPlayer" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "100" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.name, "RenamedPlayer");
    assertEquals(obj.data?.password, "hashed_pw_123");
    assertEquals(obj.data?.money, 500);
    assertEquals(obj.data?.description, "Updated desc");
  });

  await t.step("$set multiple dot-notation fields in one call", async () => {
    await db.modify({ id: "100" }, "$set", { "data.x": 1, "data.y": 2 } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "100" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.x, 1);
    assertEquals(obj.data?.y, 2);
    assertEquals(obj.data?.name, "RenamedPlayer");
    assertEquals(obj.data?.password, "hashed_pw_123");
  });

  // Cleanup
  await db.delete({ id: "100" });
});

Deno.test("DB Integrity: $unset", async (t) => {
  await db.create({
    id: "200",
    flags: "thing",
    data: {
      name: "TestThing",
      description: "A thing",
      tempField: "remove_me",
      money: 100,
    },
  });

  await t.step("$unset data.tempField removes it, preserves siblings", async () => {
    await db.modify({ id: "200" }, "$unset", { "data.tempField": 1 } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "200" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.tempField, undefined);
    assertEquals(obj.data?.name, "TestThing");
    assertEquals(obj.data?.description, "A thing");
    assertEquals(obj.data?.money, 100);
  });

  await t.step("$unset on non-existent field is a no-op", async () => {
    await db.modify({ id: "200" }, "$unset", { "data.ghost": 1 } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "200" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.name, "TestThing");
    assertEquals(obj.data?.money, 100);
  });

  // Cleanup
  await db.delete({ id: "200" });
});

Deno.test("DB Integrity: $inc with dot-notation", async (t) => {
  await db.create({
    id: "300",
    flags: "player",
    data: { name: "Banker", money: 100 },
  });

  await t.step("$inc data.money adds to value, preserves name", async () => {
    await db.modify({ id: "300" }, "$inc", { "data.money": 50 } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "300" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.money, 150);
    assertEquals(obj.data?.name, "Banker");
  });

  // Cleanup
  await db.delete({ id: "300" });
});

Deno.test("DB Integrity: simulate login flow (the original bug)", async (t) => {
  // This simulates exactly what connect.ts does — the bug that wiped player data
  await db.create({
    id: "400",
    flags: "player connected superuser",
    data: {
      name: "Jupiter",
      password: "$2a$10$fakehash",
      money: 100,
      quota: 20,
      home: "1",
      alias: "J",
    },
  });

  await t.step("targeted login update preserves ALL player fields", async () => {
    // This is what the fixed connect.ts does
    await db.modify({ id: "400" }, "$set", {
      "data.lastLogin": Date.now(),
      "data.failedAttempts": 0,
    } as unknown as Partial<IDBOBJ>);

    const obj = await db.queryOne({ id: "400" });
    if (!obj) throw new Error("Object not found");
    assertEquals(obj.data?.name, "Jupiter");
    assertEquals(obj.data?.password, "$2a$10$fakehash");
    assertEquals(obj.data?.money, 100);
    assertEquals(obj.data?.quota, 20);
    assertEquals(obj.data?.home, "1");
    assertEquals(obj.data?.alias, "J");
    assertNotEquals(obj.data?.lastLogin, undefined);
    assertEquals(obj.data?.failedAttempts, 0);
  });

  // Cleanup
  await db.delete({ id: "400" });
});
