import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { evaluateLock } from "../src/utils/evaluateLock.ts";
import { dbojs } from "../src/services/Database/index.ts";
import { DBO } from "../src/services/Database/database.ts";
import { parser } from "../src/services/Softcode/parser.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// Mock Deno.KV
const kv = await Deno.openKv(":memory:");
Deno.openKv = () => Promise.resolve(kv);
// deno-lint-ignore no-explicit-any
(DBO as any).kv = null;

Deno.test("Lock Evaluation", async (t) => {
    const enactor = {
        id: "1",
        flags: "player connected superuser", 
        location: "100",
        data: { 
            name: "TestPlayer", 
            attributes: [
                { name: "SEX", value: "Male", setter: "1" }
            ] 
        }
    } as IDBOBJ;

    const target = {
        id: "2",
        flags: "thing",
        location: "1",
        data: { name: "TestThing" }
    } as IDBOBJ;

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

    await t.step("Softcode Integration", async () => {
        // [name(me)] should return "TestPlayer" -> Truthy
        assertEquals(await evaluateLock("[name(me)]", enactor, target), true);
        
        // [add(2,2)] -> 4 -> Truthy
        assertEquals(await evaluateLock("[add(2,2)]", enactor, target), true);
        
        // Falsy softcode results
        // 0 is falsy in our logic?
        // "[sub(2,2)]" -> "0"
        assertEquals(await evaluateLock("[sub(2,2)]", enactor, target), false);
    });

    await t.step("Combined Logic", async () => {
        assertEquals(await evaluateLock("superuser & [name(me)]", enactor, target), true);
        assertEquals(await evaluateLock("!superuser | [sub(2,2)]", enactor, target), false);
    });
});
