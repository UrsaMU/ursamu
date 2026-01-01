
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { DBO } from "../src/services/Database/database.ts";
import { IDBOBJ } from "../src/@types/IDBObj.ts";

// Mock Deno.KV
const kv = await Deno.openKv(":memory:");
Deno.openKv = async () => kv;

Deno.test("Database Adapter Test", async (t) => {
    const db = new DBO<IDBOBJ>("test.db");

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
