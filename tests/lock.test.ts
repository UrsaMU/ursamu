/// <reference lib="deno.unstable" />
import { assertEquals } from "@std/assert";
import { evaluateLock } from "../src/utils/evaluateLock.ts";
import { DBO } from "../src/services/Database/database.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

// Mock Deno.KV
const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

Deno.test("Lock Evaluation", async (t) => {
    const enactor: IDBObj = {
        id: "1",
        name: "TestPlayer",
        flags: new Set(["player", "connected", "superuser"]), 
        location: "100",
        state: { 
            name: "TestPlayer", 
            sex: "Male"
        },
        contents: []
    };

    const target: IDBObj = {
        id: "2",
        name: "TestThing",
        flags: new Set(["thing"]),
        location: "1",
        state: { name: "TestThing" },
        contents: []
    };

    await t.step("Basic Boolean Logic", async () => {
        assertEquals(await evaluateLock("superuser", enactor, target), true); // Has flag
        assertEquals(await evaluateLock("!superuser", enactor, target), false); // Negation
        assertEquals(await evaluateLock("superuser & connected", enactor, target), true); // AND
        assertEquals(await evaluateLock("superuser & !connected", enactor, target), false); // AND fail
        assertEquals(await evaluateLock("!superuser | connected", enactor, target), true); // OR
    });

    await t.step("DB Ref Check", async () => {
        assertEquals(await evaluateLock("#1", enactor, target), true);
        assertEquals(await evaluateLock("#2", enactor, target), false);
    });

    await t.step("Attribute Check", async () => {
        assertEquals(await evaluateLock("SEX:Male", enactor, target), true);
        assertEquals(await evaluateLock("SEX:Female", enactor, target), false);
    });

    await t.step("Combined Logic", async () => {
        assertEquals(await evaluateLock("superuser & #1", enactor, target), true);
        assertEquals(await evaluateLock("!superuser | sex:Male", enactor, target), true);
    });
});
