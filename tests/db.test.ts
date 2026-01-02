import { assertEquals } from "@std/assert";
import { DBO } from "../src/services/Database/database.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// Mock Deno.KV
const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

Deno.test("Database Adapter Test", async (t) => {
    const db = new DBO<IDBOBJ>("test");

    await t.step("Create Object", async () => {
        const obj = { id: "1", flags: "test", data: { name: "Test Object" } };
        const created = await db.create(obj);
        assertEquals(created.id, "1");
    });

    await t.step("Query Object", async () => {
        const results = await db.query({ id: "1" });
        assertEquals(results.length, 1);
        assertEquals(results[0].data?.name, "Test Object");
    });

    await t.step("Modify Object", async () => {
        await db.modify({ id: "1" }, "$set", { description: "Modified" });
        const updated = await db.queryOne({ id: "1" });
        if (updated) {
            assertEquals(updated.description, "Modified");
        } else {
            throw new Error("Object not found");
        }
    });

    await t.step("Delete Object", async () => {
        await db.delete({ id: "1" });
        const results = await db.query({ id: "1" });
        assertEquals(results.length, 0);
    });
});
