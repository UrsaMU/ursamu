/**
 * tests/db_push.test.ts
 *
 * Verifies DBO.$push:
 *   - appends values atomically to top-level and dot-notation array fields
 *   - creates the array if the field is absent
 *   - preserves all sibling fields
 *   - handles concurrent pushes without lost updates (CAS)
 */
import { assertEquals } from "@std/assert";
import { DBO } from "../src/services/Database/database.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// Reuse the in-memory KV store from other db tests (patched at module level)
const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

const db = new DBO<IDBOBJ>("push_test");

Deno.test("DB $push: append to top-level array field", async (t) => {
  await db.create({ id: "push_1", flags: "thing", data: { name: "Box", tags: ["a", "b"] } });

  await t.step("appends new element to existing array", async () => {
    await db.modify({ id: "push_1" }, "$push", { "data.tags": "c" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "push_1" });
    assertEquals((obj!.data as Record<string, unknown>).tags, ["a", "b", "c"]);
  });

  await t.step("preserves sibling data fields", async () => {
    const obj = await db.queryOne({ id: "push_1" });
    assertEquals(obj!.data?.name, "Box");
  });

  await db.delete({ id: "push_1" });
});

Deno.test("DB $push: creates array when field is absent", async (t) => {
  await db.create({ id: "push_2", flags: "thing", data: { name: "Empty" } });

  await t.step("creates [value] for missing field", async () => {
    await db.modify({ id: "push_2" }, "$push", { "data.items": "first" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "push_2" });
    assertEquals((obj!.data as Record<string, unknown>).items, ["first"]);
  });

  await t.step("second push appends to the created array", async () => {
    await db.modify({ id: "push_2" }, "$push", { "data.items": "second" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "push_2" });
    assertEquals((obj!.data as Record<string, unknown>).items, ["first", "second"]);
  });

  await db.delete({ id: "push_2" });
});

Deno.test("DB $push: dot-notation path preserves sibling fields", async (t) => {
  await db.create({
    id: "push_3",
    flags: "player",
    data: { name: "Tester", password: "secret", money: 100, poses: ["pose1"] },
  });

  await t.step("$push data.poses preserves password and money", async () => {
    await db.modify({ id: "push_3" }, "$push", { "data.poses": "pose2" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "push_3" });
    if (!obj) throw new Error("not found");
    assertEquals((obj.data as Record<string, unknown>).poses, ["pose1", "pose2"]);
    assertEquals(obj.data?.name, "Tester");
    assertEquals(obj.data?.password, "secret");
    assertEquals(obj.data?.money, 100);
  });

  await db.delete({ id: "push_3" });
});

Deno.test("DB $push: concurrent pushes — no lost updates", async (t) => {
  await db.create({ id: "push_4", flags: "thing", data: { name: "Counter", entries: [] } });

  await t.step("ten concurrent pushes all land", async () => {
    // Fire 10 pushes in parallel; CAS retries ensure all 10 survive
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.modify({ id: "push_4" }, "$push", { "data.entries": i } as unknown as Partial<IDBOBJ>)
      ),
    );
    const obj = await db.queryOne({ id: "push_4" });
    const entries = (obj!.data as Record<string, unknown>).entries as number[];
    assertEquals(entries.length, 10, `Expected 10 entries, got ${entries.length}: ${JSON.stringify(entries)}`);
  });

  await db.delete({ id: "push_4" });
});

Deno.test("DB $push: rejects dangerous keys", async (t) => {
  await db.create({ id: "push_5", flags: "thing", data: { name: "Safe" } });

  await t.step("__proto__ key is silently skipped", async () => {
    await db.modify({ id: "push_5" }, "$push", { "__proto__": "evil" } as unknown as Partial<IDBOBJ>);
    const obj = await db.queryOne({ id: "push_5" });
    assertEquals(obj!.data?.name, "Safe"); // unchanged
  });

  await db.delete({ id: "push_5" });
});
